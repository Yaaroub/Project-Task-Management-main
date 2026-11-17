"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { FiPlus, FiCalendar, FiUser, FiCheckSquare, FiClock, FiPlay, FiSquare, FiTrash2, FiDownload, FiMessageSquare, FiList, FiColumns } from "react-icons/fi";
import { api, useCollection, fmtDate, fmtMinutes, todayKey } from "@/lib/client";
import { Modal, Field, PageHead, Empty, Skeleton, useToast, confirmDelete, spring, useSelection, SelectBar, Pick, forEach } from "./ui";
import { useSession } from "./Shell";
import RichEditor from "./RichEditor";
import { markdownToDoc } from "@/lib/richtext";

export const COLUMNS = [["todo", "Offen"], ["doing", "In Arbeit"], ["review", "Prüfung"], ["done", "Erledigt"]];
const PRIORITIES = ["Niedrig", "Mittel", "Hoch", "Kritisch"];
const WIP_LIMIT = 5; // work-in-progress limit for "In Arbeit"

function liveMinutes(task, now) {
  return (task.timeSpent || 0) + (task.timerStartedAt ? (now - Date.parse(task.timerStartedAt)) / 60000 : 0);
}

function TaskCard({ task, project, order, onOpen, overlay, now }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task._id, disabled: overlay });
  const today = todayKey();
  const subs = task.meta.subtasks;
  const doneSubs = subs.filter(s => s.done).length;
  const overdue = task.meta.dueDate && task.meta.dueDate < today && task.status !== "done";
  return (
    <motion.button
      ref={overlay ? undefined : setNodeRef} {...(overlay ? {} : { ...attributes, ...listeners })}
      layout={!overlay} layoutId={overlay ? undefined : task._id} transition={spring}
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      className={`task ${overlay ? "task--overlay" : ""}`} data-dragging={isDragging}
      onClick={() => onOpen(task)} aria-label={`Aufgabe ${task.headline} öffnen`}>
      <div className={`prio prio-${task.meta.priority}`} />
      <h3>{task.headline}</h3>
      <div className="task__meta">
        {project && <span className={`badge c-${project.color}`} style={{ background: "color-mix(in oklab, var(--c) 18%, transparent)", color: "var(--c)" }}>{project.name}</span>}
        {order && <span className="badge badge--brass mono" title={order.title}>{order.number}</span>}
        {task.meta.labels.map(l => <span key={l} className="badge badge--brass">{l}</span>)}
      </div>
      <div className="task__meta" style={{ marginTop: 8 }}>
        {task.meta.dueDate && <span className={overdue ? "overdue" : ""}><FiCalendar /> {fmtDate(task.meta.dueDate)}</span>}
        {subs.length > 0 && <span><FiCheckSquare /> {doneSubs}/{subs.length}</span>}
        {task.meta.comments.length > 0 && <span><FiMessageSquare /> {task.meta.comments.length}</span>}
        {(task.timerStartedAt || task.timeSpent > 0) && <span className={task.timerStartedAt ? "timer-live" : ""}><FiClock /> {fmtMinutes(liveMinutes(task, now))}</span>}
        {task.meta.assignee && <span style={{ marginLeft: "auto" }}><FiUser /> {task.meta.assignee}</span>}
      </div>
    </motion.button>
  );
}

