import FirmLogo from "@/components/FirmLogo";
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { resource } from "@/lib/resources";
import { getProfile } from "@/lib/profile";
import PrintBar from "@/components/PrintBar";
import RichView from "@/components/RichView";

export const dynamic = "force-dynamic";
// The page title becomes the default file name when saving as PDF.
export async function generateMetadata({ params, searchParams }) {
  const session = await requirePageSession();
  const { id } = await params;
  const { doc } = await searchParams;
  try {
    const orders = resource("orders", session.org.id), customers = resource("customers", session.org.id);
    const order = orders.store.get(id);
    const customer = customers.store.get(order.customerId);
    return { title: { absolute: `${doc === "auftrag" ? "Auftragsbestätigung" : "Angebot"} ${order.number} – ${customer.name}` }, robots: { index: false } };
  } catch { return { title: "Dokument", robots: { index: false } }; }
}

const money = n => (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const qtyFmt = n => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
const day = d => (d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

// Offer (Angebot) or order confirmation (Auftragsbestätigung) as printable A4 page.
export default async function PrintOrder({ params, searchParams }) {
  const session = await requirePageSession();
  const { id } = await params;
  const { doc = "angebot" } = await searchParams;
  const kind = doc === "auftrag" ? "auftrag" : "angebot";
  const orders = resource("orders", session.org.id), customers = resource("customers", session.org.id);
  let order, customer;
  try { order = orders.normalize(orders.store.get(id)); customer = customers.normalize(customers.store.get(order.customerId)); }
  catch { notFound(); }
  const p = getProfile(session.org);
  const title = kind === "angebot" ? "Angebot" : "Auftragsbestätigung";
  const sender = [p.name, p.street, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");

  return (
    <div className="doc-screen">
      <PrintBar title={`${title} ${order.number}`} />
      <article className="doc" aria-label={`${title} ${order.number}`}>
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
            <div>{customer.name}</div>
            {customer.type === "firma" && customer.contact && <div>z. Hd. {customer.contact}</div>}
            {customer.street && <div>{customer.street}</div>}
            {(customer.zip || customer.city) && <div>{customer.zip} {customer.city}</div>}
          </div>
          <dl className="doc__meta">
            <dt>{kind === "angebot" ? "Angebots-Nr." : "Auftrags-Nr."}</dt><dd>{order.number}</dd>
            <dt>Datum</dt><dd>{day(new Date())}</dd>
            <dt>Kunden-Nr.</dt><dd>{customer.number}</dd>
            {kind === "angebot" && order.validUntil && (<><dt>Gültig bis</dt><dd>{day(order.validUntil)}</dd></>)}
            {order.dueDate && (<><dt>Ausführung</dt><dd>{day(order.dueDate)}</dd></>)}
          </dl>
        </section>

        <h1 className="doc__title">{title}</h1>
        <p className="doc__subject"><b>{order.title}</b>{order.address ? <> · Einsatzort: {order.address}</> : null}</p>
        <p>{customer.type === "firma" ? (customer.contact ? `Guten Tag ${customer.contact},` : "Sehr geehrte Damen und Herren,") : `Guten Tag ${customer.name},`}</p>
        <p>{kind === "angebot"
          ? "vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen die folgenden Leistungen an:"
          : "vielen Dank für Ihren Auftrag. Hiermit bestätigen wir die Ausführung der folgenden Leistungen:"}</p>
        {(order.workAreas || []).filter(group => group.fields.some(f => f.value)).map(group => <section key={group.area}><strong>{group.area}</strong>{group.fields.filter(f => f.value).map(f => <div key={f.label}>{f.label}: {f.value}</div>)}</section>)}
        {order.descriptionDoc ? <div className="doc__desc"><RichView doc={order.descriptionDoc} links /></div> : order.description && <p className="doc__desc">{order.description}</p>}

        <table className="doc__table">
          <thead><tr><th>Pos.</th><th>Beschreibung</th><th className="r">Menge</th><th>Einheit</th><th className="r">Einzelpreis</th><th className="r">MwSt.</th><th className="r">Gesamt</th></tr></thead>
          <tbody>
            {order.items.map((i, n) => (
              <tr key={i.id}>
                <td>{n + 1}</td><td>{i.title}</td><td className="r">{qtyFmt(i.qty)}</td><td>{i.unit}</td>
                <td className="r">{money(i.price)}</td><td className="r">{i.vat} %</td><td className="r">{money(i.qty * i.price)}</td>
              </tr>
            ))}
            {!order.items.length && <tr><td colSpan={7} style={{ textAlign: "center", color: "#667" }}>Keine Positionen</td></tr>}
          </tbody>
        </table>

        <table className="doc__sum">
          <tbody>
            <tr><td>Summe netto</td><td className="r">{money(order.totals.net)}</td></tr>
            {order.totals.vat.map(v => <tr key={v.rate}><td>zzgl. {v.rate} % MwSt. auf {money(v.base)}</td><td className="r">{money(v.amount)}</td></tr>)}
            <tr className="doc__gross"><td>Gesamtbetrag</td><td className="r">{money(order.totals.gross)}</td></tr>
          </tbody>
        </table>

        <div className="doc__closing">
          {kind === "angebot" && order.validUntil && <p>Dieses Angebot ist gültig bis zum {day(order.validUntil)}.</p>}
          {p.terms && <p>{p.terms}</p>}
          {p.footer && <p>{p.footer}</p>}
          <p>Mit freundlichen Grüßen<br />{p.owner || p.name}</p>
        </div>

        <footer className="doc__foot">
          <div><b>{p.name}</b>{p.street && <><br />{p.street}</>}{(p.zip || p.city) && <><br />{p.zip} {p.city}</>}</div>
          <div>{p.phone && <>Tel. {p.phone}<br /></>}{p.email && <>{p.email}<br /></>}{p.web}</div>
          <div>{p.bank && <>{p.bank}<br /></>}{p.iban && <>IBAN {p.iban}<br /></>}{p.bic && <>BIC {p.bic}</>}</div>
          <div>{p.taxId && <>Steuer-Nr./USt-IdNr.<br />{p.taxId}</>}</div>
        </footer>
        <div className="doc__made">Erstellt mit Nahtbord</div>
      </article>
    </div>
  );
}
