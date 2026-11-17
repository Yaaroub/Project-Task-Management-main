import { handle } from "@/lib/http";
import { HttpError } from "@/lib/db";
import { resource } from "@/lib/resources";
import { buildXRechnung } from "@/lib/xrechnung";

export const dynamic = "force-dynamic";

// GET /api/invoices/<id>/xrechnung – E-Rechnung (XRechnung 3.0, CII) as XML download.
export const GET = handle((request, { resource: name, id }, session) => {
  if (name !== "invoices") throw new HttpError(404, "Nicht gefunden.");
  const invoices = resource("invoices", session.org.id);
  const inv = invoices.store.get(id);
  let buyerEmail = "";
  try { buyerEmail = resource("customers", session.org.id).store.get(inv.customerId).email || ""; } catch {}
  const xml = buildXRechnung(inv, { buyerEmail });
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${inv.number}-xrechnung.xml"`,
      "Cache-Control": "no-store",
    },
  });
});
