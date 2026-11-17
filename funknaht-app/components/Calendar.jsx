"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FiChevronLeft, FiChevronRight, FiPlus, FiTrash2, FiDownload, FiMapPin, FiBell, FiRepeat, FiUsers, FiClock, FiBriefcase, FiCheckSquare } from "react-icons/fi";
import { api, useCollection } from "@/lib/client";
import { occurrences, concerns, dayKey, describeRecurrence, REMINDERS, FREQS, WEEKDAYS } from "@/lib/calendar-shared";
import { Modal, Field, PageHead, Skeleton, Swatches, useToast, confirmDelete } from "./ui";
import { useSession } from "./Shell";
import { AlarmManager } from "./Reminders";

const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const VIEWS = [["month", "Monat"], ["week", "Woche"], ["day", "Tag"], ["list", "Liste"]];
const HOUR = 48; // pixels per hour in the week and day view
const pad = n => String(n).padStart(2, "0");
const localInput = d => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hhmm = d => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
const monday = d => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const sameDay = (a, b) => dayKey(a) === dayKey(b);

// Visible period per view.
function range(view, cursor) {
  if (view === "month") { const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const from = monday(first); return [from, addDays(from, 42)]; }
  if (view === "week") { const from = monday(cursor); return [from, addDays(from, 7)]; }
  if (view === "day") { const from = startOfDay(cursor); return [from, addDays(from, 1)]; }
  const from = startOfDay(cursor); return [from, addDays(from, 60)];
}
function title(view, cursor) {
  if (view === "month") return cursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  if (view === "day") return cursor.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const [from, to] = range(view, cursor), last = addDays(to, -1);
  return `${from.toLocaleDateString("de-DE", { day: "numeric", month: "short" })} – ${last.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })}`;
}

