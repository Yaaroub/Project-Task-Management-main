"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FiPlus, FiFileText, FiDownload, FiTrash2, FiPrinter, FiSend, FiXCircle, FiCheckCircle, FiAlertTriangle, FiCode, FiLock, FiCreditCard, FiShield } from "react-icons/fi";
import { api, useCollection, fmtMoney, fmtDate, todayKey } from "@/lib/client";
import { INVOICE_STATUS, laborShare } from "@/lib/invoices-shared";
import { Modal, Field, PageHead, Empty, Skeleton, useToast, confirmDelete, Counter, rise, useSelection, SelectBar, Pick, forEach, openPrint } from "./ui";
import { useSession } from "./Shell";
import { ItemsEditor, Totals } from "./ItemsEditor";

const blank = { subject: "", customerId: "", orderId: "", serviceDate: "", serviceDateTo: "", paymentDays: 14, intro: "", note: "", buyerReference: "", propertyNotice: false, items: [] };
const FILTERS = [["", "Alle"], ["entwurf", "Entwürfe"], ["offen", "Offen"], ["ueberfaellig", "Überfällig"], ["bezahlt", "Bezahlt"], ["storniert", "Storniert"]];
const day = d => fmtDate(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const count = n => `${n} ${n === 1 ? "Rechnung" : "Rechnungen"}`;

function StatusBadge({ status }) {
  const s = INVOICE_STATUS[status] || INVOICE_STATUS.entwurf;
  return <span className="badge"><span className="dot" style={{ background: s.color }} /> {s.label}</span>;
}

function Payments({ inv, onChange, isAdmin, canEdit }) {
  const toast = useToast();
  const [form, setForm] = useState({ amount: inv.open, date: todayKey(), note: "" });
  useEffect(() => setForm(f => ({ ...f, amount: inv.open })), [inv.open]);
  const add = async e => {
    e.preventDefault();
    try { onChange(await api(`invoices/${inv._id}/payments`, { method: "POST", body: { ...form, amount: Number(form.amount) } })); toast("Zahlung erfasst"); }
    catch (err) { toast(err.message, "error"); }
  };
  const remove = async p => {
    if (!window.confirm(`Zahlung über ${fmtMoney(p.amount)} vom ${day(p.date)} entfernen?`)) return;
    try { onChange(await api(`invoices/${inv._id}/payments/${p.id}`, { method: "DELETE" })); toast("Zahlung entfernt"); }
    catch (err) { toast(err.message, "error"); }
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row"><strong><FiCreditCard style={{ verticalAlign: -2 }} /> Zahlungen</strong><span className="spacer" />
        <span className="muted">bezahlt {fmtMoney(inv.paid)} · offen <b style={{ color: inv.open > 0 ? "var(--ink)" : "var(--ok)" }}>{fmtMoney(inv.open)}</b></span></div>
      {inv.payments.length > 0 && (
        <ul className="list">
          {inv.payments.map(p => (
            <li key={p.id}>
              <FiCheckCircle style={{ color: "var(--ok)" }} /><span className="mono">{day(p.date)}</span><b>{fmtMoney(p.amount)}</b>
              <span className="muted">{p.note}</span><span className="spacer" /><small className="muted">{p.by}</small>
              {isAdmin && <button className="icon-btn" onClick={() => remove(p)} aria-label="Zahlung entfernen"><FiTrash2 /></button>}
            </li>
          ))}
        </ul>
      )}
      {canEdit && inv.open > 0 && (
        <form className="row" style={{ alignItems: "end" }} onSubmit={add}>
          <div style={{ width: 140 }}><Field label="Betrag €"><input className="input num" type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field></div>
          <div style={{ width: 160 }}><Field label="Eingang am"><input className="input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field></div>
          <div style={{ flex: 1, minWidth: 160 }}><Field label="Notiz"><input className="input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="z. B. Überweisung, bar, EC" /></Field></div>
          <button className="btn">Zahlung erfassen</button>
        </form>
      )}
    </div>
  );
}

function InvoiceEditor({ invoice, customers, orders, profile, onClose, onSaved, onDeleted, onOpen }) {
  const toast = useToast();
  const { canEdit, isAdmin } = useSession();
  const [draft, setDraft] = useState(invoice);
  const [busy, setBusy] = useState(false);
  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const issued = draft.issued;
  const customer = customers.find(c => c._id === draft.customerId);
  const order = orders.find(o => o._id === draft.orderId);
  const buyer = issued ? draft.snapshot.buyer : customer;
  const zeroVat = issued ? draft.snapshot.smallBusiness : profile?.smallBusiness;
  const labor = buyer?.type === "privat" ? laborShare(draft.items) : 0;

  const body = d => ({
    subject: d.subject, customerId: d.customerId, orderId: d.orderId || "", serviceDate: d.serviceDate, serviceDateTo: d.serviceDateTo,
    paymentDays: Number(d.paymentDays) || 0, intro: d.intro, note: d.note, buyerReference: d.buyerReference, propertyNotice: !!d.propertyNotice,
    items: d.items.map(({ id, kind, title, qty, unit, price, vat }) => ({ id, kind, title, qty: Number(qty) || 0, unit, price: Number(price) || 0, vat: zeroVat ? 0 : Number(vat) })),
  });
  const persist = async () => {
    const saved = draft._id ? await api("invoices/" + draft._id, { method: "PATCH", body: body(draft) }) : await api("invoices", { method: "POST", body: body(draft) });
    onSaved(saved, !draft._id); setDraft(saved); return saved;
  };
  const save = async e => {
    e?.preventDefault(); setBusy(true);
    try { await persist(); toast("Entwurf gespeichert"); } catch (err) { toast(err.message, "error"); } finally { setBusy(false); }
  };
  const finalize = async () => {
    if (!window.confirm("Rechnung jetzt stellen?\n\nSie erhält eine fortlaufende Rechnungsnummer und das heutige Datum. Danach kann sie nicht mehr geändert oder gelöscht werden – Korrekturen nur noch per Storno.")) return;
    setBusy(true);
    try {
      const saved = await persist();
      const doc = await api(`invoices/${saved._id}/finalize`, { method: "POST" });
      onSaved(doc); setDraft(doc); toast(`Rechnung ${doc.number} gestellt`);
    } catch (err) { toast(err.message, "error"); } finally { setBusy(false); }
  };
  const cancel = async () => {
    const reason = window.prompt(`Rechnung ${draft.number} stornieren?\nEs wird eine Stornorechnung mit eigener Nummer erstellt.\n\nBegründung (optional):`, "");
    if (reason === null) return;
    try {
      const { storno, original } = await api(`invoices/${draft._id}/cancel`, { method: "POST", body: { reason } });
      onSaved(original); onSaved(storno, true); setDraft(original);
      toast(`Storniert durch ${storno.number}`);
    } catch (err) { toast(err.message, "error"); }
  };
  const remove = async () => {
    if (!confirmDelete("Diesen Rechnungsentwurf")) return;
    try { await api("invoices/" + draft._id, { method: "DELETE" }); onDeleted(draft._id); toast("Entwurf gelöscht"); onClose(); }
    catch (err) { toast(err.message, "error"); }
  };
  const chooseCustomer = id => {
    const c = customers.find(x => x._id === id);
    set({ customerId: id, propertyNotice: draft._id ? draft.propertyNotice : c?.type === "privat", buyerReference: draft.buyerReference || c?.number || "" });
  };

  const title = issued ? `${draft.type === "storno" ? "Stornorechnung" : "Rechnung"} ${draft.number}` : draft._id ? "Rechnungsentwurf" : "Neue Rechnung";
  return (
    <Modal open onClose={onClose} wide title={title}
      footer={<>
        {!issued && draft._id && canEdit && <button className="btn btn--danger" onClick={remove}><FiTrash2 /> Löschen</button>}
        {issued && isAdmin && draft.type !== "storno" && !draft.cancelled && <button className="btn btn--danger" onClick={cancel}><FiXCircle /> Stornieren</button>}
        {draft._id && <a className="btn btn--ghost" href={`/print/invoice/${draft._id}`} target="_blank" rel="noopener"><FiPrinter /> {issued ? "Drucken / PDF" : "Vorschau"}</a>}
        {issued && <a className="btn btn--ghost" href={`/api/invoices/${draft._id}/xrechnung`} title="E-Rechnung im Format XRechnung 3.0 (CII)"><FiCode /> E-Rechnung</a>}
        <span className="spacer" />
        <button className="btn btn--ghost" onClick={onClose}>Schließen</button>
        {!issued && canEdit && <button className="btn btn--ghost" onClick={save} disabled={busy || !draft.subject.trim() || !draft.customerId}>Entwurf speichern</button>}
        {!issued && isAdmin && <button className="btn" onClick={finalize} disabled={busy || !draft.subject.trim() || !draft.customerId || !draft.items.length}><FiSend /> Rechnung stellen</button>}
      </>}>
      <div className="stack">
        {issued ? (
          <>
            <div className="row">
              <StatusBadge status={draft.status} />
              <span className="muted">gestellt am {day(draft.issueDate)} von {draft.issuedBy} · fällig {day(draft.dueDate)}</span>
              <span className="spacer" />
              <span className="badge" title={`SHA-256: ${draft.hash}`}><FiLock /> unveränderbar</span>
            </div>
            {draft.cancelled && <div className="notice" style={{ margin: 0 }}><FiXCircle /> Storniert durch <button className="chip" style={{ all: "unset", cursor: "pointer", textDecoration: "underline" }} onClick={() => onOpen(draft.cancelledBy)}>{draft.cancelledNumber}</button>{draft.cancelReason && <> – {draft.cancelReason}</>}</div>}
            {draft.type === "storno" && <div className="notice" style={{ margin: 0 }}><FiXCircle /> Storniert Rechnung <button className="chip" style={{ all: "unset", cursor: "pointer", textDecoration: "underline" }} onClick={() => onOpen(draft.refInvoiceId)}>{draft.refNumber}</button></div>}
            <div className="grid-2">
              <div><small className="muted">Kunde</small><div><b>{buyer.name}</b> <span className="muted mono">{buyer.number}</span></div><div className="muted">{buyer.street}, {buyer.zip} {buyer.city}</div></div>
              <div><small className="muted">Betreff</small><div><b>{draft.subject}</b></div><div className="muted">Leistung {day(draft.serviceDate)}{draft.serviceDateTo ? ` – ${day(draft.serviceDateTo)}` : ""}{order ? ` · Auftrag ${order.number}` : ""}</div></div>
            </div>
            <ItemsEditor items={draft.items} readOnly />
            <Totals items={draft.items} labor={labor} />
            {draft.type !== "storno" && !draft.cancelled && <><hr className="stitch" /><Payments inv={draft} onChange={doc => { setDraft(doc); onSaved(doc); }} isAdmin={isAdmin} canEdit={canEdit} /></>}
          </>
        ) : (
          <fieldset disabled={!canEdit} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            {profile?.missingForInvoice?.length > 0 && (
              <div className="notice" style={{ margin: 0 }}><FiAlertTriangle /> Vor dem Stellen fehlen in den Firmendaten: {profile.missingForInvoice.join(", ")}. {isAdmin && <Link href="/admin">Jetzt ergänzen →</Link>}</div>
            )}
            <div className="grid-2">
              <Field label="Kunde">
                <select className="select" value={draft.customerId} onChange={e => chooseCustomer(e.target.value)}>
                  <option value="">Bitte wählen …</option>
                  {customers.slice().sort((a, b) => a.name.localeCompare(b.name, "de")).map(c => <option key={c._id} value={c._id}>{c.name} ({c.number})</option>)}
                </select>
              </Field>
              <Field label="Betreff"><input className="input" value={draft.subject} onChange={e => set({ subject: e.target.value })} placeholder="z. B. Heizungswartung Oktober" maxLength={160} /></Field>
              <Field label="Leistungsdatum (Pflicht)"><input className="input" type="date" value={draft.serviceDate} onChange={e => set({ serviceDate: e.target.value })} /></Field>
              <Field label="Leistungszeitraum bis (optional)"><input className="input" type="date" min={draft.serviceDate} value={draft.serviceDateTo} onChange={e => set({ serviceDateTo: e.target.value })} /></Field>
              <Field label="Zahlungsziel (Tage)"><input className="input" type="number" min="0" max="120" value={draft.paymentDays} onChange={e => set({ paymentDays: e.target.value })} /></Field>
              <Field label="Leitweg-ID / Bestellnummer (für E-Rechnung)"><input className="input" value={draft.buyerReference} onChange={e => set({ buyerReference: e.target.value })} placeholder={customer?.number || "z. B. 04011000-1234512345-06"} /></Field>
            </div>
            <Field label="Einleitung (optional)"><textarea className="textarea" style={{ minHeight: 60 }} value={draft.intro} onChange={e => set({ intro: e.target.value })} placeholder="Für die ausgeführten Arbeiten erlauben wir uns, wie folgt zu berechnen:" /></Field>
            <ItemsEditor items={draft.items} onChange={items => set({ items })} zeroVat={zeroVat} />
            {zeroVat && <small className="muted">Kleinunternehmer nach § 19 UStG: Es wird keine Umsatzsteuer ausgewiesen.</small>}
            <Totals items={zeroVat ? draft.items.map(i => ({ ...i, vat: 0 })) : draft.items} labor={labor} />
            <label className="row" style={{ gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={!!draft.propertyNotice} onChange={e => set({ propertyNotice: e.target.checked })} style={{ accentColor: "var(--brass)", width: 18, height: 18 }} />
              <span>Leistung an einem Grundstück/Gebäude für einen Privatkunden – Hinweis auf die 2-jährige Aufbewahrungspflicht drucken (§ 14 Abs. 4 Nr. 9 UStG)</span>
            </label>
            <Field label="Schlussbemerkung (optional)"><textarea className="textarea" style={{ minHeight: 60 }} value={draft.note} onChange={e => set({ note: e.target.value })} placeholder="z. B. Vielen Dank für Ihren Auftrag." /></Field>
            {!isAdmin && canEdit && <small className="muted"><FiShield style={{ verticalAlign: -2 }} /> Stellen und Stornieren dürfen nur Inhaber und Admins.</small>}
          </fieldset>
        )}
      </div>
    </Modal>
  );
}

export default function Invoices() {
  const router = useRouter();
  const params = useSearchParams();
  const { canEdit, isAdmin } = useSession();
  const toast = useToast();
  const invoices = useCollection("invoices");
  const customers = useCollection("customers");
  const orders = useCollection("orders");
  const [profile, setProfile] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const byId = useMemo(() => Object.fromEntries((customers.items || []).map(c => [c._id, c])), [customers.items]);

  useEffect(() => { api("settings").then(s => setProfile(s.profile)).catch(() => {}); }, []);
  useEffect(() => {
    if (params.get("new") && canEdit) { setEditing({ ...blank, customerId: params.get("customer") || "" }); router.replace("/invoices"); }
    const open = params.get("open");
    if (open && invoices.items) { const i = invoices.items.find(x => x._id === open); if (i) setEditing(i); router.replace("/invoices"); }
  }, [params, invoices.items, router, canEdit]);

  const all = invoices.items || [];
  const list = useMemo(() => all
    .filter(i => !filter || i.status === filter || (filter === "offen" && i.status === "teilbezahlt") || (filter === "storniert" && i.status === "storno"))
    .filter(i => !q || `${i.number} ${i.subject} ${(i.issued ? i.snapshot.buyer.name : byId[i.customerId]?.name) || ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.issueDate || "9999").localeCompare(a.issueDate || "9999") || b.createdAt.localeCompare(a.createdAt)), [all, filter, q, byId]);

  const year = String(new Date().getFullYear());
  const openList = all.filter(i => ["offen", "teilbezahlt", "ueberfaellig"].includes(i.status));
  const overdue = all.filter(i => i.status === "ueberfaellig");
  const paidYear = all.flatMap(i => i.payments || []).filter(p => p.date.startsWith(year)).reduce((s, p) => s + p.amount, 0);
  const openInvoice = id => { const i = all.find(x => x._id === id); if (i) setEditing(i); };
  const sel = useSelection();
  // Mark several issued invoices as fully paid: one payment over the open amount each (admins only, like single payments).
  const bulkPaid = async () => {
    const targets = all.filter(i => sel.has(i._id) && ["offen", "teilbezahlt", "ueberfaellig"].includes(i.status));
    if (!targets.length) return toast("Unter den ausgewählten ist keine offene Rechnung.", "error");
    if (!window.confirm(`Für ${targets.length} ${targets.length === 1 ? "Rechnung" : "Rechnungen"} den offenen Betrag als heute bezahlt erfassen?`)) return;
    const today = new Date().toISOString().slice(0, 10);
    const { done, error } = await forEach(targets.map(i => i._id), async id => {
      const inv = all.find(i => i._id === id);
      invoices.replace(await api(`invoices/${id}/payments`, { method: "POST", body: { amount: inv.open, date: today, note: "Sammelbuchung" } }));
    });
    if (error) toast(error.message, "error"); else toast(`${done} ${done === 1 ? "Rechnung" : "Rechnungen"} als bezahlt erfasst`);
    sel.stop();
  };

  return (
    <>
      <PageHead eyebrow="Rechnung · Zahlung · E-Rechnung" title="Rechnungen" text="Nach § 14 UStG mit lückenloser Nummer. Gestellte Rechnungen sind unveränderbar (GoBD) – Korrekturen per Storno.">
        <a className="btn btn--ghost" href="/api/export/invoices"><FiDownload /> CSV</a>
        {canEdit && <button className="btn" onClick={() => setEditing({ ...blank })}><FiPlus /> Neue Rechnung</button>}
      </PageHead>

      <motion.div className="stats" initial="hidden" animate="show">
        <motion.div className="card stat" variants={rise} custom={0}><small><span className="dot" style={{ background: "var(--fjord)" }} /> Offen</small><strong><Counter value={openList.reduce((s, i) => s + i.open, 0)} format={fmtMoney} /></strong><span>{count(openList.length)}</span></motion.div>
        <motion.div className="card stat" variants={rise} custom={1}><small><span className="dot" style={{ background: "var(--err)" }} /> Überfällig</small><strong style={{ color: overdue.length ? "var(--err)" : undefined }}><Counter value={overdue.reduce((s, i) => s + i.open, 0)} format={fmtMoney} /></strong><span>{count(overdue.length)}</span></motion.div>
        <motion.div className="card stat" variants={rise} custom={2}><small><span className="dot" style={{ background: "var(--ok)" }} /> Zahlungseingang {year}</small><strong><Counter value={paidYear} format={fmtMoney} /></strong><span>laut erfassten Zahlungen</span></motion.div>
        <motion.div className="card stat" variants={rise} custom={3}><small><span className="dot" style={{ background: "var(--slate)" }} /> Entwürfe</small><strong><Counter value={all.filter(i => !i.issued).length} /></strong><span>noch nicht gestellt</span></motion.div>
      </motion.div>

      <div className="toolbar">
        <input className="input" type="search" placeholder="Nummer, Kunde, Betreff …" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechnungen suchen" />
        <div className="seg" role="group" aria-label="Status">{FILTERS.map(([v, l]) => <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}</div>
        <span className="spacer" />
        <SelectBar sel={sel} ids={list.map(i => i._id)}>
          <button className="btn btn--sm" disabled={!sel.count} onClick={() => openPrint("/print/invoices?ids=" + sel.ids.join(","))}><FiDownload /> PDF</button>
          {isAdmin && <button className="btn btn--ghost btn--sm" disabled={!sel.count} onClick={bulkPaid}>Als bezahlt</button>}
          <a className={`btn btn--ghost btn--sm${sel.count ? "" : " is-disabled"}`} href={`/api/export/invoices?ids=${sel.ids.join(",")}`} aria-disabled={!sel.count}><FiDownload /> CSV</a>
        </SelectBar>
      </div>

      {!invoices.items || !customers.items ? <Skeleton rows={5} height={52} /> : !list.length ? (
        <Empty icon={FiFileText}>{all.length ? "Keine Rechnungen für diesen Filter." : "Noch keine Rechnungen. Am schnellsten: im Auftrag auf „Rechnung erstellen“."}</Empty>
      ) : (
        <div className={`table-wrap${sel.active ? " selecting" : ""}`}>
          <table>
            <thead><tr>{sel.active && <th className="pickcell" />}<th>Nr.</th><th>Datum</th><th>Kunde</th><th>Betreff</th><th>Fällig</th><th className="num">Brutto</th><th className="num">Offen</th><th>Status</th></tr></thead>
            <tbody>
              <AnimatePresence initial={false}>
                {list.map(i => (
                  <motion.tr key={i._id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-picked={sel.has(i._id)} onClick={() => (sel.active ? sel.toggle(i._id) : setEditing(i))} style={{ cursor: "pointer" }}>
                    {sel.active && <td className="pickcell"><Pick on={sel.has(i._id)} /></td>}
                    <td className="mono">{i.number || <span className="muted">Entwurf</span>}</td>
                    <td>{day(i.issueDate) || <span className="muted">–</span>}</td>
                    <td>{(i.issued ? i.snapshot.buyer.name : byId[i.customerId]?.name) || "–"}</td>
                    <td>{i.subject}</td>
                    <td className={i.status === "ueberfaellig" ? "overdue" : ""}>{i.issued && i.type !== "storno" ? day(i.dueDate) : "–"}</td>
                    <td className="num">{fmtMoney(i.totals.gross)}</td>
                    <td className="num">{i.issued && i.type !== "storno" && !i.cancelled ? fmtMoney(i.open) : "–"}</td>
                    <td><StatusBadge status={i.status} /></td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {editing && <InvoiceEditor key={editing._id || "new"} invoice={{ ...blank, ...editing }} customers={customers.items || []} orders={orders.items || []} profile={profile}
        onClose={() => setEditing(null)} onSaved={(doc, isNew) => (isNew ? invoices.add(doc) : invoices.replace(doc))} onDeleted={invoices.drop}
        onOpen={id => { setEditing(null); setTimeout(() => openInvoice(id), 50); }} />}
    </>
  );
}
