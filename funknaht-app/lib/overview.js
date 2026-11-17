import "server-only";
import { collection, getSetting } from "./db";
import { resource } from "./resources";

const dayKey = d => new Date(d).toISOString().slice(0, 10);

export function overview(org) {
  const tasks = resource("tasks", org), products = resource("products", org), projects = resource("projects", org), events = resource("events", org);
  const allTasks = tasks.store.list().map(tasks.normalize);
  const allProducts = products.store.list().map(products.normalize);
  const allProjects = projects.store.list().map(projects.normalize);
  const allEvents = events.store.list().map(events.normalize);
  const ordersRes = resource("orders", org), customersRes = resource("customers", org);
  const allOrders = ordersRes.store.list().map(ordersRes.normalize);
  const customerName = Object.fromEntries(customersRes.store.list().map(c => [c._id, c.name]));
  const invRes = resource("invoices", org);
  const allInvoices = invRes.store.list().map(invRes.normalize);
  const sumOpen = list => ({ count: list.length, value: Math.round(list.reduce((s, i) => s + i.open, 0) * 100) / 100 });
  const group = ids => { const list = allOrders.filter(o => ids.includes(o.status)); return { count: list.length, value: Math.round(list.reduce((s, o) => s + o.totals.gross, 0) * 100) / 100 }; };
  const today = dayKey(Date.now());
  const open = allTasks.filter(t => t.status !== "done");

  // Completed tasks per day for the last 14 days (sparkline on the dashboard).
  const done = allTasks.filter(t => t.status === "done");
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = dayKey(Date.now() - (13 - i) * 86400000);
    return { day, count: done.filter(t => dayKey(t.completedAt || t.updatedAt) === day).length };
  });

  return {
    announcement: getSetting(org, "announcement", ""),
    counts: {
      tasks: allTasks.length,
      open: open.length,
      done: done.length,
      overdue: open.filter(t => t.meta.dueDate && t.meta.dueDate < today).length,
      doing: allTasks.filter(t => t.status === "doing").length,
      products: allProducts.length,
      customers: Object.keys(customerName).length,
      lowStock: allProducts.filter(p => p.stock <= p.minStock).length,
      stockValue: Math.round(allProducts.reduce((s, p) => s + p.stock * (p.total || 0), 0) * 100) / 100,
      projects: allProjects.filter(p => !p.archived).length,
      events: allEvents.filter(e => dayKey(e.endDate) >= today).length,
      minutes: Math.round(allTasks.reduce((s, t) => s + (t.timeSpent || 0), 0)),
    },
    trend,
    invoices: {
      open: sumOpen(allInvoices.filter(i => ["offen", "teilbezahlt", "ueberfaellig"].includes(i.status))),
      overdue: sumOpen(allInvoices.filter(i => i.status === "ueberfaellig")),
      drafts: allInvoices.filter(i => !i.issued).length,
    },
    orders: {
      offers: group(["angebot"]), active: group(["beauftragt", "in_arbeit"]), toBill: group(["erledigt"]), requests: group(["anfrage"]),
      upcoming: allOrders.filter(o => o.dueDate && ["beauftragt", "in_arbeit"].includes(o.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5)
        .map(o => ({ _id: o._id, number: o.number, title: o.title, dueDate: o.dueDate, status: o.status, customer: customerName[o.customerId] || "", gross: o.totals.gross })),
    },
    upcoming: open.filter(t => t.meta.dueDate).sort((a, b) => a.meta.dueDate.localeCompare(b.meta.dueDate)).slice(0, 6)
      .map(t => ({ _id: t._id, headline: t.headline, dueDate: t.meta.dueDate, priority: t.meta.priority })),
    agenda: allEvents.filter(e => dayKey(e.endDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 5),
    lowStock: allProducts.filter(p => p.stock <= p.minStock).slice(0, 5).map(p => ({ _id: p._id, title: p.title, stock: p.stock, minStock: p.minStock })),
    projects: allProjects.filter(p => !p.archived).map(p => {
      const own = allTasks.filter(t => t.projectId === p._id);
      return { _id: p._id, name: p.name, color: p.color, total: own.length, done: own.filter(t => t.status === "done").length };
    }).slice(0, 6),
    activity: collection("activity", org).list().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100),
  };
}
