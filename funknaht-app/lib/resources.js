import "server-only";
import { HttpError, collection, tenantTransaction, getSetting, setSetting } from "./db";
import { orderTotals, ORDER_STATUS_IDS, VAT_RATES } from "./orders-shared";
import { computeInvoice } from "./invoices-shared";
import { cleanDoc, docText } from "./richtext";
import { REMINDER_MINUTES, SOUNDS } from "./calendar-shared";
import { listMembers } from "./auth";
export { orderTotals };

const text = (value, label, { max = 200, required = false } = {}) => {
  if (value == null) value = "";
  if (typeof value !== "string") throw new HttpError(400, `${label} muss Text sein.`);
  value = value.trim();
  if (required && !value) throw new HttpError(400, `${label} fehlt.`);
  if (value.length > max) throw new HttpError(400, `${label} ist zu lang (max. ${max} Zeichen).`);
  return value;
};
const amount = (value, label) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${label} muss eine Zahl ab 0 sein.`);
  return Math.round(n * 100) / 100;
};
const oneOf = (value, list, label) => {
  if (!list.includes(value)) throw new HttpError(400, `${label} ist ungültig.`);
  return value;
};
const date = (value, label, required = false) => {
  if (!value) { if (required) throw new HttpError(400, `${label} fehlt.`); return ""; }
  if (Number.isNaN(Date.parse(value))) throw new HttpError(400, `${label} ist kein gültiges Datum.`);
  return String(value);
};
const has = (body, key) => Object.hasOwn(body, key);
// Formatted text (document tree, see lib/richtext.js) plus its plain-text form.
function richField(body, docKey, textKey, label, max, out) {
  if (has(body, docKey) && body[docKey]) {
    try { out[docKey] = cleanDoc(body[docKey]); } catch (error) { throw new HttpError(400, `${label}: ${error.message}`); }
    out[textKey] = docText(out[docKey]).slice(0, max);
  } else if (has(body, textKey) || (has(body, docKey) && !body[docKey])) {
    out[textKey] = text(body[textKey], label, { max });
    out[docKey] = null;
  }
}
// Link to a customer or order of the same firm ("" removes the link).
function link(body, key, store, org, out) {
  if (!has(body, key)) return;
  out[key] = body[key] ? String(body[key]) : "";
  if (out[key]) collection(store, org).get(out[key]);
}

export const PRIORITIES = ["Niedrig", "Mittel", "Hoch", "Kritisch"];
export const STATUSES = ["todo", "doing", "review", "done"];
export const COLORS = ["fjord", "brass", "moss", "rust", "slate"];
export const ORDER_STATUSES = ORDER_STATUS_IDS;

// Running numbers per firm (K-1001, A-2026-0001). Must be called inside a tenant transaction.
export function nextNumber(org, key, format) {
  const year = new Date().getFullYear();
  const state = getSetting(org, key, { year, n: 0 });
  const n = (state.year === year || !format.yearly ? state.n : 0) + 1;
  setSetting(org, key, { year, n });
  return format.make(n, year);
}

function orderItems(input, previousItems = []) {
  if (!Array.isArray(input)) throw new HttpError(400, "Positionen ungültig.");
  if (input.length > 200) throw new HttpError(400, "Maximal 200 Positionen.");
  const booked = new Map(previousItems.filter(i => i.booked).map(i => [i.id, i]));
  const seen = new Set();
  const items = input.map(raw => {
    const prev = booked.get(String(raw?.id));
    const item = {
      id: String(raw?.id || crypto.randomUUID()).slice(0, 64),
      kind: oneOf(raw?.kind || "leistung", ["leistung", "material"], "Positionsart"),
      title: text(raw?.title, "Positionstext", { required: true, max: 300 }),
      qty: amount(raw?.qty ?? 1, "Menge"),
      unit: text(raw?.unit || (raw?.kind === "material" ? "Stk." : "Std."), "Einheit", { max: 20 }),
      price: amount(raw?.price ?? 0, "Einzelpreis"),
      vat: Number(raw?.vat ?? 19),
    };
    if (!VAT_RATES.includes(item.vat)) throw new HttpError(400, "MwSt.-Satz ungültig.");
    // Material taken from stock keeps its product and quantity; only text, price and VAT may change.
    if (prev) { seen.add(prev.id); return { ...item, kind: "material", qty: prev.qty, productId: prev.productId, booked: true }; }
    return item;
  });
  for (const [id, prev] of booked) if (!seen.has(id)) items.push(prev); // booked material can only be returned via the stock endpoint
  return items;
}

// Older Feldwerk tasks stored isDone/isProgressing instead of a status.
export function normalizeTask(t) {
  const status = t.status || (t.isDone ? "done" : t.isProgressing ? "doing" : "todo");
  const meta = t.meta || {};
  return {
    ...t, status,
    meta: {
      priority: meta.priority || "Mittel", labels: meta.labels || [], assignee: meta.assignee || "",
      dueDate: meta.dueDate || "", subtasks: meta.subtasks || [], storyPoints: meta.storyPoints || 0,
      comments: meta.comments || [],
    },
    timeSpent: t.timeSpent || 0, timerStartedAt: t.timerStartedAt || null, order: t.order ?? 0, orderId: t.orderId || "",
  };
}

const normalizeCustomer = c => ({ type: "firma", contact: "", email: "", phone: "", street: "", zip: "", city: "", notes: "", ...c });
const normalizeOrder = o => {
  const items = o.items || [];
  return { status: "anfrage", description: "", descriptionDoc: null, address: "", dueDate: "", validUntil: "", customerId: "", ...o, items, totals: orderTotals(items) };
};

const normalizeInvoice = i => computeInvoice({
  type: "rechnung", issued: false, cancelled: false, number: "", subject: "", customerId: "", orderId: "", serviceDate: "", serviceDateTo: "",
  paymentDays: 14, intro: "", note: "", buyerReference: "", propertyNotice: false, payments: [], items: [], ...i,
});
const GOBD = "Gestellte Rechnungen können nicht mehr geändert oder gelöscht werden (GoBD). Korrektur nur per Storno.";

export const TIME_KINDS = ["arbeit", "urlaub", "krank", "feiertag"];
const day = (value, label) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new HttpError(400, `${label} fehlt oder ist ungültig.`);
  return value;
};
const clock = (value, label) => {
  if (!value) return "";
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new HttpError(400, `${label}: bitte als Uhrzeit HH:MM eingeben.`);
  return value;
};
const minutesBetween = (a, b) => (Number(b.slice(0, 2)) * 60 + Number(b.slice(3))) - (Number(a.slice(0, 2)) * 60 + Number(a.slice(3)));
// minutes: worked time without break. An entry without end is still running (clocked in).
function normalizeTime(t) {
  const e = { kind: "arbeit", start: "", end: "", breakMinutes: 0, note: "", orderId: "", userId: "", userName: "", ...t };
  const worked = e.kind === "arbeit" && e.start && e.end;
  return { ...e, running: e.kind === "arbeit" && !!e.start && !e.end, minutes: worked ? Math.max(0, minutesBetween(e.start, e.end) - e.breakMinutes) : 0 };
}
function normalizeExpense(x) {
  const e = { vat: 19, category: "", description: "", reference: "", paid: true, gross: 0, ...x };
  const net = Math.round((e.gross / (1 + e.vat / 100)) * 100) / 100;
  return { ...e, net, vatAmount: Math.round((e.gross - net) * 100) / 100 };
}

// Repetition rule of an appointment (null = once).
function recurrence(r) {
  if (r == null || r === "" || r.freq === "" || r.freq == null) return null;
  if (typeof r !== "object") throw new HttpError(400, "Wiederholung ungültig.");
  const out = { freq: oneOf(r.freq, ["daily", "weekly", "monthly", "yearly"], "Wiederholung"), interval: Math.round(Number(r.interval ?? 1)) };
  if (!(out.interval >= 1 && out.interval <= 99)) throw new HttpError(400, "Abstand der Wiederholung: 1 bis 99.");
  out.byDay = out.freq === "weekly" && Array.isArray(r.byDay) ? [...new Set(r.byDay.map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  out.until = r.until ? String(r.until) : "";
  if (out.until && (!/^\d{4}-\d{2}-\d{2}$/.test(out.until) || Number.isNaN(Date.parse(out.until)))) throw new HttpError(400, "Ende der Wiederholung ist kein Datum.");
  out.count = out.until ? 0 : Math.round(Number(r.count || 0));
  if (!(out.count >= 0 && out.count <= 999)) throw new HttpError(400, "Anzahl der Wiederholungen: höchstens 999.");
  return out;
}

const definitions = {
  tasks: {
    store: "todos", label: "Aufgabe", title: d => d.headline, normalize: normalizeTask,
    fields(body, previous = {}, org) {
      const out = {};
      if (has(body, "headline") || !previous._id) out.headline = text(body.headline, "Titel", { required: true });
      richField(body, "doc", "text", "Beschreibung", 20000, out);
      if (has(body, "status")) {
        out.status = oneOf(body.status, STATUSES, "Status");
        out.isDone = out.status === "done";
        out.isProgressing = out.status === "doing";
        if (out.status === "done" && previous.status !== "done") out.completedAt = new Date().toISOString();
      }
      if (has(body, "order")) out.order = Number(body.order) || 0;
      if (has(body, "orderId")) {
        out.orderId = body.orderId ? String(body.orderId) : "";
        if (out.orderId) collection("orders", org).get(out.orderId); // must exist in this firm
      }
      if (has(body, "projectId")) {
        out.projectId = body.projectId ? String(body.projectId) : "";
        if (out.projectId && collection("projects", org).get(out.projectId).archived)
          throw new HttpError(409, "Das Projekt ist archiviert.");
      }
      if (has(body, "meta")) {
        const m = { ...(previous.meta || {}), ...body.meta };
        out.meta = {
          priority: oneOf(m.priority || "Mittel", PRIORITIES, "Priorität"),
          labels: (Array.isArray(m.labels) ? m.labels : []).map(l => text(l, "Label", { max: 30 })).filter(Boolean).slice(0, 10),
          assignee: text(m.assignee, "Zuständig", { max: 80 }),
          dueDate: date(m.dueDate, "Fälligkeit"),
          storyPoints: amount(m.storyPoints || 0, "Story Points"),
          subtasks: (Array.isArray(m.subtasks) ? m.subtasks : []).slice(0, 50).map(s => ({
            id: String(s.id || crypto.randomUUID()), title: text(s.title, "Teilaufgabe"), done: !!s.done,
          })),
          comments: (Array.isArray(m.comments) ? m.comments : []).slice(-100).map(c => ({
            id: String(c.id || crypto.randomUUID()), text: text(c.text, "Kommentar", { max: 2000 }),
            author: text(c.author, "Autor", { max: 80 }), time: c.time || new Date().toISOString(),
          })),
        };
      }
      // Time tracking: start/stop a running timer, accumulating minutes.
      if (has(body, "timer")) {
        if (body.timer === "start" && !previous.timerStartedAt) out.timerStartedAt = new Date().toISOString();
        if (body.timer === "stop" && previous.timerStartedAt) {
          const minutes = (Date.now() - Date.parse(previous.timerStartedAt)) / 60000;
          out.timeSpent = Math.round(((previous.timeSpent || 0) + minutes) * 10) / 10;
          out.timerStartedAt = null;
        }
      }
      return out;
    },
  },
  projects: {
    store: "projects", label: "Projekt", title: d => d.name,
    normalize: p => ({ color: "fjord", archived: false, description: "", ...p }),
    fields(body, previous = {}) {
      const out = {};
      if (has(body, "name") || !previous._id) out.name = text(body.name, "Name", { required: true, max: 120 });
      if (has(body, "description")) out.description = text(body.description, "Beschreibung", { max: 1500 });
      if (has(body, "archived")) out.archived = !!body.archived;
      if (has(body, "color")) out.color = oneOf(body.color, COLORS, "Farbe");
      if (has(body, "deadline")) out.deadline = date(body.deadline, "Deadline");
      return out;
    },
  },
  products: {
    store: "products", label: "Artikel", title: d => d.title,
    normalize: p => ({ minStock: 10, movements: [], category: "", ...p }),
    fields(body, previous = {}) {
      const out = {};
      if (has(body, "title") || !previous._id) out.title = text(body.title, "Bezeichnung", { required: true, max: 120 });
      if (has(body, "category")) out.category = text(body.category, "Kategorie", { max: 60 });
      if (has(body, "sku")) out.sku = text(body.sku, "Artikelnummer", { max: 40 });
      for (const [key, label] of [["price", "Preis"], ["taxes", "Steuern"], ["ads", "Werbung"], ["discount", "Rabatt"], ["minStock", "Mindestbestand"]])
        if (has(body, key)) out[key] = amount(body[key], label);
      if (!previous._id) out.stock = has(body, "stock") ? amount(body.stock, "Bestand") : 0;
      const merged = { price: 0, taxes: 0, ads: 0, discount: 0, ...previous, ...out };
      out.total = Math.max(0, Math.round((merged.price + merged.taxes + merged.ads - merged.discount) * 100) / 100);
      if (!previous._id) out.movements = out.stock ? [{ type: "IN", quantity: out.stock, notes: "Anfangsbestand", date: new Date().toISOString(), stockAfter: out.stock }] : [];
      return out;
    },
  },
  events: {
    store: "kalanders", label: "Termin", title: d => d.title,
    normalize: e => ({ color: "fjord", location: "", description: "", allDay: false, customerId: "", orderId: "", attendees: [], reminders: [], recurrence: null, exdates: [], ...e }),
    fields(body, previous = {}, org) {
      const out = {};
      if (has(body, "title") || !previous._id) out.title = text(body.title, "Titel", { required: true, max: 160 });
      if (has(body, "startDate") || !previous._id) out.startDate = date(body.startDate, "Beginn", true);
      if (has(body, "endDate") || !previous._id) out.endDate = date(body.endDate || body.startDate, "Ende", true);
      if (has(body, "location")) out.location = text(body.location, "Ort", { max: 160 });
      if (has(body, "color")) out.color = oneOf(body.color, COLORS, "Farbe");
      if (has(body, "allDay")) out.allDay = body.allDay === true;
      if (has(body, "description")) out.description = text(body.description, "Beschreibung", { max: 4000 });
      link(body, "customerId", "customers", org, out);
      link(body, "orderId", "orders", org, out);
      // Attendees: people of this firm. Empty list = the whole team.
      if (has(body, "attendees")) {
        if (!Array.isArray(body.attendees) || body.attendees.length > 100) throw new HttpError(400, "Teilnehmer ungültig.");
        const members = new Set(listMembers(org).map(m => m.id));
        out.attendees = [...new Set(body.attendees.map(String))];
        if (out.attendees.some(id => !members.has(id))) throw new HttpError(400, "Teilnehmer gehören nicht zur Firma.");
      }
      if (has(body, "reminders")) {
        if (!Array.isArray(body.reminders) || body.reminders.length > 5 || body.reminders.some(m => !REMINDER_MINUTES.includes(m))) throw new HttpError(400, "Erinnerungen ungültig (höchstens 5).");
        out.reminders = [...new Set(body.reminders)].sort((a, b) => b - a);
      }
      if (has(body, "recurrence")) out.recurrence = recurrence(body.recurrence);
      if (has(body, "exdates")) {
        if (!Array.isArray(body.exdates) || body.exdates.length > 500 || body.exdates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new HttpError(400, "Ausnahmen ungültig.");
        out.exdates = [...new Set(body.exdates)].sort();
      }
      const merged = { ...previous, ...out };
      if (Date.parse(merged.endDate) < Date.parse(merged.startDate)) throw new HttpError(400, "Das Ende liegt vor dem Beginn.");
      return out;
    },
  },
  customers: {
    store: "customers", label: "Kunde", title: d => d.name, normalize: normalizeCustomer,
    numbering: { key: "customerSeq", make: n => `K-${1000 + n}` },
    fields(body, previous = {}) {
      const out = {};
      if (has(body, "name") || !previous._id) out.name = text(body.name, "Name", { required: true, max: 160 });
      if (has(body, "type")) out.type = oneOf(body.type, ["firma", "privat"], "Kundenart");
      for (const [key, label, max] of [["contact", "Ansprechpartner", 120], ["phone", "Telefon", 40], ["street", "Straße", 160],
        ["zip", "PLZ", 10], ["city", "Ort", 80], ["notes", "Notizen", 5000]])
        if (has(body, key)) out[key] = text(body[key], label, { max });
      if (has(body, "email")) {
        out.email = text(body.email, "E-Mail", { max: 200 });
        if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new HttpError(400, "E-Mail-Adresse ungültig.");
      }
      return out;
    },
    beforeRemove(id, org) {
      // Invoices first: they must be kept for 10 years (§ 147 AO), so this reason always applies.
      const r = collection("invoices", org).list().filter(i => i.customerId === id).length;
      if (r) throw new HttpError(409, `Für den Kunden gibt es ${r} Rechnung(en). Rechnungen müssen 10 Jahre aufbewahrt werden – der Kunde kann daher nicht gelöscht werden.`);
      const n = collection("orders", org).list().filter(o => o.customerId === id).length;
      if (n) throw new HttpError(409, `Der Kunde hat noch ${n} Auftrag/Aufträge. Bitte zuerst diese löschen oder umhängen.`);
    },
  },
  orders: {
    store: "orders", label: "Auftrag", title: d => `${d.number} ${d.title}`, normalize: normalizeOrder,
    numbering: { key: "orderSeq", yearly: true, make: (n, y) => `A-${y}-${String(n).padStart(4, "0")}` },
    fields(body, previous = {}, org) {
      const out = {};
      if (has(body, "title") || !previous._id) out.title = text(body.title, "Bezeichnung", { required: true, max: 160 });
      if (has(body, "customerId") || !previous._id) {
        out.customerId = text(body.customerId, "Kunde", { required: true, max: 24 });
        collection("customers", org).get(out.customerId); // must exist in this firm
      }
      if (has(body, "status")) {
        out.status = oneOf(body.status, ORDER_STATUSES, "Status");
        if (out.status !== previous.status) out.statusChangedAt = new Date().toISOString();
      }
      if (has(body, "workAreas")) {
        if (!Array.isArray(body.workAreas) || body.workAreas.length > 30) throw new HttpError(400, "Ungültige Arbeitsbereiche.");
        out.workAreas = body.workAreas.map(group => {
          if (!Array.isArray(group?.fields) || group.fields.length > 30) throw new HttpError(400, "Ungültige Fachangaben.");
          return { area: text(group.area, "Arbeitsbereich", {required:true,max:100}), fields: group.fields.map(field => ({
            label: text(field?.label, "Feldname", {required:true,max:100}), value:text(field?.value, "Fachangabe", {max:500})
          })) };
        });
      }
      richField(body, "descriptionDoc", "description", "Beschreibung", 20000, out);
      if (has(body, "address")) out.address = text(body.address, "Einsatzort", { max: 300 });
      if (has(body, "dueDate")) out.dueDate = date(body.dueDate, "Termin");
      if (has(body, "validUntil")) out.validUntil = date(body.validUntil, "Gültig bis");
      if (has(body, "items")) out.items = orderItems(body.items, previous.items || []);
      else if (!previous._id) out.items = [];
      return out;
    },
    beforeRemove(id, org) {
      const r = collection("invoices", org).list().filter(i => i.orderId === id).length;
      if (r) throw new HttpError(409, `Zum Auftrag gibt es ${r} Rechnung(en). Aufträge mit Rechnungen können nicht gelöscht werden.`);
    },
  },
  invoices: {
    store: "invoices", label: "Rechnung", title: d => d.number || `Entwurf „${d.subject}“`, normalize: normalizeInvoice,
    // Only drafts are editable. Number, dates and snapshot are set when the invoice is issued (lib/invoices.js).
    fields(body, previous = {}, org) {
      if (previous.issued) throw new HttpError(409, GOBD);
      const out = {};
      if (has(body, "subject") || !previous._id) out.subject = text(body.subject, "Betreff", { required: true, max: 160 });
      if (has(body, "customerId") || !previous._id) {
        out.customerId = text(body.customerId, "Kunde", { required: true, max: 24 });
        collection("customers", org).get(out.customerId);
      }
      if (has(body, "orderId")) {
        out.orderId = body.orderId ? text(body.orderId, "Auftrag", { max: 24 }) : "";
        if (out.orderId) collection("orders", org).get(out.orderId);
      }
      if (has(body, "serviceDate")) out.serviceDate = date(body.serviceDate, "Leistungsdatum");
      if (has(body, "serviceDateTo")) out.serviceDateTo = date(body.serviceDateTo, "Leistungszeitraum bis");
      if (has(body, "paymentDays")) {
        const d = Number(body.paymentDays);
        if (!Number.isInteger(d) || d < 0 || d > 120) throw new HttpError(400, "Zahlungsziel: 0 bis 120 Tage.");
        out.paymentDays = d;
      }
      if (has(body, "intro")) out.intro = text(body.intro, "Einleitung", { max: 2000 });
      if (has(body, "note")) out.note = text(body.note, "Schlussbemerkung", { max: 2000 });
      if (has(body, "buyerReference")) out.buyerReference = text(body.buyerReference, "Leitweg-ID / Bestellnummer", { max: 100 });
      if (has(body, "propertyNotice")) out.propertyNotice = !!body.propertyNotice;
      if (has(body, "items")) out.items = orderItems(body.items, []).map(({ booked, productId, ...i }) => i);
      else if (!previous._id) out.items = [];
      const merged = { ...previous, ...out };
      if (merged.serviceDate && merged.serviceDateTo && merged.serviceDateTo < merged.serviceDate) throw new HttpError(400, "Der Leistungszeitraum endet vor seinem Beginn.");
      return out;
    },
    beforeRemove(id, org) {
      if (collection("invoices", org).get(id).issued) throw new HttpError(409, GOBD);
    },
  },
  // Working time per person. Members only see and change their own entries (see "owned").
  times: {
    store: "times", label: "Zeiteintrag", owned: true, title: d => `${d.date} ${d.userName || ""}`.trim(), normalize: normalizeTime,
    fields(body, previous = {}, org) {
      const out = {};
      if (has(body, "date") || !previous._id) out.date = day(body.date, "Datum");
      if (has(body, "kind")) out.kind = oneOf(body.kind, TIME_KINDS, "Art");
      for (const [key, label] of [["start", "Beginn"], ["end", "Ende"]]) if (has(body, key)) out[key] = clock(body[key], label);
      if (has(body, "breakMinutes")) { out.breakMinutes = Math.round(amount(body.breakMinutes, "Pause")); if (out.breakMinutes > 600) throw new HttpError(400, "Pause: maximal 600 Minuten."); }
      if (has(body, "note")) out.note = text(body.note, "Notiz", { max: 300 });
      if (has(body, "orderId")) {
        out.orderId = body.orderId ? String(body.orderId) : "";
        if (out.orderId) collection("orders", org).get(out.orderId);
      }
      const merged = normalizeTime({ ...previous, ...out });
      if (merged.kind === "arbeit") {
        if (!merged.start) throw new HttpError(400, "Beginn fehlt.");
        if (merged.end && merged.end < merged.start) throw new HttpError(400, "Das Ende liegt vor dem Beginn.");
        if (merged.end && merged.breakMinutes > 0 && merged.breakMinutes >= minutesBetween(merged.start, merged.end)) throw new HttpError(400, "Die Pause ist länger als die Arbeitszeit.");
      }
      return out;
    },
  },
  // Personal alarm clock. "private": nobody else sees it, not even admins.
  alarms: {
    store: "alarms", label: "Wecker", owned: true, private: true, title: d => `${d.time} ${d.label || "Wecker"}`.trim(),
    normalize: a => ({ label: "", time: "07:00", days: [], date: "", enabled: true, sound: "klassisch", userId: "", ...a }),
    fields(body, previous = {}) {
      const out = {};
      if (has(body, "label")) out.label = text(body.label, "Bezeichnung", { max: 80 });
      if (has(body, "time") || !previous._id) { out.time = clock(body.time, "Uhrzeit"); if (!out.time) throw new HttpError(400, "Uhrzeit fehlt."); }
      if (has(body, "days")) {
        if (!Array.isArray(body.days)) throw new HttpError(400, "Wochentage ungültig.");
        out.days = [...new Set(body.days.map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort();
      }
      if (has(body, "date")) out.date = body.date ? day(body.date, "Datum") : "";
      if (has(body, "enabled")) out.enabled = body.enabled !== false;
      if (has(body, "sound")) out.sound = oneOf(body.sound, SOUNDS.map(x => x[0]), "Ton");
      const merged = { days: [], date: "", ...previous, ...out };
      if (!merged.days.length && !merged.date) throw new HttpError(400, "Bitte Wochentage oder ein Datum wählen.");
      return out;
    },
  },
  expenses: {
    store: "expenses", label: "Ausgabe", title: d => `${d.vendor} ${d.reference || ""}`.trim(), normalize: normalizeExpense,
    fields(body, previous = {}) {
      const out = {};
      if (has(body, "date") || !previous._id) out.date = day(body.date, "Belegdatum");
      if (has(body, "vendor") || !previous._id) out.vendor = text(body.vendor, "Lieferant", { required: true, max: 160 });
      if (has(body, "gross") || !previous._id) out.gross = amount(body.gross, "Betrag");
      if (has(body, "vat")) { out.vat = Number(body.vat); if (!VAT_RATES.includes(out.vat)) throw new HttpError(400, "MwSt.-Satz ungültig."); }
      for (const [key, label, max] of [["category", "Kategorie", 60], ["description", "Beschreibung", 500], ["reference", "Belegnummer", 60]])
        if (has(body, key)) out[key] = text(body[key], label, { max });
      if (has(body, "paid")) out.paid = !!body.paid;
      return out;
    },
  },
  notes: {
    store: "notizs", label: "Notiz", title: d => d.headline,
    normalize: n => ({ pinned: false, color: "", doc: null, text: "", customerId: "", orderId: "", ...n }),
    fields(body, previous = {}, org) {
      const out = {};
      if (has(body, "headline") || !previous._id) out.headline = text(body.headline, "Überschrift", { required: true });
      // Formatted text arrives as a document tree; "text" is then derived from it (search, CSV export).
      richField(body, "doc", "text", "Notiztext", 100000, out);
      link(body, "customerId", "customers", org, out);
      link(body, "orderId", "orders", org, out);
      if (has(body, "pinned")) out.pinned = !!body.pinned;
      if (has(body, "color")) out.color = body.color ? oneOf(body.color, COLORS, "Farbe") : "";
      return out;
    },
  },
};

// Returns material booked on an order to stock and unlinks its tasks (used before deleting an order).
function releaseOrder(order, org) {
  const products = collection("products", org);
  for (const item of order.items || []) {
    if (!item.booked || !item.productId) continue;
    try {
      products.change(item.productId, p => {
        const stock = (p.stock || 0) + item.qty;
        return { stock, movements: [...(p.movements || []), { type: "IN", quantity: item.qty, notes: `Rückbuchung ${order.number} (gelöscht)`, date: new Date().toISOString(), stockAfter: stock }].slice(-500) };
      });
    } catch (error) { if (error.status !== 404) throw error; } // product was deleted meanwhile
  }
  const tasks = collection("todos", org);
  for (const t of tasks.list().filter(t => t.orderId === order._id)) tasks.change(t._id, () => ({ orderId: "" }));
  unlinkNotes(org, "orderId", order._id);
}
function unlinkNotes(org, key, id) {
  const notes = collection("notizs", org);
  for (const n of notes.list().filter(n => n[key] === id)) notes.change(n._id, () => ({ [key]: "" }));
}

export function resource(name, org) {
  const def = definitions[name];
  if (!def) throw new HttpError(404, "Unbekannter Bereich.");
  const base = collection(def.store, org);
  const store = {
    ...base,
    create: fields => def.numbering
      ? tenantTransaction(org, () => base.create({ ...fields, number: nextNumber(org, def.numbering.key, def.numbering) }))
      : base.create(fields),
    remove: id => tenantTransaction(org, () => {
      def.beforeRemove?.(id, org);
      if (name === "orders") releaseOrder(base.get(id), org);
      if (name === "customers") unlinkNotes(org, "customerId", id);
      return base.remove(id);
    }),
  };
  return { ...def, name, store, fields: (body, previous) => def.fields(body, previous, org) };
}
export const resourceNames = Object.keys(definitions);
