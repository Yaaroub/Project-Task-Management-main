"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FiPlus, FiUsers, FiPhone, FiMail, FiMapPin, FiTrash2, FiDownload, FiBriefcase, FiHome, FiUser, FiArrowLeft, FiFileText, FiEdit3 } from "react-icons/fi";
import { api, useCollection, fmtMoney, fmtDate } from "@/lib/client";
import { statusMeta } from "@/lib/orders-shared";
import { INVOICE_STATUS } from "@/lib/invoices-shared";
import { Field, PageHead, Empty, Skeleton, useToast, confirmDelete, Counter, rise, openPrint } from "./ui";
import { useSession } from "./Shell";

export const blankCustomer = { name: "", type: "firma", contact: "", email: "", phone: "", street: "", zip: "", city: "", notes: "" };

// Form used here and for quick creation inside an order.
export function CustomerForm({ value, onChange, autoFocus = true }) {
  const set = key => e => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="stack">
      <div className="seg" role="group" aria-label="Kundenart" style={{ justifySelf: "start" }}>
        <button type="button" aria-pressed={value.type === "firma"} onClick={() => onChange({ ...value, type: "firma" })}><FiBriefcase /> Firma</button>
        <button type="button" aria-pressed={value.type === "privat"} onClick={() => onChange({ ...value, type: "privat" })}><FiHome /> Privat</button>
      </div>
      <div className="grid-2">
        <Field label={value.type === "firma" ? "Firmenname" : "Name"}><input className="input" autoFocus={autoFocus} value={value.name} onChange={set("name")} maxLength={160} /></Field>
        {value.type === "firma" && <Field label="Ansprechpartner"><input className="input" value={value.contact} onChange={set("contact")} /></Field>}
        <Field label="Telefon"><input className="input" type="tel" value={value.phone} onChange={set("phone")} /></Field>
        <Field label="E-Mail"><input className="input" type="email" value={value.email} onChange={set("email")} /></Field>
        <Field label="Straße und Hausnummer"><input className="input" value={value.street} onChange={set("street")} /></Field>
        <div className="row" style={{ flexWrap: "nowrap", alignItems: "end" }}>
          <div style={{ width: 110 }}><Field label="PLZ"><input className="input" inputMode="numeric" value={value.zip} onChange={set("zip")} maxLength={10} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Ort"><input className="input" value={value.city} onChange={set("city")} /></Field></div>
        </div>
      </div>
    </div>
  );
}

const VOLUME_STATUSES = ["beauftragt", "in_arbeit", "erledigt", "abgerechnet"];
const OPEN_ORDER = ["anfrage", "angebot", "beauftragt", "in_arbeit"];
const longDate = d => fmtDate(d, { day: "2-digit", month: "2-digit", year: "numeric" });

