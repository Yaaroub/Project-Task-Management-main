import "server-only";
import { HttpError, tenantTransaction, logActivity } from "./db";
import { resource } from "./resources";

const movement = (type, quantity, notes, stock, user) => ({ type, quantity, notes, date: new Date().toISOString(), stockAfter: stock, user });

// Takes material from stock onto an order. Stock and order change together or not at all.
export function bookMaterial(session, orderId, { productId, qty }) {
  const org = session.org.id;
  const quantity = Number(qty);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, "Menge muss größer als 0 sein.");
  const orders = resource("orders", org), products = resource("products", org);
  const doc = tenantTransaction(org, () => {
    const order = orders.normalize(orders.store.get(orderId));
    if (order.status === "abgerechnet") throw new HttpError(409, "Der Auftrag ist bereits abgerechnet.");
    const product = products.store.change(String(productId || ""), p => {
      const stock = (p.stock || 0) - quantity;
      if (stock < 0) throw new HttpError(409, `Nicht genug „${p.title}“ auf Lager (verfügbar: ${p.stock || 0}).`);
      return { stock, movements: [...(p.movements || []), movement("OUT", quantity, `Auftrag ${order.number}`, stock, session.user.name)].slice(-500) };
    });
    const item = { id: crypto.randomUUID(), kind: "material", title: product.sku ? `${product.title} (${product.sku})` : product.title,
      qty: quantity, unit: "Stk.", price: product.total || 0, vat: 19, productId: product._id, booked: true };
    return orders.store.change(orderId, o => ({ items: [...(o.items || []), item] }));
  });
  const order = orders.normalize(doc);
  logActivity(session, "orders", `${quantity} × Material auf Auftrag ${order.number} gebucht`, orderId);
  return order;
}

// Removes a booked material position and returns the quantity to stock.
export function returnMaterial(session, orderId, itemId) {
  const org = session.org.id;
  const orders = resource("orders", org), products = resource("products", org);
  const doc = tenantTransaction(org, () => {
    const order = orders.store.get(orderId);
    const item = (order.items || []).find(i => i.id === itemId);
    if (!item) throw new HttpError(404, "Position nicht gefunden.");
    if (item.booked && item.productId) {
      try {
        products.store.change(item.productId, p => {
          const stock = (p.stock || 0) + item.qty;
          return { stock, movements: [...(p.movements || []), movement("IN", item.qty, `Rückbuchung ${order.number}`, stock, session.user.name)].slice(-500) };
        });
      } catch (error) { if (error.status !== 404) throw error; }
    }
    return orders.store.change(orderId, o => ({ items: o.items.filter(i => i.id !== itemId) }));
  });
  const order = orders.normalize(doc);
  logActivity(session, "orders", `Material von Auftrag ${order.number} zurück ins Lager`, orderId);
  return order;
}
