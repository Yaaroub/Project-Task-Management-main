import { handle, body } from "@/lib/http";
import { HttpError } from "@/lib/db";
import { cancelInvoice } from "@/lib/invoices";

export const dynamic = "force-dynamic";

// POST /api/invoices/<id>/cancel { reason } – creates a cancellation invoice. Owner/admin only.
export const POST = handle(async (request, { resource, id }, session) => {
  if (resource !== "invoices") throw new HttpError(404, "Nicht gefunden.");
  const { reason = "" } = await body(request);
  return cancelInvoice(session, id, reason);
}, "admin");
