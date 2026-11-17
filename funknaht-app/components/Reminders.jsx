"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FiBell, FiBellOff, FiClock, FiMapPin, FiPlus, FiTrash2, FiVolume2, FiX, FiCalendar, FiSmartphone, FiSend } from "react-icons/fi";
import { api } from "@/lib/client";
import { nextAlarm, dayKey, dueReminders as dueItems, WEEKDAYS, SOUNDS } from "@/lib/calendar-shared";
import { playSound, unlockAudio } from "@/lib/sound";
import { pushSupported, needsInstall, currentSubscription, enablePush, disablePush } from "@/lib/push-client";
import { Field, Modal, useToast } from "./ui";
import { useSession } from "./Shell";

const GRACE = 15 * 60000; // a reminder missed by up to 15 minutes (laptop asleep, tab closed) still rings
const store = {
  get(name) { try { return JSON.parse(localStorage.getItem(name) || "{}"); } catch { return {}; } },
  set(name, value) { try { localStorage.setItem(name, JSON.stringify(value)); } catch {} },
};
const hhmm = d => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const when = d => {
  const today = dayKey(new Date()), tomorrow = dayKey(new Date(Date.now() + 86400000));
  const k = dayKey(d);
  return `${k === today ? "Heute" : k === tomorrow ? "Morgen" : d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}, ${hhmm(d)}`;
};