function Column({ id, title, tasks, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const over = id === "doing" && tasks.length > WIP_LIMIT;
  return (
    <section ref={setNodeRef} className="column" data-over={isOver} aria-label={title}>
      <header>
        <span className="dot" style={{ background: { todo: "var(--slate)", doing: "var(--brass)", review: "var(--fjord)", done: "var(--ok)" }[id] }} />
        {title}
        <span className={`badge ${over ? "badge--err" : ""}`} title={id === "doing" ? `WIP-Limit ${WIP_LIMIT}` : undefined}>
          {tasks.length}{id === "doing" ? ` / ${WIP_LIMIT}` : ""}
        </span>
      </header>
      <div className="column__list">{children}</div>
    </section>
  );
}

const blank = { headline: "", text: "", status: "todo", projectId: "", orderId: "", meta: { priority: "Mittel", labels: [], assignee: "", dueDate: "", subtasks: [], comments: [], storyPoints: 0 } };

function TaskEditor({ task, projects, orders = [], onClose, onSaved, onDeleted, now }) {
  const toast = useToast();
  const [draft, setDraft] = useState(task);
  const [labels, setLabels] = useState(task.meta.labels.join(", "));
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState([]);
  const { user } = useSession();
  useEffect(() => { api("team").then(setTeam).catch(() => {}); }, []);
  const isNew = !task._id;
  const setMeta = patch => setDraft(d => ({ ...d, meta: { ...d.meta, ...patch } }));

  const save = async e => {
    e?.preventDefault();
    setBusy(true);
    try {
      const body = { headline: draft.headline, ...(draft.doc ? { doc: draft.doc } : { text: draft.text }), status: draft.status, projectId: draft.projectId, orderId: draft.orderId || "",
        meta: { ...draft.meta, labels: labels.split(",").map(s => s.trim()).filter(Boolean) } };
      const saved = isNew ? await api("tasks", { method: "POST", body }) : await api("tasks/" + task._id, { method: "PATCH", body });
      onSaved(saved, isNew);
      toast(isNew ? "Aufgabe angelegt" : "Aufgabe gespeichert");
      onClose();
    } catch (err) { toast(err.message, "error"); } finally { setBusy(false); }
  };
  const timer = async action => {
    try { const saved = await api("tasks/" + task._id, { method: "PATCH", body: { timer: action } }); setDraft(d => ({ ...d, timeSpent: saved.timeSpent, timerStartedAt: saved.timerStartedAt })); onSaved(saved); }
    catch (err) { toast(err.message, "error"); }
  };
  const remove = async () => {
    if (!confirmDelete(`„${task.headline}“`)) return;
    try { await api("tasks/" + task._id, { method: "DELETE" }); onDeleted(task._id); toast("Aufgabe gelöscht"); onClose(); }
    catch (err) { toast(err.message, "error"); }
  };
  const addComment = () => {
    if (!comment.trim()) return;
    setMeta({ comments: [...draft.meta.comments, { id: crypto.randomUUID(), text: comment.trim(), author: user?.name || "Ich", time: new Date().toISOString() }] });
    setComment("");
  };

  return (
    <Modal open onClose={onClose} wide title={isNew ? "Neue Aufgabe" : "Aufgabe bearbeiten"}
      footer={<>
        {!isNew && <button className="btn btn--danger" onClick={remove}><FiTrash2 /> Löschen</button>}
        <span className="spacer" />
        <button className="btn btn--ghost" onClick={onClose}>Abbrechen</button>
        <button className="btn" onClick={save} disabled={busy || !draft.headline.trim()}>{isNew ? "Anlegen" : "Speichern"}</button>
      </>}>
      <form className="stack" onSubmit={save}>
        <Field label="Titel"><input className="input" autoFocus value={draft.headline} onChange={e => setDraft({ ...draft, headline: e.target.value })} placeholder="Was ist zu tun?" maxLength={200} /></Field>
        <div className="field"><span>Beschreibung</span>
          <RichEditor compact label="Beschreibung" value={task.doc || markdownToDoc(task.text || "")} onChange={doc => setDraft(d => ({ ...d, doc }))} />
        </div>
        <div className="grid-2">
          <Field label="Status">
            <select className="select" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>{COLUMNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </Field>
          <Field label="Projekt">
            <select className="select" value={draft.projectId} onChange={e => setDraft({ ...draft, projectId: e.target.value })}>
              <option value="">Ohne Projekt</option>
              {projects.filter(p => !p.archived || p._id === draft.projectId).map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Auftrag">
            <select className="select" value={draft.orderId || ""} onChange={e => setDraft({ ...draft, orderId: e.target.value })}>
              <option value="">Ohne Auftrag</option>
              {orders.filter(o => !["abgerechnet", "abgelehnt"].includes(o.status) || o._id === draft.orderId).map(o => <option key={o._id} value={o._id}>{o.number} · {o.title}</option>)}
            </select>
          </Field>
          <Field label="Priorität">
            <select className="select" value={draft.meta.priority} onChange={e => setMeta({ priority: e.target.value })}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select>
          </Field>
          <Field label="Fällig am"><input type="date" className="input" value={draft.meta.dueDate} onChange={e => setMeta({ dueDate: e.target.value })} /></Field>
          <Field label="Zuständig"><input className="input" list="team-names" value={draft.meta.assignee} onChange={e => setMeta({ assignee: e.target.value })} placeholder="Aus dem Team wählen" />
            <datalist id="team-names">{team.map(m => <option key={m.id} value={m.name} />)}</datalist></Field>
          <Field label="Labels (mit Komma trennen)"><input className="input" value={labels} onChange={e => setLabels(e.target.value)} placeholder="z. B. Kunde, Website" /></Field>
        </div>

        <hr className="stitch" />
        <Field label={`Teilaufgaben (${draft.meta.subtasks.filter(s => s.done).length}/${draft.meta.subtasks.length})`}>
          <div className="subtasks">
            <AnimatePresence initial={false}>
              {draft.meta.subtasks.map((s, i) => (
                <motion.div key={s.id} className="subtask" layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <input type="checkbox" checked={s.done} aria-label="Erledigt" onChange={() => setMeta({ subtasks: draft.meta.subtasks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
                  <input className="input" value={s.title} onChange={e => setMeta({ subtasks: draft.meta.subtasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                  <button type="button" className="icon-btn" aria-label="Teilaufgabe entfernen" onClick={() => setMeta({ subtasks: draft.meta.subtasks.filter((_, j) => j !== i) })}><FiTrash2 /></button>
                </motion.div>
              ))}
            </AnimatePresence>
            <button type="button" className="btn btn--ghost btn--sm" style={{ justifySelf: "start" }}
              onClick={() => setMeta({ subtasks: [...draft.meta.subtasks, { id: crypto.randomUUID(), title: "", done: false }] })}><FiPlus /> Teilaufgabe</button>
          </div>
        </Field>

        {!isNew && (
          <>
            <hr className="stitch" />
            <div className="row">
              <strong><FiClock style={{ verticalAlign: -2 }} /> Zeiterfassung</strong>
              <span className={draft.timerStartedAt ? "timer-live" : "muted"}>{fmtMinutes(liveMinutes(draft, now))}</span>
              <span className="spacer" />
              {draft.timerStartedAt
                ? <button type="button" className="btn btn--sm" onClick={() => timer("stop")}><FiSquare /> Stoppen</button>
                : <button type="button" className="btn btn--ghost btn--sm" onClick={() => timer("start")}><FiPlay /> Starten</button>}
            </div>
          </>
        )}

        <hr className="stitch" />
        <Field label="Kommentare">
          <div className="comments">
            {draft.meta.comments.map(c => <div className="comment" key={c.id}><small>{c.author} · {fmtDate(c.time, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small><div>{c.text}</div></div>)}
            {!draft.meta.comments.length && <span className="muted">Noch keine Kommentare.</span>}
          </div>
        </Field>
        <div className="row">
          <input className="input" style={{ flex: 1 }} value={comment} onChange={e => setComment(e.target.value)} placeholder="Kommentar schreiben …"
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addComment(); } }} />
          <button type="button" className="btn btn--ghost" onClick={addComment}>Hinzufügen</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Tasks() {
  const toast = useToast();
  const { canEdit } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const tasks = useCollection("tasks");
  const projects = useCollection("projects");
  const orders = useCollection("orders");
  const ordersById = useMemo(() => Object.fromEntries((orders.items || []).map(o => [o._id, o])), [orders.items]);
  const [q, setQ] = useState("");
  const [project, setProject] = useState(params.get("project") || "");
  const [priority, setPriority] = useState("");
  const [view, setView] = useState("board");
  const [editing, setEditing] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  // Deep links: ?new=1 opens an empty task, ?open=<id> opens an existing one.
  useEffect(() => {
    if (params.get("new") && canEdit) { setEditing({ ...blank, projectId: params.get("project") || "", orderId: params.get("order") || "" }); router.replace("/tasks"); }
    const open = params.get("open");
    if (open && tasks.items) { const t = tasks.items.find(x => x._id === open); if (t) setEditing(t); router.replace("/tasks"); }
  }, [params, tasks.items, router]);

  const byId = useMemo(() => Object.fromEntries((projects.items || []).map(p => [p._id, p])), [projects.items]);
  const filtered = useMemo(() => (tasks.items || []).filter(t =>
    (!q || (t.headline + " " + t.text + " " + t.meta.labels.join(" ") + " " + t.meta.assignee).toLowerCase().includes(q.toLowerCase()))
    && (!project || t.projectId === project) && (!priority || t.meta.priority === priority)), [tasks.items, q, project, priority]);
  const sorted = useMemo(() => [...filtered].sort((a, b) =>
    PRIORITIES.indexOf(b.meta.priority) - PRIORITIES.indexOf(a.meta.priority) || (a.meta.dueDate || "9").localeCompare(b.meta.dueDate || "9")), [filtered]);

  const move = async (id, status) => {
    const task = tasks.items.find(t => t._id === id);
    if (!task || task.status === status) return;
    tasks.replace({ ...task, status }); // optimistic
    try { tasks.replace(await api("tasks/" + id, { method: "PATCH", body: { status } })); if (status === "done") toast(`„${task.headline}“ erledigt 🎉`); }
    catch (err) { tasks.replace(task); toast(err.message, "error"); }
  };

  const onSaved = (doc, isNew) => (isNew ? tasks.add(doc) : tasks.replace(doc));
  const sel = useSelection();
  const [team, setTeam] = useState([]);
  useEffect(() => { api("team").then(setTeam).catch(() => {}); }, []);
  // Several tasks at once: status, person or delete. Selecting switches to the list view.
  const bulk = async (what, fn) => {
    const { done, error } = await forEach(sel.ids, fn);
    if (error) toast(error.message, "error"); else toast(`${done} ${done === 1 ? "Aufgabe" : "Aufgaben"} ${what}`);
    sel.stop();
  };
  const bulkPatch = (body, what) => bulk(what, async id => tasks.replace(await api("tasks/" + id, { method: "PATCH", body })));
  const bulkAssign = name => bulk(name ? `an ${name} zugewiesen` : "ohne Zuständigkeit", async id => {
    const t = tasks.items.find(x => x._id === id);
    tasks.replace(await api("tasks/" + id, { method: "PATCH", body: { meta: { ...t.meta, assignee: name } } }));
  });
  const bulkRemove = () => {
    if (!window.confirm(`${sel.count} ${sel.count === 1 ? "Aufgabe" : "Aufgaben"} wirklich löschen? Das lässt sich nicht rückgängig machen.`)) return;
    bulk("gelöscht", async id => { await api("tasks/" + id, { method: "DELETE" }); tasks.drop(id); });
  };
  const dragTask = dragId && tasks.items?.find(t => t._id === dragId);

  return (
    <>
      <PageHead eyebrow="Kanban · Zeiterfassung" title="Aufgaben" text="Karten zwischen Spalten ziehen, um den Status zu ändern. Taste N legt überall eine neue Aufgabe an.">
        <a className="btn btn--ghost" href="/api/export/tasks"><FiDownload /> CSV</a>
        {canEdit && <button className="btn" onClick={() => setEditing(blank)}><FiPlus /> Neue Aufgabe</button>}
      </PageHead>

      <div className="toolbar">
        <input className="input" type="search" placeholder="Filtern nach Titel, Label, Person …" value={q} onChange={e => setQ(e.target.value)} aria-label="Aufgaben filtern" />
        <select className="select" value={project} onChange={e => setProject(e.target.value)} aria-label="Projekt">
          <option value="">Alle Projekte</option>{(projects.items || []).map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
        <select className="select" value={priority} onChange={e => setPriority(e.target.value)} aria-label="Priorität">
          <option value="">Jede Priorität</option>{PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
        <span className="spacer" />
        {canEdit && <SelectBar sel={{ ...sel, start: () => { setView("list"); sel.start(); } }} ids={sorted.map(t => t._id)}>
          <select className="select" aria-label="Status setzen" value="" disabled={!sel.count} onChange={e => e.target.value && bulkPatch({ status: e.target.value }, `auf „${COLUMNS.find(c => c[0] === e.target.value)[1]}“ gesetzt`)}>
            <option value="">Status …</option>{COLUMNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="select" aria-label="Zuständig setzen" value="" disabled={!sel.count} onChange={e => e.target.value && bulkAssign(e.target.value === "-" ? "" : e.target.value)}>
            <option value="">Zuständig …</option>{team.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}<option value="-">Niemand</option>
          </select>
          <button className="btn btn--danger btn--sm" disabled={!sel.count} onClick={bulkRemove}><FiTrash2 /> Löschen</button>
        </SelectBar>}
        <div className="seg" role="group" aria-label="Ansicht">
          <button aria-pressed={view === "board"} onClick={() => { sel.stop(); setView("board"); }}><FiColumns /> Board</button>
          <button aria-pressed={view === "list"} onClick={() => setView("list")}><FiList /> Liste</button>
        </div>
      </div>

      {!tasks.items ? <Skeleton rows={4} /> : !tasks.items.length ? (
        <Empty icon={FiCheckSquare}>Noch keine Aufgaben. {canEdit && <button className="btn btn--sm" style={{ marginLeft: 8 }} onClick={() => setEditing(blank)}>Erste Aufgabe anlegen</button>}</Empty>
      ) : view === "board" ? (
        <DndContext sensors={sensors} onDragStart={e => setDragId(e.active.id)} onDragCancel={() => setDragId(null)}
          onDragEnd={e => { setDragId(null); if (e.over) move(e.active.id, e.over.id); }}>
          <LayoutGroup>
            <div className="board">
              {COLUMNS.map(([id, title]) => {
                const list = sorted.filter(t => t.status === id);
                return (
                  <Column key={id} id={id} title={title} tasks={list}>
                    <AnimatePresence>
                      {list.map(t => <TaskCard key={t._id} task={t} project={byId[t.projectId]} order={ordersById[t.orderId]} onOpen={setEditing} now={now} />)}
                    </AnimatePresence>
                  </Column>
                );
              })}
            </div>
          </LayoutGroup>
          <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.16,1,.3,1)" }}>
            {dragTask && <TaskCard task={dragTask} project={byId[dragTask.projectId]} order={ordersById[dragTask.orderId]} onOpen={() => {}} overlay now={now} />}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className={`table-wrap${sel.active ? " selecting" : ""}`}>
          <table>
            <thead><tr>{sel.active && <th className="pickcell" />}<th>Aufgabe</th><th>Status</th><th>Priorität</th><th>Projekt</th><th>Fällig</th><th className="num">Zeit</th></tr></thead>
            <tbody>
              {sorted.map(t => (
                <tr key={t._id} data-picked={sel.has(t._id)} onClick={() => (sel.active ? sel.toggle(t._id) : setEditing(t))} style={{ cursor: "pointer" }}>
                  {sel.active && <td className="pickcell"><Pick on={sel.has(t._id)} /></td>}
                  <td><strong>{t.headline}</strong>{t.meta.assignee && <div className="muted" style={{ fontSize: 12 }}>{t.meta.assignee}</div>}</td>
                  <td><span className={`badge ${t.status === "done" ? "badge--ok" : ""}`}>{COLUMNS.find(c => c[0] === t.status)[1]}</span></td>
                  <td><span className={`prio-${t.meta.priority}`}><span className="dot" style={{ background: "var(--c)" }} /> {t.meta.priority}</span></td>
                  <td>{byId[t.projectId]?.name || <span className="muted">–</span>}</td>
                  <td className={t.meta.dueDate && t.meta.dueDate < todayKey() && t.status !== "done" ? "overdue" : ""}>{fmtDate(t.meta.dueDate) || "–"}</td>
                  <td className="num">{fmtMinutes(liveMinutes(t, now))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <TaskEditor key={editing._id || "new"} task={editing} projects={projects.items || []} orders={orders.items || []} now={now}
        onClose={() => setEditing(null)} onSaved={onSaved} onDeleted={tasks.drop} />}
    </>
  );
}
