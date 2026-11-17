import FirmLogo from "@/components/FirmLogo";
import { resource, orderTotals } from "@/lib/resources";
import { getProfile } from "@/lib/profile";
import { invoiceHash } from "@/lib/invoices";
import { laborShare } from "@/lib/invoices-shared";

// One invoice as an A4 page. Used for a single invoice (/print/invoice/[id]) and for several at once (/print/invoices).
const money = n => (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const qtyFmt = n => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
const day = d => (d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

// Throws if the invoice does not exist in the firm of the session.
export function loadInvoice(session, id) {
  const invoices = resource("invoices", session.org.id), customers = resource("customers", session.org.id);
  const raw = invoices.store.get(id);
  const inv = invoices.normalize(raw);
  if (inv.issued) {
    const s = inv.snapshot;
    return { inv, raw, seller: s.seller, buyer: s.buyer, items: s.items, totals: s.totals, labor: s.buyer.type === "privat" ? s.labor : 0,
      smallBusiness: s.smallBusiness, propertyNotice: s.propertyNotice, buyerReference: s.buyerReference };
  }
  const seller = getProfile(session.org);
  const buyer = customers.normalize(customers.store.get(inv.customerId));
  const items = seller.smallBusiness ? inv.items.map(i => ({ ...i, vat: 0 })) : inv.items;
  return { inv, raw, seller, buyer, items, totals: orderTotals(items), labor: buyer.type === "privat" ? laborShare(items) : 0,
    smallBusiness: seller.smallBusiness, propertyNotice: inv.propertyNotice, buyerReference: inv.buyerReference };
}

export const invoiceTitle = d => `${d.inv.type === "storno" ? "Stornorechnung" : "Rechnung"} ${d.inv.number || "Entwurf"} – ${d.buyer.name}`;

export default function InvoiceDoc({ d }) {
  const { inv, raw, seller: p, buyer, items, totals, labor, smallBusiness, propertyNotice } = d;
  const storno = inv.type === "storno";
  const title = storno ? "Stornorechnung" : "Rechnung";
  const hashOk = inv.issued && invoiceHash(raw) === raw.hash;
  const sender = [p.name, p.street, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return (
  <article className={`doc ${inv.issued ? "" : "doc--draft"}`} aria-label={`${title} ${inv.number}`}>
    {!inv.issued && <div className="doc__watermark" aria-hidden="true">ENTWURF</div>}
    {p.logo && <FirmLogo logo={p.logo} logoWidth={p.logoWidth} logoStyle={p.logoStyle} />}
    <header className="doc__head">
      <div>
        <div className="doc__firm">{p.name}</div>
        {p.owner && <div>{p.owner}</div>}
      </div>
      <address>
        {p.street && <div>{p.street}</div>}
        {(p.zip || p.city) && <div>{p.zip} {p.city}</div>}
        {p.phone && <div>Tel. {p.phone}</div>}
        {p.email && <div>{p.email}</div>}
        {p.web && <div>{p.web}</div>}
      </address>
    </header>

    <section className="doc__address-row">
      <div className="doc__recipient">
        <div className="doc__sender">{sender}</div>
        <div>{buyer.name}</div>
        {buyer.type === "firma" && buyer.contact && <div>z. Hd. {buyer.contact}</div>}
        {buyer.street && <div>{buyer.street}</div>}
        {(buyer.zip || buyer.city) && <div>{buyer.zip} {buyer.city}</div>}
      </div>
      <dl className="doc__meta">
        <dt>Rechnungs-Nr.</dt><dd>{inv.number || "– Entwurf –"}</dd>
        <dt>Rechnungsdatum</dt><dd>{inv.issued ? day(inv.issueDate) : "–"}</dd>
        <dt>{inv.serviceDateTo ? "Leistungszeitraum" : "Leistungsdatum"}</dt>
        <dd>{day(inv.serviceDate)}{inv.serviceDateTo ? ` – ${day(inv.serviceDateTo)}` : ""}</dd>
        <dt>Kunden-Nr.</dt><dd>{buyer.number}</dd>
        {d.buyerReference && d.buyerReference !== buyer.number && (<><dt>Ihre Referenz</dt><dd>{d.buyerReference}</dd></>)}
        {p.taxId && (<><dt>Steuer-Nr./USt-IdNr.</dt><dd>{p.taxId}</dd></>)}
      </dl>
    </section>

    <h1 className="doc__title">{title}{inv.number ? ` ${inv.number}` : ""}</h1>
    <p className="doc__subject"><b>{inv.subject}</b>{storno && <> · zu Rechnung {inv.refNumber}</>}</p>
    <p>{buyer.type === "firma" ? (buyer.contact ? `Guten Tag ${buyer.contact},` : "Sehr geehrte Damen und Herren,") : `Guten Tag ${buyer.name},`}</p>
    <p className="doc__desc">{inv.intro || (storno ? "" : "für die ausgeführten Leistungen berechnen wir Ihnen:")}</p>

    <table className="doc__table">
      <thead><tr><th>Pos.</th><th>Beschreibung</th><th className="r">Menge</th><th>Einheit</th><th className="r">Einzelpreis</th><th className="r">USt.</th><th className="r">Gesamt</th></tr></thead>
      <tbody>
        {items.map((i, n) => (
          <tr key={i.id}>
            <td>{n + 1}</td><td>{i.title}</td><td className="r">{qtyFmt(i.qty)}</td><td>{i.unit}</td>
            <td className="r">{money(i.price)}</td><td className="r">{i.vat} %</td><td className="r">{money(i.qty * i.price)}</td>
          </tr>
        ))}
      </tbody>
    </table>

    <table className="doc__sum">
      <tbody>
        <tr><td>Summe netto</td><td className="r">{money(totals.net)}</td></tr>
        {totals.vat.map(v => <tr key={v.rate}><td>zzgl. {v.rate} % USt. auf {money(v.base)}</td><td className="r">{money(v.amount)}</td></tr>)}
        <tr className="doc__gross"><td>{storno ? "Gutschriftsbetrag" : "Rechnungsbetrag"}</td><td className="r">{money(totals.gross)}</td></tr>
      </tbody>
    </table>

    <div className="doc__closing">
      {smallBusiness && <p><b>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</b></p>}
      {labor > 0 && !storno && <p>Im Rechnungsbetrag enthaltene Arbeitskosten (§ 35a EStG): <b>{money(labor)}</b>{smallBusiness ? "" : " inkl. USt."}</p>}
      {storno
        ? <p>Diese Stornorechnung hebt die Rechnung {inv.refNumber} vollständig auf. {inv.note && <>Grund: {inv.note}</>}</p>
        : <p>Bitte überweisen Sie den Rechnungsbetrag bis zum <b>{inv.issued ? day(inv.dueDate) : `${inv.paymentDays} Tage nach Rechnungsdatum`}</b> ohne Abzug unter Angabe der Rechnungsnummer{p.iban ? " auf das unten genannte Konto" : ""}.</p>}
      {propertyNotice && !storno && <p>Sie sind gesetzlich verpflichtet, diese Rechnung zwei Jahre aufzubewahren (§ 14b Abs. 1 Satz 5 UStG).</p>}
      {!storno && inv.note && <p>{inv.note}</p>}
      <p>Mit freundlichen Grüßen<br />{p.owner || p.name}</p>
    </div>

    <footer className="doc__foot">
      <div><b>{p.name}</b>{p.street && <><br />{p.street}</>}{(p.zip || p.city) && <><br />{p.zip} {p.city}</>}</div>
      <div>{p.phone && <>Tel. {p.phone}<br /></>}{p.email && <>{p.email}<br /></>}{p.web}</div>
      <div>{p.bank && <>{p.bank}<br /></>}{p.iban && <>IBAN {p.iban}<br /></>}{p.bic && <>BIC {p.bic}</>}</div>
      <div>{p.taxId && <>Steuer-Nr./USt-IdNr.<br />{p.taxId}</>}</div>
    </footer>
    <div className="doc__made">
      {inv.issued ? `Prüfsumme ${raw.hash.slice(0, 16)}… ${hashOk ? "✓ unverändert" : "⚠ weicht ab"} · ` : ""}Erstellt mit Nahtbord
    </div>
  </article>
  );
}
