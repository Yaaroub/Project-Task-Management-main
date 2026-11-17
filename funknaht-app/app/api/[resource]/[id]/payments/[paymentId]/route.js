import { handle } from "@/lib/http";
import { HttpError } from "@/lib/db";
import { removePayment } from "@/lib/invoices";

export const dynamic = "force-dynamic";

// DELETE /api/invoices/<id>/payments/<paymentId> – owner/admin only.
export const DELETE = handle((request, { resource, id, paymentId }, session) => {
  if (resource !== "invoices") throw new HttpError(404, "Nicht gefunden.");
  return removePayment(session, id, paymentId);
}, "admin");
