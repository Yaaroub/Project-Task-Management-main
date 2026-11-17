import { handle } from "@/lib/http";
import { resource } from "@/lib/resources";

export const dynamic = "force-dynamic";
const AREAS = [
  ["invoices", "/invoices", d => `${d.number || "Entwurf"} · ${d.subject}`], ["orders", "/orders", d => `${d.number} · ${d.title}`], ["customers", "/customers", d => `${d.number} · ${d.name}`],
  ["tasks", "/tasks", d => d.headline], ["projects", "/projects", d => d.name],
  ["notes", "/notes", d => d.headline], ["products", "/inventory", d => d.title], ["events", "/calendar", d => d.title],
];

// Global search for the command palette (Strg+K), limited to the own firm.
export const GET = handle((request, params, session) => {
  const q = (new URL(request.url).searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) return [];
  return AREAS.flatMap(([name, href, title]) => {
    const r = resource(name, session.org.id);
    return r.store.list().map(r.normalize)
      .filter(d => JSON.stringify(d).toLowerCase().includes(q))
      .slice(0, 5)
      .map(d => ({ area: name, label: r.label, title: title(d), href: `${href}?open=${d._id}` }));
  }).slice(0, 20);
});