// Right-hand side: everything about one customer on one page.
function CustomerFile({ customer, orders, invoices, notes, onSaved, onDeleted, onBack }) {
  const toast = useToast();
  const { canEdit, has } = useSession();
  const [draft, setDraft] = useState(customer);
  const [busy, setBusy] = useState(false);
  const isNew = !customer._id;
  const changed = JSON.stringify(draft) !== JSON.stringify(customer);

  const save = async e => {
    e?.preventDefault();
    setBusy(true);
    try {
      const { _id, number, createdAt, updatedAt, createdBy, updatedBy, ...body } = draft;
      const doc = _id ? await api("customers/" + _id, { method: "PATCH", body }) : await api("customers", { method: "POST", body });
      onSaved(doc, !_id);
      toast(_id ? "Kunde gespeichert" : `Kunde ${doc.number} angelegt`);
    } catch (err) { toast(err.message, "error"); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirmDelete(`Kunde „${customer.name}“`)) return;
    try { await api("customers/" + customer._id, { method: "DELETE" }); onDeleted(customer._id); toast("Kunde gelöscht"); }
    catch (err) { toast(err.message, "error"); }
  };

  const issued = invoices.filter(i => i.issued);
  const revenue = issued.reduce((s, i) => s + i.totals.gross, 0);
  const open = issued.reduce((s, i) => s + i.open, 0);
  const address = [customer.street, [customer.zip, customer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <section className="card notebook__page akte" aria-label={isNew ? "Neuer Kunde" : `Kundenakte ${customer.name}`}>
      <div className="notebook__meta">
        <button className="btn btn--ghost btn--sm notebook__back" onClick={onBack}><FiArrowLeft /> Alle Kunden</button>
        {!isNew && <span className="mono muted">{customer.number}</span>}
        {!isNew && <span className="badge">{customer.type === "firma" ? "Firma" : "Privat"}</span>}
        <span className="spacer" />
        {!isNew && <>
          {customer.phone && <a className="icon-btn" href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`} title={customer.phone} aria-label="Anrufen"><FiPhone /></a>}
          {customer.email && <a className="icon-btn" href={`mailto:${customer.email}`} title={customer.email} aria-label="E-Mail schreiben"><FiMail /></a>}
          {address && <a className="icon-btn" target="_blank" rel="noopener noreferrer" title="Adresse auf der Karte" aria-label="Adresse auf der Karte"
            href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`}><FiMapPin /></a>}
          <button className="btn btn--ghost btn--sm" onClick={() => openPrint(`/print/customer/${customer._id}`)}><FiDownload /> Kundenblatt</button>
        </>}
      </div>
      <h2 className="akte__name">{isNew ? "Neuer Kunde" : customer.name}</h2>

      {!isNew && (
        <div className="akte__kpis">
          <div><small>Aufträge</small><b>{orders.length}</b><span>{orders.filter(o => OPEN_ORDER.includes(o.status)).length} offen</span></div>
          {has("invoices") && <div><small>Umsatz</small><b>{fmtMoney(revenue)}</b><span>aus {issued.length} {issued.length === 1 ? "Rechnung" : "Rechnungen"}</span></div>}
          {has("invoices") && <div><small>Offen</small><b style={{ color: open > 0 ? "var(--warn)" : undefined }}>{fmtMoney(open)}</b><span>{invoices.filter(i => i.status === "ueberfaellig").length} überfällig</span></div>}
        </div>
      )}

      {!isNew && canEdit && (
        <div className="row akte__actions">
          {has("orders") && <Link className="btn btn--sm" href={`/orders?new=1&customer=${customer._id}`}><FiPlus /> Auftrag</Link>}
          {has("invoices") && <Link className="btn btn--ghost btn--sm" href={`/invoices?new=1&customer=${customer._id}`}><FiPlus /> Rechnung</Link>}
          {has("notes") && <Link className="btn btn--ghost btn--sm" href={`/notes?new=1&customer=${customer._id}`}><FiPlus /> Notiz</Link>}
        </div>
      )}

      <form className="akte__section stack" onSubmit={save}>
        <h3><FiUser /> Stammdaten</h3>
        <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
          <CustomerForm value={draft} onChange={setDraft} autoFocus={isNew} />
          <Field label="Interne Notizen"><textarea className="textarea" style={{ minHeight: 80 }} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="z. B. Schlüssel beim Nachbarn, Hund im Garten, bevorzugte Zeiten …" /></Field>
        </fieldset>
        {canEdit && (
          <div className="row">
            {!isNew && <button type="button" className="btn btn--danger btn--sm" onClick={remove}><FiTrash2 /> Löschen</button>}
            <span className="spacer" />
            {changed && !isNew && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDraft(customer)}>Verwerfen</button>}
            <button className="btn btn--sm" disabled={busy || !draft.name?.trim() || (!changed && !isNew)}>{isNew ? "Kunde anlegen" : "Speichern"}</button>
          </div>
        )}
      </form>

      {!isNew && <>
        {has("orders") && (
          <div className="akte__section">
            <h3><FiBriefcase /> Aufträge ({orders.length})</h3>
            {orders.length ? (
              <ul className="list">{orders.map(o => (
                <li key={o._id}>
                  <span className="dot" style={{ background: statusMeta(o.status).color }} />
                  <Link href={`/orders?open=${o._id}`}><span className="mono muted">{o.number}</span> {o.title}</Link>
                  <span className="spacer" /><span className="badge">{statusMeta(o.status).label}</span>
                  <span className="mono" style={{ minWidth: 96, textAlign: "right" }}>{fmtMoney(o.totals.gross)}</span>
                </li>
              ))}</ul>
            ) : <p className="muted">Noch keine Aufträge.</p>}
          </div>
        )}
        {has("invoices") && (
          <div className="akte__section">
            <h3><FiFileText /> Rechnungen ({invoices.length})</h3>
            {invoices.length ? (
              <ul className="list">{invoices.map(i => (
                <li key={i._id}>
                  <span className="dot" style={{ background: INVOICE_STATUS[i.status]?.color }} />
                  <Link href={`/invoices?open=${i._id}`}><span className="mono muted">{i.number || "Entwurf"}</span> {i.subject}</Link>
                  <span className="spacer" /><span className="badge">{INVOICE_STATUS[i.status]?.label}</span>
                  <span className="mono" style={{ minWidth: 96, textAlign: "right" }}>{fmtMoney(i.totals.gross)}</span>
                </li>
              ))}</ul>
            ) : <p className="muted">Noch keine Rechnungen.</p>}
          </div>
        )}
        {has("notes") && (
          <div className="akte__section">
            <h3><FiEdit3 /> Notizen ({notes.length})</h3>
            {notes.length ? (
              <ul className="list">{notes.map(n => (
                <li key={n._id}><Link href={`/notes?open=${n._id}`}>{n.headline}</Link><span className="spacer" /><span className="muted mono" style={{ fontSize: 12 }}>{longDate(n.updatedAt)}</span></li>
              ))}</ul>
            ) : <p className="muted">Noch keine Notizen zu diesem Kunden.</p>}
          </div>
        )}
        <small className="muted akte__foot">Kunde seit {longDate(customer.createdAt)}</small>
      </>}
    </section>
  );
}

