import "server-only";
import { HttpError, db, collection, getSetting, setSetting } from "./db";
import { getProfile } from "./profile";
import { INDUSTRY_IDS, MODULE_IDS, normalizeModules } from "./workspace-shared";

// What a firm sees: its kind of business, the visible areas and whether the AI help is on.
export function getWorkspace(org) {
  const stored = getSetting(org, "workspace", {});
  return {
    industry: INDUSTRY_IDS.includes(stored.industry) ? stored.industry : "",
    modules: normalizeModules(stored.modules),
    ai: stored.ai !== false,
    setupDismissed: !!stored.setupDismissed,
  };
}

// Accepts a partial change, e.g. only { setupDismissed: true }.
export function saveWorkspace(org, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new HttpError(400, "Einstellungen ungültig.");
  const next = getWorkspace(org);
  if ("industry" in patch) {
    if (!INDUSTRY_IDS.includes(patch.industry)) throw new HttpError(400, "Branche ungültig.");
    next.industry = patch.industry;
  }
  if ("modules" in patch) {
    if (!Array.isArray(patch.modules) || patch.modules.some(id => !MODULE_IDS.includes(id))) throw new HttpError(400, "Bereiche ungültig.");
    next.modules = normalizeModules(patch.modules);
  }
  if ("ai" in patch) next.ai = patch.ai === true;
  if ("setupDismissed" in patch) next.setupDismissed = patch.setupDismissed === true;
  return setSetting(org, "workspace", next);
}

// "Erste Schritte" on the dashboard: only steps for areas the firm uses.
export function setupSteps(session) {
  const org = session.org.id;
  const ws = getWorkspace(org);
  const on = id => ws.modules.includes(id);
  const any = name => collection(name, org).list().length > 0;
  const members = db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE org_id=?").get(org).n;
  const steps = [
    ["industry", "Branche wählen", "Blendet aus, was Sie nicht brauchen.", "/admin#arbeitsbereich", !!ws.industry, true],
    ["profile", "Firmendaten eintragen", "Adresse und Steuernummer für Angebote und Rechnungen.", "/admin#firmendaten", getProfile(session.org).missingForInvoice.length === 0, on("orders") || on("invoices")],
    ["customer", "Ersten Kunden anlegen", "Name und Adresse genügen.", "/customers?new=1", any("customers"), on("customers")],
    ["order", "Ersten Auftrag oder ein Angebot anlegen", "Mit Positionen und Preis.", "/orders?new=1", any("orders"), on("orders")],
    ["invoice", "Erste Rechnung schreiben", "Aus einem Auftrag oder frei.", "/invoices?new=1", any("invoices"), on("invoices")],
    ["task", "Erste Aufgabe anlegen", "Mit Frist und Zuständigkeit.", "/tasks?new=1", any("todos"), on("tasks")],
    ["team", "Kollegen einladen", "Jeder bekommt einen eigenen Zugang mit passenden Rechten.", "/admin#team", members > 1, true],
  ].filter(s => s[5]).map(([id, title, text, href, done]) => ({ id, title, text, href, done }));
  return { steps, dismissed: ws.setupDismissed, done: steps.every(s => s.done) };
}
