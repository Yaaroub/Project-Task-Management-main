import "server-only";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { db, getSetting, setSetting } from "./db";
import { resource } from "./resources";

// Calendar subscription: a secret link per firm (<firm-id>-<secret>.ics). Only the hash is stored.
const hash = value => createHash("sha256").update(value).digest();

export function createFeedToken(org) {
  const secret = randomBytes(24).toString("base64url");
  setSetting(org, "icalSecretHash", hash(secret).toString("hex"));
  return `${org}-${secret}`;
}
export const revokeFeedToken = org => setSetting(org, "icalSecretHash", "");
export const feedActive = org => !!getSetting(org, "icalSecretHash", "");

// Returns the firm for a valid token, else null. Unknown firm IDs never open (or create) a database.
export function orgForToken(token) {
  const clean = String(token || "").replace(/\.ics$/i, "");
  const org = clean.slice(0, 24), secret = clean.slice(25);
  if (!/^[a-f0-9]{24}$/i.test(org) || clean[24] !== "-" || secret.length < 20) return null;
  const firm = db.prepare("SELECT id, name FROM orgs WHERE id=?").get(org);
  if (!firm) return null;
  const stored = getSetting(org, "icalSecretHash", "");
  if (!stored) return null;
  return timingSafeEqual(hash(secret), Buffer.from(stored, "hex")) ? firm : null;
}

const esc = s => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = d => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = s => String(s).replace(/-/g, "");
const nextDay = s => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replace(/-/g, ""); };
// RFC 5545: lines longer than 75 octets are folded.
function fold(line) {
  const out = [];
  let buf = Buffer.from(line, "utf8");
  while (buf.length > 75) {
    let cut = 75;
    while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut--; // do not split a UTF-8 character
    out.push(buf.subarray(0, cut).toString("utf8"));
    buf = Buffer.concat([Buffer.from(" "), buf.subarray(cut)]);
  }
  out.push(buf.toString("utf8"));
  return out.join("\r\n");
}

// Wall-clock time in Germany, so repeating appointments keep their time across summer time in every calendar app.
const berlinParts = d => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(d)).map(p => [p.type, p.value]));
const berlin = d => { const p = berlinParts(d); return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`; };
const berlinDay = d => berlin(d).slice(0, 8);
const plusDay = ymd => { const x = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + 1)); return x.toISOString().slice(0, 10).replace(/-/g, ""); };
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const VTIMEZONE = ["BEGIN:VTIMEZONE", "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE"];

function rrule(r, allDay) {
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === "weekly" && r.byDay?.length) parts.push("BYDAY=" + r.byDay.map(d => BYDAY[d]).join(","));
  if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, "")}${allDay ? "" : "T235959Z"}`);
  else if (r.count) parts.push(`COUNT=${r.count}`);
  return "RRULE:" + parts.join(";");
}
// Reminders become alarms in phone and desktop calendars (if the app honours alarms of subscribed calendars).
const alarm = (m, title) => ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`,
  `TRIGGER:${m === 0 ? "PT0M" : m % 1440 === 0 ? `-P${m / 1440}D` : `-PT${m}M`}`, "END:VALARM"];

export function buildCalendar(firm) {
  const events = resource("events", firm.id), tasks = resource("tasks", firm.id);
  const now = stamp(Date.now());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FUNKNAHT//Nahtbord//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`Nahtbord · ${firm.name}`)}`, "X-WR-TIMEZONE:Europe/Berlin", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H", ...VTIMEZONE];
  for (const e of events.store.list().map(events.normalize)) {
    const start = e.allDay ? [`DTSTART;VALUE=DATE:${berlinDay(e.startDate)}`, `DTEND;VALUE=DATE:${plusDay(berlinDay(e.endDate))}`]
      : [`DTSTART;TZID=Europe/Berlin:${berlin(e.startDate)}`, `DTEND;TZID=Europe/Berlin:${berlin(e.endDate)}`];
    const time = berlin(e.startDate).slice(8);
    const ex = e.recurrence ? e.exdates.map(d => e.allDay ? `EXDATE;VALUE=DATE:${d.replace(/-/g, "")}` : `EXDATE;TZID=Europe/Berlin:${d.replace(/-/g, "")}${time}`) : [];
    lines.push("BEGIN:VEVENT", `UID:${e._id}@nahtbord`, `DTSTAMP:${now}`, ...start,
      ...(e.recurrence ? [rrule(e.recurrence, e.allDay), ...ex] : []),
      `SUMMARY:${esc(e.title)}`, ...(e.location ? [`LOCATION:${esc(e.location)}`] : []), ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      ...(e.allDay ? ["TRANSP:TRANSPARENT"] : []), ...e.reminders.flatMap(m => alarm(m, e.title)), "END:VEVENT");
  }
  for (const t of tasks.store.list().map(tasks.normalize)) {
    if (!t.meta.dueDate || t.status === "done") continue;
    lines.push("BEGIN:VEVENT", `UID:task-${t._id}@nahtbord`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${dateOnly(t.meta.dueDate)}`,
      `DTEND;VALUE=DATE:${nextDay(t.meta.dueDate)}`, `SUMMARY:${esc(`Fällig: ${t.headline}`)}`,
      `DESCRIPTION:${esc(`Priorität ${t.meta.priority}${t.meta.assignee ? ` · ${t.meta.assignee}` : ""}`)}`, "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  const orders = resource("orders", firm.id);
  for (const o of orders.store.list().map(orders.normalize)) {
    if (!o.dueDate || !["beauftragt", "in_arbeit"].includes(o.status)) continue;
    lines.push("BEGIN:VEVENT", `UID:order-${o._id}@nahtbord`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${dateOnly(o.dueDate)}`,
      `DTEND;VALUE=DATE:${nextDay(o.dueDate)}`, `SUMMARY:${esc(`Auftrag ${o.number}: ${o.title}`)}`, ...(o.address ? [`LOCATION:${esc(o.address)}`] : []), "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
