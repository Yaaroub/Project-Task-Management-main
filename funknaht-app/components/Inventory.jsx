"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FiPlus, FiPackage, FiArrowDown, FiArrowUp, FiSliders, FiTrash2, FiEdit2, FiDownload, FiAlertTriangle, FiShoppingCart } from "react-icons/fi";
import { api, useCollection, fmtMoney, fmtDate } from "@/lib/client";
import { Modal, Field, PageHead, Empty, Skeleton, useToast, confirmDelete, Counter, rise, useSelection, SelectBar, Pick, forEach, openPrint } from "./ui";
import { useSession } from "./Shell";

const blank = { title: "", sku: "", category: "", price: 0, taxes: 0, ads: 0, discount: 0, stock: 0, minStock: 10 };
const MOVES = { IN: ["Zugang", FiArrowDown], OUT: ["Abgang", FiArrowUp], ADJUSTMENT: ["Korrektur", FiSliders] };

export default function Inventory() {
  const toast = useToast();
  const { canEdit } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const products = useCollection("products");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [sort, setSort] = useState("title");
  const [editing, setEditing] = useState(null);
  const [booking, setBooking] = useState(null);
  const [history, setHistory] = useState(null);
  const sel = useSelection();

  useEffect(() => {
    const open = params.get("open");
    if (open && products.items) { const p = products.items.find(x => x._id === open); if (p) setHistory(p); router.replace("/inventory"); }
  }, [params, products.items, router]);

  const categories = useMemo(() => [...new Set((products.items || []).map(p => p.category).filter(Boolean))].sort(), [products.items]);
  const list = useMemo(() => (products.items || [])
    .filter(p => (!q || `${p.title} ${p.sku || ""} ${p.category}`.toLowerCase().includes(q.toLowerCase())) && (!category || p.category === category) && (!onlyLow || p.stock <= p.minStock))
    .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "stock" ? a.stock - b.stock : b.stock * b.total - a.stock * a.total),
  [products.items, q, category, onlyLow, sort]);
  const totals = useMemo(() => ({
    value: (products.items || []).reduce((s, p) => s + p.stock * p.total, 0),
    units: (products.items || []).reduce((s, p) => s + p.stock, 0),
    low: (products.items || []).filter(p => p.stock <= p.minStock).length,
  }), [products.items]);

  const save = async e => {
    e.preventDefault();
    try {
      const { _id, title, sku, category, price, taxes, ads, discount, stock, minStock } = editing;
      const body = { title, sku, category, price, taxes, ads, discount, minStock, ...(_id ? {} : { stock }) };
      if (_id) products.replace(await api("products/" + _id, { method: "PATCH", body }));
      else products.add(await api("products", { method: "POST", body }));
      toast(_id ? "Artikel gespeichert" : "Artikel angelegt");
      setEditing(null);
    } catch (err) { toast(err.message, "error"); }
  };
  const book = async e => {
    e.preventDefault();
    try {
      const doc = await api("stock/" + booking.product._id, { method: "POST", body: { type: booking.type, quantity: booking.quantity, notes: booking.notes } });
      products.replace(doc);
      toast(`${MOVES[booking.type][0]} gebucht – Bestand ${doc.stock}`);
      setBooking(null);
    } catch (err) { toast(err.message, "error"); }
  };
  const remove = async p => {
    if (!confirmDelete(`„${p.title}“`)) return;
    try { await api("products/" + p._id, { method: "DELETE" }); products.drop(p._id); toast("Artikel gelöscht"); } catch (err) { toast(err.message, "error"); }
  };
  const bulkRemove = async () => {
    if (!window.confirm(`${sel.count} ${sel.count === 1 ? "Artikel" : "Artikel"} wirklich löschen? Das lässt sich nicht rückgängig machen.`)) return;
    const { done, error } = await forEach(sel.ids, async id => { await api("products/" + id, { method: "DELETE" }); products.drop(id); });
    if (error) toast(error.message, "error"); else toast(`${done} ${done === 1 ? "Artikel" : "Artikel"} gelöscht`);
    sel.stop();
  };
  const total = editing ? Math.max(0, +editing.price + +editing.taxes + +editing.ads - +editing.discount) : 0;

  return (
    <>
      <PageHead eyebrow="Bestand · Buchungen" title="Inventar" text="Zu- und Abgänge werden mit Verlauf gebucht. Artikel unter Mindestbestand erscheinen auf der Übersicht.">
        <a className="btn btn--ghost" href="/api/export/products"><FiDownload /> CSV</a>
        <button className="btn btn--ghost" onClick={() => openPrint("/print/reorder")} title="Alle Artikel am oder unter dem Mindestbestand"><FiShoppingCart /> Bestellliste</button>
        {canEdit && <button className="btn" onClick={() => setEditing(blank)}><FiPlus /> Neuer Artikel</button>}
      </PageHead>

      <motion.div className="stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }} initial="hidden" animate="show">
        <motion.div className="card stat" variants={rise} custom={0}><small>Lagerwert</small><strong><Counter value={totals.value} format={fmtMoney} /></strong></motion.div>
        <motion.div className="card stat" variants={rise} custom={1}><small>Einheiten</small><strong><Counter value={totals.units} /></strong></motion.div>
        <motion.div className="card stat" variants={rise} custom={2}><small>Nachbestellen</small><strong style={{ color: totals.low ? "var(--err)" : undefined }}><Counter value={totals.low} /></strong></motion.div>
      </motion.div>

      <div className="toolbar">
        <input className="input" type="search" placeholder="Artikel, Nummer, Kategorie …" value={q} onChange={e => setQ(e.target.value)} aria-label="Artikel filtern" />
        <select className="select" value={category} onChange={e => setCategory(e.target.value)} aria-label="Kategorie">
          <option value="">Alle Kategorien</option>{categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sortierung">
          <option value="title">Nach Name</option><option value="stock">Nach Bestand</option><option value="value">Nach Lagerwert</option>
        </select>
        <div className="seg"><button aria-pressed={onlyLow} onClick={() => setOnlyLow(v => !v)}><FiAlertTriangle /> Nur Nachbestellen</button></div>
        <span className="spacer" />
        <SelectBar sel={sel} ids={list.map(p => p._id)}>
          <button className="btn btn--sm" disabled={!sel.count} onClick={() => openPrint("/print/reorder?ids=" + sel.ids.join(","))}><FiShoppingCart /> Bestellliste</button>
          {canEdit && <button className="btn btn--danger btn--sm" disabled={!sel.count} onClick={bulkRemove}><FiTrash2 /> Löschen</button>}
        </SelectBar>
      </div>

      {!products.items ? <Skeleton rows={5} height={48} /> : !list.length ? (
        <Empty icon={FiPackage}>{products.items.length ? "Keine Treffer für diesen Filter." : "Noch keine Artikel angelegt."}</Empty>
      ) : (
        <div className={`table-wrap${sel.active ? " selecting" : ""}`}>
          <table>
            <thead><tr>{sel.active && <th className="pickcell" />}<th>Artikel</th><th>Kategorie</th><th className="num">Stückpreis</th><th className="num">Bestand</th><th className="num">Wert</th><th></th></tr></thead>
            <tbody>
              <AnimatePresence initial={false}>
                {list.map(p => {
                  const low = p.stock <= p.minStock;
                  return (
                    <motion.tr key={p._id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-picked={sel.has(p._id)} onClick={sel.active ? () => sel.toggle(p._id) : undefined}>
                      {sel.active && <td className="pickcell"><Pick on={sel.has(p._id)} /></td>}
                      <td><button className="chip" style={{ all: "unset", cursor: "pointer", fontWeight: 600 }} onClick={() => !sel.active && setHistory(p)}>{p.title}</button>{p.sku && <div className="mono muted" style={{ fontSize: 12 }}>{p.sku}</div>}</td>
                      <td>{p.category || <span className="muted">–</span>}</td>
                      <td className="num">{fmtMoney(p.total)}</td>
                      <td className="num">
                        <span className={low ? "overdue" : ""}>{p.stock}</span>
                        <span className={`stockbar ${low ? "low" : ""}`} title={`Mindestbestand ${p.minStock}`}><motion.i initial={{ width: 0 }} animate={{ width: Math.min(100, (p.stock / Math.max(1, p.minStock * 2)) * 100) + "%" }} /></span>
                      </td>
                      <td className="num">{fmtMoney(p.stock * p.total)}</td>
                      <td className="num" style={{ whiteSpace: "nowrap", visibility: sel.active ? "hidden" : undefined }}>
                        <button className="btn btn--ghost btn--sm" onClick={() => setBooking({ product: p, type: "IN", quantity: 1, notes: "" })}><FiArrowDown /> Buchen</button>{" "}
                        <button className="icon-btn" aria-label="Bearbeiten" onClick={() => setEditing(p)}><FiEdit2 /></button>{" "}
                        <button className="icon-btn" aria-label="Löschen" onClick={() => remove(p)}><FiTrash2 /></button>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?._id ? "Artikel bearbeiten" : "Neuer Artikel"}
        footer={<><button className="btn btn--ghost" onClick={() => setEditing(null)}>Abbrechen</button><button className="btn" onClick={save} disabled={!editing?.title?.trim()}>Speichern</button></>}>
        {editing && (
          <form className="stack" onSubmit={save}>
            <Field label="Bezeichnung"><input className="input" autoFocus value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} /></Field>
            <div className="grid-2">
              <Field label="Artikelnummer"><input className="input" value={editing.sku || ""} onChange={e => setEditing({ ...editing, sku: e.target.value })} /></Field>
              <Field label="Kategorie"><input className="input" list="cats" value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} /><datalist id="cats">{categories.map(c => <option key={c} value={c} />)}</datalist></Field>
              {[["price", "Preis (€)"], ["taxes", "Steuern (€)"], ["ads", "Werbung (€)"], ["discount", "Rabatt (€)"]].map(([k, l]) => (
                <Field key={k} label={l}><input className="input" type="number" min="0" step="0.01" value={editing[k]} onChange={e => setEditing({ ...editing, [k]: e.target.value })} /></Field>
              ))}
              {!editing._id && <Field label="Anfangsbestand"><input className="input" type="number" min="0" value={editing.stock} onChange={e => setEditing({ ...editing, stock: e.target.value })} /></Field>}
              <Field label="Mindestbestand"><input className="input" type="number" min="0" value={editing.minStock} onChange={e => setEditing({ ...editing, minStock: e.target.value })} /></Field>
            </div>
            <div className="notice" style={{ margin: 0 }}>Stückpreis gesamt: <strong>{fmtMoney(total)}</strong></div>
          </form>
        )}
      </Modal>

      <Modal open={!!booking} onClose={() => setBooking(null)} title={booking ? `Buchung · ${booking.product.title}` : ""}
        footer={<><button className="btn btn--ghost" onClick={() => setBooking(null)}>Abbrechen</button><button className="btn" onClick={book}>Buchen</button></>}>
        {booking && (
          <form className="stack" onSubmit={book}>
            <div className="seg" role="group" aria-label="Art">
              {Object.entries(MOVES).map(([k, [l, Icon]]) => <button type="button" key={k} aria-pressed={booking.type === k} onClick={() => setBooking({ ...booking, type: k })}><Icon /> {l}</button>)}
            </div>
            <Field label={booking.type === "ADJUSTMENT" ? "Neuer Bestand (Inventur)" : "Menge"}>
              <input className="input" type="number" min="0" autoFocus value={booking.quantity} onChange={e => setBooking({ ...booking, quantity: e.target.value })} />
            </Field>
            <Field label="Notiz"><input className="input" value={booking.notes} onChange={e => setBooking({ ...booking, notes: e.target.value })} placeholder="z. B. Lieferschein 4711" /></Field>
            <p className="muted" style={{ margin: 0 }}>Aktueller Bestand: {booking.product.stock}</p>
          </form>
        )}
      </Modal>

      <Modal open={!!history} onClose={() => setHistory(null)} title={history ? `Verlauf · ${history.title}` : ""} wide>
        {history && (history.movements?.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Datum</th><th>Art</th><th className="num">Menge</th><th className="num">Bestand danach</th><th>Notiz</th></tr></thead>
              <tbody>
                {[...history.movements].reverse().map((m, i) => (
                  <tr key={i}>
                    <td className="mono">{fmtDate(m.date, { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td><span className={`badge ${m.type === "IN" ? "badge--ok" : m.type === "OUT" ? "badge--warn" : ""}`}>{MOVES[m.type]?.[0]}</span></td>
                    <td className="num">{m.quantity}</td><td className="num">{m.stockAfter}</td><td>{m.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>Noch keine Buchungen.</Empty>)}
      </Modal>
    </>
  );
}
