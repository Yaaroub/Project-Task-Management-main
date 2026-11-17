import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import PrintBar from "@/components/PrintBar";
import InvoiceDoc, { loadInvoice, invoiceTitle } from "@/components/InvoiceDoc";

export const dynamic = "force-dynamic";

// The page title becomes the default file name when saving as PDF.
export async function generateMetadata({ params }) {
  const session = await requirePageSession();
  const { id } = await params;
  try { return { title: { absolute: invoiceTitle(loadInvoice(session, id)) }, robots: { index: false } }; }
  catch { return { title: "Rechnung", robots: { index: false } }; }
}

export default async function PrintInvoice({ params, searchParams }) {
  const session = await requirePageSession();
  const { id } = await params;
  const { auto } = await searchParams;
  let d;
  try { d = loadInvoice(session, id); } catch { notFound(); }
  return (
    <div className="doc-screen">
      <PrintBar title={`${d.inv.type === "storno" ? "Stornorechnung" : "Rechnung"} ${d.inv.number || "(Entwurf)"}`} auto={auto === "1"} />
      <InvoiceDoc d={d} />
    </div>
  );
}
