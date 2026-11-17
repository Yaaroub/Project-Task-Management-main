import "server-only";
import { createRequire } from "node:module";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

// node:sqlite is loaded at runtime so the bundler leaves it alone.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/*
 * Storage layout
 *   data/funknaht.sqlite        control database: firms, accounts, memberships, sessions
 *   data/tenants/<firm>.sqlite  one database per firm: all of its tasks, projects, stock, notes, events, log
 * A firm's data can be backed up, restored, exported, moved or deleted as one file.
 */
const CONTROL_FILE = resolve(process.env.SQLITE_PATH || "data/funknaht.sqlite");
export const TENANT_DIR = resolve(process.env.TENANT_DIR || join(dirname(CONTROL_FILE), "tenants"));

function pragmas(database) {
  database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;");
}

function openControl() {
  mkdirSync(dirname(CONTROL_FILE), { recursive: true });
  const database = new DatabaseSync(CONTROL_FILE);
  pragmas(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS orgs (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
      password TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
      PRIMARY KEY (user_id, org_id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, expires_at TEXT NOT NULL
    );
    -- Legacy tables from the single-database version. Rows are moved into the firm files on first use.
    CREATE TABLE IF NOT EXISTS documents (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (collection, id));
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  if (!database.prepare("SELECT 1 FROM pragma_table_info('documents') WHERE name='org'").get())
    database.exec("ALTER TABLE documents ADD COLUMN org TEXT");
  database.exec("CREATE INDEX IF NOT EXISTS documents_org ON documents(org)");
  database.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
  return database;
}

// Control database, one connection per server process (kept across hot reloads in development).
export const db = globalThis.__nbControl ?? (globalThis.__nbControl = openControl());

export const newId = () => randomBytes(12).toString("hex");
const isId = id => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
const checkId = id => { if (!isId(id)) throw new HttpError(400, "Ungültige ID."); };

// Transactions may be nested: only the outermost one commits, an error anywhere rolls everything back.
const depth = new WeakMap();
function run(database, fn) {
  const level = depth.get(database) || 0;
  if (level > 0) {
    depth.set(database, level + 1);
    try { return fn(); } finally { depth.set(database, level); }
  }
  database.exec("BEGIN IMMEDIATE");
  depth.set(database, 1);
  try { const result = fn(); database.exec("COMMIT"); return result; }
  catch (error) { database.exec("ROLLBACK"); throw error; }
  finally { depth.set(database, 0); }
}
// Transaction on the control database (accounts, firms, sessions).
export const transaction = fn => run(db, fn);
// Transaction across several collections of one firm (e.g. stock booking + order position).
export const tenantTransaction = (org, fn) => run(tenantDb(org), fn);

/* ---------- Firm databases ---------- */
export const tenantFile = org => { checkId(org); return join(TENANT_DIR, `${org}.sqlite`); };

// Moves rows of this firm (and, if asked, rows without owner) out of the legacy shared tables.
function adopt(database, org, includeOrphans) {
  const where = includeOrphans ? "(org=? OR org IS NULL)" : "org=?";
  const rows = db.prepare(`SELECT collection,id,data FROM documents WHERE ${where}`).all(org);
  const legacy = db.prepare("SELECT key,value FROM settings WHERE key LIKE ? OR (? AND key='announcement')").all(`${org}:%`, includeOrphans ? 1 : 0);
  if (!rows.length && !legacy.length) return 0;
  run(database, () => {
    const insert = database.prepare("INSERT OR IGNORE INTO documents(collection,id,data) VALUES(?,?,?)");
    for (const r of rows) insert.run(r.collection, r.id, r.data);
    const set = database.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)");
    for (const s of legacy) set.run(s.key.includes(":") ? s.key.split(":").slice(1).join(":") : s.key, s.value);
  });
  db.prepare(`DELETE FROM documents WHERE ${where}`).run(org);
  for (const s of legacy) db.prepare("DELETE FROM settings WHERE key=?").run(s.key);
  return rows.length;
}

const cache = globalThis.__nbTenants ?? (globalThis.__nbTenants = new Map());
const MAX_OPEN = Number(process.env.TENANT_CACHE || 200);

export function tenantDb(org) {
  const file = tenantFile(org);
  const hit = cache.get(org);
  if (hit) { cache.delete(org); cache.set(org, hit); return hit; } // keep most recently used at the end
  mkdirSync(TENANT_DIR, { recursive: true });
  const database = new DatabaseSync(file);
  pragmas(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (collection, id));
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS activity_time ON documents(json_extract(data,'$.createdAt')) WHERE collection='activity';
  `);
  adopt(database, org, false);
  cache.set(org, database);
  if (cache.size > MAX_OPEN) { const [oldest, handle] = cache.entries().next().value; handle.close(); cache.delete(oldest); }
  return database;
}

// First firm takes over data from the single-user version (rows without owner).
export const adoptOrphans = org => adopt(tenantDb(org), org, true);

export function deleteTenant(org) {
  const file = tenantFile(org);
  const handle = cache.get(org);
  if (handle) { handle.close(); cache.delete(org); }
  for (const suffix of ["", "-wal", "-shm"]) if (existsSync(file + suffix)) rmSync(file + suffix, { force: true });
}

/* ---------- Documents inside one firm database ---------- */
export function collection(name, org) {
  const database = tenantDb(org);
  const read = id => {
    const row = database.prepare("SELECT data FROM documents WHERE collection=? AND id=?").get(name, id);
    return row ? JSON.parse(row.data) : null;
  };
  return {
    list() {
      return database.prepare("SELECT data FROM documents WHERE collection=?").all(name).map(r => JSON.parse(r.data));
    },
    get(id) {
      checkId(id);
      const doc = read(id);
      if (!doc) throw new HttpError(404, "Eintrag nicht gefunden.");
      return doc;
    },
    create(fields) {
      const now = new Date().toISOString();
      const doc = { _id: newId(), ...fields, createdAt: now, updatedAt: now };
      database.prepare("INSERT INTO documents(collection,id,data) VALUES(?,?,?)").run(name, doc._id, JSON.stringify(doc));
      return doc;
    },
    // apply() runs inside an immediate transaction, so stock bookings cannot race.
    change(id, apply) {
      checkId(id);
      return run(database, () => {
        const previous = read(id);
        if (!previous) throw new HttpError(404, "Eintrag nicht gefunden.");
        const next = { ...previous, ...apply(previous), _id: id, updatedAt: new Date().toISOString() };
        database.prepare("UPDATE documents SET data=? WHERE collection=? AND id=?").run(JSON.stringify(next), name, id);
        return next;
      });
    },
    remove(id) {
      checkId(id);
      const row = database.prepare("DELETE FROM documents WHERE collection=? AND id=? RETURNING data").get(name, id);
      if (!row) throw new HttpError(404, "Eintrag nicht gefunden.");
      return JSON.parse(row.data);
    },
  };
}

export function getSetting(org, key, fallback = "") {
  const row = tenantDb(org).prepare("SELECT value FROM settings WHERE key=?").get(key);
  return row ? JSON.parse(row.value) : fallback;
}
export function setSetting(org, key, value) {
  tenantDb(org).prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value));
  return value;
}

// Audit log per firm: who changed what and when. Newest 1000 entries are kept.
// coalesce: skip if the same person already logged the same entry in the last 10 minutes (autosave).
export function logActivity(session, kind, text, ref = "", { coalesce = false } = {}) {
  const org = session.org.id;
  const database = tenantDb(org);
  if (coalesce) {
    const since = new Date(Date.now() - 10 * 60000).toISOString();
    const recent = database.prepare(`SELECT 1 FROM documents WHERE collection='activity'
      AND json_extract(data,'$.ref')=? AND json_extract(data,'$.userId')=? AND json_extract(data,'$.text')=?
      AND json_extract(data,'$.createdAt')>? LIMIT 1`).get(ref, session.user.id, text, since);
    if (recent) return;
  }
  collection("activity", org).create({ kind, text, ref, userId: session.user.id, user: session.user.name });
  database.prepare(`DELETE FROM documents WHERE collection='activity' AND id NOT IN (
    SELECT id FROM documents WHERE collection='activity' ORDER BY json_extract(data,'$.createdAt') DESC LIMIT 1000)`).run();
}
