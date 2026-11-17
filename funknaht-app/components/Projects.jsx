"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiPlus, FiFolder, FiArchive, FiRotateCcw, FiEdit2, FiCalendar, FiDownload } from "react-icons/fi";
import { api, useCollection, fmtDate, todayKey } from "@/lib/client";
import { Modal, Field, PageHead, Empty, Skeleton, Swatches, useToast, rise } from "./ui";
import { useSession } from "./Shell";

function Ring({ pct }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 64 64" aria-label={`${pct} % erledigt`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--stone)" strokeWidth="6" />
      <motion.circle cx="32" cy="32" r={r} fill="none" stroke="var(--c)" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (pct / 100) * c }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle">{pct}%</text>
    </svg>
  );
}

export default function Projects() {
  const toast = useToast();
  const { canEdit } = useSession();
  const projects = useCollection("projects");
  const tasks = useCollection("tasks");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null);

  const stats = useMemo(() => {
    const out = {};
    for (const t of tasks.items || []) {
      if (!t.projectId) continue;
      out[t.projectId] ??= { total: 0, done: 0, overdue: 0 };
      out[t.projectId].total++;
      if (t.status === "done") out[t.projectId].done++;
      else if (t.meta.dueDate && t.meta.dueDate < todayKey()) out[t.projectId].overdue++;
    }
    return out;
  }, [tasks.items]);

  const list = (projects.items || []).filter(p => !!p.archived === showArchived);

  const save = async e => {
    e.preventDefault();
    try {
      const body = { name: editing.name, description: editing.description, color: editing.color, deadline: editing.deadline || "" };
      if (editing._id) projects.replace(await api("projects/" + editing._id, { method: "PATCH", body }));
      else projects.add(await api("projects", { method: "POST", body }));
      toast(editing._id ? "Projekt gespeichert" : "Projekt angelegt");
      setEditing(null);
    } catch (err) { toast(err.message, "error"); }
  };
  const archive = async (p, archived) => {
    try { projects.replace(await api("projects/" + p._id, { method: "PATCH", body: { archived } })); toast(archived ? "Projekt archiviert" : "Projekt reaktiviert"); }
    catch (err) { toast(err.message, "error"); }
  };

  return (
    <>
      <PageHead eyebrow="Vorhaben · Fortschritt" title="Projekte" text="Der Fortschritt ergibt sich automatisch aus den erledigten Aufgaben.">
        <a className="btn btn--ghost" href="/api/export/projects"><FiDownload /> CSV</a>
        {canEdit && <button className="btn" onClick={() => setEditing({ name: "", description: "", color: "fjord", deadline: "" })}><FiPlus /> Neues Projekt</button>}
      </PageHead>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filter">
          <button aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>Aktiv</button>
          <button aria-pressed={showArchived} onClick={() => setShowArchived(true)}>Archiv</button>
        </div>
      </div>

      {!projects.items ? <Skeleton rows={3} height={150} /> : !list.length ? (
        <Empty icon={FiFolder}>{showArchived ? "Keine archivierten Projekte." : "Noch keine aktiven Projekte."}</Empty>
      ) : (
        <motion.div className="projects" initial="hidden" animate="show">
          <AnimatePresence>
            {list.map((p, i) => {
              const s = stats[p._id] || { total: 0, done: 0, overdue: 0 };
              const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
              return (
                <motion.article key={p._id} layout className={`card project c-${p.color}`} variants={rise} custom={i} exit={{ opacity: 0, scale: 0.95 }} whileHover={{ y: -4 }}>
                  <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                    <div style={{ flex: 1 }}>
                      <h3>{p.name}</h3>
                      {p.deadline && <small className={p.deadline < todayKey() && pct < 100 ? "overdue" : "muted"}><FiCalendar style={{ verticalAlign: -2 }} /> bis {fmtDate(p.deadline, { day: "2-digit", month: "long", year: "numeric" })}</small>}
                    </div>
                    <Ring pct={pct} />
                  </div>
                  <p>{p.description || <span className="muted">Keine Beschreibung.</span>}</p>
                  <div className="row">
                    <span className="badge">{s.done}/{s.total} Aufgaben</span>
                    {s.overdue > 0 && <span className="badge badge--err">{s.overdue} überfällig</span>}
                  </div>
                  <div className="row" style={{ marginTop: "auto" }}>
                    {!p.archived && <Link className="btn btn--sm" href={`/tasks?project=${p._id}`}>Board öffnen</Link>}
                    {!p.archived && <Link className="btn btn--ghost btn--sm" href={`/tasks?new=1&project=${p._id}`}><FiPlus /> Aufgabe</Link>}
                    <span className="spacer" />
                    <button className="icon-btn" aria-label="Bearbeiten" onClick={() => setEditing(p)}><FiEdit2 /></button>
                    <button className="icon-btn" aria-label={p.archived ? "Reaktivieren" : "Archivieren"} onClick={() => archive(p, !p.archived)}>{p.archived ? <FiRotateCcw /> : <FiArchive />}</button>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?._id ? "Projekt bearbeiten" : "Neues Projekt"}
        footer={<><button className="btn btn--ghost" onClick={() => setEditing(null)}>Abbrechen</button><button className="btn" onClick={save} disabled={!editing?.name?.trim()}>Speichern</button></>}>
        {editing && (
          <form className="stack" onSubmit={save}>
            <Field label="Name"><input className="input" autoFocus value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} maxLength={120} /></Field>
            <Field label="Beschreibung"><textarea className="textarea" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} maxLength={1500} /></Field>
            <div className="grid-2">
              <Field label="Deadline"><input type="date" className="input" value={editing.deadline || ""} onChange={e => setEditing({ ...editing, deadline: e.target.value })} /></Field>
              <Field label="Farbe"><Swatches value={editing.color} onChange={color => setEditing({ ...editing, color })} /></Field>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