/* ---------- Bell in the top bar: next reminders, permission, and the ringing card ---------- */
export default function Reminders() {
  const { user, has } = useSession();
  const toast = useToast();
  const [events, setEvents] = useState([]);
  const [alarms, setAlarms] = useState([]);
  const [ringing, setRinging] = useState([]);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState("default");
  const [now, setNow] = useState(() => Date.now());
  const [push, setPush] = useState({ supported: false, on: false, busy: false, install: false });
  const on = has("calendar");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(() => {
    if (!on) return;
    api("events").then(setEvents).catch(() => {});
    api("alarms").then(setAlarms).catch(() => {});
  }, [on]);

  // Data every 2 minutes and when the tab comes back; sound unlocks with the first click on the page.
  useEffect(() => {
    if (!on) return;
    load();
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    currentSubscription().then(sub => setPush(p => ({ ...p, supported: pushSupported(), install: needsInstall(), on: !!sub }))).catch(() => {});
    const t = setInterval(load, 120000);
    const back = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    window.addEventListener("nahtbord:reminders", load);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); window.removeEventListener("nahtbord:reminders", load); };
  }, [on, load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  // Check what is due. fired/snoozed live in this browser, so every device rings for itself.
  useEffect(() => {
    if (!on) return;
    const fired = store.get("nb-fired"), snoozed = store.get("nb-snooze");
    const due = dueItems(events, alarms, user.id, new Date(now - GRACE), new Date(now)).filter(i => !fired[i.key]);
    for (const [key, item] of Object.entries(snoozed)) if (item.at <= now) { due.push({ ...item, at: new Date(item.at), start: new Date(item.start), key, snoozed: true }); delete snoozed[key]; }
    if (!due.length) return;
    for (const item of due) fired[item.key] = now;
    for (const k of Object.keys(fired)) if (now - fired[k] > 3 * 86400000) delete fired[k];
    store.set("nb-fired", fired); store.set("nb-snooze", snoozed);
    setRinging(r => [...r.filter(x => !due.some(d => d.key === x.key)), ...due]);
    for (const item of due) {
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && !push.on) {
        try { new Notification(item.kind === "alarm" ? `⏰ ${item.title}` : item.title, { body: item.kind === "alarm" ? `Wecker · ${hhmm(item.at)}` : `${when(item.start)}${item.location ? " · " + item.location : ""} (${item.note})`, tag: item.key, requireInteraction: item.kind === "alarm" }); } catch {}
      }
      // A one-off alarm switches itself off after ringing.
      if (item.kind === "alarm" && !item.snoozed && item.alarm && !item.alarm.days.length) api("alarms/" + item.alarm._id, { method: "PATCH", body: { enabled: false } }).then(load).catch(() => {});
    }
  }, [now, events, alarms, on, user.id, load, push.on]);

  // Sound: alarms ring until switched off (at most 3 minutes), appointment reminders chime twice.
  const loud = ringing.find(r => r.kind === "alarm");
  useEffect(() => {
    if (!ringing.length) return;
    const sound = loud ? loud.sound : "sanft";
    playSound(sound);
    if (!loud) { const t = setTimeout(() => playSound(sound), 1800); return () => clearTimeout(t); }
    const started = Date.now();
    const t = setInterval(() => { if (Date.now() - started < 180000) playSound(sound); }, 2200);
    return () => clearInterval(t);
  }, [ringing.length, loud]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = key => setRinging(r => r.filter(x => x.key !== key));
  const snooze = (item, minutes) => {
    const snoozed = store.get("nb-snooze");
    snoozed[item.key + ":s" + Date.now()] = { ...item, alarm: undefined, at: Date.now() + minutes * 60000, start: item.start.getTime() };
    store.set("nb-snooze", snoozed);
    dismiss(item.key);
    toast(`Erinnert in ${minutes} Minuten erneut`);
  };
  const allow = async () => {
    unlockAudio();
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPerm(result);
    if (result === "granted") new Notification("Nahtbord", { body: "Hinweise sind eingeschaltet." });
  };

  const togglePush = async () => {
    setPush(p => ({ ...p, busy: true }));
    try {
      if (push.on) { await disablePush(); setPush(p => ({ ...p, on: false })); toast("Push auf diesem Gerät ausgeschaltet"); }
      else { await enablePush(); setPerm("granted"); setPush(p => ({ ...p, on: true })); toast("Push eingeschaltet – Erinnerungen kommen jetzt auch bei geschlossenem Browser"); }
    } catch (err) { toast(err.message, "error"); }
    finally { setPush(p => ({ ...p, busy: false })); }
  };
  const testPush = async () => {
    try { const r = await api("push/test", { method: "POST" }); toast(`Test an ${r.sent} ${r.sent === 1 ? "Gerät" : "Geräte"} geschickt`); }
    catch (err) { toast(err.message, "error"); }
  };

  const upcoming = useMemo(() => dueItems(events, alarms, user.id, new Date(now), new Date(now + 2 * 86400000)).slice(0, 6), [events, alarms, user.id, now]);
  if (!on) return null;

  return (
    <>
      <div className="bell">
        <button className="icon-btn" onClick={() => { unlockAudio(); setOpen(o => !o); }} aria-expanded={open} aria-label="Erinnerungen und Wecker" title="Erinnerungen und Wecker">
          {perm === "denied" ? <FiBellOff /> : <FiBell />}
          {upcoming.length > 0 && <i className="bell__dot" aria-hidden="true" />}
        </button>
        <AnimatePresence>
          {open && (
            <motion.div className="bell__menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <div className="row"><b>Nächste Erinnerungen</b><span className="spacer" /><button className="icon-btn" onClick={() => setOpen(false)} aria-label="Schließen"><FiX /></button></div>
              {upcoming.length ? (
                <ul className="list">{upcoming.map(i => (
                  <li key={i.key}>{i.kind === "alarm" ? <FiClock /> : <FiCalendar />}
                    <span style={{ minWidth: 0 }}><b>{i.title}</b><br /><small className="muted">{when(i.at)} · {i.note}</small></span></li>
                ))}</ul>
              ) : <p className="muted" style={{ margin: "6px 0" }}>In den nächsten 48 Stunden steht nichts an.</p>}
              <hr className="stitch" style={{ margin: "10px 0" }} />
              {push.supported || push.install ? (
                <div className="push-row">
                  <FiSmartphone />
                  <span><b>Push auf diesem Gerät</b><br /><small className="muted">{push.on ? "Kommt auch bei geschlossenem Browser." : push.install ? "Auf dem iPhone erst „Zum Home-Bildschirm“, dann hier einschalten." : "Erinnerungen auch bei geschlossenem Browser."}</small></span>
                  <label className="switch"><input type="checkbox" checked={push.on} disabled={push.busy || perm === "denied"} onChange={togglePush} aria-label="Push auf diesem Gerät" /><span /></label>
                </div>
              ) : perm === "default" ? <button className="btn btn--sm" onClick={allow}><FiBell /> Hinweise auf diesem Gerät erlauben</button> : null}
              {perm === "denied" && <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>Hinweise sind im Browser blockiert. Sie können sie in den Website-Einstellungen wieder erlauben.</p>}
              {!push.supported && !push.install && perm === "granted" && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Hinweise sind auf diesem Gerät eingeschaltet.</p>}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn btn--ghost btn--sm" onClick={() => { unlockAudio(); playSound("klassisch"); }}><FiVolume2 /> Ton testen</button>
                {push.on && <button className="btn btn--ghost btn--sm" onClick={testPush}><FiSend /> Test-Push</button>}
                <Link className="btn btn--ghost btn--sm" href="/calendar?wecker=1" onClick={() => setOpen(false)}><FiClock /> Wecker</Link>
              </div>
              <small className="muted bell__hint">{push.on ? "Im geöffneten Tab klingelt Nahtbord zusätzlich mit Ton. Der Push-Hinweis kommt mit dem Ton des Geräts." : "Ohne Push klingelt Nahtbord nur, solange es in einem Tab geöffnet ist."}</small>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Rendered into <body>: the frosted top bar would otherwise pin the cards to itself. */}
      {mounted && createPortal(<div className="ringing" aria-live="assertive">
        <AnimatePresence>
          {ringing.map(item => (
            <motion.div key={item.key} className={`ring-card ${item.kind === "alarm" ? "ring-card--alarm" : ""}`} role="alertdialog" aria-label={item.title}
              initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}>
              <div className="ring-card__head">{item.kind === "alarm" ? <FiClock /> : <FiBell />}<span>{item.kind === "alarm" ? "Wecker" : item.note}</span><b>{hhmm(item.kind === "alarm" ? item.at : item.start)}</b></div>
              <h3>{item.title}</h3>
              {item.kind === "event" && <p className="muted">{when(item.start)}{item.location && <><br /><FiMapPin style={{ verticalAlign: -2 }} /> {item.location}</>}</p>}
              <div className="row">
                <button className="btn btn--ghost btn--sm" onClick={() => snooze(item, 5)}>5 Min.</button>
                <button className="btn btn--ghost btn--sm" onClick={() => snooze(item, 10)}>10 Min.</button>
                {item.href && <Link className="btn btn--ghost btn--sm" href={item.href} onClick={() => dismiss(item.key)}>Öffnen</Link>}
                <span className="spacer" />
                <button className="btn btn--sm" onClick={() => dismiss(item.key)}>{item.kind === "alarm" ? "Aus" : "OK"}</button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>, document.body)}
    </>
  );
}

/* ---------- Alarm clock management (Kalender → Wecker) ---------- */
const blankAlarm = () => ({ label: "", time: "07:00", days: [1, 2, 3, 4, 5], date: "", enabled: true, sound: "klassisch" });

export function AlarmManager({ open, onClose }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null);
  const refresh = () => window.dispatchEvent(new Event("nahtbord:reminders"));
  const load = () => api("alarms").then(setList).catch(e => toast(e.message, "error"));
  useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async e => {
    e?.preventDefault();
    try {
      const { _id, label, time, days, date, enabled, sound } = editing;
      const body = { label, time, days, date: days.length ? "" : date, enabled, sound };
      await (_id ? api("alarms/" + _id, { method: "PATCH", body }) : api("alarms", { method: "POST", body }));
      toast(_id ? "Wecker gespeichert" : "Wecker gestellt");
      setEditing(null); load(); refresh();
    } catch (err) { toast(err.message, "error"); }
  };
  const toggle = async a => { try { await api("alarms/" + a._id, { method: "PATCH", body: { enabled: !a.enabled } }); load(); refresh(); } catch (err) { toast(err.message, "error"); } };
  const remove = async a => { try { await api("alarms/" + a._id, { method: "DELETE" }); load(); refresh(); } catch (err) { toast(err.message, "error"); } };
  const daysText = a => a.days.length === 7 ? "Täglich" : a.days.length ? (String(a.days) === "1,2,3,4,5" ? "Mo – Fr" : WEEKDAYS.filter(([d]) => a.days.includes(d)).map(w => w[1]).join(", "))
    : a.date ? new Date(a.date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) : "einmalig";

  return (
    <Modal open={open} onClose={() => { setEditing(null); onClose(); }} title={editing ? (editing._id ? "Wecker bearbeiten" : "Neuer Wecker") : "Wecker"}
      footer={editing ? <>
        {editing._id && <button className="btn btn--danger" onClick={() => { remove(editing); setEditing(null); }}><FiTrash2 /> Löschen</button>}
        <span className="spacer" />
        <button className="btn btn--ghost" onClick={() => setEditing(null)}>Zurück</button>
        <button className="btn" onClick={save}>Speichern</button>
      </> : <><span className="muted" style={{ fontSize: 13 }}>Nur Sie sehen Ihre Wecker.</span><span className="spacer" /><button className="btn" onClick={() => setEditing(blankAlarm())}><FiPlus /> Wecker stellen</button></>}>
      {editing ? (
        <form className="stack" onSubmit={save}>
          <input className="input alarm-time" type="time" value={editing.time} onChange={e => setEditing({ ...editing, time: e.target.value })} aria-label="Uhrzeit" autoFocus />
          <Field label="Bezeichnung (optional)"><input className="input" maxLength={80} value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} placeholder="z. B. Material abholen" /></Field>
          <Field label="Wiederholen">
            <div className="seg daypick" role="group" aria-label="Wochentage">
              {WEEKDAYS.map(([d, l]) => <button type="button" key={d} aria-pressed={editing.days.includes(d)} onClick={() => setEditing({ ...editing, days: editing.days.includes(d) ? editing.days.filter(x => x !== d) : [...editing.days, d] })}>{l}</button>)}
            </div>
          </Field>
          {!editing.days.length && <Field label="Einmalig am"><input className="input" type="date" value={editing.date || dayKey(new Date())} onChange={e => setEditing({ ...editing, date: e.target.value })} /></Field>}
          <Field label="Ton">
            <div className="row">
              <select className="select" style={{ width: "auto" }} value={editing.sound} onChange={e => setEditing({ ...editing, sound: e.target.value })}>{SOUNDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => { unlockAudio(); playSound(editing.sound); }}><FiVolume2 /> Anhören</button>
            </div>
          </Field>
        </form>
      ) : !list ? <p className="muted">Lädt …</p> : !list.length ? (
        <p className="muted">Noch kein Wecker gestellt. Ein Wecker klingelt im geöffneten Nahtbord – auch wenn gerade ein anderer Tab vorne ist.</p>
      ) : (
        <ul className="list alarms">{list.sort((a, b) => a.time.localeCompare(b.time)).map(a => {
          const next = nextAlarm(a);
          return (
            <li key={a._id} data-off={!a.enabled}>
              <button className="alarms__time" onClick={() => setEditing({ ...a, date: a.date || dayKey(new Date()) })}>{a.time}</button>
              <span style={{ minWidth: 0, flex: 1 }}><b>{a.label || "Wecker"}</b><br /><small className="muted">{daysText(a)}{next ? ` · nächster: ${when(next)}` : ""}</small></span>
              <label className="switch"><input type="checkbox" checked={a.enabled} onChange={() => toggle(a)} aria-label={`${a.time} ${a.enabled ? "ausschalten" : "einschalten"}`} /><span /></label>
            </li>
          );
        })}</ul>
      )}
    </Modal>
  );
}
