import { handle, body } from "@/lib/http";
import { HttpError } from "@/lib/db";
import { bookMaterial } from "@/lib/material";

export const dynamic = "force-dynamic";

// POST /api/orders/<id>/material  { productId, qty }
export const POST = handle(async (request, { resource, id }, session) => {
  if (resource !== "orders") throw new HttpError(404, "Nicht gefunden.");
  return bookMaterial(session, id, await body(request));
});
