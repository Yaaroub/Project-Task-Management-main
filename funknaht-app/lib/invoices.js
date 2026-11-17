import "server-only";
import { createHash } from "node:crypto";
import { HttpError, tenantTransaction, logActivity } from "./db";
import { resource, nextNumber, orderTotals } from "./resources";
import { laborShare } from "./invoices-shared";
import { getProfile } from "./profile";

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (day, n) => { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const round2 = n => Math.round(n * 100) / 100;
const INVOICE_NUMBER = { key: "invoiceSeq", yearly: true, make: (n, y) => `R-${y}-${String(n).padStart(4, "0")}` };
const fmt = n => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

// SHA-256 over the frozen content: any later change to an issued invoice becomes detectable.
// Fields are normalised first, so stored raw data and computed views hash identically.
export function invoiceHash(inv) {
  const s = v => (v == null ? "" : String(v));
  const content = {
    number: s(inv.number), issueDate: s(inv.issueDate), dueDate: s(inv.dueDate), serviceDate: s(inv.serviceDate), serviceDateTo: s(inv.serviceDateTo),
    subject: s(inv.subject), intro: s(inv.intro), note: s(inv.note), type: inv.type || "rechnung", refNumber: s(inv.refNumber), snapshot: inv.snapshot,
  };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

function buyerOf(customer) {
  const { number, name, contact, type, street, zip, city, email } = customer;
  return { number, name, contact, type, street, zip, city, email };
}

// Creates a draft invoice from an order (positions, customer, place and date of service).
export function invoiceFromOrder(session, orderId) {
  const org = session.org.id;
  const orders = resource("orders", org), invoices = resource("invoices", org), customers = resource("customers", org);
  const order = orders.normalize(orders.store.get(orderId));
  const customer = customers.normalize(customers.store.get(order.customerId));
  const doc = invoices.store.create({
    type: "rechnung", issued: false, customerId: order.customerId, orderId: order._id,
    subject: `${order.title} (${order.number})`, serviceDate: order.dueDate || today(), serviceDateTo: "", paymentDays: 14,
    intro: "", note: "", buyerReference: order.number, propertyNotice: customer.type === "privat", payments: [],
    items: order.items.map(({ booked, productId, ...i }) => ({ ...i, id: crypto.randomUUID() })),
    createdBy: session.user.id,
  });
  logActivity(session, "invoices", `Rechnungsentwurf aus Auftrag ${order.number} erstellt`, doc._id);
  return invoices.normalize(doc);
}

// Issues a draft: checks the legal minimum (§ 14 Abs. 4 UStG), assigns the next gap-free number and freezes the content.
export function finalizeInvoice(session, id) {
  const org = session.org.id;
  const invoices = resource("invoices", org), customers = resource("customers", org), orders = resource("orders", org);
  const profile = getProfile(session.org);
  const doc = tenantTransaction(org, () => {
    const inv = invoices.normalize(invoices.store.get(id));
    if (inv.issued) throw new HttpError(409, "Die Rechnung wurde bereits gestellt.");
    if (profile.missingForInvoice.length)
      throw new HttpError(409, `Für eine Rechnung fehlen in den Firmendaten: ${profile.missingForInvoice.join(", ")}. Bitte unter Verwaltung → Firmendaten ergänzen.`);
    const customer = customers.normalize(customers.store.get(inv.customerId));
    const missing = [["name", "Name"], ["street", "Straße"], ["zip", "PLZ"], ["city", "Ort"]].filter(([k]) => !customer[k]).map(([, l]) => l);
    if (missing.length) throw new HttpError(409, `Beim Kunden ${customer.number} fehlt: ${missing.join(", ")}. Die vollständige Anschrift ist Pflicht.`);
    if (!inv.serviceDate) throw new HttpError(409, "Bitte das Leistungsdatum angeben (Pflichtangabe).");
    if (!inv.items.length) throw new HttpError(409, "Die Rechnung hat keine Positionen.");
    if (inv.totals.gross <= 0) throw new HttpError(409, "Der Rechnungsbetrag muss größer als 0 sein.");
    if (profile.smallBusiness && inv.items.some(i => i.vat > 0))
      throw new HttpError(409, "Als Kleinunternehmer (§ 19 UStG) darf keine Umsatzsteuer ausgewiesen werden. Bitte alle Positionen auf 0 % setzen.");

    const issueDate = today();
    const number = nextNumber(org, INVOICE_NUMBER.key, INVOICE_NUMBER);
    const { missingForInvoice, ...seller } = profile;
    const snapshot = {
      seller, buyer: buyerOf(customer), items: inv.items, totals: orderTotals(inv.items), labor: laborShare(inv.items),
      smallBusiness: profile.smallBusiness, propertyNotice: !!inv.propertyNotice, buyerReference: inv.buyerReference || customer.number,
    };
    const issued = { issued: true, number, issueDate, dueDate: addDays(issueDate, inv.paymentDays), snapshot, issuedAt: new Date().toISOString(), issuedBy: session.user.name };
    issued.hash = invoiceHash({ ...inv, ...issued });
    const saved = invoices.store.change(id, () => issued);
    // An order that was done is now billed.
    if (inv.orderId) {
      try { orders.store.change(inv.orderId, o => (o.status === "erledigt" ? { status: "abgerechnet", statusChangedAt: new Date().toISOString() } : {})); }
      catch (error) { if (error.status !== 404) throw error; }
    }
    return saved;
  });
  const out = invoices.normalize(doc);
  logActivity(session, "invoices", `Rechnung ${out.number} über ${fmt(out.totals.gross)} gestellt`, id);
  return out;
}

// Cancels an issued invoice with a cancellation invoice (Stornorechnung) that mirrors it with negative amounts.
export function cancelInvoice(session, id, reason = "") {
  const org = session.org.id;
  const invoices = resource("invoices", org);
  const profile = getProfile(session.org);
  if (typeof reason !== "string" || reason.length > 300) throw new HttpError(400, "Begründung: maximal 300 Zeichen.");
  const { storno, original } = tenantTransaction(org, () => {
    const inv = invoices.normalize(invoices.store.get(id));
    if (!inv.issued) throw new HttpError(409, "Entwürfe werden gelöscht, nicht storniert.");
    if (inv.type === "storno") throw new HttpError(409, "Eine Stornorechnung kann nicht storniert werden.");
    if (inv.cancelled) throw new HttpError(409, `Die Rechnung ist bereits storniert (${inv.cancelledNumber}).`);
    if (inv.paid > 0) throw new HttpError(409, "Es sind Zahlungen erfasst. Bitte zuerst die Zahlungen entfernen oder erstatten.");
    const issueDate = today();
    const number = nextNumber(org, INVOICE_NUMBER.key, INVOICE_NUMBER);
    const items = inv.snapshot.items.map(i => ({ ...i, id: crypto.randomUUID(), qty: -i.qty }));
    const { missingForInvoice, ...seller } = profile;
    const base = {
      type: "storno", refInvoiceId: inv._id, refNumber: inv.number, customerId: inv.customerId, orderId: inv.orderId,
      subject: `Stornorechnung zu Rechnung ${inv.number}`, serviceDate: inv.serviceDate, serviceDateTo: inv.serviceDateTo, paymentDays: 0,
      intro: `Hiermit stornieren wir die Rechnung ${inv.number} vom ${new Date(inv.issueDate).toLocaleDateString("de-DE")} vollständig.`,
      note: reason.trim(), buyerReference: inv.snapshot.buyerReference, propertyNotice: false, payments: [], items,
      issued: true, number, issueDate, dueDate: issueDate, issuedAt: new Date().toISOString(), issuedBy: session.user.name, cancelReason: reason.trim(),
      snapshot: { ...inv.snapshot, seller, items, totals: orderTotals(items), labor: laborShare(items), propertyNotice: false },
    };
    base.hash = invoiceHash(base);
    const storno = invoices.store.create(base);
    const original = invoices.store.change(id, () => ({ cancelled: true, cancelledBy: storno._id, cancelledNumber: number, cancelReason: reason.trim() }));
    return { storno, original };
  });
  logActivity(session, "invoices", `Rechnung ${original.number} storniert durch ${storno.number}`, id);
  return { storno: invoices.normalize(storno), original: invoices.normalize(original) };
}

// Payments may be recorded on issued invoices; the invoice content itself stays unchanged.
export function addPayment(session, id, { amount, date, note = "" }) {
  const org = session.org.id;
  const invoices = resource("invoices", org);
  const value = round2(Number(amount));
  if (!Number.isFinite(value) || value <= 0) throw new HttpError(400, "Betrag muss größer als 0 sein.");
  const day = String(date || today());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) throw new HttpError(400, "Zahlungsdatum ungültig.");
  if (typeof note !== "string" || note.length > 200) throw new HttpError(400, "Notiz: maximal 200 Zeichen.");
  const doc = tenantTransaction(org, () => {
    const inv = invoices.normalize(invoices.store.get(id));
    if (!inv.issued || inv.type === "storno" || inv.cancelled) throw new HttpError(409, "Zahlungen sind nur für gestellte, nicht stornierte Rechnungen möglich.");
    if (value > inv.open + 0.005) throw new HttpError(409, `Der Betrag übersteigt den offenen Betrag von ${fmt(inv.open)}.`);
    const payment = { id: crypto.randomUUID(), amount: value, date: day, note: note.trim(), by: session.user.name, at: new Date().toISOString() };
    return invoices.store.change(id, i => ({ payments: [...(i.payments || []), payment] }));
  });
  const out = invoices.normalize(doc);
  logActivity(session, "invoices", `Zahlung ${fmt(value)} zu Rechnung ${out.number} erfasst${out.status === "bezahlt" ? " – vollständig bezahlt" : ""}`, id);
  return out;
}

export function removePayment(session, id, paymentId) {
  const org = session.org.id;
  const invoices = resource("invoices", org);
  let removed;
  const doc = tenantTransaction(org, () => invoices.store.change(id, i => {
    removed = (i.payments || []).find(p => p.id === paymentId);
    if (!removed) throw new HttpError(404, "Zahlung nicht gefunden.");
    return { payments: i.payments.filter(p => p.id !== paymentId) };
  }));
  const out = invoices.normalize(doc);
  logActivity(session, "invoices", `Zahlung ${fmt(removed.amount)} bei Rechnung ${out.number} entfernt`, id);
  return out;
}
