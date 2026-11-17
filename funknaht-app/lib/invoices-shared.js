// Shared by server and browser: invoice status, payments and the labour share (§ 35a EStG).
import { orderTotals } from "./orders-shared";

export const INVOICE_STATUS = {
  entwurf: { label: "Entwurf", color: "var(--slate)" },
  offen: { label: "Offen", color: "var(--fjord)" },
  teilbezahlt: { label: "Teilbezahlt", color: "var(--brass)" },
  ueberfaellig: { label: "Überfällig", color: "var(--err)" },
  bezahlt: { label: "Bezahlt", color: "var(--ok)" },
  storniert: { label: "Storniert", color: "var(--ink-3)" },
  storno: { label: "Stornorechnung", color: "var(--rust)" },
};
const round2 = n => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

// Gross labour costs (services, not material) – private customers can claim these under § 35a EStG.
export function laborShare(items = []) {
  return round2(items.filter(i => i.kind === "leistung").reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0) * (1 + (Number(i.vat) || 0) / 100), 0));
}

// Adds totals, paid, open amount and status. Issued invoices always use their frozen snapshot.
export function computeInvoice(inv, now = today()) {
  const items = inv.issued ? inv.snapshot.items : inv.items || [];
  const totals = inv.issued ? inv.snapshot.totals : orderTotals(items);
  const payments = inv.payments || [];
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  const open = inv.cancelled || inv.type === "storno" ? 0 : round2(totals.gross - paid);
  let status = "entwurf";
  if (inv.issued) {
    if (inv.type === "storno") status = "storno";
    else if (inv.cancelled) status = "storniert";
    else if (open <= 0.004) status = "bezahlt";
    else if (inv.dueDate && inv.dueDate < now) status = "ueberfaellig";
    else if (paid > 0) status = "teilbezahlt";
    else status = "offen";
  }
  return { ...inv, items, totals, paid, open, status, labor: laborShare(items) };
}
