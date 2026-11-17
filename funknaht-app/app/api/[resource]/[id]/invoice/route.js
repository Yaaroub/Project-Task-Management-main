import { handle } from "@/lib/http";
import { HttpError } from "@/lib/db";
import { invoiceFromOrder } from "@/lib/invoices";

export const dynamic = "force-dynamic";

// POST /api/orders/<id>/invoice – draft invoice with the order's positions.
export const POST = handle((request, { resource, id }, session) => {
  if (resource !== "orders") throw new HttpError(404, "Nicht gefunden.");
  return Response.json(invoiceFromOrder(session, id), { status: 201 });
});
