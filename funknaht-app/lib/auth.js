import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { db, newId, transaction, HttpError, tenantDb, adoptOrphans, deleteTenant } from "./db";

const scrypt = promisify(scryptCb);
export const SESSION_COOKIE = "fn_session";
const SESSION_DAYS = 30;
export const ROLES = { viewer: 0, member: 1, admin: 2, owner: 3 };
export const ROLE_LABEL = { owner: "Inhaber", admin: "Admin", member: "Mitarbeiter", viewer: "Nur lesen" };

/* ---------- Passwords ---------- */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}
async function verifyPassword(password, stored) {
  const [scheme, salt, hex] = String(stored).split("$");
  if (scheme !== "scrypt") return false;
  const key = await scrypt(password, Buffer.from(salt, "hex"), 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(key, Buffer.from(hex, "hex"));
}
// Used when the e-mail is unknown, so response time does not reveal which accounts exist.
const DUMMY_HASH = "scrypt$" + "00".repeat(16) + "$" + "00".repeat(64);

export function validateCredentials({ email, password, name }) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 200)
    throw new HttpError(400, "Bitte eine gültige E-Mail-Adresse eingeben.");
  if (typeof password !== "string" || password.length < 10 || password.length > 200)
    throw new HttpError(400, "Das Passwort braucht mindestens 10 Zeichen.");
  if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 80))
    throw new HttpError(400, "Bitte einen Namen eingeben (max. 80 Zeichen).");
  return { email: email.trim().toLowerCase(), password, name: name?.trim() };
}

/* ---------- Login rate limit: failed attempts per e-mail (8) and per IP (40) in 15 minutes ---------- */
const failures = globalThis.__fnFailures ?? (globalThis.__fnFailures = new Map());
const WINDOW = 15 * 60 * 1000;
const recent = key => (failures.get(key) || []).filter(t => Date.now() - t < WINDOW);
function checkThrottle(key, limit) {
  if (recent(key).length >= limit) throw new HttpError(429, "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.");
}
const recordFailure = key => failures.set(key, [...recent(key), Date.now()]);

/* ---------- Sessions ---------- */
const tokenHash = token => createHash("sha256").update(token).digest("hex");

export function createSession(userId, orgId) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  db.prepare("INSERT INTO sessions(token_hash,user_id,org_id,expires_at) VALUES(?,?,?,?)").run(tokenHash(token), userId, orgId, expires.toISOString());
  return { token, expires };
}
export function cookieOptions(expires) {
  return { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1", path: "/", expires };
}
export function destroySession(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(token));
}