/* ---------- Appointment dialog ---------- */
function EventEditor({ value, occ, team, customers, orders, onClose, onSaved, onDeleted }) {
  const toast = useToast();
  const { canEdit, has } = useSession();
  const [d, setD] = useState(value);
  const set = patch => setD(x => ({ ...x, ...patch }));
  const r = d.recurrence || { freq: "", interval: 1, byDay: [], until: "", count: 0 };
  const setR = patch => set({ recurrence: { ...r, ...patch } });
  const endMode = r.until ? "until" : r.count ? "count" : "never";

  const save = async e => {
    e?.preventDefault();
    try {
      const start = d.allDay ? new Date(d.startDay + "T00:00") : new Date(d.start);
      const end = d.allDay ? new Date((d.endDay || d.startDay) + "T23:59") : new Date(d.end || d.start);
      if (end < start) throw new Error("Das Ende liegt vor dem Beginn.");
      const body = { title: d.title, location: d.location, color: d.color, description: d.description, allDay: d.allDay,
        startDate: start.toISOString(), endDate: end.toISOString(), reminders: d.reminders, attendees: d.attendees,
        customerId: d.customerId || "", orderId: d.orderId || "", recurrence: r.freq ? { ...r, byDay: r.freq === "weekly" ? (r.byDay.length ? r.byDay : [start.getDay()]) : [] } : null };
      const saved = d._id ? await api("events/" + d._id, { method: "PATCH", body }) : await api("events", { method: "POST", body });
      onSaved(saved, !d._id);
      toast(d._id ? "Termin gespeichert" : "Termin angelegt");
      onClose();
    } catch (err) { toast(err.message, "error"); }
  };
  const removeAll = async () => {
    if (!confirmDelete(d.recurrence ? `Die ganze Serie „${d.title}“` : `„${d.title}“`)) return;
    try { await api("events/" + d._id, { method: "DELETE" }); onDeleted(d._id); toast("Termin gelöscht"); onClose(); } catch (err) { toast(err.message, "error"); }
  };
  const removeOne = async () => {
    try { onSaved(await api("events/" + d._id, { method: "PATCH", body: { exdates: [...(value.exdates || []), occ.key] } })); toast("Dieser Termin entfällt"); onClose(); }
    catch (err) { toast(err.message, "error"); }
  };

  return (
    <Modal open wide onClose={onClose} title={d._id ? (canEdit ? "Termin bearbeiten" : "Termin") : "Neuer Termin"}
      footer={<>
        {d._id && canEdit && <button className="btn btn--danger" onClick={removeAll}><FiTrash2 /> {d.recurrence ? "Serie löschen" : "Löschen"}</button>}
        {d._id && canEdit && occ && value.recurrence && <button className="btn btn--ghost" onClick={removeOne}>Nur am {new Date(occ.key + "T12:00").toLocaleDateString("de-DE")} absagen</button>}
        <span className="spacer" />
        <button className="btn btn--ghost" onClick={onClose}>{canEdit ? "Abbrechen" : "Schließen"}</button>
        {canEdit && <button className="btn" onClick={save} disabled={!d.title.trim()}>Speichern</button>}
      </>}>
      <form className="stack ev-form" onSubmit={save}>
        <fieldset disabled={!canEdit} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <input className="input ev-title" autoFocus value={d.title} onChange={e => set({ title: e.target.value })} placeholder="Titel, z. B. Abnahme Bauteil 3" maxLength={160} aria-label="Titel" />
          <div className="ev-when">
            <label className="row" style={{ gap: 8, cursor: "pointer" }}><input type="checkbox" checked={d.allDay} onChange={e => set({ allDay: e.target.checked })} style={{ accentColor: "var(--brass)" }} /> Ganztägig</label>
            {d.allDay ? (
              <div className="grid-2">
                <Field label="Von"><input className="input" type="date" value={d.startDay} onChange={e => set({ startDay: e.target.value, endDay: d.endDay < e.target.value ? e.target.value : d.endDay })} /></Field>
                <Field label="Bis"><input className="input" type="date" min={d.startDay} value={d.endDay} onChange={e => set({ endDay: e.target.value })} /></Field>
              </div>
            ) : (
              <div className="grid-2">
                <Field label="Beginn"><input className="input" type="datetime-local" value={d.start} onChange={e => {
                  const dur = new Date(d.end) - new Date(d.start);
                  set({ start: e.target.value, end: localInput(new Date(new Date(e.target.value).getTime() + (dur > 0 ? dur : 3600000))) });
                }} /></Field>
                <Field label="Ende"><input className="input" type="datetime-local" min={d.start} value={d.end} onChange={e => set({ end: e.target.value })} /></Field>
              </div>
            )}
          </div>

          <div className="grid-2">
            <Field label={<><FiRepeat /> Wiederholung</>}>
              <select className="select" value={r.freq} onChange={e => set({ recurrence: e.target.value ? { ...r, freq: e.target.value } : null })}>
                <option value="">Keine</option>{FREQS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            {r.freq && (
              <Field label={`Alle … ${FREQS.find(f => f[0] === r.freq)[3]}`}><input className="input" type="number" min="1" max="99" value={r.interval} onChange={e => setR({ interval: Number(e.target.value) || 1 })} /></Field>
            )}
          </div>
          {r.freq === "weekly" && (
            <div className="seg daypick" role="group" aria-label="Wochentage">
              {WEEKDAYS.map(([n, l]) => <button type="button" key={n} aria-pressed={r.byDay.includes(n)} onClick={() => setR({ byDay: r.byDay.includes(n) ? r.byDay.filter(x => x !== n) : [...r.byDay, n] })}>{l}</button>)}
            </div>
          )}
          {r.freq && (
            <div className="row ev-end">
              <span className="muted">Endet</span>
              <div className="seg">
                <button type="button" aria-pressed={endMode === "never"} onClick={() => setR({ until: "", count: 0 })}>Nie</button>
                <button type="button" aria-pressed={endMode === "until"} onClick={() => setR({ until: dayKey(addDays(new Date(), 90)), count: 0 })}>Am</button>
                <button type="button" aria-pressed={endMode === "count"} onClick={() => setR({ until: "", count: 10 })}>Nach</button>
              </div>
              {endMode === "until" && <input className="input" style={{ width: "auto" }} type="date" value={r.until} onChange={e => setR({ until: e.target.value })} />}
              {endMode === "count" && <><input className="input" style={{ width: 90 }} type="number" min="1" max="999" value={r.count} onChange={e => setR({ count: Number(e.target.value) || 1 })} /><span className="muted">Terminen</span></>}
              <span className="muted ev-rule">{describeRecurrence({ ...r, byDay: r.byDay })}</span>
            </div>
          )}

          <Field label={<><FiBell /> Erinnerung</>}>
            <div className="chips">
              {REMINDERS.map(([m, l]) => <button type="button" key={m} className="pickchip" aria-pressed={d.reminders.includes(m)}
                onClick={() => set({ reminders: d.reminders.includes(m) ? d.reminders.filter(x => x !== m) : d.reminders.length >= 5 ? d.reminders : [...d.reminders, m] })}>{l}</button>)}
            </div>
          </Field>

          {team.length > 1 && (
            <Field label={<><FiUsers /> Teilnehmer ({d.attendees.length ? d.attendees.length : "ganzes Team"})</>}>
              <div className="chips">
                {team.map(m => <button type="button" key={m.id} className="pickchip" aria-pressed={d.attendees.includes(m.id)}
                  onClick={() => set({ attendees: d.attendees.includes(m.id) ? d.attendees.filter(x => x !== m.id) : [...d.attendees, m.id] })}>{m.name}</button>)}
              </div>
            </Field>
          )}

          <div className="grid-2">
            <Field label={<><FiMapPin /> Ort</>}><input className="input" value={d.location} onChange={e => set({ location: e.target.value })} placeholder="z. B. Werkstatt Plön" /></Field>
            <Field label="Farbe"><Swatches value={d.color} onChange={color => set({ color })} /></Field>
            {has("customers") && (
              <Field label="Kunde"><select className="select" value={d.customerId} onChange={e => set({ customerId: e.target.value, orderId: "" })}>
                <option value="">Kein Kunde</option>{customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>
            )}
            {has("orders") && (
              <Field label="Auftrag"><select className="select" value={d.orderId} onChange={e => { const o = orders.find(x => x._id === e.target.value); set({ orderId: e.target.value, customerId: o ? o.customerId : d.customerId }); }}>
                <option value="">Kein Auftrag</option>{orders.filter(o => !d.customerId || o.customerId === d.customerId).map(o => <option key={o._id} value={o._id}>{o.number} · {o.title}</option>)}</select></Field>
            )}
          </div>
          <Field label="Beschreibung"><textarea className="textarea" style={{ minHeight: 80 }} maxLength={4000} value={d.description} onChange={e => set({ description: e.target.value })} placeholder="Ablauf, Ansprechpartner, Zugang …" /></Field>
        </fieldset>
      </form>
    </Modal>
  );
}

const toDraft = e => {
  const s = new Date(e.startDate), en = new Date(e.endDate);
  return { ...e, start: localInput(s), end: localInput(en), startDay: dayKey(s), endDay: dayKey(en), recurrence: e.recurrence ? { ...e.recurrence, byDay: e.recurrence.byDay || [] } : null };
};

/* ---------- Views ---------- */
function Chip({ entry, onOpen, draggable }) {
  const { kind, item, start } = entry;
  const label = kind === "event" ? `${entry.allDay ? "" : hhmm(start) + " "}${item.title}` : kind === "order" ? `${item.number} ${item.title}` : item.headline;
  return (
    <button className={`chip ${kind === "event" ? "c-" + item.color : kind === "order" ? "chip--order" : "chip--task"}`} title={label}
      draggable={draggable} onDragStart={e => { e.dataTransfer.setData("text/plain", JSON.stringify({ id: item._id, start: start.getTime() })); e.dataTransfer.effectAllowed = "move"; }}
      onClick={e => { e.stopPropagation(); onOpen(entry); }}>
      {kind === "event" && item.recurrence && <FiRepeat className="chip__icon" />}{kind === "event" && item.reminders?.length > 0 && <FiBell className="chip__icon" />}{label}
    </button>
  );
}

function MonthView({ cursor, entries, onOpen, onCreate, onDrop, canEdit }) {
  const [from] = range("month", cursor);
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const today = dayKey(new Date());
  const byDay = useMemo(() => {
    const map = {};
    for (const e of entries) for (let d = startOfDay(e.start); d <= e.end && d < addDays(from, 42); d = addDays(d, 1)) (map[dayKey(d)] ??= []).push(e);
    for (const list of Object.values(map)) list.sort((a, b) => (b.allDay - a.allDay) || a.start - b.start);
    return map;
  }, [entries, from]);
  return (
    <div className="cal">
      {DOW.map(d => <div key={d} className="cal__dow">{d}</div>)}
      {days.map(d => {
        const key = dayKey(d), list = byDay[key] || [];
        return (
          <div key={key} className="cal__day" data-out={d.getMonth() !== cursor.getMonth()} data-today={key === today}
            onClick={() => onCreate(d)} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onCreate(d)} aria-label={`${d.toLocaleDateString("de-DE")} – ${list.length} Einträge`}
            onDragOver={e => canEdit && e.preventDefault()} onDrop={e => { e.preventDefault(); onDrop(e, d, false); }}>
            <b>{d.getDate()}</b>
            {list.slice(0, 4).map(en => <Chip key={en.kind + en.item._id + en.start.getTime()} entry={en} onOpen={onOpen} draggable={canEdit && en.kind === "event"} />)}
            {list.length > 4 && <small className="muted">+{list.length - 4} weitere</small>}
          </div>
        );
      })}
    </div>
  );
}

// Week and day view: hours on the left, appointments placed by time; all-day entries in a row on top.
function TimeGrid({ days, entries, onOpen, onCreate, onDrop, canEdit }) {
  const scroller = useRef(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 7 * HOUR; }, []);
  const timed = entries.filter(e => e.kind === "event" && !e.allDay);
  const allDay = entries.filter(e => !(e.kind === "event" && !e.allDay));

  // Overlapping appointments share the column width.
  const layout = day => {
    const list = timed.filter(e => e.start < addDays(day, 1) && e.end > day).sort((a, b) => a.start - b.start || b.end - a.end);
    const cols = [];
    for (const e of list) {
      let c = cols.findIndex(end => end <= e.start);
      if (c < 0) { c = cols.length; cols.push(e.end); } else cols[c] = e.end;
      e._col = c;
    }
    return list.map(e => ({ e, cols: cols.length }));
  };
  const slot = (day, ev) => {
    const y = ev.nativeEvent.offsetY;
    const minutes = Math.max(0, Math.min(23 * 60 + 30, Math.floor(y / (HOUR / 2)) * 30));
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
  };

  return (
    <div className="tg" style={{ "--days": days.length }}>
      <div className="tg__head">
        <span />
        {days.map(d => <div key={dayKey(d)} className="tg__dayhead" data-today={sameDay(d, now)}><small>{DOW[(d.getDay() + 6) % 7]}</small><b>{d.getDate()}</b></div>)}
      </div>
      <div className="tg__allday">
        <span className="muted">ganztags</span>
        {days.map(d => (
          <div key={dayKey(d)} onDragOver={e => canEdit && e.preventDefault()} onDrop={e => { e.preventDefault(); onDrop(e, d, false); }} onClick={() => onCreate(d, true)}>
            {allDay.filter(e => startOfDay(e.start) <= d && e.end >= d).map(en => <Chip key={en.kind + en.item._id + en.start.getTime()} entry={en} onOpen={onOpen} draggable={canEdit && en.kind === "event"} />)}
          </div>
        ))}
      </div>
      <div className="tg__body" ref={scroller}>
        <div className="tg__hours">{Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * HOUR }}>{pad(h)}:00</span>)}</div>
        {days.map(day => (
          <div key={dayKey(day)} className="tg__col" style={{ height: 24 * HOUR }} onClick={e => e.target === e.currentTarget && onCreate(slot(day, e))}
            onDragOver={e => canEdit && e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.target === e.currentTarget) onDrop(e, slot(day, e), true); }}>
            {sameDay(day, now) && <i className="tg__now" style={{ top: (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR }} />}
            {layout(day).map(({ e, cols }) => {
              const s = Math.max(e.start, day), en = Math.min(e.end, addDays(day, 1));
              const top = ((s - day) / 3600000) * HOUR, height = Math.max(20, ((en - s) / 3600000) * HOUR - 2);
              return (
                <button key={e.item._id + e.start.getTime()} className={`tg__ev c-${e.item.color}`} style={{ top, height, left: `calc(${(e._col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }}
                  draggable={canEdit} onDragStart={ev => { ev.dataTransfer.setData("text/plain", JSON.stringify({ id: e.item._id, start: e.start.getTime() })); }}
                  onClick={ev => { ev.stopPropagation(); onOpen(e); }} title={`${hhmm(e.start)} – ${hhmm(e.end)} ${e.item.title}`}>
                  <b>{e.item.title}</b><small>{hhmm(e.start)} – {hhmm(e.end)}{e.item.location ? ` · ${e.item.location}` : ""}</small>
                  {(e.item.recurrence || e.item.reminders?.length > 0) && <span className="tg__icons">{e.item.recurrence && <FiRepeat />}{e.item.reminders?.length > 0 && <FiBell />}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListView({ entries, onOpen }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const e of [...entries].sort((a, b) => a.start - b.start)) { const k = dayKey(e.start); if (!map.has(k)) map.set(k, []); map.get(k).push(e); }
    return [...map];
  }, [entries]);
  if (!groups.length) return <div className="empty"><FiClock /><div>In den nächsten 60 Tagen steht nichts an.</div></div>;
  const today = dayKey(new Date());
  return (
    <div className="agenda">
      {groups.map(([k, list]) => (
        <section key={k} className="card agenda__day" data-today={k === today}>
          <h3>{new Date(k + "T12:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}{k === today && <span className="badge badge--brass">Heute</span>}</h3>
          <ul className="list">
            {list.map(e => (
              <li key={e.kind + e.item._id + e.start.getTime()} className={e.kind === "event" ? "c-" + e.item.color : ""}>
                <span className="agenda__time">{e.kind !== "event" || e.allDay ? "ganztags" : `${hhmm(e.start)} – ${hhmm(e.end)}`}</span>
                <span className="dot" style={{ background: e.kind === "event" ? "var(--c)" : e.kind === "order" ? "var(--brass)" : "var(--warn)" }} />
                <button className="agenda__title" onClick={() => onOpen(e)}>
                  {e.kind === "order" && <FiBriefcase />}{e.kind === "task" && <FiCheckSquare />}
                  {e.kind === "event" ? e.item.title : e.kind === "order" ? `${e.item.number} ${e.item.title}` : `Fällig: ${e.item.headline}`}
                </button>
                {e.kind === "event" && e.item.location && <span className="muted"><FiMapPin style={{ verticalAlign: -2 }} /> {e.item.location}</span>}
                <span className="spacer" />
                {e.kind === "event" && e.item.recurrence && <FiRepeat className="muted" title={describeRecurrence(e.item.recurrence)} />}
                {e.kind === "event" && e.item.reminders?.length > 0 && <FiBell className="muted" />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------- Page ---------- */
export default function Calendar() {
  const toast = useToast();
  const { canEdit, has, user } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const events = useCollection("events");
  const tasks = useCollection(has("tasks") ? "tasks" : "events");
  const orders = useCollection(has("orders") ? "orders" : "events");
  const customers = useCollection(has("customers") ? "customers" : "events");
  const [team, setTeam] = useState([]);
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [dir, setDir] = useState(0);
  const [show, setShow] = useState({ events: true, orders: true, tasks: true, mine: false });
  const [editing, setEditing] = useState(null);
  const [alarms, setAlarms] = useState(false);

  useEffect(() => { api("team").then(setTeam).catch(() => {}); }, []);
  useEffect(() => { try { const v = localStorage.getItem("calView"); if (VIEWS.some(x => x[0] === v)) setView(v); } catch {} }, []);
  const switchView = v => { setView(v); try { localStorage.setItem("calView", v); } catch {} };

  const blank = (start, allDay = false) => {
    const s = start || new Date(new Date().setMinutes(0, 0, 0) + 3600000);
    const hasTime = !!start && (start.getHours() || start.getMinutes());
    const st = hasTime || !start ? s : new Date(s.getFullYear(), s.getMonth(), s.getDate(), 9);
    return toDraft({ title: "", location: "", description: "", color: "fjord", allDay, startDate: st.toISOString(), endDate: new Date(st.getTime() + 3600000).toISOString(),
      reminders: [15], attendees: [], customerId: "", orderId: "", recurrence: null, exdates: [] });
  };
  const create = (start, allDay) => canEdit && setEditing({ draft: blank(start, allDay) });
  useEffect(() => {
    if (params.get("new")) { create(); router.replace("/calendar"); }
    if (params.get("wecker")) { setAlarms(true); router.replace("/calendar"); }
    const open = params.get("open");
    if (open && events.items) { const e = events.items.find(x => x._id === open); if (e) setEditing({ draft: toDraft(e), source: e }); router.replace("/calendar"); }
  }, [params, events.items]); // eslint-disable-line react-hooks/exhaustive-deps

  const [from, to] = range(view, cursor);
  const entries = useMemo(() => {
    const out = [];
    if (show.events) for (const ev of events.items || []) {
      if (show.mine && !concerns(ev, user.id)) continue;
      for (const o of occurrences(ev, from, to, 500)) out.push({ kind: "event", item: ev, start: o.start, end: o.end, key: o.key, allDay: ev.allDay });
    }
    const dateEntry = (kind, item, day) => { const s = new Date(day + "T00:00"); if (s >= addDays(from, -1) && s < to) out.push({ kind, item, start: s, end: new Date(day + "T23:59"), allDay: true }); };
    if (show.tasks && has("tasks")) for (const t of tasks.items || []) if (t.meta?.dueDate && t.status !== "done" && (!show.mine || !t.meta.assignee || t.meta.assignee === user.name)) dateEntry("task", t, t.meta.dueDate);
    if (show.orders && has("orders")) for (const o of orders.items || []) if (o.dueDate && ["beauftragt", "in_arbeit"].includes(o.status)) dateEntry("order", o, o.dueDate);
    return out;
  }, [events.items, tasks.items, orders.items, show, from.getTime(), to.getTime(), user.id, user.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const shift = n => {
    setDir(n);
    setCursor(c => view === "month" ? new Date(c.getFullYear(), c.getMonth() + n, 1) : addDays(c, n * (view === "week" ? 7 : view === "day" ? 1 : 30)));
  };
  const openEntry = en => {
    if (en.kind === "order") return router.push(`/orders?open=${en.item._id}`);
    if (en.kind === "task") return router.push(`/tasks?open=${en.item._id}`);
    setEditing({ draft: toDraft(en.item), source: en.item, occ: en.item.recurrence ? { key: en.key } : null });
  };

  // Drag and drop: move to another day (keeps the time) or, in week/day view, to a time slot (keeps the length).
  const onDrop = async (e, target, withTime) => {
    if (!canEdit) return;
    let data;
    try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
    const ev = (events.items || []).find(x => x._id === data.id);
    if (!ev) return;
    const occStart = new Date(data.start);
    const newStart = withTime ? target : new Date(target.getFullYear(), target.getMonth(), target.getDate(), occStart.getHours(), occStart.getMinutes());
    const delta = newStart - occStart;
    if (!delta) return;
    if (ev.recurrence && !window.confirm("Das ist ein Serientermin. Die ganze Serie verschieben?")) return;
    const body = { startDate: new Date(new Date(ev.startDate).getTime() + delta).toISOString(), endDate: new Date(new Date(ev.endDate).getTime() + delta).toISOString() };
    events.replace({ ...ev, ...body }); // optimistic
    try { events.replace(await api("events/" + ev._id, { method: "PATCH", body })); toast(`„${ev.title}“ verschoben auf ${newStart.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}${withTime ? ", " + hhmm(newStart) : ""}`); }
    catch (err) { events.replace(ev); toast(err.message, "error"); }
    window.dispatchEvent(new Event("nahtbord:reminders"));
  };

  const weekDays = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(from, i)) : [from];
  const onSaved = (doc, isNew) => { isNew ? events.add(doc) : events.replace(doc); window.dispatchEvent(new Event("nahtbord:reminders")); };

  return (
    <>
      <PageHead eyebrow="Termine · Serien · Erinnerungen" title="Kalender" text="Termine mit Wiederholung, Erinnerung und Teilnehmern. Ziehen verschiebt, ein Klick auf einen freien Platz legt einen Termin an.">
        <a className="btn btn--ghost" href="/api/export/events"><FiDownload /> CSV</a>
        <button className="btn btn--ghost" onClick={() => setAlarms(true)}><FiClock /> Wecker</button>
        {canEdit && <button className="btn" onClick={() => create()}><FiPlus /> Neuer Termin</button>}
      </PageHead>
      <div className="toolbar cal-bar">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Zurück"><FiChevronLeft /></button>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Weiter"><FiChevronRight /></button>
        <button className="btn btn--ghost btn--sm" onClick={() => { setDir(0); setCursor(startOfDay(new Date())); }}>Heute</button>
        <h2 className="cal-bar__title">{title(view, cursor)}</h2>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Anzeigen">
          <button aria-pressed={show.events} onClick={() => setShow(s => ({ ...s, events: !s.events }))}>Termine</button>
          {has("orders") && <button aria-pressed={show.orders} onClick={() => setShow(s => ({ ...s, orders: !s.orders }))}>Aufträge</button>}
          {has("tasks") && <button aria-pressed={show.tasks} onClick={() => setShow(s => ({ ...s, tasks: !s.tasks }))}>Aufgaben</button>}
          <button aria-pressed={show.mine} onClick={() => setShow(s => ({ ...s, mine: !s.mine }))}>Nur meine</button>
        </div>
        <div className="seg" role="group" aria-label="Ansicht">{VIEWS.map(([v, l]) => <button key={v} aria-pressed={view === v} onClick={() => switchView(v)}>{l}</button>)}</div>
      </div>

      {!events.items ? <Skeleton rows={1} height={560} /> : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={view + dayKey(from)} initial={{ opacity: 0, x: dir * 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -30 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            {view === "month" && <MonthView cursor={cursor} entries={entries} onOpen={openEntry} onCreate={d => create(d)} onDrop={onDrop} canEdit={canEdit} />}
            {(view === "week" || view === "day") && <TimeGrid days={weekDays} entries={entries} onOpen={openEntry} onCreate={(d, allDay) => create(d, allDay)} onDrop={onDrop} canEdit={canEdit} />}
            {view === "list" && <ListView entries={entries} onOpen={openEntry} />}
          </motion.div>
        </AnimatePresence>
      )}

      {editing && <EventEditor key={(editing.source?._id || "new") + (editing.occ?.key || "")} value={editing.draft} occ={editing.occ} team={team}
        customers={has("customers") ? (customers.items || []).slice().sort((a, b) => a.name.localeCompare(b.name, "de")) : []} orders={has("orders") ? orders.items || [] : []}
        onClose={() => setEditing(null)} onSaved={onSaved} onDeleted={id => { events.drop(id); window.dispatchEvent(new Event("nahtbord:reminders")); }} />}
      <AlarmManager open={alarms} onClose={() => setAlarms(false)} />
    </>
  );
}
