import "server-only";
import webpush from "web-push";
import { db, HttpError, collection, getSetting, setSetting } from "./db";
import { listMembers } from "./auth";
import { resource } from "./resources";
import { dueReminders } from "./calendar-shared";

/*
 * Web Push: reminders and alarms reach the phone or computer even when no Nahtbord tab is open.
 * The browser hands us a "subscription" (an address at the push service of Google, Mozilla, Apple or Microsoft
 * plus two keys). Messages are encrypted for that device (RFC 8291) and signed with our VAPID key (RFC 8292).
 */

// Server key pair: from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, otherwise created once and kept in the control database.
db.exec("CREATE TABLE IF NOT EXISTS server_keys (name TEXT PRIMARY KEY, value TEXT NOT NULL)");
export function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  const row = db.prepare("SELECT value FROM server_keys WHERE name='vapid'").get();
  if (row) return JSON.parse(row.value);
  db.prepare("INSERT OR IGNORE INTO server_keys(name,value) VALUES('vapid',?)").run(JSON.stringify(webpush.generateVAPIDKeys()));
  return JSON.parse(db.prepare("SELECT value FROM server_keys WHERE name='vapid'").get().value);
}
// Contact of the operator for the push services (they reach out if something goes wrong).
const subject = () => process.env.VAPID_SUBJECT || "https://hexel-pi.vercel.app";

// Only real push services: a subscription must not make the server call arbitrary addresses.
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com", "wns.windows.com"];
function allowedEndpoint(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch { return false; }
  const extra = (process.env.PUSH_ALLOW_HOSTS || "").split(",").map(h => h.trim()).filter(Boolean); // e.g. a test stub
  if (extra.includes(url.hostname) && ["http:", "https:"].includes(url.protocol)) return true;
  return url.protocol === "https:" && PUSH_HOSTS.some(h => url.hostname === h || url.hostname.endsWith("." + h));
}

const subs = org => collection("pushsubs", org);
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export function subscribe(session, input, userAgent = "") {
  const sub = input?.subscription;
  const endpoint = sub?.endpoint, p256dh = sub?.keys?.p256dh, auth = sub?.keys?.auth;
  if (typeof endpoint !== "string" || endpoint.length > 1000 || !allowedEndpoint(endpoint)) throw new HttpError(400, "Dieser Push-Dienst wird nicht unterstützt.");
  if (typeof p256dh !== "string" || !B64URL.test(p256dh) || p256dh.length < 80 || p256dh.length > 100 || typeof auth !== "string" || !B64URL.test(auth) || auth.length < 16 || auth.length > 32)
    throw new HttpError(400, "Ungültige Push-Anmeldung.");
  const store = subs(session.org.id);
  // One entry per device; the same browser signing in as someone else takes the entry over.
  for (const old of store.list().filter(s => s.endpoint === endpoint)) store.remove(old._id);
  const own = store.list().filter(s => s.userId === session.user.id);
  if (own.length >= 10) store.remove(own.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]._id);
  store.create({ userId: session.user.id, endpoint, keys: { p256dh, auth }, device: String(userAgent).slice(0, 160) });
  return { ok: true, devices: own.length >= 10 ? 10 : own.length + 1 };
}

export function unsubscribe(session, endpoint) {
  const store = subs(session.org.id);
  let removed = 0;
  for (const s of store.list().filter(s => s.userId === session.user.id && (!endpoint || s.endpoint === endpoint))) { store.remove(s._id); removed++; }
  return { removed };
}
export const deviceCount = session => subs(session.org.id).list().filter(s => s.userId === session.user.id).length;

// Sends one message to every device of the given people. Devices the push service no longer knows are removed.
export async function sendTo(org, userIds, message) {
  const { publicKey, privateKey } = vapidKeys();
  const store = subs(org);
  const targets = store.list().filter(s => userIds.includes(s.userId));
  let sent = 0;
  await Promise.all(targets.map(async s => {
    try {
      const req = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(message), {
        vapidDetails: { subject: subject(), publicKey, privateKey }, TTL: message.ttl ?? 3600, urgency: "high", topic: message.tag ? message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(-32) : undefined,
      });
      const res = await fetch(req.endpoint, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(10000) });
      if (res.status === 404 || res.status === 410) store.remove(s._id);
      else if (res.ok) sent++;
      else console.error(`Push an ${new URL(s.endpoint).hostname}: ${res.status}`);
    } catch (error) { console.error("Push fehlgeschlagen:", error.message); }
  }));
  return sent;
}

const hhmm = d => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const GRACE = 15 * 60000;

// One run of the scheduler for one firm: send what became due since the last run (at most 15 minutes back).
export async function checkOrg(org, now = new Date()) {
  const store = subs(org);
  const all = store.list();
  if (!all.length) return 0;
  const members = new Set(listMembers(org).map(m => m.id));
  // People who left the firm get nothing anymore.
  for (const s of all.filter(s => !members.has(s.userId))) store.remove(s._id);
  const people = [...new Set(all.map(s => s.userId).filter(id => members.has(id)))];
  if (!people.length) return 0;
  const events = resource("events", org), alarms = resource("alarms", org);
  const evList = events.store.list().map(events.normalize).filter(e => e.reminders.length);
  const alarmList = alarms.store.list().map(alarms.normalize).filter(a => a.enabled);
  const sentLog = getSetting(org, "pushSent", {});
  const from = new Date(Math.max(now - GRACE, sentLog._last ? Date.parse(sentLog._last) - 1000 : 0));
  let count = 0;
  for (const userId of people) {
    for (const item of dueReminders(evList, alarmList.filter(a => a.userId === userId), userId, from, now)) {
      const key = `${userId}|${item.key}`;
      if (sentLog[key]) continue;
      sentLog[key] = now.toISOString();
      count += await sendTo(org, [userId], {
        title: item.kind === "alarm" ? `⏰ ${item.title}` : item.title,
        body: item.kind === "alarm" ? `Wecker · ${hhmm(item.at)}` : `${hhmm(item.start)} Uhr${item.location ? " · " + item.location : ""} (${item.note})`,
        tag: item.key, url: item.href, alarm: item.kind === "alarm", ttl: item.kind === "alarm" ? 900 : 3600,
      });
    }
  }
  for (const k of Object.keys(sentLog)) if (k !== "_last" && now - Date.parse(sentLog[k]) > 3 * 86400000) delete sentLog[k];
  sentLog._last = now.toISOString();
  setSetting(org, "pushSent", sentLog);
  return count;
}

// All firms that have at least one device registered (the firm list lives in the control database).
export async function checkAll(now = new Date()) {
  let total = 0;
  for (const { id } of db.prepare("SELECT id FROM orgs").all()) {
    try { total += await checkOrg(id, now); } catch (error) { console.error(`Push-Prüfung ${id}:`, error.message); }
  }
  return total;
}

// Started once per server process from instrumentation.js.
export function startScheduler() {
  if (globalThis.__nbPush) return;
  const every = Math.max(1000, Number(process.env.PUSH_INTERVAL_MS) || 60000);
  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { await checkAll(); } finally { busy = false; } };
  globalThis.__nbPush = setInterval(tick, every);
  setTimeout(tick, Math.min(every, 5000));
}
