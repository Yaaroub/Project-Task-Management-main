"use client";
import { AnimatePresence, motion } from "framer-motion";
import { FiPackage, FiTool, FiTrash2, FiPlus } from "react-icons/fi";
import { fmtMoney } from "@/lib/client";
import { orderTotals, VAT_RATES } from "@/lib/orders-shared";

const num = v => (v === "" ? "" : Number(v));
export const newItem = (kind, vat = 19) => ({ id: crypto.randomUUID(), kind, title: "", qty: 1, unit: kind === "material" ? "Stk." : "Std.", price: 0, vat });

// Editable line items with live totals. readOnly renders a plain table (issued invoices).
export function ItemsEditor({ items, onChange, readOnly = false, zeroVat = false }) {
  const setItem = (id, patch) => onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)));
  return (
    <div className="stack" style={{ gap: 10 }}>
      {!readOnly && (
        <div className="row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange([...items, newItem("leistung", zeroVat ? 0 : 19)])}><FiPlus /> Leistung</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange([...items, newItem("material", zeroVat ? 0 : 19)])}><FiPlus /> Material</button>
        </div>
      )}
      {items.length ? (
        <div className="table-wrap">
          <table className="positions">
            <thead><tr><th style={{ width: 34 }}>#</th><th>Beschreibung</th><th className="num" style={{ width: 90 }}>Menge</th><th style={{ width: 80 }}>Einheit</th><th className="num" style={{ width: 120 }}>Einzelpreis €</th><th style={{ width: 84 }}>MwSt.</th><th className="num" style={{ width: 110 }}>Gesamt</th>{!readOnly && <th style={{ width: 44 }}></th>}</tr></thead>
            <tbody>
              <AnimatePresence initial={false}>
                {items.map((i, n) => (
                  <motion.tr key={i.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td className="muted mono">{n + 1}</td>
                    {readOnly ? (
                      <>
                        <td>{i.kind === "material" ? <FiPackage className="muted" /> : <FiTool className="muted" />} {i.title}</td>
                        <td className="num">{Number(i.qty).toLocaleString("de-DE")}</td><td>{i.unit}</td>
                        <td className="num">{fmtMoney(i.price)}</td><td>{i.vat} %</td>
                      </>
                    ) : (
                      <>
                        <td>
                          <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                            {i.kind === "material" ? <FiPackage className="muted" title="Material" /> : <FiTool className="muted" title="Leistung" />}
                            <input className="input" value={i.title} onChange={e => setItem(i.id, { title: e.target.value })} placeholder="Text der Position" aria-label="Positionstext" />
                          </div>
                        </td>
                        <td><input className="input num" type="number" min="0" step="any" value={i.qty} onChange={e => setItem(i.id, { qty: num(e.target.value) })} aria-label="Menge" /></td>
                        <td><input className="input" value={i.unit} onChange={e => setItem(i.id, { unit: e.target.value })} aria-label="Einheit" maxLength={20} /></td>
                        <td><input className="input num" type="number" min="0" step="0.01" value={i.price} onChange={e => setItem(i.id, { price: num(e.target.value) })} aria-label="Einzelpreis netto" /></td>
                        <td>
                          <select className="select" value={zeroVat ? 0 : i.vat} disabled={zeroVat} onChange={e => setItem(i.id, { vat: Number(e.target.value) })} aria-label="MwSt.">
                            {VAT_RATES.map(r => <option key={r} value={r}>{r} %</option>)}
                          </select>
                        </td>
                      </>
                    )}
                    <td className="num mono">{fmtMoney((Number(i.qty) || 0) * (Number(i.price) || 0))}</td>
                    {!readOnly && <td><button type="button" className="icon-btn" onClick={() => onChange(items.filter(x => x.id !== i.id))} aria-label="Position entfernen"><FiTrash2 /></button></td>}
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      ) : <p className="muted" style={{ margin: 0 }}>Noch keine Positionen.</p>}
    </div>
  );
}

export function Totals({ items, labor }) {
  const t = orderTotals(items);
  return (
    <div className="totals">
      <div><span>Netto</span><b>{fmtMoney(t.net)}</b></div>
      {t.vat.map(v => <div key={v.rate}><span>MwSt. {v.rate} % auf {fmtMoney(v.base)}</span><b>{fmtMoney(v.amount)}</b></div>)}
      <div className="totals__gross"><span>Gesamt brutto</span><motion.b key={t.gross} initial={{ scale: 1.08, color: "var(--brass-text)" }} animate={{ scale: 1, color: "var(--ink)" }}>{fmtMoney(t.gross)}</motion.b></div>
      {labor > 0 && <div style={{ fontSize: 13 }}><span>davon Arbeitskosten (§ 35a EStG)</span><b>{fmtMoney(labor)}</b></div>}
    </div>
  );
}
