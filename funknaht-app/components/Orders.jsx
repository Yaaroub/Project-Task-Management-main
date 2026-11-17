"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { FiPlus, FiBriefcase, FiDownload, FiTrash2, FiPrinter, FiPackage, FiClock, FiLock, FiColumns, FiList, FiCalendar, FiUser, FiCheckSquare, FiMapPin, FiTool, FiX, FiFileText } from "react-icons/fi";
import { api, useCollection, fmtMoney, fmtDate, fmtMinutes, todayKey } from "@/lib/client";
import { ORDER_STATUS, statusMeta, orderTotals, VAT_RATES } from "@/lib/orders-shared";
import { Modal, Field, PageHead, Empty, Skeleton, useToast, confirmDelete, Counter, rise, spring } from "./ui";
import { useSession } from "./Shell";
import RichEditor from "./RichEditor";
import { markdownToDoc } from "@/lib/richtext";
import { CustomerForm, blankCustomer } from "./Customers";

const BOARD = ORDER_STATUS.filter(s => s.id !== "abgelehnt");
const scopeFields = {
  "Zimmerei und Holzbau": ["Bauteil", "Holzart", "Querschnitt und Länge"],
  "Reinigung": ["Fläche in m²", "Bodenbelag", "Reinigungsintervall"],
  "Elektrotechnik": ["Anlage", "Stromkreis", "Prüfumfang"],
  "Sanitär und Heizung": ["Anlagentyp", "Einbauort", "Wartungsumfang"],
  "IT und Netzwerk": ["Standort", "Gerät oder Dienst", "Wartungsfenster"],
  "Softwareentwicklung": ["Funktion", "Schnittstellen", "Abnahmekriterium"],
  "Malerarbeiten": ["Untergrund", "Farbton", "Anstrichfläche", "Anzahl der Anstriche"],
  "Dacharbeiten": ["Dachform", "Eindeckung", "Dachfläche", "Gerüstbedarf"],
  "Fliesenarbeiten": ["Fliesenformat", "Verlegemuster", "Fugenfarbe", "Fläche"],
  "Fahrzeugservice": ["Fahrzeug", "Kilometerstand", "Serviceumfang"],
  "Gartenpflege": ["Grundstücksfläche", "Pflegearbeiten", "Entsorgung"],
};

const blankOrder = { title: "", customerId: "", status: "anfrage", description: "", address: "", dueDate: "", validUntil: "", items: [] };
const customerAddress = c => (c ? [c.street, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "");
const num = v => (v === "" ? "" : Number(v));

/* ---------- Board ---------- */
function OrderCard({ order, customer, onOpen, overlay, canEdit }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: order._id, disabled: overlay || !canEdit });
  const late = order.dueDate && order.dueDate < todayKey() && !["erledigt", "abgerechnet", "abgelehnt"].includes(order.status);
  return (
    <motion.button ref={overlay ? undefined : setNodeRef} {...(overlay ? {} : { ...attributes, ...listeners })}
      layout={!overlay} layoutId={overlay ? undefined : order._id} transition={spring}
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      className={`task ${overlay ? "task--overlay" : ""}`} data-dragging={isDragging} onClick={() => onOpen(order)} aria-label={`Auftrag ${order.number} öffnen`}>
      <div className="prio" style={{ "--c": statusMeta(order.status).color }} />
      <div className="task__meta" style={{ marginTop: 6 }}><span className="mono">{order.number}</span><span style={{ marginLeft: "auto", fontWeight: 700, color: "var(--ink)" }}>{fmtMoney(order.totals.gross)}</span></div>
      <h3>{order.title}</h3>
      <div className="task__meta">
        <span><FiUser /> {customer?.name || "–"}</span>
        {order.dueDate && <span className={late ? "overdue" : ""} style={{ marginLeft: "auto" }}><FiCalendar /> {fmtDate(order.dueDate)}</span>}
      </div>
    </motion.button>
  );
}

