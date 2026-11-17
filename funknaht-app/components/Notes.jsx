"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FiPlus, FiEdit3, FiStar, FiTrash2, FiDownload, FiCheck, FiArrowLeft, FiGrid, FiFileText, FiCheckSquare, FiX } from "react-icons/fi";
import { api, useCollection, relTime } from "@/lib/client";
import { PageHead, Empty, Skeleton, Swatches, useToast, confirmDelete, rise } from "./ui";
import { useSession } from "./Shell";
import RichEditor from "./RichEditor";
import RichView from "./RichView";

// Opens the print view of the given notes; there the browser saves them as one PDF file.
const openPdf = ids => window.open(`/print/notes?ids=${ids.join(",")}&auto=1`, "_blank");
import { markdownToDoc, TEMPLATES } from "@/lib/richtext";

// Notes written before the formatted editor are plain text in a small Markdown dialect; cards still show them this way.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part.startsWith("`") && part.endsWith("`") ? <code key={i}>{part.slice(1, -1)}</code>
        : part.startsWith("_") && part.endsWith("_") && part.length > 2 ? <em key={i}>{part.slice(1, -1)}</em> : part);
}
export function Markdown({ text }) {
  const blocks = [];
  let list = null;
  text.split("\n").forEach((line, i) => {
    const item = line.match(/^\s*[-*]\s+(\[( |x)\]\s+)?(.*)/i);
    if (item) {
      list ??= [];
      list.push(<li key={i} className={item[1] ? "check" : ""}>{item[1] && <input type="checkbox" readOnly checked={item[2].toLowerCase() === "x"} />} {inline(item[3])}</li>);
      return;
    }
    if (list) { blocks.push(<ul key={"l" + i}>{list}</ul>); list = null; }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) { const T = "h" + (h[1].length + 1); blocks.push(<T key={i}>{inline(h[2])}</T>); }
    else if (line.trim()) blocks.push(<p key={i} style={{ margin: "6px 0" }}>{inline(line)}</p>);
  });
  if (list) blocks.push(<ul key="end">{list}</ul>);
  return <div className="md">{blocks}</div>;
}