export function sessionFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id AS user_id, u.email, u.name, o.id AS org_id, o.name AS org_name, m.role, s.expires_at
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN orgs o ON o.id=s.org_id
    JOIN memberships m ON m.user_id=s.user_id AND m.org_id=s.org_id
    WHERE s.token_hash=?`).get(tokenHash(token));
  if (!row || row.expires_at < new Date().toISOString()) return null;
  return { user: { id: row.user_id, email: row.email, name: row.name }, org: { id: row.org_id, name: row.org_name }, role: row.role };
}

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.split(/;\s*/).find(c => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

// For API routes: returns the session or throws 401/403.
export function requireSession(request, minRole = "viewer") {
  const session = sessionFromToken(readCookie(request, SESSION_COOKIE));
  if (!session) throw new HttpError(401, "Bitte anmelden.");
  if (ROLES[session.role] < ROLES[minRole]) throw new HttpError(403, "Dafür fehlen die Rechte.");
  return session;
}
export const sessionToken = request => readCookie(request, SESSION_COOKIE);

/* ---------- Accounts ---------- */
export async function register({ email, password, name, company }) {
  const creds = validateCredentials({ email, password, name });
  if (typeof company !== "string" || !company.trim() || company.length > 120) throw new HttpError(400, "Bitte den Firmennamen eingeben.");
  const hash = await hashPassword(creds.password);
  const result = transaction(() => {
    if (db.prepare("SELECT 1 FROM users WHERE email=?").get(creds.email)) throw new HttpError(409, "Diese E-Mail-Adresse ist bereits registriert.");
    const now = new Date().toISOString();
    const user = { id: newId(), email: creds.email, name: creds.name };
    const org = { id: newId(), name: company.trim() };
    const firstOrg = !db.prepare("SELECT 1 FROM orgs LIMIT 1").get();
    db.prepare("INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)").run(user.id, user.email, user.name, hash, now);
    db.prepare("INSERT INTO orgs(id,name,created_at) VALUES(?,?,?)").run(org.id, org.name, now);
    db.prepare("INSERT INTO memberships(user_id,org_id,role) VALUES(?,?,'owner')").run(user.id, org.id);
    return { user, org, firstOrg };
  });
  // Creates the firm's own database file. The very first firm also takes over data from the
  // single-user version (e.g. the Feldwerk import), which has no owner yet.
  if (result.firstOrg) adoptOrphans(result.org.id); else tenantDb(result.org.id);
  return { user: result.user, org: result.org };
}

// Deletes the whole firm: its database file, memberships, sessions and accounts that belong to no other firm.
export function deleteOrg(session, confirmName) {
  if (session.role !== "owner") throw new HttpError(403, "Nur der Inhaber kann die Firma löschen.");
  if (typeof confirmName !== "string" || confirmName.trim() !== session.org.name)
    throw new HttpError(400, "Zur Bestätigung bitte den Firmennamen exakt eingeben.");
  const org = session.org.id;
  transaction(() => {
    const members = db.prepare("SELECT user_id FROM memberships WHERE org_id=?").all(org).map(r => r.user_id);
    db.prepare("DELETE FROM orgs WHERE id=?").run(org); // cascades memberships and sessions
    const orphanUser = db.prepare("DELETE FROM users WHERE id=? AND NOT EXISTS (SELECT 1 FROM memberships WHERE user_id=?)");
    for (const id of members) orphanUser.run(id, id);
  });
  deleteTenant(org);
}

export async function login({ email, password }, ip = "") {
  if (typeof email !== "string" || typeof password !== "string") throw new HttpError(400, "E-Mail und Passwort eingeben.");
  const key = email.trim().toLowerCase();
  checkThrottle("mail:" + key, 8);
  if (ip) checkThrottle("ip:" + ip, 40);
  const user = db.prepare("SELECT id,password FROM users WHERE email=?").get(key);
  const ok = await verifyPassword(password, user?.password || DUMMY_HASH);
  if (!user || !ok) {
    recordFailure("mail:" + key);
    if (ip) recordFailure("ip:" + ip);
    throw new HttpError(401, "E-Mail oder Passwort ist falsch.");
  }
  failures.delete("mail:" + key);
  const membership = db.prepare("SELECT org_id FROM memberships WHERE user_id=? ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END LIMIT 1").get(user.id);
  if (!membership) throw new HttpError(403, "Dieses Konto gehört zu keiner Firma mehr.");
  return createSession(user.id, membership.org_id);
}

export async function changePassword(session, current, next) {
  const row = db.prepare("SELECT password FROM users WHERE id=?").get(session.user.id);
  if (!(await verifyPassword(String(current || ""), row.password))) throw new HttpError(400, "Das aktuelle Passwort stimmt nicht.");
  const { password } = validateCredentials({ email: session.user.email, password: next });
  db.prepare("UPDATE users SET password=? WHERE id=?").run(await hashPassword(password), session.user.id);
  // Sign out all other devices.
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(session.user.id);
}

/* ---------- Team ---------- */
export function listMembers(orgId) {
  return db.prepare(`SELECT u.id, u.email, u.name, m.role FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.org_id=? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, u.name`).all(orgId);
}

const assertRole = role => { if (!(role in ROLES) || role === "owner") throw new HttpError(400, "Ungültige Rolle."); };

export async function addMember(session, { email, name, password, role }) {
  assertRole(role);
  const creds = validateCredentials({ email, password, name });
  const hash = await hashPassword(creds.password);
  return transaction(() => {
    let user = db.prepare("SELECT id,email,name FROM users WHERE email=?").get(creds.email);
    if (!user) {
      user = { id: newId(), email: creds.email, name: creds.name };
      db.prepare("INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)").run(user.id, user.email, user.name, hash, new Date().toISOString());
    } else if (db.prepare("SELECT 1 FROM memberships WHERE user_id=? AND org_id=?").get(user.id, session.org.id)) {
      throw new HttpError(409, "Diese Person ist bereits im Team.");
    } else {
      throw new HttpError(409, "Diese E-Mail gehört schon zu einem anderen Konto. Bitte eine andere Adresse nutzen.");
    }
    db.prepare("INSERT INTO memberships(user_id,org_id,role) VALUES(?,?,?)").run(user.id, session.org.id, role);
    return { ...user, role };
  });
}

function targetMembership(session, userId) {
  const m = db.prepare("SELECT role FROM memberships WHERE user_id=? AND org_id=?").get(String(userId), session.org.id);
  if (!m) throw new HttpError(404, "Mitglied nicht gefunden.");
  if (m.role === "owner") throw new HttpError(403, "Der Inhaber kann nicht geändert oder entfernt werden.");
  if (String(userId) === session.user.id) throw new HttpError(403, "Die eigene Rolle kann nicht geändert werden.");
  if (m.role === "admin" && session.role !== "owner") throw new HttpError(403, "Nur der Inhaber kann Admins ändern.");
  return m;
}
export function setRole(session, userId, role) {
  assertRole(role);
  targetMembership(session, userId);
  if (role === "admin" && session.role !== "owner") throw new HttpError(403, "Nur der Inhaber kann Admins ernennen.");
  db.prepare("UPDATE memberships SET role=? WHERE user_id=? AND org_id=?").run(role, String(userId), session.org.id);
}
export function removeMember(session, userId) {
  targetMembership(session, userId);
  transaction(() => {
    db.prepare("DELETE FROM memberships WHERE user_id=? AND org_id=?").run(String(userId), session.org.id);
    db.prepare("DELETE FROM sessions WHERE user_id=? AND org_id=?").run(String(userId), session.org.id);
  });
}