function StatusColumn({ status, orders, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  const sum = orders.reduce((s, o) => s + o.totals.gross, 0);
  return (
    <section ref={setNodeRef} className="column" data-over={isOver} aria-label={status.label}>
      <header><span className="dot" style={{ background: status.color }} />{status.label}<span className="badge">{orders.length}</span></header>
      <div className="muted mono" style={{ fontSize: 12, padding: "0 4px 10px" }}>{fmtMoney(sum)}</div>
      <div className="column__list">{children}</div>
    </section>
  );
}

/* ---------- Order editor ---------- */
function OrderEditor({ order, customers, products, tasks, onClose, onSaved, onDeleted, onCustomerAdded, canEdit }) {
  const toast = useToast();
  const router = useRouter();
  const [draft, setDraft] = useState(order);
  const [customName, setCustomName] = useState("");
  const [customLabels, setCustomLabels] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCustomer, setNewCustomer] = useState(null);
  const [picker, setPicker] = useState(null);
  const totals = useMemo(() => orderTotals(draft.items), [draft.items]);
  const own = tasks.filter(t => draft._id && t.orderId === draft._id);
  const minutes = own.reduce((s, t) => s + (t.timeSpent || 0), 0);
  const customer = customers.find(c => c._id === draft.customerId);
  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const setItem = (id, patch) => set({ items: draft.items.map(i => (i.id === id ? { ...i, ...patch } : i)) });

  const body = d => ({
    title: d.title, customerId: d.customerId, status: d.status, ...(d.descriptionDoc ? { descriptionDoc: d.descriptionDoc } : { description: d.description }), workAreas: d.workAreas || [], address: d.address,
    dueDate: d.dueDate, validUntil: d.validUntil,
    items: d.items.map(({ id, kind, title, qty, unit, price, vat }) => ({ id, kind, title, qty: Number(qty) || 0, unit, price: Number(price) || 0, vat: Number(vat) })),
  });
  // Saves the current draft and returns the stored order (needed before stock bookings).
  const persist = async () => {
    const saved = draft._id ? await api("orders/" + draft._id, { method: "PATCH", body: body(draft) }) : await api("orders", { method: "POST", body: body(draft) });
    onSaved(saved, !draft._id);
    setDraft(saved);
    return saved;
  };
  const save = async e => {
    e?.preventDefault();
    setBusy(true);
    try { const saved = await persist(); toast(order._id ? "Auftrag gespeichert" : `Auftrag ${saved.number} angelegt`); }
    catch (err) { toast(err.message, "error"); } finally { setBusy(false); }
  };
  const chooseCustomer = id => {
    if (id === "__new") { setNewCustomer({ ...blankCustomer }); return; }
    const c = customers.find(x => x._id === id);
    set({ customerId: id, address: draft.address || customerAddress(c) });
  };
  const createCustomer = async () => {
    try {
      const { ...fields } = newCustomer;
      const doc = await api("customers", { method: "POST", body: fields });
      onCustomerAdded(doc);
      set({ customerId: doc._id, address: draft.address || customerAddress(doc) });
      setNewCustomer(null);
      toast(`Kunde ${doc.number} angelegt`);
    } catch (err) { toast(err.message, "error"); }
  };
  const addService = () => set({ items: [...draft.items, { id: crypto.randomUUID(), kind: "leistung", title: "", qty: 1, unit: "Std.", price: 0, vat: 19 }] });
  const addFreeMaterial = () => set({ items: [...draft.items, { id: crypto.randomUUID(), kind: "material", title: "", qty: 1, unit: "Stk.", price: 0, vat: 19 }] });
  const addWorkTime = () => {
    const hours = Math.max(0.25, Math.round((minutes / 60) * 4) / 4);
    const lastRate = [...draft.items].reverse().find(i => i.unit === "Std." && i.price > 0)?.price || 0;
    set({ items: [...draft.items, { id: crypto.randomUUID(), kind: "leistung", title: "Arbeitszeit laut erfassten Aufgaben", qty: hours, unit: "Std.", price: lastRate, vat: 19 }] });
  };
  const bookMaterial = async () => {
    try {
      const saved = await persist();
      const doc = await api(`orders/${saved._id}/material`, { method: "POST", body: { productId: picker.productId, qty: Number(picker.qty) } });
      setDraft(doc); onSaved(doc); setPicker(null);
      toast("Material vom Lager gebucht");
    } catch (err) { toast(err.message, "error"); }
  };
  const removeItem = async item => {
    if (!item.booked) { set({ items: draft.items.filter(i => i.id !== item.id) }); return; }
    if (!window.confirm(`${item.qty} × „${item.title}“ zurück ins Lager buchen und Position entfernen?`)) return;
    try {
      const saved = await persist();
      const doc = await api(`orders/${saved._id}/material/${item.id}`, { method: "DELETE" });
      setDraft(doc); onSaved(doc);
      toast("Material zurück ins Lager gebucht");
    } catch (err) { toast(err.message, "error"); }
  };
  const remove = async () => {
    if (!confirmDelete(`Auftrag ${draft.number}`)) return;
    try { await api("orders/" + draft._id, { method: "DELETE" }); onDeleted(draft._id); toast("Auftrag gelöscht – gebuchtes Material ist zurück im Lager"); onClose(); }
    catch (err) { toast(err.message, "error"); }
  };
  const product = picker && products.find(p => p._id === picker.productId);
  // Saves the order and opens a draft invoice with all of its positions.
  const createInvoice = async () => {
    try {
      const saved = await persist();
      const inv = await api(`orders/${saved._id}/invoice`, { method: "POST" });
      toast("Rechnungsentwurf erstellt");
      router.push(`/invoices?open=${inv._id}`);
    } catch (err) { toast(err.message, "error"); }
  };

  return (
    <Modal open onClose={onClose} wide title={draft._id ? `${draft.number} · ${draft.title || "Auftrag"}` : "Neuer Auftrag"}
      footer={<>
        {draft._id && canEdit && <button className="btn btn--danger" onClick={remove}><FiTrash2 /> Löschen</button>}
        {draft._id && <a className="btn btn--ghost" href={`/print/order/${draft._id}?doc=angebot`} target="_blank" rel="noopener"><FiPrinter /> Angebot</a>}
        {draft._id && <a className="btn btn--ghost" href={`/print/order/${draft._id}?doc=auftrag`} target="_blank" rel="noopener"><FiPrinter /> Auftragsbestätigung</a>}
        {draft._id && canEdit && draft.items.length > 0 && <button className="btn btn--ghost" onClick={createInvoice}><FiFileText /> Rechnung erstellen</button>}
        <span className="spacer" />
        <button className="btn btn--ghost" onClick={onClose}>Schließen</button>
        {canEdit && <button className="btn" onClick={save} disabled={busy || !draft.title.trim() || !draft.customerId}>{draft._id ? "Speichern" : "Anlegen"}</button>}
      </>}>
      <form className="stack" onSubmit={save}>
        <fieldset disabled={!canEdit} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="grid-2">
            <Field label="Bezeichnung"><input className="input" autoFocus={!draft._id} value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="z. B. Heizungswartung Gas-Brennwert" maxLength={160} /></Field>
            <Field label="Kunde">
              <select className="select" value={draft.customerId} onChange={e => chooseCustomer(e.target.value)}>
                <option value="">Bitte wählen …</option>
                {customers.slice().sort((a, b) => a.name.localeCompare(b.name, "de")).map(c => <option key={c._id} value={c._id}>{c.name} ({c.number})</option>)}
                <option value="__new">+ Neuen Kunden anlegen …</option>
              </select>
            </Field>
          </div>
          <AnimatePresence>
            {newCustomer && (
              <motion.div className="card stack" style={{ background: "var(--surface-2)" }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <div className="row"><strong>Neuer Kunde</strong><span className="spacer" /><button type="button" className="icon-btn" onClick={() => setNewCustomer(null)} aria-label="Abbrechen"><FiX /></button></div>
                <CustomerForm value={newCustomer} onChange={setNewCustomer} />
                <div className="row"><span className="spacer" /><button type="button" className="btn btn--sm" disabled={!newCustomer.name.trim()} onClick={createCustomer}>Kunde anlegen und übernehmen</button></div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="grid-2">
            <Field label="Status">
              <select className="select" value={draft.status} onChange={e => set({ status: e.target.value })}>{ORDER_STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            </Field>
            <Field label="Einsatzort"><input className="input" value={draft.address} onChange={e => set({ address: e.target.value })} placeholder={customerAddress(customer) || "Straße, PLZ Ort"} /></Field>
            <Field label="Ausführungstermin"><input className="input" type="date" value={draft.dueDate} onChange={e => set({ dueDate: e.target.value })} /></Field>
            <Field label="Angebot gültig bis"><input className="input" type="date" value={draft.validUntil} onChange={e => set({ validUntil: e.target.value })} /></Field>
          </div>
          <Field label="Arbeitsbereich hinzufügen"><select className="input" value="" onChange={e => {
            const area = e.target.value;
            if (area && !draft.workAreas?.some(group => group.area === area)) set({ workAreas: [...(draft.workAreas || []), { area, fields: scopeFields[area].map(label => ({ label, value: "" })) }] });
          }}><option value="">Bereich auswählen …</option>{Object.keys(scopeFields).map(area => <option key={area} disabled={draft.workAreas?.some(group => group.area === area)}>{area}</option>)}</select></Field>
          {canEdit && <details><summary>Eigenen Arbeitsbereich anlegen</summary><div className="stack">
            <Field label="Name des Bereichs"><input className="input" value={customName} maxLength={100} onChange={e => setCustomName(e.target.value)} /></Field>
            <Field label="Feldnamen (ein Feld pro Zeile)"><textarea className="textarea" value={customLabels} onChange={e => setCustomLabels(e.target.value)} /></Field>
            <button type="button" className="btn" onClick={() => {
              const area = customName.trim();
              const labels = [...new Set(customLabels.split(/\r?\n/).map(label => label.trim()).filter(Boolean))];
              if (!area || !labels.length || labels.length > 30 || labels.some(label => label.length > 100)) return toast("Name und 1 bis 30 Feldnamen mit maximal 100 Zeichen eingeben.", "error");
              if (draft.workAreas?.some(g => g.area === area)) return toast("Dieser Bereich ist bereits im Auftrag.", "error");
              set({workAreas:[...(draft.workAreas || []), {area, fields:labels.map(label => ({label,value:""}))}]});
              setCustomName(""); setCustomLabels("");
            }}>Zum Auftrag hinzufügen</button></div></details>}
          {(draft.workAreas || []).map((group, i) => <section className="card stack" key={group.area}><h3>{group.area}</h3><div className="grid-2">
            {group.fields.map((field,j) => <Field label={field.label} key={j}><input className="input" maxLength={500} value={field.value} onChange={e => set({ workAreas: draft.workAreas.map((g,k) => k !== i ? g : {...g, fields:g.fields.map((f,n) => n === j ? {...f,value:e.target.value} : f)}) })} /></Field>)}</div>
            {canEdit && <button className="btn" type="button" onClick={() => set({workAreas:draft.workAreas.filter((_,k) => k !== i)})}>Bereich aus Auftrag entfernen</button>}</section>)}
          <div className="field"><span>Beschreibung (erscheint so formatiert im Angebot)</span>
            <RichEditor compact label="Beschreibung" editable={canEdit} value={draft.descriptionDoc || markdownToDoc(draft.description || "")} onChange={doc => set({ descriptionDoc: doc })} />
          </div>
        </fieldset>

        <hr className="stitch" />
        <div className="row"><strong><FiTool style={{ verticalAlign: -2 }} /> Positionen</strong><span className="spacer" />
          {canEdit && <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={addService}><FiPlus /> Leistung</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={addFreeMaterial}><FiPlus /> Material frei</button>
            <button type="button" className="btn btn--sm" onClick={() => setPicker({ productId: products[0]?._id || "", qty: 1 })} disabled={!products.length || !draft.title.trim() || !draft.customerId}
              title={!products.length ? "Im Inventar sind noch keine Artikel angelegt" : "Bucht den Artikel vom Lagerbestand ab"}><FiPackage /> Material aus Lager</button>
          </>}
        </div>
        <AnimatePresence>
          {picker && (
            <motion.div className="card row" style={{ background: "var(--surface-2)", alignItems: "end" }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div style={{ flex: 2, minWidth: 200 }}><Field label="Artikel">
                <select className="select" value={picker.productId} onChange={e => setPicker({ ...picker, productId: e.target.value })}>
                  {products.map(p => <option key={p._id} value={p._id} disabled={p.stock <= 0}>{p.title} – {p.stock} auf Lager – {fmtMoney(p.total)}</option>)}
                </select></Field></div>
              <div style={{ width: 110 }}><Field label="Menge"><input className="input" type="number" min="0.01" step="any" value={picker.qty} onChange={e => setPicker({ ...picker, qty: e.target.value })} /></Field></div>
              <button type="button" className="btn" onClick={bookMaterial} disabled={!product || !(Number(picker.qty) > 0) || Number(picker.qty) > product.stock}>Vom Lager buchen</button>
              <button type="button" className="icon-btn" onClick={() => setPicker(null)} aria-label="Abbrechen"><FiX /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {draft.items.length ? (
          <div className="table-wrap">
            <table className="positions">
              <thead><tr><th style={{ width: 34 }}>#</th><th>Beschreibung</th><th className="num" style={{ width: 90 }}>Menge</th><th style={{ width: 80 }}>Einheit</th><th className="num" style={{ width: 120 }}>Einzelpreis €</th><th style={{ width: 84 }}>MwSt.</th><th className="num" style={{ width: 110 }}>Gesamt</th><th style={{ width: 44 }}></th></tr></thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {draft.items.map((i, n) => (
                    <motion.tr key={i.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <td className="muted mono">{n + 1}</td>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                          {i.kind === "material" ? <FiPackage className="muted" title="Material" /> : <FiTool className="muted" title="Leistung" />}
                          <input className="input" value={i.title} disabled={!canEdit} onChange={e => setItem(i.id, { title: e.target.value })} placeholder="Text der Position" aria-label="Positionstext" />
                        </div>
                        {i.booked && <small className="muted"><FiLock style={{ verticalAlign: -1 }} /> vom Lager gebucht</small>}
                      </td>
                      <td><input className="input num" type="number" min="0" step="any" value={i.qty} disabled={!canEdit || i.booked} onChange={e => setItem(i.id, { qty: num(e.target.value) })} aria-label="Menge" /></td>
                      <td><input className="input" value={i.unit} disabled={!canEdit} onChange={e => setItem(i.id, { unit: e.target.value })} aria-label="Einheit" maxLength={20} /></td>
                      <td><input className="input num" type="number" min="0" step="0.01" value={i.price} disabled={!canEdit} onChange={e => setItem(i.id, { price: num(e.target.value) })} aria-label="Einzelpreis netto" /></td>
                      <td><select className="select" value={i.vat} disabled={!canEdit} onChange={e => setItem(i.id, { vat: Number(e.target.value) })} aria-label="MwSt.">{VAT_RATES.map(r => <option key={r} value={r}>{r} %</option>)}</select></td>
                      <td className="num mono">{fmtMoney((Number(i.qty) || 0) * (Number(i.price) || 0))}</td>
                      <td>{canEdit && <button type="button" className="icon-btn" onClick={() => removeItem(i)} aria-label={i.booked ? "Zurück ins Lager" : "Position entfernen"} title={i.booked ? "Zurück ins Lager buchen" : "Entfernen"}><FiTrash2 /></button>}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        ) : <p className="muted" style={{ margin: 0 }}>Noch keine Positionen. Leistungen, Material oder erfasste Arbeitszeit hinzufügen.</p>}

        <div className="totals">
          <div><span>Netto</span><b>{fmtMoney(totals.net)}</b></div>
          {totals.vat.map(v => <div key={v.rate}><span>MwSt. {v.rate} % auf {fmtMoney(v.base)}</span><b>{fmtMoney(v.amount)}</b></div>)}
          <div className="totals__gross"><span>Gesamt brutto</span><motion.b key={totals.gross} initial={{ scale: 1.08, color: "var(--brass-text)" }} animate={{ scale: 1, color: "var(--ink)" }}>{fmtMoney(totals.gross)}</motion.b></div>
        </div>

        {draft._id && (
          <>
            <hr className="stitch" />
            <div className="row">
              <strong><FiCheckSquare style={{ verticalAlign: -2 }} /> Aufgaben zum Auftrag ({own.length})</strong>
              <span className="muted"><FiClock style={{ verticalAlign: -2 }} /> {fmtMinutes(minutes)} erfasst</span>
              <span className="spacer" />
              {canEdit && minutes > 0 && <button type="button" className="btn btn--ghost btn--sm" onClick={addWorkTime}><FiClock /> Zeit als Position</button>}
              {canEdit && <Link className="btn btn--ghost btn--sm" href={`/tasks?new=1&order=${draft._id}`}><FiPlus /> Aufgabe</Link>}
            </div>
            {own.length ? (
              <ul className="list">
                {own.map(t => (
                  <li key={t._id}>
                    <span className={`badge ${t.status === "done" ? "badge--ok" : ""}`}>{{ todo: "Offen", doing: "In Arbeit", review: "Prüfung", done: "Erledigt" }[t.status]}</span>
                    <Link href={`/tasks?open=${t._id}`}>{t.headline}</Link>
                    <span className="spacer" />
                    {t.meta.assignee && <span className="muted"><FiUser style={{ verticalAlign: -2 }} /> {t.meta.assignee}</span>}
                    <span className="mono muted">{fmtMinutes(t.timeSpent)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted" style={{ margin: 0 }}>Noch keine Aufgaben verknüpft. Mitarbeiter erfassen ihre Zeit direkt an der Aufgabe.</p>}
          </>
        )}
        {customer && (customer.phone || customer.email || draft.address) && (
          <div className="row muted" style={{ fontSize: 13 }}>
            {customer.phone && <a href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`}>☎ {customer.phone}</a>}
            {customer.email && <a href={`mailto:${customer.email}`}>✉ {customer.email}</a>}
            {draft.address && <span><FiMapPin style={{ verticalAlign: -2 }} /> {draft.address}</span>}
          </div>
        )}
      </form>
    </Modal>
  );
}

/* ---------- Page ---------- */
export default function Orders() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { canEdit } = useSession();
  const orders = useCollection("orders");
  const customers = useCollection("customers");
  const products = useCollection("products");
  const tasks = useCollection("tasks");
  const [q, setQ] = useState("");
  const [customerFilter, setCustomerFilter] = useState(params.get("customer") && !params.get("new") ? params.get("customer") : "");
  const [view, setView] = useState("board");
  const [showLost, setShowLost] = useState(false);
  const [editing, setEditing] = useState(null);
  const [dragId, setDragId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const byId = useMemo(() => Object.fromEntries((customers.items || []).map(c => [c._id, c])), [customers.items]);

  useEffect(() => {
    if (params.get("new") && canEdit && customers.items) {
      const c = byId[params.get("customer")];
      setEditing({ ...blankOrder, customerId: c?._id || "", address: customerAddress(c) });
      router.replace("/orders");
    }
    const open = params.get("open");
    if (open && orders.items) { const o = orders.items.find(x => x._id === open); if (o) setEditing(o); router.replace("/orders"); }
  }, [params, orders.items, customers.items, byId, router, canEdit]);

  const filtered = useMemo(() => (orders.items || []).filter(o =>
    (!customerFilter || o.customerId === customerFilter) &&
    (!q || `${o.number} ${o.title} ${byId[o.customerId]?.name || ""} ${o.address}`.toLowerCase().includes(q.toLowerCase()))
  ).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || b.createdAt.localeCompare(a.createdAt)), [orders.items, q, customerFilter, byId]);

  const sumOf = ids => (orders.items || []).filter(o => ids.includes(o.status)).reduce((s, o) => s + o.totals.gross, 0);
  const year = String(new Date().getFullYear());
  const billedThisYear = (orders.items || []).filter(o => o.status === "abgerechnet" && (o.statusChangedAt || o.updatedAt || "").startsWith(year)).reduce((s, o) => s + o.totals.gross, 0);

  const move = async (id, status) => {
    const order = orders.items.find(o => o._id === id);
    if (!order || order.status === status) return;
    orders.replace({ ...order, status });
    try { orders.replace(await api("orders/" + id, { method: "PATCH", body: { status } })); toast(`${order.number}: ${statusMeta(status).label}`); }
    catch (err) { orders.replace(order); toast(err.message, "error"); }
  };
  const dragOrder = dragId && orders.items?.find(o => o._id === dragId);
  const columns = showLost ? ORDER_STATUS : BOARD;

  return (
    <>
      <PageHead eyebrow="Angebot · Auftrag · Abrechnung" title="Aufträge" text="Vom ersten Anruf bis zur Abrechnung. Karten ziehen, um den Status zu ändern; Material wird direkt vom Lager gebucht.">
        <a className="btn btn--ghost" href="/api/export/orders"><FiDownload /> CSV</a>
        {canEdit && <button className="btn" onClick={() => setEditing({ ...blankOrder })}><FiPlus /> Neuer Auftrag</button>}
      </PageHead>

      <motion.div className="stats" initial="hidden" animate="show">
        {[["Angebote offen", ["angebot"]], ["Beauftragt & in Arbeit", ["beauftragt", "in_arbeit"]], ["Erledigt, nicht abgerechnet", ["erledigt"]]].map(([label, ids], i) => (
          <motion.div key={label} className="card stat" variants={rise} custom={i}>
            <small><span className="dot" style={{ background: statusMeta(ids[0]).color }} /> {label}</small>
            <strong><Counter value={sumOf(ids)} format={fmtMoney} /></strong>
            <span>{(n => `${n} ${n === 1 ? "Auftrag" : "Aufträge"} · brutto`)((orders.items || []).filter(o => ids.includes(o.status)).length)}</span>
          </motion.div>
        ))}
        <motion.div className="card stat" variants={rise} custom={3}>
          <small><span className="dot" style={{ background: "var(--moss)" }} /> Abgerechnet {year}</small>
          <strong><Counter value={billedThisYear} format={fmtMoney} /></strong>
          <span>Umsatz brutto laut Aufträgen</span>
        </motion.div>
      </motion.div>

      <div className="toolbar">
        <input className="input" type="search" placeholder="Nummer, Titel, Kunde, Ort …" value={q} onChange={e => setQ(e.target.value)} aria-label="Aufträge suchen" />
        <select className="select" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} aria-label="Kunde">
          <option value="">Alle Kunden</option>{(customers.items || []).slice().sort((a, b) => a.name.localeCompare(b.name, "de")).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <div className="seg"><button aria-pressed={showLost} onClick={() => setShowLost(v => !v)}>Abgelehnte zeigen</button></div>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Ansicht">
          <button aria-pressed={view === "board"} onClick={() => setView("board")}><FiColumns /> Pipeline</button>
          <button aria-pressed={view === "list"} onClick={() => setView("list")}><FiList /> Liste</button>
        </div>
      </div>

      {!orders.items || !customers.items ? <Skeleton rows={4} /> : !orders.items.length ? (
        <Empty icon={FiBriefcase}>Noch keine Aufträge. {canEdit && <button className="btn btn--sm" style={{ marginLeft: 8 }} onClick={() => setEditing({ ...blankOrder })}>Ersten Auftrag anlegen</button>}</Empty>
      ) : view === "board" ? (
        <DndContext sensors={sensors} onDragStart={e => setDragId(e.active.id)} onDragCancel={() => setDragId(null)}
          onDragEnd={e => { setDragId(null); if (e.over) move(e.active.id, e.over.id); }}>
          <LayoutGroup>
            <div className="board board--orders" style={{ "--cols": columns.length }}>
              {columns.map(s => {
                const list = filtered.filter(o => o.status === s.id);
                return (
                  <StatusColumn key={s.id} status={s} orders={list}>
                    <AnimatePresence>{list.map(o => <OrderCard key={o._id} order={o} customer={byId[o.customerId]} onOpen={setEditing} canEdit={canEdit} />)}</AnimatePresence>
                  </StatusColumn>
                );
              })}
            </div>
          </LayoutGroup>
          <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.16,1,.3,1)" }}>
            {dragOrder && <OrderCard order={dragOrder} customer={byId[dragOrder.customerId]} onOpen={() => {}} overlay />}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nr.</th><th>Auftrag</th><th>Kunde</th><th>Status</th><th>Termin</th><th className="num">Brutto</th></tr></thead>
            <tbody>
              {filtered.filter(o => showLost || o.status !== "abgelehnt").map(o => (
                <tr key={o._id} onClick={() => setEditing(o)} style={{ cursor: "pointer" }}>
                  <td className="mono muted">{o.number}</td>
                  <td><strong>{o.title}</strong></td>
                  <td>{byId[o.customerId]?.name || "–"}</td>
                  <td><span className="badge"><span className="dot" style={{ background: statusMeta(o.status).color }} /> {statusMeta(o.status).label}</span></td>
                  <td>{fmtDate(o.dueDate) || <span className="muted">–</span>}</td>
                  <td className="num">{fmtMoney(o.totals.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <OrderEditor key={editing._id || "new"} order={{ ...blankOrder, ...editing }} customers={customers.items || []} products={products.items || []}
        tasks={tasks.items || []} canEdit={canEdit} onClose={() => { setEditing(null); products.reload(); }}
        onSaved={(doc, isNew) => (isNew ? orders.add(doc) : orders.replace(doc))} onDeleted={orders.drop} onCustomerAdded={customers.add} />}
    </>
  );
}
