import "server-only";
import { resource } from "./resources";

const round2 = n => Math.round(n * 100) / 100;

// Yearly figures per month: invoiced revenue, money received, expenses, result and VAT (as orientation, not a tax return).
export function report(session, year) {
  const org = session.org.id;
  const admin = session.role === "owner" || session.role === "admin";
  const load = name => { const r = resource(name, org); return r.store.list().map(r.normalize); };
  const invoices = load("invoices").filter(i => i.issued);
  const expenses = load("expenses");
  const times = load("times").filter(t => admin || t.userId === session.user.id);

  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenueNet: 0, revenueGross: 0, vatOut: 0, received: 0, expensesNet: 0, expensesGross: 0, vatIn: 0, minutes: 0 }));
  const inYear = date => typeof date === "string" && date.slice(0, 4) === String(year);
  const slot = date => months[Number(date.slice(5, 7)) - 1];
  const customers = new Map();

  for (const inv of invoices) {
    // Storno invoices carry negative totals, so a cancelled invoice and its storno add up to zero.
    if (inYear(inv.issueDate)) {
      const m = slot(inv.issueDate);
      m.revenueNet += inv.totals.net; m.revenueGross += inv.totals.gross; m.vatOut += inv.totals.vatSum;
      const key = inv.customerId || inv.snapshot.buyer.name;
      const c = customers.get(key) || { name: inv.snapshot.buyer.name, net: 0, count: 0 };
      c.net += inv.totals.net; if (inv.type !== "storno" && !inv.cancelled) c.count += 1;
      customers.set(key, c);
    }
    for (const p of inv.payments || []) if (inYear(p.date)) slot(p.date).received += p.amount;
  }
  const categories = new Map();
  for (const x of expenses) {
    if (!inYear(x.date)) continue;
    const m = slot(x.date);
    m.expensesNet += x.net; m.expensesGross += x.gross; m.vatIn += x.vatAmount;
    const key = x.category || "Ohne Kategorie";
    categories.set(key, (categories.get(key) || 0) + x.net);
  }
  const people = new Map();
  for (const t of times) {
    if (!inYear(t.date)) continue;
    slot(t.date).minutes += t.minutes;
    const p = people.get(t.userId) || { name: t.userName, minutes: 0, urlaub: 0, krank: 0 };
    p.minutes += t.minutes; if (t.kind === "urlaub") p.urlaub += 1; if (t.kind === "krank") p.krank += 1;
    people.set(t.userId, p);
  }
  for (const m of months) { for (const k of Object.keys(m)) if (k !== "month") m[k] = round2(m[k]); m.result = round2(m.revenueNet - m.expensesNet); }
  const sum = key => round2(months.reduce((s, m) => s + m[key], 0));
  const open = invoices.filter(i => ["offen", "teilbezahlt", "ueberfaellig"].includes(i.status));
  const years = [...new Set([new Date().getFullYear(), ...invoices.map(i => Number(i.issueDate?.slice(0, 4))), ...expenses.map(x => Number(x.date.slice(0, 4))), ...times.map(t => Number(t.date.slice(0, 4)))].filter(Boolean))].sort((a, b) => b - a);

  return {
    year, years, months,
    totals: Object.fromEntries(["revenueNet", "revenueGross", "vatOut", "received", "expensesNet", "expensesGross", "vatIn", "minutes", "result"].map(k => [k, sum(k)])),
    receivables: { open: round2(open.reduce((s, i) => s + i.open, 0)), overdue: round2(open.filter(i => i.status === "ueberfaellig").reduce((s, i) => s + i.open, 0)), count: open.length },
    topCustomers: [...customers.values()].map(c => ({ ...c, net: round2(c.net) })).filter(c => c.net > 0).sort((a, b) => b.net - a.net).slice(0, 8),
    categories: [...categories].map(([name, net]) => ({ name, net: round2(net) })).sort((a, b) => b.net - a.net),
    people: [...people.values()].sort((a, b) => b.minutes - a.minutes),
  };
}
