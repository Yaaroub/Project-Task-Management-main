import { handle } from "@/lib/http";
import { HttpError } from "@/lib/db";
import { returnMaterial } from "@/lib/material";

export const dynamic = "force-dynamic";

// DELETE /api/orders/<id>/material/<itemId>  → position removed, quantity back to stock
export const DELETE = handle((request, { resource, id, itemId }, session) => {
  if (resource !== "orders") throw new HttpError(404, "Nicht gefunden.");
  return returnMaterial(session, id, itemId);
});