const BLANK = { headline: "", text: "", doc: null, pinned: false, color: "", customerId: "", orderId: "" };
const snippet = n => (n.text || "").replace(/^#+\s*/gm, "").replace(/\[( |x)\]\s*/gi, "").replace(/^\s*[–-]\s+/gm, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().slice(0, 110);

// One note as a document page: title, formatting bar and text. Saves by itself while you write.
function NotePage({ note, customers, orders, onSaved, onDeleted, onBack }) {
  const toast = useToast();
  const { canEdit, has } = useSession();
  // Older notes are plain text; they open as a formatted document and are saved as one from then on.
  const [draft, setDraft] = useState(() => ({ ...note, doc: note.doc || markdownToDoc(note.text) }));
  const [state, setState] = useState("saved");
  const first = useRef(true);
  const id = useRef(note._id);
  const latest = useRef(draft);
  const dirty = useRef(false);
  latest.current = draft;

  const save = async () => {
    const d = latest.current;
    dirty.current = false;
    try {
      const body = { headline: d.headline, doc: d.doc, pinned: d.pinned, color: d.color, customerId: d.customerId || "", orderId: d.orderId || "" };
      const saved = id.current ? await api("notes/" + id.current, { method: "PATCH", body }) : await api("notes", { method: "POST", body });
      onSaved(saved, !id.current);
      id.current = saved._id;
      setState("saved");
    } catch (err) { setState("error"); toast(err.message, "error"); }
  };

  // Autosave 700 ms after the last change.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!draft.headline.trim()) return;
    dirty.current = true;
    setState("pending");
    const t = setTimeout(save, 700);
    return () => clearTimeout(t);
  }, [draft.headline, draft.doc, draft.pinned, draft.color, draft.customerId, draft.orderId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Switching to another note within those 700 ms must not lose the last words.
  useEffect(() => () => { if (dirty.current && latest.current.headline.trim()) save(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async () => {
    if (id.current && !confirmDelete(`„${draft.headline}“`)) return;
    dirty.current = false;
    try { if (id.current) { await api("notes/" + id.current, { method: "DELETE" }); toast("Notiz gelöscht"); } onDeleted(id.current); }
    catch (err) { toast(err.message, "error"); }
  };

  return (
    <section className={`card notebook__page ${draft.color ? "c-" + draft.color : ""}`} aria-label="Notiz">
      <div className="notebook__meta">
        <button className="btn btn--ghost btn--sm notebook__back" onClick={onBack}><FiArrowLeft /> Alle Notizen</button>
        <span className="muted notebook__state" role="status">
          {!canEdit ? "Nur lesen" : state === "pending" ? "Speichert …" : state === "error" ? "Nicht gespeichert" : id.current ? <><FiCheck /> Gespeichert</> : "Titel eingeben zum Speichern"}
        </span>
        <span className="spacer" />
        {id.current && <button className="btn btn--ghost btn--sm" onClick={() => openPdf([id.current])} title="Druckansicht öffnen und als PDF speichern"><FiDownload /> PDF</button>}
        {canEdit && <>
          <Swatches value={draft.color} allowNone onChange={color => setDraft(d => ({ ...d, color }))} />
          <button className="icon-btn" aria-pressed={draft.pinned} aria-label="Anheften" title="Anheften" onClick={() => setDraft(d => ({ ...d, pinned: !d.pinned }))}
            style={draft.pinned ? { color: "var(--brass)", borderColor: "var(--brass)" } : undefined}><FiStar /></button>
          <button className="icon-btn" aria-label="Notiz löschen" title="Löschen" onClick={remove}><FiTrash2 /></button>
        </>}
      </div>
      {(has("customers") || has("orders")) && (
        <div className="notebook__links">
          {has("customers") && (
            <label><span>Kunde</span>
              <select className="select" disabled={!canEdit} value={draft.customerId || ""} onChange={e => setDraft(d => ({ ...d, customerId: e.target.value, orderId: e.target.value && d.orderId && orders.find(o => o._id === d.orderId)?.customerId !== e.target.value ? "" : d.orderId }))}>
                <option value="">Kein Kunde</option>
                {customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {has("orders") && (
            <label><span>Auftrag</span>
              <select className="select" disabled={!canEdit} value={draft.orderId || ""} onChange={e => { const o = orders.find(x => x._id === e.target.value); setDraft(d => ({ ...d, orderId: e.target.value, customerId: o ? o.customerId : d.customerId })); }}>
                <option value="">Kein Auftrag</option>
                {orders.filter(o => !draft.customerId || o.customerId === draft.customerId).map(o => <option key={o._id} value={o._id}>{o.number} · {o.title}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      <input className="notebook__title" autoFocus={!note._id} readOnly={!canEdit} value={draft.headline} placeholder="Titel der Notiz" maxLength={200} aria-label="Titel"
        onChange={e => setDraft(d => ({ ...d, headline: e.target.value }))} />
      <RichEditor value={draft.doc} editable={canEdit} onChange={doc => setDraft(d => ({ ...d, doc }))} />
    </section>
  );
}

export default function Notes() {
  const { canEdit } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const notes = useCollection("notes");
  const { has } = useSession();
  const customers = useCollection(has("customers") ? "customers" : "notes");
  const orders = useCollection(has("orders") ? "orders" : "notes");
  const customerList = has("customers") ? (customers.items || []).slice().sort((a, b) => a.name.localeCompare(b.name, "de")) : [];
  const orderList = has("orders") ? (orders.items || []) : [];
  const nameOf = useMemo(() => Object.fromEntries(customerList.map(c => [c._id, c.name])), [customerList]);
  const [q, setQ] = useState("");
  const [view, setView] = useState("doc"); // "doc": list beside the open note · "cards": overview tiles
  const [sel, setSel] = useState(null);     // { key, id } – key stays the same while a new note gets its id
  const counter = useRef(0);
  const toast = useToast();
  const [picked, setPicked] = useState(null); // null: normal · Set of ids: selection mode
  const toggle = id => setPicked(p => { const next = new Set(p); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const removePicked = async () => {
    const ids = [...picked];
    if (!window.confirm(`${ids.length} ${ids.length === 1 ? "Notiz" : "Notizen"} wirklich löschen? Das lässt sich nicht rückgängig machen.`)) return;
    let done = 0;
    try {
      for (const id of ids) { await api("notes/" + id, { method: "DELETE" }); notes.drop(id); done++; }
      toast(`${done} ${done === 1 ? "Notiz" : "Notizen"} gelöscht`);
    } catch (err) { toast(err.message, "error"); }
    setSel(s => (s && ids.includes(s.id) ? null : s));
    setPicked(null);
  };

  const open = id => { setView("doc"); setSel(s => (s?.id === id ? s : { key: id, id })); };
  const create = (preset = {}) => { setView("doc"); setSel({ key: "new-" + ++counter.current, id: null, preset }); };
  const fromTemplate = id => { const t = TEMPLATES.find(x => x[0] === id); if (t) create({ headline: t[1], doc: t[2]() }); };
  const switchView = v => { setView(v); try { localStorage.setItem("notesView", v); } catch {} };
  useEffect(() => { try { if (localStorage.getItem("notesView") === "cards") setView("cards"); } catch {} }, []);

  useEffect(() => {
    if (params.get("new")) { if (canEdit) create({ customerId: params.get("customer") || "", orderId: params.get("order") || "" }); router.replace("/notes"); }
    const wanted = params.get("open");
    if (wanted && notes.items) { if (notes.items.some(n => n._id === wanted)) open(wanted); router.replace("/notes"); }
  }, [params, notes.items, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => (notes.items || [])
    .filter(n => !q || (n.headline + " " + n.text).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.pinned - a.pinned) || b.updatedAt.localeCompare(a.updatedAt)), [notes.items, q]);

  // On a wide screen the page is never empty: the newest note opens by itself. On a phone the list comes first.
  useEffect(() => {
    if (view === "doc" && !sel && list.length && window.matchMedia("(min-width: 861px)").matches) setSel({ key: list[0]._id, id: list[0]._id });
  }, [view, sel, list]);

  const current = sel && (sel.id ? (notes.items || []).find(n => n._id === sel.id) : { ...BLANK, ...sel.preset });

  return (
    <>
      <PageHead eyebrow="Wissen · Protokolle" title="Notizen" text="Schreiben wie in einer Textverarbeitung: Schriftart, Größe, Farbe, Listen und Checklisten. Jede Änderung wird automatisch gespeichert.">
        <a className="btn btn--ghost" href="/api/export/notes"><FiDownload /> CSV</a>
        {canEdit && (
          <select className="select notes__tpl" value="" onChange={e => fromTemplate(e.target.value)} aria-label="Neue Notiz aus Vorlage">
            <option value="">Aus Vorlage …</option>
            {TEMPLATES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        {canEdit && <button className="btn" onClick={() => create()}><FiPlus /> Neue Notiz</button>}
      </PageHead>
      <div className="toolbar">
        <input className="input" type="search" placeholder="Notizen durchsuchen …" value={q} onChange={e => setQ(e.target.value)} aria-label="Notizen durchsuchen" />
        {picked ? (
          <div className="selbar" role="group" aria-label="Auswahl">
            <b>{picked.size} ausgewählt</b>
            <button className="btn btn--ghost btn--sm" onClick={() => setPicked(picked.size === list.length ? new Set() : new Set(list.map(n => n._id)))}>{picked.size === list.length && list.length ? "Keine" : "Alle"}</button>
            <button className="btn btn--sm" disabled={!picked.size} onClick={() => openPdf([...picked])}><FiDownload /> PDF</button>
            {canEdit && <button className="btn btn--danger btn--sm" disabled={!picked.size} onClick={removePicked}><FiTrash2 /> Löschen</button>}
            <button className="btn btn--ghost btn--sm" onClick={() => setPicked(null)}><FiX /> Fertig</button>
          </div>
        ) : <button className="btn btn--ghost btn--sm" disabled={!list.length} onClick={() => setPicked(new Set())}><FiCheckSquare /> Auswählen</button>}
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Ansicht">
          <button aria-pressed={view === "doc"} onClick={() => switchView("doc")}><FiFileText /> Dokument</button>
          <button aria-pressed={view === "cards"} onClick={() => switchView("cards")}><FiGrid /> Kacheln</button>
        </div>
      </div>

      {view === "doc" ? (
        <div className="notebook" data-open={current ? "true" : "false"}>
          <aside className="card notebook__list" aria-label="Alle Notizen">
            {!notes.items ? <Skeleton rows={4} height={62} /> : (
              <ul>
                {sel && !sel.id && <li><button className="notebook__item" aria-current="true"><b><span>Neue Notiz</span></b><span>Noch nicht gespeichert</span></button></li>}
                {list.map(n => (
                  <li key={n._id}>
                    <button className={`notebook__item ${picked ? "notebook__item--pick" : ""} ${n.color ? "c-" + n.color : ""}`} aria-current={!picked && sel?.id === n._id ? "true" : undefined}
                      aria-pressed={picked ? picked.has(n._id) : undefined} onClick={() => (picked ? toggle(n._id) : open(n._id))}>
                      {picked && <span className="pick" aria-hidden="true"><FiCheck /></span>}
                      <b><span>{n.headline}</span>{n.pinned && <FiStar aria-label="Angeheftet" />}</b>
                      <span>{snippet(n) || "Kein Text"}</span>
                      {n.customerId && nameOf[n.customerId] && <em className="notebook__tag">{nameOf[n.customerId]}</em>}
                      <time dateTime={n.updatedAt}>{relTime(n.updatedAt)}</time>
                    </button>
                  </li>
                ))}
                {!list.length && !(sel && !sel.id) && <li className="muted" style={{ padding: 14 }}>{notes.items.length ? "Keine Treffer." : "Noch keine Notizen."}</li>}
              </ul>
            )}
          </aside>
          {current ? (
            <NotePage key={sel.key} note={current} customers={customerList} orders={orderList} onBack={() => setSel(null)} onDeleted={id => { if (id) notes.drop(id); setSel(null); }}
              onSaved={(doc, isNew) => { if (isNew) { notes.add(doc); setSel(s => (s && !s.id ? { ...s, id: doc._id } : s)); } else notes.replace(doc); }} />
          ) : (
            <section className="notebook__page notebook__page--empty">
              <Empty icon={FiEdit3}>{canEdit ? "Wählen Sie links eine Notiz oder legen Sie eine neue an." : "Wählen Sie links eine Notiz."}</Empty>
            </section>
          )}
        </div>
      ) : !notes.items ? <Skeleton rows={3} height={140} /> : !list.length ? (
        <Empty icon={FiEdit3}>{notes.items.length ? "Keine Treffer." : "Noch keine Notizen."}</Empty>
      ) : (
        <motion.div className="notes" initial="hidden" animate="show">
          <AnimatePresence>
            {list.map((n, i) => (
              <motion.button key={n._id} layout className={`card note ${n.color ? "c-" + n.color : ""}`} variants={rise} custom={i}
                exit={{ opacity: 0, scale: 0.95 }} whileHover={{ y: -3 }} aria-pressed={picked ? picked.has(n._id) : undefined} onClick={() => (picked ? toggle(n._id) : open(n._id))}>
                {picked && <span className="pick" aria-hidden="true"><FiCheck /></span>}
                <h3>{n.headline}{n.pinned && <FiStar aria-label="Angeheftet" />}</h3>
                <div className="note__body">{n.doc ? <RichView doc={n.doc} /> : <Markdown text={n.text} />}</div>
                <time dateTime={n.updatedAt}>{relTime(n.updatedAt)}</time>
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </>
  );
}
