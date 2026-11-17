"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FiPlus, FiClock, FiDownload, FiTrash2, FiEdit2, FiChevronLeft, FiChevronRight, FiLogIn, FiLogOut, FiPrinter } from "react-icons/fi";
import { api, useCollection, fmtDate, todayKey } from "@/lib/client";
import { Modal, Field, PageHead, Empty, Skeleton, useToast, confirmDelete, rise, openPrint } from "./ui";
import { useSession } from "./Shell";

const KINDS = { arbeit: ["Arbeit", ""], urlaub: ["Urlaub", "badge--ok"], krank: ["Krank", "badge--warn"], feiertag: ["Feiertag", ""] };
const hours = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} Std.`;
const nowClock = () => new Date().toTimeString().slice(0, 5);
const monthLabel = key => new Date(key + "-01T12:00:00").toLocaleDateString("de-DE", { month: "long", year: "numeric" });
const shiftMonth = (key, by) => { const d = new Date(key + "-01T12:00:00"); d.setMonth(d.getMonth() + by); return d.toISOString().slice(0, 7); };

export default function Times() {
  const toast = useToast();
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const times = useCollection("times");
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [person, setPerson] = useState("");
  const [team, setTeam] = useState([]);
  const [editing, setEditing] = useState(null);

  const blank = () => ({ date: todayKey(), kind: "arbeit", start: "08:00", end: "16:30", breakMinutes: 30, note: "", userId: session.user.id });
  useEffect(() => { if (session.isAdmin) api("team").then(setTeam).catch(() => {}); }, [session.isAdmin]);
  useEffect(() => { if (params.get("new") && session.canEdit) { setEditing(blank()); router.replace("/times"); } }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => (times.items || [])
    .filter(t => t.date.startsWith(month) && (!person || t.userId === person))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.start || "").localeCompare(a.start || "")), [times.items, month, person]);
  const sums = useMemo(() => ({
    minutes: list.reduce((s, t) => s + t.minutes, 0),
    days: new Set(list.filter(t => t.kind === "arbeit").map(t => t.userId + t.date)).size,
    urlaub: list.filter(t => t.kind === "urlaub").length,
    krank: list.filter(t => t.kind === "krank").length,
  }), [list]);
  // The own entry of today that has a start but no end yet.
  const running = (times.items || []).find(t => t.userId === session.user.id && t.running && t.date === todayKey());

  const clock = async () => {
    try {
      if (running) { times.replace(await api("times/" + running._id, { method: "PATCH", body: { end: nowClock() } })); toast("Ausgestempelt – schönen Feierabend"); }
      else { times.add(await api("times", { method: "POST", body: { date: todayKey(), kind: "arbeit", start: nowClock() } })); toast("Eingestempelt"); }
    } catch (err) { toast(err.message, "error"); }
  };
  const save = async e => {
    e.preventDefault();
    try {
      const { _id, date, until, kind, start, end, breakMinutes, note, userId } = editing;
      const work = kind === "arbeit";
      const body = { date, kind, note, start: work ? start : "", end: work ? end : "", breakMinutes: work ? Number(breakMinutes) || 0 : 0 };
      // Holiday or sick leave over several days: one entry per weekday from "date" to "until".
      const days = [date];
      if (!_id && !work && until && until > date) {
        for (let d = new Date(date + "T12:00:00"); days.length < 62;) {
          d.setDate(d.getDate() + 1);
          const key = d.toISOString().slice(0, 10);
          if (key > until) break;
          if (d.getDay() !== 0 && d.getDay() !== 6) days.push(key);
        }
      }
      if (_id) times.replace(await api("times/" + _id, { method: "PATCH", body }));
      else for (const day of days) times.add(await api("times", { method: "POST", body: { ...body, date: day, userId } }));
      toast(_id ? "Eintrag gespeichert" : days.length > 1 ? `${days.length} Tage eingetragen` : "Eintrag angelegt");
      setEditing(null);
    } catch (err) { toast(err.message, "error"); }
  };
  const remove = async t => {
    if (!confirmDelete(`Eintrag vom ${fmtDate(t.date, { day: "2-digit", month: "2-digit", year: "numeric" })}`)) return;
    try { await api("times/" + t._id, { method: "DELETE" }); times.drop(t._id); toast("Eintrag gelöscht"); } catch (err) { toast(err.message, "error"); }
  };

  return (
    <>
      <PageHead eyebrow="Arbeitszeit · Urlaub · Krankheit" title="Zeiterfassung" text={session.isAdmin ? "Alle Zeiten des Teams. Jede Person sieht nur ihre eigenen Einträge." : "Ihre Arbeitszeiten. Nur Sie und die Admins sehen diese Einträge."}>
        <a className="btn btn--ghost" href="/api/export/times"><FiDownload /> CSV</a>
        {session.canEdit && <button className="btn btn--ghost" onClick={() => setEditing(blank())}><FiPlus /> Eintrag</button>}
        {session.canEdit && <button className="btn" onClick={clock}>{running ? <><FiLogOut /> Gehen</> : <><FiLogIn /> Kommen</>}</button>}
      </PageHead>

      {running && <div className="notice"><FiClock /> Eingestempelt seit {running.start} Uhr.</div>}

      <motion.div className="stats" initial="hidden" animate="show">
        {[["Arbeitszeit", hours(sums.minutes)], ["Arbeitstage", sums.days], ["Urlaubstage", sums.urlaub], ["Krankheitstage", sums.krank]].map(([label, value], i) => (
          <motion.div key={label} className="card stat" variants={rise} custom={i}><small>{label}</small><strong>{value}</strong><span>{monthLabel(month)}</span></motion.div>
        ))}
      </motion.div>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Monat">
          <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Vorheriger Monat"><FiChevronLeft /></button>
          <button aria-pressed="true" onClick={() => setMonth(todayKey().slice(0, 7))} title="Zum aktuellen Monat">{monthLabel(month)}</button>
          <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Nächster Monat"><FiChevronRight /></button>
        </div>
        <span className="spacer" />
        <button className="btn btn--ghost btn--sm" title="Monatsübersicht zum Unterschreiben, als PDF speicherbar"
          onClick={() => openPrint(`/print/timesheet?month=${month}${person ? "&user=" + person : ""}`)}><FiPrinter /> Stundenzettel {person || !session.isAdmin ? "" : "(meiner)"}</button>
        {session.isAdmin && team.length > 1 && (
          <select className="select" value={person} onChange={e => setPerson(e.target.value)} aria-label="Person">
            <option value="">Gesamtes Team</option>{team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>

      {!times.items ? <Skeleton rows={5} height={48} /> : !list.length ? (
        <Empty icon={FiClock}>Keine Einträge in diesem Monat. Mit „Kommen“ starten Sie den Arbeitstag.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Datum</th>{session.isAdmin && <th>Person</th>}<th>Art</th><th>Zeit</th><th className="num">Pause</th><th className="num">Dauer</th><th>Notiz</th><th></th></tr></thead>
            <tbody>
              {list.map(t => (
                <tr key={t._id}>
                  <td className="mono">{fmtDate(t.date, { weekday: "short", day: "2-digit", month: "2-digit" })}</td>
                  {session.isAdmin && <td>{t.userName}</td>}
                  <td><span className={`badge ${KINDS[t.kind][1]}`}>{KINDS[t.kind][0]}</span></td>
                  <td className="mono">{t.kind === "arbeit" ? `${t.start} – ${t.end || "läuft"}` : "ganzer Tag"}</td>
                  <td className="num">{t.breakMinutes ? `${t.breakMinutes} Min.` : ""}</td>
                  <td className="num">{t.kind === "arbeit" ? (t.running ? "–" : hours(t.minutes)) : ""}</td>
                  <td>{t.note}</td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    {session.canEdit && <><button className="icon-btn" aria-label="Bearbeiten" onClick={() => setEditing(t)}><FiEdit2 /></button>{" "}
                      <button className="icon-btn" aria-label="Löschen" onClick={() => remove(t)}><FiTrash2 /></button></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?._id ? "Eintrag bearbeiten" : "Zeit eintragen"}
        footer={<><button className="btn btn--ghost" onClick={() => setEditing(null)}>Abbrechen</button><button className="btn" onClick={save}>Speichern</button></>}>
        {editing && (
          <form className="stack" onSubmit={save}>
            <div className="seg" role="group" aria-label="Art">
              {Object.entries(KINDS).map(([k, [l]]) => <button type="button" key={k} aria-pressed={editing.kind === k} onClick={() => setEditing({ ...editing, kind: k })}>{l}</button>)}
            </div>
            <div className="grid-2">
              <Field label={editing.kind === "arbeit" || editing._id ? "Datum" : "Von"}><input className="input" type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} /></Field>
              {editing.kind !== "arbeit" && !editing._id && (
                <Field label="Bis (optional, ohne Wochenenden)"><input className="input" type="date" min={editing.date} value={editing.until || ""} onChange={e => setEditing({ ...editing, until: e.target.value })} /></Field>
              )}
              {session.isAdmin && !editing._id && team.length > 1 && (
                <Field label="Person"><select className="select" value={editing.userId} onChange={e => setEditing({ ...editing, userId: e.target.value })}>{team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
              )}
            </div>
            {editing.kind === "arbeit" && (
              <div className="grid-3">
                <Field label="Beginn"><input className="input" type="time" value={editing.start} onChange={e => setEditing({ ...editing, start: e.target.value })} /></Field>
                <Field label="Ende"><input className="input" type="time" value={editing.end} onChange={e => setEditing({ ...editing, end: e.target.value })} /></Field>
                <Field label="Pause (Min.)"><input className="input" type="number" min="0" max="600" value={editing.breakMinutes} onChange={e => setEditing({ ...editing, breakMinutes: e.target.value })} /></Field>
              </div>
            )}
            <Field label="Notiz (optional)"><input className="input" maxLength={300} value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} placeholder={editing.kind === "arbeit" ? "z. B. Baustelle Petersen" : ""} /></Field>
          </form>
        )}
      </Modal>
    </>
  );
}
