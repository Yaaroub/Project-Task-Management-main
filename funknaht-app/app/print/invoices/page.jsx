import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { parseIds } from "@/lib/print";
import PrintBar from "@/components/PrintBar";
import InvoiceDoc, { loadInvoice } from "@/components/InvoiceDoc";

export const dynamic = "force-dynamic";

// /print/invoices?ids=a,b – several invoices in one document (one A4 page each).
function load(session, ids) {
  return parseIds(ids, 60).map(id => { try { return loadInvoice(session, id); } catch { return null; } }).filter(Boolean);
}

export async function generateMetadata({ searchParams }) {
  const session = await requirePageSession();
  const list = load(session, (await searchParams).ids);
  return { title: { absolute: `Rechnungen (${list.length}) – ${session.org.name}` }, robots: { index: false } };
}

export default async function PrintInvoices({ searchParams }) {
  const session = await requirePageSession();
  const { ids, auto } = await searchParams;
  const list = load(session, ids);
  if (!list.length) notFound();
  return (
    <div className="doc-screen doc-batch">
      <PrintBar title={`${list.length} ${list.length === 1 ? "Rechnung" : "Rechnungen"}`} auto={auto === "1"} />
      {list.map(d => <InvoiceDoc key={d.inv._id} d={d} />)}
    </div>
  );
}
