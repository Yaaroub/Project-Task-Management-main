// Calendar rules shared by server and browser: repeating appointments, reminders and alarms.

export const REMINDERS = [
  [0, "Zum Beginn"], [5, "5 Minuten vorher"], [10, "10 Minuten vorher"], [15, "15 Minuten vorher"], [30, "30 Minuten vorher"],
  [60, "1 Stunde vorher"], [120, "2 Stunden vorher"], [1440, "1 Tag vorher"], [2880, "2 Tage vorher"], [10080, "1 Woche vorher"],
];
export const REMINDER_MINUTES = REMINDERS.map(r => r[0]);
export const reminderLabel = m => REMINDERS.find(r => r[0] === m)?.[1] || `${m} Minuten vorher`;

export const FREQS = [["daily", "Täglich", "Tag", "Tage"], ["weekly", "Wöchentlich", "Woche", "Wochen"], ["monthly", "Monatlich", "Monat", "Monate"], ["yearly", "Jährlich", "Jahr", "Jahre"]];
// JavaScript weekday numbers (0 = Sunday) in German order, Monday first.
export const WEEKDAYS = [[1, "Mo"], [2, "Di"], [3, "Mi"], [4, "Do"], [5, "Fr"], [6, "Sa"], [0, "So"]];
export const SOUNDS = [["klassisch", "Klassischer Wecker"], ["sanft", "Sanfter Gong"], ["digital", "Digital-Piepen"]];

const pad = n => String(n).padStart(2, "0");
export const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Plain-language summary of a repetition, e.g. "Alle 2 Wochen am Mo, Mi · bis 31.12.2026".
export function describeRecurrence(r) {
  if (!r?.freq) return "";
  const f = FREQS.find(x => x[0] === r.freq);
  let text = r.interval > 1 ? `Alle ${r.interval} ${f[3]}` : f[1];
  if (r.freq === "weekly" && r.byDay?.length) text += " am " + WEEKDAYS.filter(([d]) => r.byDay.includes(d)).map(w => w[1]).join(", ");
  if (r.until) text += ` · bis ${new Date(r.until + "T12:00:00").toLocaleDateString("de-DE")}`;
  else if (r.count) text += ` · ${r.count}-mal`;
  return text;
}

/**
 * All occurrences of an appointment that overlap [from, to): [{ start: Date, end: Date, key }].
 * key is the local start day (YYYY-MM-DD) – it identifies a single occurrence (e.g. for "nur diesen Termin löschen").
 * Repetitions follow the local wall clock, so 9:00 stays 9:00 across the change to summer time.
 */
export function occurrences(ev, from, to, limit = 1000) {
  const first = new Date(ev.startDate), duration = Math.max(0, new Date(ev.endDate) - first);
  const out = [];
  const take = start => {
    const end = new Date(start.getTime() + duration);
    if (end >= from && start < to && !(ev.exdates || []).includes(dayKey(start))) out.push({ start, end, key: dayKey(start) });
  };
  const r = ev.recurrence;
  if (!r?.freq) { take(first); return out; }
  const interval = Math.max(1, r.interval || 1);
  const until = r.until ? new Date(r.until + "T23:59:59") : null;
  let n = 0; // counted occurrences (for "count")
  const at = (y, m, d) => new Date(y, m, d, first.getHours(), first.getMinutes(), first.getSeconds());

  if (r.freq === "weekly") {
    const days = r.byDay?.length ? r.byDay : [first.getDay()];
    const weekStart = at(first.getFullYear(), first.getMonth(), first.getDate() - ((first.getDay() + 6) % 7)); // Monday of the first week
    for (let w = 0; w < 5300; w += interval) {
      for (const [d] of WEEKDAYS) {
        if (!days.includes(d)) continue;
        const start = at(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + w * 7 + ((d + 6) % 7));
        if (start < first) continue;
        if ((until && start > until) || (r.count && n >= r.count) || start >= to || out.length >= limit) return out;
        n++;
        take(start);
      }
    }
    return out;
  }
  for (let i = 0; i < 40000; i++) {
    const y = first.getFullYear(), m = first.getMonth(), d = first.getDate();
    const step = i * interval;
    const start = r.freq === "daily" ? at(y, m, d + step) : r.freq === "monthly" ? at(y, m + step, d) : at(y + step, m, d);
    // 31st in a 30-day month, 29 February outside leap years: that occurrence does not exist.
    if (r.freq !== "daily" && start.getDate() !== d) continue;
    if ((until && start > until) || (r.count && n >= r.count) || start >= to || out.length >= limit) return out;
    n++;
    take(start);
  }
  return out;
}

// The person is invited if the appointment has no attendee list (whole team) or lists them.
export const concerns = (ev, userId) => !ev.attendees?.length || ev.attendees.includes(userId);

// Next ring time of an alarm after "after" (Date), or null. days: weekdays to repeat; empty = once on "date".
export function nextAlarm(alarm, after = new Date()) {
  if (!alarm.enabled || !/^\d{2}:\d{2}$/.test(alarm.time || "")) return null;
  const [h, m] = alarm.time.split(":").map(Number);
  if (!alarm.days?.length) {
    if (!alarm.date) return null;
    const [y, mo, d] = alarm.date.split("-").map(Number);
    const at = new Date(y, mo - 1, d, h, m);
    return at > after ? at : null;
  }
  for (let i = 0; i < 8; i++) {
    const at = new Date(after.getFullYear(), after.getMonth(), after.getDate() + i, h, m);
    if (at > after && alarm.days.includes(at.getDay())) return at;
  }
  return null;
}

// Everything that should ring between from and to for one person: reminders of appointments they attend, and their own alarms.
export function dueReminders(events, alarms, userId, from, to) {
  const out = [];
  for (const ev of events) {
    if (!ev.reminders?.length || !concerns(ev, userId)) continue;
    const latest = Math.max(...ev.reminders);
    for (const occ of occurrences(ev, new Date(from.getTime()), new Date(to.getTime() + latest * 60000), 200)) {
      for (const m of ev.reminders) {
        const at = new Date(occ.start.getTime() - m * 60000);
        if (at >= from && at <= to) out.push({ key: `e:${ev._id}:${occ.key}:${m}`, at, kind: "event", title: ev.title, start: occ.start, location: ev.location || "", note: reminderLabel(m), href: `/calendar?open=${ev._id}`, sound: "sanft" });
      }
    }
  }
  for (const a of alarms) {
    const at = nextAlarm(a, new Date(from.getTime() - 1));
    if (at && at <= to) out.push({ key: `a:${a._id}:${dayKey(at)}:${a.time}`, at, kind: "alarm", title: a.label || "Wecker", start: at, note: "Wecker", sound: a.sound, alarm: a, href: "/calendar?wecker=1" });
  }
  return out.sort((a, b) => a.at - b.at);
}