export default function Customers() {
  const router = useRouter();
  const params = useSearchParams();
  const { canEdit, has } = useSession();
  const customers = useCollection("customers");
  const orders = useCollection("orders");
  const invoices = useCollection(has("invoices") ? "invoices" : "customers");
  const notes = useCollection(has("notes") ? "notes" : "customers");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [sel, setSel] = useState(null); // { key, id } – id null while a new customer is entered
  const counter = useRef(0);

  const create = () => setSel({ key: "new-" + ++counter.current, id: null });
  useEffect(() => {
    if (params.get("new") && canEdit) { create(); router.replace("/customers"); }
    const open = params.get("open");
    if (open && customers.items) { if (customers.items.some(c => c._id === open)) setSel({ key: open, id: open }); router.replace("/customers"); }
  }, [params, customers.items, router, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const out = {};
    for (const o of orders.items || []) {
      const s = (out[o.customerId] ??= { count: 0, volume: 0, open: 0 });
      s.count++;
      if (VOLUME_STATUSES.includes(o.status)) s.volume += o.totals.gross;
      if (OPEN_ORDER.includes(o.status)) s.open++;
    }
    return out;
  }, [orders.items]);

  const list = useMemo(() => (customers.items || [])
    .filter(c => (!type || c.type === type) && (!q || `${c.number} ${c.name} ${c.contact} ${c.city} ${c.email} ${c.phone}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name, "de")), [customers.items, q, type]);

  // Wide screens always show a file: the first customer opens by itself.
  useEffect(() => {
    if (!sel && list.length && window.matchMedia("(min-width: 861px)").matches) setSel({ key: list[0]._id, id: list[0]._id });
  }, [sel, list]);

  const current = sel && (sel.id ? (customers.items || []).find(c => c._id === sel.id) : { ...blankCustomer });
  const total = Object.values(stats).reduce((s, x) => s + x.volume, 0);
  const ownOrders = current?._id ? (orders.items || []).filter(o => o.customerId === current._id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const ownInvoices = current?._id && has("invoices") ? (invoices.items || []).filter(i => i.customerId === current._id).sort((a, b) => (b.issueDate || "9").localeCompare(a.issueDate || "9")) : [];
  const ownNotes = current?._id && has("notes") ? (notes.items || []).filter(n => n.customerId === current._id) : [];

  return (
    <>
      <PageHead eyebrow="Kundenkartei" title="Kunden" text="Jede Kundin, jeder Kunde mit eigener Akte: Stammdaten, Aufträge, Rechnungen und Notizen auf einen Blick.">
        <a className="btn btn--ghost" href="/api/export/customers"><FiDownload /> CSV</a>
        {canEdit && <button className="btn" onClick={create}><FiPlus /> Neuer Kunde</button>}
      </PageHead>

      <motion.div className="stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }} initial="hidden" animate="show">
        <motion.div className="card stat" variants={rise} custom={0}><small><FiUsers /> Kunden</small><strong><Counter value={customers.items?.length || 0} /></strong></motion.div>
        <motion.div className="card stat" variants={rise} custom={1}><small><FiBriefcase /> mit offenen Aufträgen</small><strong><Counter value={Object.values(stats).filter(s => s.open).length} /></strong></motion.div>
        <motion.div className="card stat" variants={rise} custom={2}><small>Auftragsvolumen (brutto)</small><strong><Counter value={total} format={fmtMoney} /></strong></motion.div>
      </motion.div>

      <div className="toolbar">
        <input className="input" type="search" placeholder="Name, Ort, Nummer, Telefon …" value={q} onChange={e => setQ(e.target.value)} aria-label="Kunden suchen" />
        <div className="seg" role="group" aria-label="Kundenart">
          {[["", "Alle"], ["firma", "Firmen"], ["privat", "Privat"]].map(([v, l]) => <button key={v} aria-pressed={type === v} onClick={() => setType(v)}>{l}</button>)}
        </div>
      </div>

      <div className="notebook" data-open={current ? "true" : "false"}>
        <aside className="card notebook__list" aria-label="Alle Kunden">
          {!customers.items ? <Skeleton rows={5} height={58} /> : (
            <ul>
              {sel && !sel.id && <li><button className="notebook__item" aria-current="true"><b><span>Neuer Kunde</span></b><span>Noch nicht gespeichert</span></button></li>}
              {list.map(c => (
                <li key={c._id}>
                  <button className="notebook__item" aria-current={sel?.id === c._id ? "true" : undefined} onClick={() => setSel({ key: c._id, id: c._id })}>
                    <b><span>{c.name}</span>{stats[c._id]?.open ? <span className="badge badge--brass">{stats[c._id].open} offen</span> : null}</b>
                    <span>{[c.number, [c.zip, c.city].filter(Boolean).join(" "), c.type === "privat" ? "privat" : c.contact].filter(Boolean).join(" · ")}</span>
                    <time>{fmtMoney(stats[c._id]?.volume || 0)}</time>
                  </button>
                </li>
              ))}
              {!list.length && !(sel && !sel.id) && <li className="muted" style={{ padding: 14 }}>{customers.items.length ? "Keine Treffer." : "Noch keine Kunden."}</li>}
            </ul>
          )}
        </aside>
        {current ? (
          <CustomerFile key={sel.key + (current.updatedAt || "")} customer={current} orders={ownOrders} invoices={ownInvoices} notes={ownNotes}
            onBack={() => setSel(null)}
            onSaved={(doc, isNew) => { if (isNew) { customers.add(doc); setSel({ key: sel.key, id: doc._id }); } else customers.replace(doc); }}
            onDeleted={id => { customers.drop(id); setSel(null); }} />
        ) : (
          <section className="notebook__page notebook__page--empty">
            <Empty icon={FiUsers}>{customers.items?.length ? "Wählen Sie links einen Kunden." : "Noch keine Kunden. Legen Sie den ersten an – oder direkt beim ersten Auftrag."}</Empty>
          </section>
        )}
      </div>
    </>
  );
}
