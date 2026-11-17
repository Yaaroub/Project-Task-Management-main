// Areas a firm can switch on or off, and presets per kind of business. Used by server and browser.
// To add an area: one line here, one entry in NAV (components/Shell.jsx), one page under app/(app).
export const MODULES = [
  ["orders", "/orders", "Aufträge", "Angebote, Aufträge und ihr Bearbeitungsstand"],
  ["invoices", "/invoices", "Rechnungen", "Rechnungen stellen, Zahlungen erfassen, E-Rechnung"],
  ["customers", "/customers", "Kunden", "Kontakte, Adressen und Notizen"],
  ["tasks", "/tasks", "Aufgaben", "Board mit Zuständigkeit, Frist und Zeiterfassung"],
  ["projects", "/projects", "Projekte", "Aufgaben bündeln und Fortschritt sehen"],
  ["inventory", "/inventory", "Inventar", "Artikel, Bestand und Mindestbestand"],
  ["calendar", "/calendar", "Kalender", "Termine und Fristen"],
  ["notes", "/notes", "Notizen", "Gemeinsame Notizen"],
  ["times", "/times", "Zeiterfassung", "Arbeitszeit, Urlaub und Krankheit je Person"],
  ["expenses", "/expenses", "Ausgaben", "Belege und Kosten mit Vorsteuer"],
  ["reports", "/reports", "Berichte", "Umsatz, Ausgaben und Ergebnis je Monat"],
];
export const MODULE_IDS = MODULES.map(m => m[0]);
export const moduleForPath = path => MODULES.find(m => path === m[1] || path.startsWith(m[1] + "/"))?.[0] || null;

export const INDUSTRIES = [
  ["handwerk", "Handwerk und Bau", "Aufträge mit Material, Rechnungen, Lager", MODULE_IDS],
  ["dienstleistung", "Dienstleistung, Agentur, Beratung", "Aufträge, Rechnungen, Projekte – ohne Lager", ["orders", "invoices", "customers", "tasks", "projects", "calendar", "notes", "times", "expenses", "reports"]],
  ["handel", "Handel und Verkauf", "Kunden, Rechnungen und Warenbestand", ["orders", "invoices", "customers", "inventory", "tasks", "calendar", "notes", "expenses", "reports"]],
  ["termine", "Praxis, Studio, Salon", "Kunden, Termine und Rechnungen", ["customers", "calendar", "invoices", "tasks", "notes", "times", "expenses", "reports"]],
  ["organisation", "Verein, Team, internes Projekt", "Aufgaben, Projekte, Termine – ohne Abrechnung", ["tasks", "projects", "calendar", "notes"]],
  ["alles", "Alles anzeigen", "Jeder Bereich ist sichtbar", MODULE_IDS],
];
export const INDUSTRY_IDS = INDUSTRIES.map(i => i[0]);

// Orders and invoices are written for customers, so the customer list stays on with them.
export function normalizeModules(list) {
  const set = new Set((Array.isArray(list) ? list : MODULE_IDS).filter(id => MODULE_IDS.includes(id)));
  if (set.has("orders") || set.has("invoices")) set.add("customers");
  return MODULE_IDS.filter(id => set.has(id));
}
