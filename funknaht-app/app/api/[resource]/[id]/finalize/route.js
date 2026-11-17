import { handle } from "@/lib/http";
import { HttpError } from "@/lib/db";
import { finalizeInvoice } from "@/lib/invoices";

export const dynamic = "force-dynamic";

// POST /api/invoices/<id>/finalize – issue the invoice (number, date, frozen content). Owner/admin only.
export const POST = handle((request, { resource, id }, session) => {
  if (resource !== "invoices") throw new HttpError(404, "Nicht gefunden.");
  return finalizeInvoice(session, id);
}, "admin");
