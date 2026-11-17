import { handle, body } from "@/lib/http";
import { resource } from "@/lib/resources";
import { HttpError, logActivity } from "@/lib/db";

export const dynamic = "force-dynamic";
const LABEL = { IN: "Zugang", OUT: "Abgang", ADJUSTMENT: "Korrektur" };

// Book a stock movement. Runs in one transaction, so the stock can never go negative.
export const POST = handle(async (request, { id }, session) => {
  const data = await body(request);
  const quantity = Number(data.quantity);
  const notes = typeof data.notes === "string" ? data.notes.trim().slice(0, 300) : "";
  if (!LABEL[data.type] || data.quantity === "" || data.quantity == null || !Number.isFinite(quantity) || quantity < 0
    || (quantity === 0 && data.type !== "ADJUSTMENT"))
    throw new HttpError(400, "Ungültige Lagerbewegung.");
  const products = resource("products", session.org.id);
  const doc = products.normalize(products.store.change(id, previous => {
    const current = previous.stock || 0;
    const stock = data.type === "IN" ? current + quantity : data.type === "OUT" ? current - quantity : quantity;
    if (stock < 0) throw new HttpError(409, "Der verfügbare Bestand reicht nicht aus.");
    const movement = { type: data.type, quantity, notes, date: new Date().toISOString(), stockAfter: stock, stockValue: stock * (previous.total || 0), user: session.user.name };
    return { stock, movements: [...(previous.movements || []), movement].slice(-500) };
  }));
  logActivity(session, "products", `${LABEL[data.type]} ${quantity} × „${doc.title}“ (Bestand ${doc.stock})`, id);
  return doc;
});
