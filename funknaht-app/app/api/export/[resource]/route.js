import { handle } from "@/lib/http";
import { resource } from "@/lib/resources";

export const dynamic = "force-dynamic";

const ORDER_LABEL = { anfrage: "Anfrage", angebot: "Angebot", beauftragt: "Beauftragt", in_arbeit: "In Arbeit", erledigt: "Erledigt", abgerechnet: "Abgerechnet", abgelehnt: "Abgelehnt" };
const INVOICE_LABEL = { entwurf: "Entwurf", offen: "Offen", teilbezahlt: "Teilbezahlt", ueberfaellig: "Überfällig", bezahlt: "Bezahlt", storniert: "Storniert", storno: "Stornorechnung" };
const TIME_LABEL = { arbeit: "Arbeit", urlaub: "Urlaub", krank: "Krank", feiertag: "Feiertag" };
const COLUMNS = {
  invoices: [["Rechnungs-Nr.", i => i.number || "Entwurf"], ["Rechnungsdatum", i => i.issueDate || ""], ["Leistungsdatum", i => i.serviceDate], ["Kunde", (i, ctx) => (i.issued ? i.snapshot.buyer.name : ctx.customers[i.customerId] || "")],
    ["Betreff", i => i.subject], ["Netto", i => i.totals.net], ["MwSt.", i => i.totals.vatSum], ["Brutto", i => i.totals.gross], ["Bezahlt", i => i.paid], ["Offen", i => i.open],
    ["Fällig", i => i.dueDate || ""], ["Status", i => INVOICE_LABEL[i.status] || i.status], ["Bezug", i => i.refNumber || i.cancelledNumber || ""]],
  customers: [["Kunden-Nr.", c => c.number], ["Name", c => c.name], ["Art", c => c.type], ["Ansprechpartner", c => c.contact], ["Straße", c => c.street],
    ["PLZ", c => c.zip], ["Ort", c => c.city], ["Telefon", c => c.phone], ["E-Mail", c => c.email]],
  orders: [["Auftrags-Nr.", o => o.number], ["Bezeichnung", o => o.title], ["Kunde", (o, ctx) => ctx.customers[o.customerId] || ""], ["Status", o => ORDER_LABEL[o.status] || o.status],
    ["Termin", o => o.dueDate], ["Netto", o => o.totals.net], ["MwSt.", o => o.totals.vatSum], ["Brutto", o => o.totals.gross], ["Positionen", o => o.items.length]],
  tasks: [["Titel", t => t.headline], ["Status", t => t.status], ["Priorität", t => t.meta.priority], ["Fällig", t => t.meta.dueDate],
    ["Zuständig", t => t.meta.assignee], ["Labels", t => t.meta.labels.join(" ")], ["Minuten", t => t.timeSpent]],
  products: [["Bezeichnung", p => p.title], ["Artikelnummer", p => p.sku || ""], ["Kategorie", p => p.category], ["Bestand", p => p.stock],
    ["Mindestbestand", p => p.minStock], ["Stückpreis", p => p.total], ["Lagerwert", p => Math.round(p.stock * p.total * 100) / 100]],
  events: [["Titel", e => e.title], ["Beginn", e => e.startDate], ["Ende", e => e.endDate], ["Ort", e => e.location]],
  projects: [["Name", p => p.name], ["Beschreibung", p => p.description], ["Archiviert", p => (p.archived ? "ja" : "nein")]],
  times: [["Datum", t => t.date], ["Person", t => t.userName], ["Art", t => TIME_LABEL[t.kind] || t.kind], ["Beginn", t => t.start], ["Ende", t => t.end],
    ["Pause (Min.)", t => t.breakMinutes], ["Arbeitszeit (Std.)", t => Math.round(t.minutes / 6) / 10], ["Notiz", t => t.note]],
  expenses: [["Belegdatum", x => x.date], ["Lieferant", x => x.vendor], ["Kategorie", x => x.category], ["Beschreibung", x => x.description], ["Belegnummer", x => x.reference],
    ["Netto", x => x.net], ["MwSt. %", x => x.vat], ["Vorsteuer", x => x.vatAmount], ["Brutto", x => x.gross], ["Bezahlt", x => (x.paid ? "ja" : "nein")]],
  notes: [["Überschrift", n => n.headline], ["Text", n => n.text], ["Geändert", n => n.updatedAt]],
};

// /api/export/all: complete JSON export of the firm (data portability, DSGVO Art. 20).
function exportAll(session) {
  const data = { firma: session.org.name, exportiertAm: new Date().toISOString(), exportiertVon: session.user.email };
  for (const name of Object.keys(COLUMNS)) { const r = resource(name, session.org.id); data[name] = r.store.list().map(r.normalize); }
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="nahtbord-export-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}

// Semicolon CSV with BOM, opens correctly in German Excel.
export const GET = handle((request, { resource: name }, session) => {
  if (name === "all") {
    if (!["owner", "admin"].includes(session.role)) return Response.json({ error: "Dafür fehlen die Rechte." }, { status: 403 });
    return exportAll(session);
  }
  const r = resource(name, session.org.id);
  const cols = COLUMNS[name];
  const cell = v => {
    let s = typeof v === "number" ? String(v).replace(".", ",") : String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // no formula injection
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const ctx = { customers: ["orders", "invoices"].includes(name) ? Object.fromEntries(resource("customers", session.org.id).store.list().map(c => [c._id, c.name])) : {} };
  const own = r.owned && !["owner", "admin"].includes(session.role);
  // ?ids=a,b exports only the selected rows (selection in the lists).
  const only = new Set((new URL(request.url).searchParams.get("ids") || "").split(",").filter(Boolean));
  const rows = r.store.list().map(r.normalize).filter(d => (!own || d.userId === session.user.id) && (!only.size || only.has(d._id))).map(d => cols.map(([, f]) => cell(f(d, ctx))).join(";"));
  const csv = "﻿" + [cols.map(([h]) => h).join(";"), ...rows].join("\r\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
});
