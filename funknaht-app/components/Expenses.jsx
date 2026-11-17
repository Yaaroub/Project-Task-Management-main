"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FiPlus, FiCreditCard, FiDownload, FiTrash2, FiEdit2 } from "react-icons/fi";
import { api, useCollection, fmtDate, fmtMoney, todayKey } from "@/lib/client";
import { Modal, Field, PageHead, Empty, Skeleton, useToast, confirmDelete, Counter, rise, useSelection, SelectBar, Pick, forEach } from "./ui";
import { useSession } from "./Shell";

const CATEGORIES = ["Material", "Fahrzeug", "Miete und Nebenkosten", "Büro", "Software", "Versicherung", "Werbung", "Löhne", "Fremdleistung", "Sonstiges"];
const blank = () => ({ date: todayKey(), vendor: "", category: "", description: "", reference: "", gross: "", vat: 19, paid: true });

export default function Expenses() {
  const toast = useToast();
  const { canEdit } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const expenses = useCollection("expenses");
  const [q, setQ] = useState("");
  const [year, setYear] = useState(todayKey().slice(0, 4));
  const [category, setCategory] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const sel = useSelection();

  useEffect(() => { if (params.get("new") && canEdit) { setEditing(blank()); router.replace("/expenses"); } }, [params, canEdit, router]);

  const all = expenses.items || [];
  const years = useMemo(() => [...new Set([todayKey().slice(0, 4), ...all.map(x => x.date.slice(0, 4))])].sort().reverse(), [all]);
  const categories = useMemo(() => [...new Set([...CATEGORIES, ...all.map(x => x.category).filter(Boolean)])], [all]);
  const list = useMemo(() => all
    .filter(x => x.date.startsWith(year) && (!category || x.category === category) && (!onlyOpen || !x.paid)
      && (!q || `${x.vendor} ${x.description} ${x.reference} ${x.category}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.date.localeCompare(a.date)), [all, year, category, onlyOpen, q]);
  const month = todayKey().slice(0, 7);
  const sums = useMemo(() => ({
    month: all.filter(x => x.date.startsWith(month)).reduce((s, x) => s + x.gross, 0),
    year: all.filter(x => x.date.startsWith(year)).reduce((s, x) => s + x.gross, 0),
    vat: all.filter(x => x.date.startsWith(year)).reduce((s, x) => s + x.vatAmount, 0),
    unpaid: all.filter(x => !x.paid).reduce((s, x) => s + x.gross, 0),
  }), [all, month, year]);

  const save = async e => {
    e.preventDefault();
    try {
      const { _id, date, vendor, category, description, reference, gross, vat, paid } = editing;
      const body = { date, vendor, category, description, reference, gross: Number(String(gross).replace(",", ".")), vat: Number(vat), paid };
      if (_id) expenses.replace(await api("expenses/" + _id, { method: "PATCH", body }));
      else expenses.add(await api("expenses", { method: "POST", body }));
      toast(_id ? "Ausgabe gespeichert" : "Ausgabe angelegt");
      setEditing(null);
    } catch (err) { toast(err.message, "error"); }
  };
  const togglePaid = async x => {
    try { expenses.replace(await api("expenses/" + x._id, { method: "PATCH", body: { paid: !x.paid } })); } catch (err) { toast(err.message, "error"); }
  };
  const remove = async x => {
    if (!confirmDelete(`Ausgabe „${x.vendor}“`)) return;
    try { await api("expenses/" + x._id, { method: "DELETE" }); expenses.drop(x._id); toast("Ausgabe gelöscht"); } catch (err) { toast(err.message, "error"); }
  };
  // Several at once: mark as paid or delete.
  const bulk = async (what, fn) => {
    const { done, error } = await forEach(sel.ids, fn);
    if (error) toast(error.message, "error"); else toast(`${done} ${done === 1 ? "Ausgabe" : "Ausgaben"} ${what}`);
    sel.stop();
  };
  const bulkPaid = () => bulk("als bezahlt markiert", async id => expenses.replace(await api("expenses/" + id, { method: "PATCH", body: { paid: true } })));
  const bulkRemove = () => {
    if (!window.confirm(`${sel.count} ${sel.count === 1 ? "Ausgabe" : "Ausgaben"} wirklich löschen? Das lässt sich nicht rückgängig machen.`)) return;
    bulk("gelöscht", async id => { await api("expenses/" + id, { method: "DELETE" }); expenses.drop(id); });
  };
  const net = editing ? (Number(String(editing.gross).replace(",", ".")) || 0) / (1 + Number(editing.vat) / 100) : 0;

  return (
    <>
      <PageHead eyebrow="Belege · Kosten · Vorsteuer" title="Ausgaben" text="Jede Ausgabe mit Lieferant, Betrag und Steuersatz. In den Berichten steht sie dem Umsatz gegenüber.">
        <a className="btn btn--ghost" href="/api/export/expenses"><FiDownload /> CSV</a>
        {canEdit && <button className="btn" onClick={() => setEditing(blank())}><FiPlus /> Neue Ausgabe</button>}
      </PageHead>

      <motion.div className="stats" initial="hidden" animate="show">
        {[["Dieser Monat", sums.month, "brutto"], [`Jahr ${year}`, sums.year, "brutto"], ["Vorsteuer", sums.vat, `Jahr ${year}`], ["Noch nicht bezahlt", sums.unpaid, "alle Jahre"]].map(([label, value, sub], i) => (
          <motion.div key={label} className="card stat" variants={rise} custom={i}><small>{label}</small><strong><Counter value={value} format={fmtMoney} /></strong><span>{sub}</span></motion.div>
        ))}
      </motion.div>

      <div className="toolbar">
        <input className="input" type="search" placeholder="Lieferant, Beleg, Beschreibung …" value={q} onChange={e => setQ(e.target.value)} aria-label="Ausgaben filtern" />
        <select className="select" value={year} onChange={e => setYear(e.target.value)} aria-label="Jahr">{years.map(y => <option key={y}>{y}</option>)}</select>
        <select className="select" value={category} onChange={e => setCategory(e.target.value)} aria-label="Kategorie">
          <option value="">Alle Kategorien</option>{categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <div className="seg"><button aria-pressed={onlyOpen} onClick={() => setOnlyOpen(v => !v)}>Nur unbezahlte</button></div>
        <span className="spacer" />
        <SelectBar sel={sel} ids={list.map(x => x._id)}>
          {canEdit && <button className="btn btn--sm" disabled={!sel.count} onClick={bulkPaid}>Als bezahlt</button>}
          <a className={`btn btn--ghost btn--sm${sel.count ? "" : " is-disabled"}`} href={`/api/export/expenses?ids=${sel.ids.join(",")}`} aria-disabled={!sel.count}><FiDownload /> CSV für Steuerberatung</a>
          {canEdit && <button className="btn btn--danger btn--sm" disabled={!sel.count} onClick={bulkRemove}><FiTrash2 /> Löschen</button>}
        </SelectBar>
      </div>

      {!expenses.items ? <Skeleton rows={5} height={48} /> : !list.length ? (
        <Empty icon={FiCreditCard}>{all.length ? "Keine Treffer für diesen Filter." : "Noch keine Ausgaben erfasst."}</Empty>
      ) : (
        <div className={`table-wrap${sel.active ? " selecting" : ""}`}>
          <table>
            <thead><tr>{sel.active && <th className="pickcell" />}<th>Datum</th><th>Lieferant</th><th>Kategorie</th><th className="num">Netto</th><th className="num">MwSt.</th><th className="num">Brutto</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map(x => (
                <tr key={x._id} data-picked={sel.has(x._id)} onClick={sel.active ? () => sel.toggle(x._id) : undefined}>
                  {sel.active && <td className="pickcell"><Pick on={sel.has(x._id)} /></td>}
                  <td className="mono">{fmtDate(x.date, { day: "2-digit", month: "2-digit", year: "2-digit" })}</td>
                  <td><b>{x.vendor}</b>{(x.description || x.reference) && <div className="muted" style={{ fontSize: 12 }}>{[x.reference, x.description].filter(Boolean).join(" · ")}</div>}</td>
                  <td>{x.category || <span className="muted">–</span>}</td>
                  <td className="num">{fmtMoney(x.net)}</td>
                  <td className="num">{x.vat} %</td>
                  <td className="num"><b>{fmtMoney(x.gross)}</b></td>
                  <td><button className={`badge ${x.paid ? "badge--ok" : "badge--warn"}`} style={{ border: 0, cursor: canEdit ? "pointer" : "default" }} disabled={!canEdit || sel.active} onClick={() => togglePaid(x)} title={canEdit ? "Klicken zum Umschalten" : undefined}>{x.paid ? "Bezahlt" : "Offen"}</button></td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    {canEdit && !sel.active && <><button className="icon-btn" aria-label="Bearbeiten" onClick={() => setEditing(x)}><FiEdit2 /></button>{" "}
                      <button className="icon-btn" aria-label="Löschen" onClick={() => remove(x)}><FiTrash2 /></button></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?._id ? "Ausgabe bearbeiten" : "Neue Ausgabe"}
        footer={<><button className="btn btn--ghost" onClick={() => setEditing(null)}>Abbrechen</button><button className="btn" onClick={save} disabled={!editing?.vendor?.trim() || !String(editing?.gross).trim()}>Speichern</button></>}>
        {editing && (
          <form className="stack" onSubmit={save}>
            <div className="grid-2">
              <Field label="Lieferant"><input className="input" autoFocus value={editing.vendor} onChange={e => setEditing({ ...editing, vendor: e.target.value })} placeholder="z. B. Baumarkt Nord" /></Field>
              <Field label="Belegdatum"><input className="input" type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} /></Field>
              <Field label="Betrag brutto (€)"><input className="input" inputMode="decimal" value={editing.gross} onChange={e => setEditing({ ...editing, gross: e.target.value })} placeholder="0,00" /></Field>
              <Field label="MwSt."><select className="select" value={editing.vat} onChange={e => setEditing({ ...editing, vat: e.target.value })}><option value="19">19 %</option><option value="7">7 %</option><option value="0">0 % / keine</option></select></Field>
              <Field label="Kategorie"><input className="input" list="expense-cats" value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} /><datalist id="expense-cats">{categories.map(c => <option key={c} value={c} />)}</datalist></Field>
              <Field label="Belegnummer (optional)"><input className="input" value={editing.reference} onChange={e => setEditing({ ...editing, reference: e.target.value })} /></Field>
            </div>
            <Field label="Beschreibung (optional)"><input className="input" maxLength={500} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} /></Field>
            <label className="row" style={{ gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={editing.paid} onChange={e => setEditing({ ...editing, paid: e.target.checked })} style={{ accentColor: "var(--brass)", width: 18, height: 18 }} />
              <span>Bereits bezahlt</span>
            </label>
            <div className="notice" style={{ margin: 0 }}>Netto <strong>{fmtMoney(net)}</strong> · Vorsteuer <strong>{fmtMoney((Number(String(editing.gross).replace(",", ".")) || 0) - net)}</strong></div>
          </form>
        )}
      </Modal>
    </>
  );
}
