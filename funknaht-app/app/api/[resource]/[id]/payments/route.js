import { handle, body } from "@/lib/http";
import { HttpError } from "@/lib/db";
import { addPayment } from "@/lib/invoices";

export const dynamic = "force-dynamic";

// POST /api/invoices/<id>/payments { amount, date, note }
export const POST = handle(async (request, { resource, id }, session) => {
  if (resource !== "invoices") throw new HttpError(404, "Nicht gefunden.");
  return addPayment(session, id, await body(request));
});
