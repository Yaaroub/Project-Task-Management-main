import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { resource } from "@/lib/resources";
import { getProfile } from "@/lib/profile";
import { statusMeta } from "@/lib/orders-shared";
import { INVOICE_STATUS } from "@/lib/invoices-shared";
import { day, money } from "@/lib/print";
import PrintBar from "@/components/PrintBar";

export const dynamic = "force-dynamic";

// Customer sheet: address, contact, internal notes, orders, invoices and linked notes on one page.
async function load(params) {
  const session = await requirePageSession();
  const { id } = await params;
  const org = session.org.id;
  const all = name => { const r = resource(name, org); return r.store.list().map(r.normalize); };
  const customers = resource("customers", org);
  let c;
  try { c = customers.normalize(customers.store.get(id)); } catch { return { session, c: null }; }
  return {
    session, c,
    orders: all("orders").filter(o => o.customerId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    invoices: all("invoices").filter(i => i.customerId === id).sort((a, b) => (b.issueDate || "9").localeCompare(a.issueDate || "9")),
    notes: all("notes").filter(n => n.customerId === id),
  };
}

export async function generateMetadata({ params }) {
  const { c } = await load(params);
  return { title: { absolute: c ? `Kundenblatt ${c.number} – ${c.name}` : "Kundenblatt" }, robots: { index: false } };
}

export default async function CustomerSheet({ params, searchParams }) {
  const { session, c, orders, invoices, notes } = await load(params);
  if (!c) notFound();
  const { auto } = await searchParams;
  const issued = invoices.filter(i => i.issued);
  const revenue = issued.reduce((s, i) => s + i.totals.gross, 0);
  const open = issued.reduce((s, i) => s + i.open, 0);
  return (
    <div className="doc-screen">
      <PrintBar title={`Kundenblatt ${c.number}`} auto={auto === "1"} />
      <article className="doc doc--note doc--sheet" aria-label="Kundenblatt">
        <header className="doc__notehead"><span>{getProfile(session.org).name}</span><span>Stand {day(new Date().toISOString())}</span></header>
        <h1 className="doc__title">{c.name}</h1>
        <div className="doc__cols">
          <dl className="doc__meta">
            <dt>Kunden-Nr.</dt><dd>{c.number}</dd>
            <dt>Art</dt><dd>{c.type === "firma" ? "Firma" : "Privat"}</dd>
            {c.contact && <><dt>Ansprechpartner</dt><dd>{c.contact}</dd></>}
            <dt>Kunde seit</dt><dd>{day(c.createdAt)}</dd>
          </dl>
          <div>
            {c.street && <div>{c.street}</div>}
            {(c.zip || c.city) && <div>{c.zip} {c.city}</div>}
            {c.phone && <div>Tel. {c.phone}</div>}
            {c.email && <div>{c.email}</div>}
          </div>
        </div>
        {c.notes && <><h2 className="doc__h2">Interne Notizen</h2><p className="doc__desc">{c.notes}</p></>}

        <h2 className="doc__h2">Aufträge ({orders.length})</h2>
        <table className="doc__table">
          <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Status</th><th>Termin</th><th className="r">Brutto</th></tr></thead>
          <tbody>
            {orders.map(o => <tr key={o._id}><td>{o.number}</td><td>{o.title}</td><td>{statusMeta(o.status).label}</td><td>{day(o.dueDate)}</td><td className="r">{money(o.totals.gross)}</td></tr>)}
            {!orders.length && <tr><td colSpan={5} style={{ color: "#667" }}>Keine Aufträge</td></tr>}
          </tbody>
        </table>

        <h2 className="doc__h2">Rechnungen ({invoices.length})</h2>
        <table className="doc__table">
          <thead><tr><th>Nr.</th><th>Datum</th><th>Betreff</th><th>Status</th><th className="r">Brutto</th><th className="r">Offen</th></tr></thead>
          <tbody>
            {invoices.map(i => (
              <tr key={i._id}><td>{i.number || "Entwurf"}</td><td>{day(i.issueDate)}</td><td>{i.subject}</td><td>{INVOICE_STATUS[i.status]?.label}</td>
                <td className="r">{money(i.totals.gross)}</td><td className="r">{i.issued && i.type !== "storno" && !i.cancelled ? money(i.open) : ""}</td></tr>
            ))}
            {!invoices.length && <tr><td colSpan={6} style={{ color: "#667" }}>Keine Rechnungen</td></tr>}
          </tbody>
        </table>
        <table className="doc__sum">
          <tbody>
            <tr><td>Umsatz aus gestellten Rechnungen (brutto)</td><td className="r">{money(revenue)}</td></tr>
            <tr className="doc__gross"><td>Davon offen</td><td className="r">{money(open)}</td></tr>
          </tbody>
        </table>
        {notes.length > 0 && <><h2 className="doc__h2">Notizen</h2><ul>{notes.map(n => <li key={n._id}>{n.headline} <span style={{ color: "#667" }}>· {day(n.updatedAt)}</span></li>)}</ul></>}
        <div className="doc__made">Erstellt mit Nahtbord</div>
      </article>
    </div>
  );
}
