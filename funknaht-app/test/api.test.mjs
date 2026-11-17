// HTTP integration tests against a real production build with an empty temporary database.
// Run with: npm test   (builds into .next-test, starts on port 3199)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "funknaht-test-"));
let server;

// Stand-in for a browser push service (Google, Mozilla, Apple …): records every message it is given.
const PUSH_PORT = 3196;
const pushed = [];
const pushServer = createServer((req, res) => {
  const chunks = [];
  req.on("data", c => chunks.push(c));
  req.on("end", () => {
    pushed.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
    res.writeHead(req.url.endsWith("/gone") ? 410 : 201).end();
  });
});

// Stand-in for an OpenAI-compatible AI service (e.g. Ollama): records the request and returns a fixed answer.
const AI_PORT = 3198;
const aiStub = { reply: "ok", last: null, fail: false };
const aiServer = createServer((req, res) => {
  let raw = "";
  req.on("data", c => (raw += c));
  req.on("end", () => {
    if (aiStub.fail || req.url !== "/v1/chat/completions") { res.writeHead(500).end("kaputt"); return; }
    aiStub.last = JSON.parse(raw);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ choices: [{ message: { role: "assistant", content: aiStub.reply } }] }));
  });
});

before(async () => {
  await new Promise(r => aiServer.listen(AI_PORT, "127.0.0.1", r));
  await new Promise(r => pushServer.listen(PUSH_PORT, "127.0.0.1", r));
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    env: { ...process.env, NEXT_DIST_DIR: ".next-test", SQLITE_PATH: join(dir, "test.sqlite"), NODE_ENV: "production",
      AI_BASE_URL: `http://127.0.0.1:${AI_PORT}/v1`, AI_MODEL: "test-modell", AI_API_KEY: "",
      PUSH_ALLOW_HOSTS: "127.0.0.1", PUSH_INTERVAL_MS: "1000", PUSH_SCHEDULER: "1", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", d => process.stderr.write(d));
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + "/login"); return; } catch { await new Promise(r => setTimeout(r, 500)); }
  }
  throw new Error("Server startet nicht.");
});
after(async () => {
  aiServer.close();
  pushServer.close();
  if (server && server.exitCode === null) await new Promise(r => { server.once("exit", r); server.kill(); });
  // Windows releases the database file shortly after the process ends.
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

// Minimal browser: keeps the session cookie and sends a same-site Origin header.
function client() {
  let cookie = "";
  return async (method, path, body, headers = {}) => {
    const res = await fetch(BASE + path, {
      method, redirect: "manual",
      headers: { Origin: BASE, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) if (c.startsWith("fn_session=")) cookie = c.split(";")[0];
    const type = res.headers.get("content-type") || "";
    return { status: res.status, data: type.includes("json") ? await res.json() : await res.text(), headers: res.headers };
  };
}

const owner = client(), stranger = client(), viewer = client(), member = client(), anon = client();
let taskId;

test("ohne Anmeldung: API 401, Seiten leiten zum Login", async () => {
  assert.equal((await anon("GET", "/api/tasks")).status, 401);
  const page = await anon("GET", "/tasks");
  assert.ok([307, 308].includes(page.status));
  assert.match(page.headers.get("location"), /\/login/);
});

test("Registrierung prüft Eingaben", async () => {
  assert.equal((await anon("POST", "/api/auth/register", { name: "A", company: "X", email: "kein-mail", password: "1234567890" })).status, 400);
  assert.equal((await anon("POST", "/api/auth/register", { name: "A", company: "X", email: "a@b.de", password: "kurz" })).status, 400);
});

test("Inhaber registriert Firma und arbeitet mit Daten", async () => {
  assert.equal((await owner("POST", "/api/auth/register", { name: "Anna Petersen", company: "Petersen GmbH", email: "anna@petersen.de", password: "sicheres-passwort" })).status, 201);
  const me = await owner("GET", "/api/auth/me");
  assert.equal(me.data.role, "owner");
  const created = await owner("POST", "/api/tasks", { headline: "Heizung warten", meta: { priority: "Hoch" } });
  assert.equal(created.status, 201);
  taskId = created.data._id;
  assert.equal((await owner("PATCH", "/api/tasks/" + taskId, { status: "done" })).data.status, "done");
});

test("doppelte E-Mail wird abgelehnt", async () => {
  assert.equal((await anon("POST", "/api/auth/register", { name: "B", company: "Y", email: "ANNA@petersen.de", password: "noch-ein-passwort" })).status, 409);
});

test("Mandantentrennung: fremde Firma sieht und ändert nichts", async () => {
  assert.equal((await stranger("POST", "/api/auth/register", { name: "Bernd", company: "Andere Firma", email: "bernd@andere.de", password: "sicheres-passwort" })).status, 201);
  assert.deepEqual((await stranger("GET", "/api/tasks")).data, []);
  assert.equal((await stranger("GET", "/api/tasks/" + taskId)).status, 404);
  assert.equal((await stranger("PATCH", "/api/tasks/" + taskId, { headline: "gehackt" })).status, 404);
  assert.equal((await stranger("DELETE", "/api/tasks/" + taskId)).status, 404);
  assert.deepEqual((await stranger("GET", "/api/search?q=heizung")).data, []);
  assert.equal((await owner("GET", "/api/tasks/" + taskId)).data.headline, "Heizung warten");
});

test("Rollen: Nur-lesen darf lesen, aber nichts ändern", async () => {
  assert.equal((await owner("POST", "/api/team", { name: "Vera", email: "vera@petersen.de", password: "vera-passwort-1", role: "viewer" })).status, 201);
  assert.equal((await viewer("POST", "/api/auth/login", { email: "vera@petersen.de", password: "vera-passwort-1" })).status, 200);
  assert.equal((await viewer("GET", "/api/tasks")).data.length, 1);
  assert.equal((await viewer("POST", "/api/tasks", { headline: "x" })).status, 403);
  assert.equal((await viewer("DELETE", "/api/tasks/" + taskId)).status, 403);
  assert.equal((await viewer("POST", "/api/team", { name: "X", email: "x@x.de", password: "xxxxxxxxxxxx", role: "member" })).status, 403);
});

test("Rollen: Mitarbeiter arbeitet, verwaltet aber kein Team", async () => {
  await owner("POST", "/api/team", { name: "Max", email: "max@petersen.de", password: "max-passwort-12", role: "member" });
  await member("POST", "/api/auth/login", { email: "max@petersen.de", password: "max-passwort-12" });
  assert.equal((await member("POST", "/api/notes", { headline: "Notiz von Max" })).status, 201);
  assert.equal((await member("PUT", "/api/settings", { announcement: "x" })).status, 403);
  assert.equal((await member("GET", "/api/activity")).status, 403);
  assert.equal((await member("GET", "/api/export/all")).status, 403);
});

test("Inhaber kann weder entfernt noch herabgestuft werden", async () => {
  const team = (await owner("GET", "/api/team")).data;
  const ownerId = team.find(m => m.role === "owner").id;
  assert.equal((await owner("DELETE", "/api/team/" + ownerId)).status, 403);
  assert.equal((await owner("PATCH", "/api/team/" + ownerId, { role: "viewer" })).status, 403);
});

test("Entferntes Mitglied verliert sofort den Zugang", async () => {
  const vera = (await owner("GET", "/api/team")).data.find(m => m.email === "vera@petersen.de");
  assert.equal((await owner("DELETE", "/api/team/" + vera.id)).status, 200);
  assert.equal((await viewer("GET", "/api/tasks")).status, 401);
});

test("Änderungsprotokoll nennt die handelnde Person", async () => {
  const log = (await owner("GET", "/api/activity")).data;
  assert.ok(log.some(e => e.user === "Max" && e.text.includes("Notiz von Max")));
  assert.ok(log.some(e => e.user === "Anna Petersen" && e.text.includes("erledigt")));
});

test("CSRF: Änderung von fremder Herkunft wird abgelehnt", async () => {
  assert.equal((await owner("POST", "/api/tasks", { headline: "x" }, { Origin: "https://evil.example" })).status, 403);
});

test("Lager kann nicht negativ werden", async () => {
  const p = (await owner("POST", "/api/products", { title: "Kabel", stock: 3 })).data;
  assert.equal((await owner("POST", "/api/stock/" + p._id, { type: "OUT", quantity: 5 })).status, 409);
  assert.equal((await owner("POST", "/api/stock/" + p._id, { type: "OUT", quantity: 2 })).data.stock, 1);
});

test("Falsches Passwort und Sperre nach vielen Versuchen", async () => {
  const c = client();
  assert.equal((await c("POST", "/api/auth/login", { email: "bernd@andere.de", password: "falsch" })).status, 401);
  let last;
  for (let i = 0; i < 9; i++) last = await c("POST", "/api/auth/login", { email: "bernd@andere.de", password: "falsch" });
  assert.equal(last.status, 429);
});

test("Abmelden beendet die Sitzung", async () => {
  assert.equal((await stranger("POST", "/api/auth/logout")).status, 200);
  assert.equal((await stranger("GET", "/api/tasks")).status, 401);
});

/* ---------- Eigene Datenbank pro Firma ---------- */
const { DatabaseSync } = await import("node:sqlite");
const { existsSync, readdirSync } = await import("node:fs");
const tenants = () => join(dir, "tenants");
const titlesIn = org => {
  const db = new DatabaseSync(join(tenants(), `${org}.sqlite`), { readOnly: true });
  try { return db.prepare("SELECT json_extract(data,'$.headline') AS h FROM documents WHERE collection='todos'").all().map(r => r.h); }
  finally { db.close(); }
};

test("jede Firma hat ihre eigene Datenbankdatei", async () => {
  const a = client(), b = client();
  await a("POST", "/api/auth/register", { name: "Clara", company: "Firma A", email: "clara@a.de", password: "sicheres-passwort" });
  await b("POST", "/api/auth/register", { name: "Dirk", company: "Firma B", email: "dirk@b.de", password: "sicheres-passwort" });
  await a("POST", "/api/tasks", { headline: "Nur bei A" });
  await b("POST", "/api/tasks", { headline: "Nur bei B" });
  const orgA = (await a("GET", "/api/org")).data.id, orgB = (await b("GET", "/api/org")).data.id;
  assert.notEqual(orgA, orgB);
  assert.ok(existsSync(join(tenants(), `${orgA}.sqlite`)) && existsSync(join(tenants(), `${orgB}.sqlite`)));
  assert.deepEqual(titlesIn(orgA), ["Nur bei A"]);
  assert.deepEqual(titlesIn(orgB), ["Nur bei B"]);
  // The control database holds no business data.
  const control = new DatabaseSync(join(dir, "test.sqlite"), { readOnly: true });
  assert.equal(control.prepare("SELECT COUNT(*) AS n FROM documents").get().n, 0);
  control.close();
});

test("Kalender-Abo: gültiger Link liefert iCal, falscher nicht", async () => {
  await owner("POST", "/api/events", { title: "Abnahme, Bauteil 3", startDate: "2026-12-01T09:00:00.000Z", endDate: "2026-12-01T10:00:00.000Z", location: "Plön" });
  await owner("POST", "/api/tasks", { headline: "Angebot schreiben", meta: { dueDate: "2026-12-03" } });
  assert.equal((await member("POST", "/api/ical")).status, 403);
  const { token } = (await owner("POST", "/api/ical")).data;
  const feed = await anon("GET", `/api/ical/${token}.ics`);
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get("content-type"), /text\/calendar/);
  assert.match(feed.data, /BEGIN:VCALENDAR/);
  assert.ok(feed.data.includes("SUMMARY:Abnahme\\, Bauteil 3"), "Komma muss nach RFC 5545 maskiert sein");
  assert.ok(feed.data.includes("LOCATION:Plön"));
  assert.match(feed.data, /DTSTART;VALUE=DATE:20261203/);
  const org = token.slice(0, 24);
  assert.equal((await anon("GET", `/api/ical/${org}-falschesgeheimnis1234567890.ics`)).status, 404);
  const before = readdirSync(tenants()).length;
  assert.equal((await anon("GET", `/api/ical/${"a".repeat(24)}-${"x".repeat(30)}.ics`)).status, 404);
  assert.equal(readdirSync(tenants()).length, before, "unbekannte Firma darf keine Datei anlegen");
  await owner("DELETE", "/api/ical");
  assert.equal((await anon("GET", `/api/ical/${token}.ics`)).status, 404);
});

test("Firma löschen entfernt Datenbank und Zugänge", async () => {
  const c = client();
  await c("POST", "/api/auth/register", { name: "Eva", company: "Löschfirma", email: "eva@loesch.de", password: "sicheres-passwort" });
  await c("POST", "/api/tasks", { headline: "weg damit" });
  const org = (await c("GET", "/api/org")).data.id;
  assert.ok(existsSync(join(tenants(), `${org}.sqlite`)));
  assert.equal((await member("DELETE", "/api/org", { confirm: "Petersen GmbH" })).status, 403);
  assert.equal((await c("DELETE", "/api/org", { confirm: "Falscher Name" })).status, 400);
  assert.equal((await c("DELETE", "/api/org", { confirm: "Löschfirma" })).status, 200);
  assert.ok(!existsSync(join(tenants(), `${org}.sqlite`)));
  assert.equal((await c("GET", "/api/tasks")).status, 401);
  assert.equal((await client()("POST", "/api/auth/login", { email: "eva@loesch.de", password: "sicheres-passwort" })).status, 401);
});

/* ---------- Kunden & Aufträge ---------- */
const YEAR = new Date().getFullYear();
let customerId, orderId, productId;

test("Kunden: fortlaufende Nummern und Prüfung der E-Mail", async () => {
  const a = await owner("POST", "/api/customers", { name: "Hof Brodersen", type: "firma", contact: "Jan Brodersen", street: "Dorfstr. 1", zip: "24306", city: "Plön" });
  const b = await owner("POST", "/api/customers", { name: "Familie Petersen", type: "privat" });
  assert.equal(a.status, 201);
  assert.equal(a.data.number, "K-1001");
  assert.equal(b.data.number, "K-1002");
  assert.equal((await owner("POST", "/api/customers", { name: "X", email: "keine-mail" })).status, 400);
  customerId = a.data._id;
});

test("Aufträge: Nummer, Kundenprüfung und Summen vom Server", async () => {
  assert.equal((await owner("POST", "/api/orders", { title: "X", customerId: "a".repeat(24) })).status, 404);
  const created = await owner("POST", "/api/orders", {
    title: "Heizungswartung", customerId, status: "angebot",
    items: [{ title: "Wartung", qty: 2, unit: "Std.", price: 50, vat: 19 }, { title: "Filter", kind: "material", qty: 1, price: 100, vat: 7 }],
    totals: { gross: 1 }, // must be ignored
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.number, `A-${YEAR}-0001`);
  assert.deepEqual([created.data.totals.net, created.data.totals.vatSum, created.data.totals.gross], [200, 26, 226]);
  assert.equal((await owner("POST", "/api/orders", { title: "Y", customerId, items: [{ title: "z", qty: 1, price: 1, vat: 16 }] })).status, 400);
  orderId = created.data._id;
});

test("Material vom Lager: bucht ab, ist geschützt und geht vollständig zurück", async () => {
  productId = (await owner("POST", "/api/products", { title: "Dichtung", price: 10, stock: 10 })).data._id;
  const booked = await owner("POST", `/api/orders/${orderId}/material`, { productId, qty: 3 });
  assert.equal(booked.status, 200);
  const item = booked.data.items.find(i => i.booked);
  assert.equal(item.qty, 3);
  assert.equal((await owner("GET", `/api/products/${productId}`)).data.stock, 7);
  // Booked quantity cannot be changed or removed through a normal edit.
  const edited = await owner("PATCH", `/api/orders/${orderId}`, { items: [{ ...item, qty: 1, price: 12.5 }] });
  const kept = edited.data.items.find(i => i.id === item.id);
  assert.equal(kept.qty, 3);
  assert.equal(kept.price, 12.5);
  const emptied = await owner("PATCH", `/api/orders/${orderId}`, { items: [] });
  assert.ok(emptied.data.items.some(i => i.id === item.id));
  // Too much: nothing changes (stock and order stay as they were).
  assert.equal((await owner("POST", `/api/orders/${orderId}/material`, { productId, qty: 20 })).status, 409);
  assert.equal((await owner("GET", `/api/products/${productId}`)).data.stock, 7);
  assert.equal((await owner("GET", `/api/orders/${orderId}`)).data.items.filter(i => i.booked).length, 1);
  // Return to stock.
  const back = await owner("DELETE", `/api/orders/${orderId}/material/${item.id}`);
  assert.equal(back.status, 200);
  assert.ok(!back.data.items.some(i => i.id === item.id));
  assert.equal((await owner("GET", `/api/products/${productId}`)).data.stock, 10);
});

test("Aufgaben am Auftrag; Kunde mit Aufträgen nicht löschbar; Auftrag löschen gibt Material zurück", async () => {
  const task = (await member("POST", "/api/tasks", { headline: "Brenner reinigen", orderId })).data;
  assert.equal(task.orderId, orderId);
  await owner("POST", `/api/orders/${orderId}/material`, { productId, qty: 4 });
  assert.equal((await owner("GET", `/api/products/${productId}`)).data.stock, 6);
  assert.equal((await owner("DELETE", `/api/customers/${customerId}`)).status, 409);
  assert.equal((await owner("DELETE", `/api/orders/${orderId}`)).status, 200);
  assert.equal((await owner("GET", `/api/products/${productId}`)).data.stock, 10);
  assert.equal((await owner("GET", `/api/tasks/${task._id}`)).data.orderId, "");
  assert.equal((await owner("DELETE", `/api/customers/${customerId}`)).status, 200);
});

test("Kunden & Aufträge sind pro Firma getrennt; Druckansicht nur für die eigene Firma", async () => {
  const c = (await owner("POST", "/api/customers", { name: "Kanzlei am Markt", city: "Eutin" })).data;
  const o = (await owner("POST", "/api/orders", { title: "Netzwerkprüfung", customerId: c._id, items: [{ title: "Prüfung", qty: 1, price: 190, vat: 19 }] })).data;
  const other = client();
  const reg = await other("POST", "/api/auth/register", { name: "Fremd", company: "Fremdfirma", email: "fremd-notiz@x.de", password: "sicheres-passwort" });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  assert.deepEqual((await other("GET", "/api/customers")).data, []);
  assert.equal((await other("GET", `/api/orders/${o._id}`)).status, 404);
  assert.equal((await other("POST", `/api/orders/${o._id}/material`, { productId, qty: 1 })).status, 404);
  assert.equal((await other("POST", "/api/tasks", { headline: "x", orderId: o._id })).status, 404);
  assert.equal((await other("GET", `/print/order/${o._id}`)).status, 404);
  assert.ok([307, 308].includes((await anon("GET", `/print/order/${o._id}`)).status));
  const page = await owner("GET", `/print/order/${o._id}?doc=angebot`);
  assert.equal(page.status, 200);
  assert.match(page.data, /Angebot/);
  assert.match(page.data, new RegExp(`A-${YEAR}-0002`));
  assert.match(page.data, /226,10\s€/);
  const csv = await owner("GET", "/api/export/orders");
  assert.match(csv.data, /Kanzlei am Markt/);
});

/* ---------- Rechnungen ---------- */
const plusDays = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function wellFormedXml(xml) {
  if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml)) return false;
  const stack = [], re = /<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g;
  const body = xml.replace(/<\?xml[^>]*\?>/, "");
  for (let m; (m = re.exec(body));) {
    if (m[4] === "/") continue;
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
  }
  return stack.length === 0;
}
const PROFILE = { name: "Petersen GmbH", owner: "Anna Petersen", street: "Hafenstraße 5", zip: "24306", city: "Plön", phone: "04522 1234",
  email: "info@petersen.test", web: "", taxId: "DE123456789", bank: "Förde Sparkasse", iban: "DE02 1203 0000 0000 2020 51", bic: "BYLADEM1001", terms: "", footer: "" };
let inv1, privCustomer;

test("Rechnung aus Auftrag: Entwurf mit Positionen; Stellen nur mit Pflichtangaben und nur durch Admins", async () => {
  privCustomer = (await owner("POST", "/api/customers", { name: "Familie Hansen", type: "privat", street: "Seeweg 2", zip: "24306", city: "Plön", email: "hansen@example.test" })).data;
  const order = (await owner("POST", "/api/orders", { title: "Bad-Reparatur", customerId: privCustomer._id, status: "erledigt", dueDate: plusDays(-2),
    items: [{ kind: "leistung", title: "Montage", qty: 2, unit: "Std.", price: 60, vat: 19 }, { kind: "material", title: "Armatur", qty: 1, unit: "Stk.", price: 100, vat: 19 }] })).data;
  const draft = await member("POST", `/api/orders/${order._id}/invoice`);
  assert.equal(draft.status, 201);
  assert.equal(draft.data.issued, false);
  assert.equal(draft.data.number, "");
  assert.equal(draft.data.items.length, 2);
  assert.equal(draft.data.propertyNotice, true);
  assert.equal(draft.data.totals.gross, 261.8);
  assert.equal(draft.data.labor, 142.8);
  assert.equal((await member("POST", `/api/invoices/${draft.data._id}/finalize`)).status, 403);
  const missing = await owner("POST", `/api/invoices/${draft.data._id}/finalize`);
  assert.equal(missing.status, 409);
  assert.match(missing.data.error, /Steuernummer/);
  assert.equal((await owner("PUT", "/api/settings", { profile: PROFILE })).status, 200);
  const issued = await owner("POST", `/api/invoices/${draft.data._id}/finalize`);
  assert.equal(issued.status, 200);
  assert.equal(issued.data.number, `R-${YEAR}-0001`);
  assert.equal(issued.data.issueDate, plusDays(0));
  assert.equal(issued.data.dueDate, plusDays(14));
  assert.equal(issued.data.status, "offen");
  assert.match(issued.data.hash, /^[a-f0-9]{64}$/);
  assert.equal((await owner("GET", `/api/orders/${order._id}`)).data.status, "abgerechnet");
  inv1 = issued.data;
});

test("Gestellte Rechnung ist unveränderbar; Entwürfe verbrauchen keine Nummer", async () => {
  assert.equal((await owner("PATCH", `/api/invoices/${inv1._id}`, { subject: "geändert" })).status, 409);
  assert.equal((await owner("DELETE", `/api/invoices/${inv1._id}`)).status, 409);
  assert.equal((await owner("POST", `/api/invoices/${inv1._id}/finalize`)).status, 409);
  // A changed customer address does not change the issued invoice.
  await owner("PATCH", `/api/customers/${privCustomer._id}`, { street: "Neue Straße 9" });
  assert.equal((await owner("GET", `/api/invoices/${inv1._id}`)).data.snapshot.buyer.street, "Seeweg 2");
  const scrap = (await member("POST", "/api/invoices", { subject: "Verworfen", customerId: privCustomer._id, items: [{ title: "x", qty: 1, price: 10, vat: 19 }] })).data;
  assert.equal((await member("DELETE", `/api/invoices/${scrap._id}`)).status, 200);
  const next = (await member("POST", "/api/invoices", { subject: "Kleinreparatur", customerId: privCustomer._id, serviceDate: plusDays(0), items: [{ title: "Dichtung", qty: 1, price: 50, vat: 19 }] })).data;
  assert.equal((await owner("POST", `/api/invoices/${next._id}/finalize`)).data.number, `R-${YEAR}-0002`);
  const noDate = (await owner("POST", "/api/invoices", { subject: "ohne Datum", customerId: privCustomer._id, items: [{ title: "x", qty: 1, price: 1, vat: 19 }] })).data;
  const refused = await owner("POST", `/api/invoices/${noDate._id}/finalize`);
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /Leistungsdatum/);
});

test("Zahlungen: teilweise, vollständig, keine Überzahlung; Storno nur ohne Zahlungen", async () => {
  const part = await member("POST", `/api/invoices/${inv1._id}/payments`, { amount: 100, date: plusDays(0), note: "Anzahlung" });
  assert.equal(part.data.status, "teilbezahlt");
  assert.equal(part.data.open, 161.8);
  assert.equal((await member("POST", `/api/invoices/${inv1._id}/payments`, { amount: 500 })).status, 409);
  assert.equal((await owner("POST", `/api/invoices/${inv1._id}/cancel`, { reason: "x" })).status, 409);
  const paymentId = part.data.payments[0].id;
  assert.equal((await member("DELETE", `/api/invoices/${inv1._id}/payments/${paymentId}`)).status, 403);
  assert.equal((await owner("DELETE", `/api/invoices/${inv1._id}/payments/${paymentId}`)).data.open, 261.8);
  const full = await member("POST", `/api/invoices/${inv1._id}/payments`, { amount: 261.8 });
  assert.equal(full.data.status, "bezahlt");
  await owner("DELETE", `/api/invoices/${inv1._id}/payments/${full.data.payments[0].id}`);
});

test("Storno: eigene Nummer, negative Beträge, Original gesperrt", async () => {
  assert.equal((await member("POST", `/api/invoices/${inv1._id}/cancel`, {})).status, 403);
  const res = await owner("POST", `/api/invoices/${inv1._id}/cancel`, { reason: "Falscher Kunde" });
  assert.equal(res.status, 200);
  const { storno, original } = res.data;
  assert.equal(storno.number, `R-${YEAR}-0003`);
  assert.equal(storno.type, "storno");
  assert.equal(storno.totals.gross, -261.8);
  assert.equal(storno.refNumber, inv1.number);
  assert.equal(original.status, "storniert");
  assert.equal(original.open, 0);
  assert.equal((await owner("POST", `/api/invoices/${inv1._id}/cancel`, {})).status, 409);
  assert.equal((await owner("POST", `/api/invoices/${storno._id}/cancel`, {})).status, 409);
  assert.equal((await owner("POST", `/api/invoices/${inv1._id}/payments`, { amount: 1 })).status, 409);
  const xml = await owner("GET", `/api/invoices/${storno._id}/xrechnung`);
  assert.equal(xml.status, 200);
  assert.ok(wellFormedXml(xml.data));
  assert.match(xml.data, /<ram:TypeCode>384<\/ram:TypeCode>/);
  assert.match(xml.data, new RegExp(`<ram:IssuerAssignedID>${inv1.number}</ram:IssuerAssignedID>`));
  assert.match(xml.data, /<ram:GrandTotalAmount>-261\.80<\/ram:GrandTotalAmount>/);
});

test("E-Rechnung (XRechnung 3.0 CII) und Druckansicht mit Pflichtangaben", async () => {
  const draft = (await member("POST", "/api/invoices", { subject: "Wartung & Prüfung <Heizung>", customerId: privCustomer._id, serviceDate: plusDays(-1), propertyNotice: true,
    items: [{ kind: "leistung", title: "Wartung", qty: 1.5, unit: "Std.", price: 68, vat: 19 }, { kind: "material", title: "Filter", qty: 2, unit: "Stk.", price: 12.5, vat: 7 }] })).data;
  assert.equal((await owner("GET", `/api/invoices/${draft._id}/xrechnung`)).status, 409); // drafts have no e-invoice
  const inv = (await owner("POST", `/api/invoices/${draft._id}/finalize`)).data;
  const xml = await owner("GET", `/api/invoices/${inv._id}/xrechnung`);
  assert.equal(xml.status, 200);
  assert.match(xml.headers.get("content-type"), /xml/);
  assert.ok(wellFormedXml(xml.data), "XML muss wohlgeformt sein");
  for (const re of [/urn:cen\.eu:en16931:2017#compliant#urn:xeinkauf\.de:kosit:xrechnung_3\.0/, /<ram:TypeCode>380<\/ram:TypeCode>/,
    new RegExp(`<ram:ID>${inv.number}</ram:ID>`), /<ram:ID schemeID="VA">DE123456789<\/ram:ID>/, /<ram:IBANID>DE02120300000000202051<\/ram:IBANID>/,
    /<ram:BilledQuantity unitCode="HUR">1\.5<\/ram:BilledQuantity>/, /<ram:BilledQuantity unitCode="H87">2<\/ram:BilledQuantity>/,
    /<ram:LineTotalAmount>127\.00<\/ram:LineTotalAmount>/, /<ram:TaxTotalAmount currencyID="EUR">21\.13<\/ram:TaxTotalAmount>/,
    /<ram:GrandTotalAmount>148\.13<\/ram:GrandTotalAmount>/, /§ 14b/])
    assert.match(xml.data, re);
  const page = await owner("GET", `/print/invoice/${inv._id}`);
  assert.equal(page.status, 200);
  for (const re of [new RegExp(`Rechnung ${inv.number}`), /Leistungsdatum/, /DE123456789/, /§ 14b Abs\. 1 Satz 5 UStG/, /§ 35a EStG/, /148,13\s€/, /unverändert/])
    assert.match(page.data, re);
});

test("Kleinunternehmer: keine Umsatzsteuer; Kunde mit Rechnungen bleibt erhalten; andere Firma sieht nichts", async () => {
  await owner("PUT", "/api/settings", { profile: { ...PROFILE, smallBusiness: true } });
  const withVat = (await member("POST", "/api/invoices", { subject: "KU", customerId: privCustomer._id, serviceDate: plusDays(0), items: [{ title: "Arbeit", qty: 1, price: 100, vat: 19 }] })).data;
  const refused = await owner("POST", `/api/invoices/${withVat._id}/finalize`);
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /§ 19/);
  await member("PATCH", `/api/invoices/${withVat._id}`, { items: [{ title: "Arbeit", qty: 1, price: 100, vat: 0 }] });
  const ok = (await owner("POST", `/api/invoices/${withVat._id}/finalize`)).data;
  assert.equal(ok.totals.gross, 100);
  const xml = (await owner("GET", `/api/invoices/${ok._id}/xrechnung`)).data;
  assert.match(xml, /<ram:CategoryCode>E<\/ram:CategoryCode>/);
  assert.match(xml, /<ram:ExemptionReason>Kleinunternehmer gemäß § 19 UStG<\/ram:ExemptionReason>/);
  assert.match((await owner("GET", `/print/invoice/${ok._id}`)).data, /Gemäß § 19 UStG wird keine Umsatzsteuer berechnet/);
  await owner("PUT", "/api/settings", { profile: PROFILE });

  const del = await owner("DELETE", `/api/customers/${privCustomer._id}`);
  assert.equal(del.status, 409);
  assert.match(del.data.error, /10 Jahre/);
  const other = client();
  await other("POST", "/api/auth/register", { name: "Zweit", company: "Zweitfirma", email: "zweit@x.de", password: "sicheres-passwort" });
  assert.deepEqual((await other("GET", "/api/invoices")).data, []);
  assert.equal((await other("GET", `/api/invoices/${ok._id}`)).status, 404);
  assert.equal((await other("GET", `/api/invoices/${ok._id}/xrechnung`)).status, 404);
  assert.equal((await other("GET", `/print/invoice/${ok._id}`)).status, 404);
  assert.match((await owner("GET", "/api/export/invoices")).data, new RegExp(`${ok.number};`));
});

/* ---------- Arbeitsbereich, Zeiterfassung, Ausgaben, Berichte, Hilfe ---------- */
const ALL_AREAS = ["orders", "invoices", "customers", "tasks", "projects", "inventory", "calendar", "notes", "times", "expenses", "reports"];

test("Arbeitsbereich: Branche blendet Bereiche aus, Daten bleiben, nur Admins ändern", async () => {
  assert.deepEqual((await owner("GET", "/api/settings")).data.workspace.modules, ALL_AREAS);
  assert.equal((await member("PUT", "/api/settings", { workspace: { modules: ["tasks"] } })).status, 403);
  assert.equal((await owner("PUT", "/api/settings", { workspace: { modules: ["tasks", "gibtsnicht"] } })).status, 400);
  assert.equal((await owner("PUT", "/api/settings", { workspace: { industry: "raumfahrt" } })).status, 400);

  // Orders need the customer list, so it stays switched on.
  const forced = (await owner("PUT", "/api/settings", { workspace: { modules: ["orders"] } })).data.workspace;
  assert.deepEqual(forced.modules, ["orders", "customers"]);

  const set = (await owner("PUT", "/api/settings", { workspace: { industry: "organisation", modules: ["tasks", "projects", "calendar", "notes"] } })).data.workspace;
  assert.equal(set.industry, "organisation");
  const home = (await owner("GET", "/")).data;
  assert.match(home, /href="\/tasks"/);
  assert.doesNotMatch(home, /href="\/invoices"/);
  assert.doesNotMatch(home, /href="\/expenses"/);
  // Hidden areas keep their data.
  assert.ok((await owner("GET", "/api/invoices")).data.length > 0);

  await owner("PUT", "/api/settings", { workspace: { industry: "alles", modules: ALL_AREAS } });
  assert.match((await owner("GET", "/")).data, /href="\/invoices"/);
});

test("Erste Schritte: Branchenwahl, offene Schritte, ausblenden", async () => {
  const fresh = client();
  await fresh("POST", "/api/auth/register", { name: "Nora Neu", company: "Neustart UG", email: "nora@neustart.test", password: "sicheres-passwort" });
  assert.match((await fresh("GET", "/")).data, /Was für ein Betrieb sind Sie\?/);
  await fresh("PUT", "/api/settings", { workspace: { industry: "organisation", modules: ["tasks", "projects", "calendar", "notes"] } });
  let home = (await fresh("GET", "/")).data;
  assert.match(home, /Erste Schritte/);
  assert.match(home, /Erste Aufgabe anlegen/);
  assert.doesNotMatch(home, /Ersten Kunden anlegen/); // customers are switched off for this firm
  await fresh("PUT", "/api/settings", { workspace: { setupDismissed: true } });
  assert.doesNotMatch((await fresh("GET", "/")).data, /Erste Schritte/);
});

let ownTime, bossTime;
test("Zeiterfassung: eigene Einträge, Admin sieht alle, Prüfung der Zeiten", async () => {
  const day = plusDays(0);
  const mine = await member("POST", "/api/times", { date: day, kind: "arbeit", start: "08:00", end: "16:30", breakMinutes: 30, note: "Baustelle" });
  assert.equal(mine.status, 201);
  assert.equal(mine.data.minutes, 480);
  assert.equal(mine.data.userName, "Max");
  ownTime = mine.data;

  const me = (await owner("GET", "/api/auth/me")).data;
  const max = (await owner("GET", "/api/team")).data.find(m => m.email === "max@petersen.de");
  // A member cannot record time for someone else; an admin can.
  assert.equal((await member("POST", "/api/times", { date: day, start: "09:00", end: "10:00", userId: me.user.id })).status, 403);
  const forMax = await owner("POST", "/api/times", { date: day, kind: "urlaub", userId: max.id });
  assert.equal(forMax.data.userName, "Max");
  assert.equal(forMax.data.minutes, 0);
  bossTime = (await owner("POST", "/api/times", { date: day, start: "07:00" })).data;
  assert.equal(bossTime.running, true);
  assert.equal((await owner("POST", "/api/times", { date: day, start: "09:00", userId: "a".repeat(24) })).status, 400);

  assert.equal((await member("POST", "/api/times", { date: day, start: "10:00", end: "09:00" })).status, 400);
  assert.equal((await member("POST", "/api/times", { date: day, start: "25:00" })).status, 400);
  assert.equal((await member("POST", "/api/times", { date: "gestern", start: "08:00" })).status, 400);
  assert.equal((await member("POST", "/api/times", { date: day, start: "08:00", end: "09:00", breakMinutes: 90 })).status, 400);

  const seenByMember = (await member("GET", "/api/times")).data;
  assert.ok(seenByMember.length === 2 && seenByMember.every(t => t.userId === max.id));
  assert.equal((await owner("GET", "/api/times")).data.length, 3);
  for (const [method, body] of [["GET"], ["PATCH", { note: "x" }], ["DELETE"]])
    assert.equal((await member(method, `/api/times/${bossTime._id}`, body)).status, 403);
  const out = (await owner("PATCH", `/api/times/${bossTime._id}`, { end: "15:00", breakMinutes: 60 })).data;
  assert.equal(out.minutes, 420);
  assert.equal(out.running, false);

  const csv = (await member("GET", "/api/export/times")).data;
  assert.match(csv, /Max;Arbeit;08:00;16:30;30;8;Baustelle/);
  assert.doesNotMatch(csv, /07:00/);
  assert.match((await owner("GET", "/api/export/times")).data, /07:00;15:00;60;7/);
});

test("Ausgaben: Netto und Vorsteuer vom Server; Nur-lesen ändert nichts", async () => {
  const x = await member("POST", "/api/expenses", { date: plusDays(0), vendor: "Baumarkt Nord", category: "Material", gross: 119, vat: 19, reference: "B-77", paid: false });
  assert.equal(x.status, 201);
  assert.equal(x.data.net, 100);
  assert.equal(x.data.vatAmount, 19);
  assert.equal(x.data.paid, false);
  assert.equal((await member("POST", "/api/expenses", { date: plusDays(0), vendor: "X", gross: 10, vat: 16 })).status, 400);
  assert.equal((await member("POST", "/api/expenses", { date: plusDays(0), vendor: "", gross: 10 })).status, 400);
  assert.equal((await member("POST", "/api/expenses", { date: plusDays(0), vendor: "X", gross: -5 })).status, 400);
  const paid = (await member("PATCH", `/api/expenses/${x.data._id}`, { paid: true })).data;
  assert.equal(paid.paid, true);

  await owner("POST", "/api/team", { name: "Lea", email: "lea@petersen.de", password: "lea-passwort-12", role: "viewer" });
  await viewer("POST", "/api/auth/login", { email: "lea@petersen.de", password: "lea-passwort-12" });
  assert.equal((await viewer("POST", "/api/expenses", { date: plusDays(0), vendor: "X", gross: 1 })).status, 403);
  assert.equal((await viewer("GET", "/api/expenses")).data.length, 1);
  assert.match((await owner("GET", "/api/export/expenses")).data, /Baumarkt Nord;Material;;B-77;100;19;19;119;ja/);
});

test("Berichte: Umsatz, Ausgaben, Ergebnis und Zeiten passen zu den Daten", async () => {
  const issued = (await owner("GET", "/api/invoices")).data.filter(i => i.issued && i.issueDate.startsWith(String(YEAR)));
  const net = Math.round(issued.reduce((s, i) => s + i.totals.net, 0) * 100) / 100;
  const r = (await owner("GET", `/api/reports?year=${YEAR}`)).data;
  assert.equal(r.months.length, 12);
  assert.equal(r.totals.revenueNet, net);
  assert.equal(r.totals.expensesNet, 100);
  assert.equal(r.totals.vatIn, 19);
  assert.equal(r.totals.result, Math.round((net - 100) * 100) / 100);
  assert.deepEqual(r.categories, [{ name: "Material", net: 100 }]);
  assert.equal(r.totals.minutes, 480 + 420);
  assert.equal(r.people.length, 2);
  // Members only get their own working time.
  const own = (await member("GET", `/api/reports?year=${YEAR}`)).data;
  assert.equal(own.totals.minutes, 480);
  assert.deepEqual(own.people.map(p => p.name), ["Max"]);
  assert.equal((await owner("GET", "/api/reports?year=1800")).status, 400);
  assert.equal((await owner("GET", `/api/reports?year=${YEAR - 1}`)).data.totals.revenueNet, 0);
});

test("Hilfe: KI antwortet mit Anleitung als Wissen; ohne KI antwortet die Anleitung", async () => {
  const info = (await owner("GET", "/api/assistant?page=/invoices")).data;
  assert.equal(info.ai, true);
  assert.equal(info.local, true);
  assert.match(info.suggestions[0], /Rechnung/);

  // The panel shows plain text, so Markdown marks from the model are removed.
  aiStub.reply = "## Schritte\n\n1. Öffnen Sie **Rechnungen**.\n- Wählen Sie „Rechnung stellen“.";
  const a = await viewer("POST", "/api/assistant", { page: "/invoices", messages: [{ role: "user", content: "Wie stelle ich eine Rechnung?" }] });
  assert.equal(a.status, 200);
  assert.equal(a.data.source, "ai");
  assert.equal(a.data.answer, "Schritte\n\n1. Öffnen Sie Rechnungen.\n– Wählen Sie „Rechnung stellen“.");
  const sent = aiStub.last;
  assert.equal(sent.model, "test-modell");
  assert.equal(sent.messages.at(-1).content, "Wie stelle ich eine Rechnung?");
  const system = sent.messages[0].content;
  assert.match(system, /# Anleitung/);
  assert.match(system, /Rechnung schreiben und stellen/);
  // Only matching topics go out in full (free AI plans have tight token limits); the rest as titles.
  assert.match(system, /Weitere Themen der Anleitung/);
  assert.doesNotMatch(system, /Notizen werden beim Schreiben automatisch gespeichert/);
  assert.ok(system.length < 5000, `Systemtext zu lang: ${system.length}`);
  assert.match(system, /Aktuelle Seite: Rechnungen/);
  assert.match(system, /Rechnungen: \d+ offen/); // totals go to a model on the own machine …
  assert.doesNotMatch(system, /Hansen|Brodersen|hansen@example\.test/); // … but never names or addresses
  assert.doesNotMatch(system, /Lea|Petersen/); // not even the asking person or the firm

  // A "not covered" sentence stuck to the end of a real answer is dropped; on its own it stays.
  const askStub = async reply => { aiStub.reply = reply; return (await owner("POST", "/api/assistant", { messages: [{ role: "user", content: "Wie trage ich Urlaub ein?" }] })).data.answer; };
  assert.equal(await askStub("1. Zeiterfassung öffnen und auf „Eintrag“ klicken.\n2. „Speichern“ klicken.   Das beschreibt die Anleitung nicht."), "1. Zeiterfassung öffnen und auf „Eintrag“ klicken.\n2. „Speichern“ klicken.");
  assert.equal(await askStub("Das beschreibt die Anleitung nicht."), "Das beschreibt die Anleitung nicht.");

  assert.equal((await owner("POST", "/api/assistant", { messages: [] })).status, 400);
  assert.equal((await owner("POST", "/api/assistant", { messages: [{ role: "system", content: "x" }] })).status, 400);
  assert.equal((await anon("POST", "/api/assistant", { messages: [{ role: "user", content: "Hallo" }] })).status, 401);

  // Model down: the built-in manual answers and says so.
  aiStub.fail = true;
  const down = (await owner("POST", "/api/assistant", { messages: [{ role: "user", content: "Wie storniere ich eine Rechnung?" }] })).data;
  assert.equal(down.source, "manual");
  assert.match(down.notice, /nicht erreichbar/);
  assert.match(down.answer, /Stornorechnung/);
  aiStub.fail = false;

  // Firm switches the AI off: nothing is sent to the model.
  await owner("PUT", "/api/settings", { workspace: { ai: false } });
  aiStub.last = null;
  const manual = (await owner("POST", "/api/assistant", { messages: [{ role: "user", content: "Wie trage ich Urlaub ein?" }] })).data;
  assert.equal(manual.source, "manual");
  assert.match(manual.answer, /Zeiterfassung/);
  assert.equal(aiStub.last, null);
  assert.equal((await owner("GET", "/api/assistant")).data.ai, false);
  const none = (await owner("POST", "/api/assistant", { messages: [{ role: "user", content: "Quantenphysik Zebra" }] })).data;
  assert.match(none.answer, /steht nichts in der Anleitung/);
  await owner("PUT", "/api/settings", { workspace: { ai: true } });
});

/* ---------- Notizen mit Formatierung ---------- */
test("Notizen: Formatierung wird gespeichert, Fremdes wird entfernt oder abgelehnt", async () => {
  const t = (text, marks) => ({ type: "text", text, ...(marks ? { marks } : {}) });
  const doc = { type: "doc", content: [
    { type: "heading", attrs: { level: 1, textAlign: "center", onclick: "alert(1)" }, content: [t("Protokoll")] },
    { type: "paragraph", content: [
      t("fett", [{ type: "bold" }]), t(" rot ", [{ type: "textStyle", attrs: { color: "#E5484D", fontFamily: "Georgia, serif", fontSize: "18px" } }]),
      t("böse Farbe", [{ type: "textStyle", attrs: { color: "red;background:url(https://x.test/a)", fontSize: "expression(1)" } }]),
      t("Link", [{ type: "link", attrs: { href: "https://example.test/seite", target: "_self" } }]),
      t("Falle", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
    ] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [t("Punkt eins")] }] }] },
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [t("erledigt")] }] }] },
  ] };
  const made = await member("POST", "/api/notes", { headline: "Formatiert", doc });
  assert.equal(made.status, 201);
  const [head, para] = made.data.doc.content;
  assert.deepEqual(head.attrs, { level: 1, textAlign: "center" }); // unknown attribute dropped
  assert.deepEqual(para.content[1].marks[0].attrs, { color: "#E5484D", fontFamily: "Georgia, serif", fontSize: "18px" });
  assert.deepEqual(para.content[2].marks[0].attrs, { color: null, fontFamily: null, fontSize: null }); // unsafe values dropped
  assert.deepEqual(para.content[3].marks[0].attrs, { href: "https://example.test/seite", target: "_blank", rel: "noopener noreferrer nofollow", class: null });
  assert.equal(para.content[4].marks, undefined); // javascript: link removed, text stays
  assert.doesNotMatch(JSON.stringify(made.data.doc), /javascript:|onclick|expression|url\(/);
  // Plain text for search and CSV is derived on the server.
  assert.equal(made.data.text, "Protokoll\nfett rot böse FarbeLinkFalle\n– Punkt eins\n[x] erledigt");
  assert.match((await member("GET", "/api/search?q=punkt eins")).data.map(h => h.title).join(), /Formatiert/);

  for (const bad of [{ type: "doc", content: [{ type: "script", content: [t("x")] }] }, { type: "doc", content: [{ type: "paragraph", content: [t("x", [{ type: "iframe" }])] }] },
    { type: "paragraph" }, "<p>html</p>", { type: "doc", content: "nein" }])
    assert.equal((await member("POST", "/api/notes", { headline: "Böse", doc: bad })).status, 400);
  let deep = { type: "paragraph", content: [t("tief")] };
  for (let i = 0; i < 30; i++) deep = { type: "blockquote", content: [deep] };
  assert.equal((await member("POST", "/api/notes", { headline: "Tief", doc: { type: "doc", content: [deep] } })).status, 400);

  // Old plain-text notes keep working.
  const plain = (await member("POST", "/api/notes", { headline: "Alt", text: "# Titel\n- Punkt" })).data;
  assert.equal(plain.doc, null);
  assert.equal(plain.text, "# Titel\n- Punkt");
  assert.equal((await viewer("PATCH", `/api/notes/${made.data._id}`, { doc })).status, 403);
});

test("Notizen als PDF-Ansicht: nur eigene Notizen, mit Formatierung", async () => {
  const mine = (await member("GET", "/api/notes")).data;
  const rich = mine.find(n => n.headline === "Formatiert"), old = mine.find(n => n.headline === "Alt");
  const page = await member("GET", `/print/notes?ids=${rich._id},${old._id}`);
  assert.equal(page.status, 200);
  assert.match(page.data, /<title>Notizen \(2\) – Petersen GmbH<\/title>/);
  for (const re of [/Protokoll/, /color:#E5484D/i, /font-family:Georgia/, /Punkt eins/, /href="https:\/\/example\.test\/seite"/, /Titel/])
    assert.match(page.data, re);
  assert.doesNotMatch(page.data, /javascript:/);
  assert.match((await member("GET", `/print/notes?ids=${rich._id}`)).data, /<title>Notiz – Formatiert<\/title>/);

  // Another firm gets nothing, and so do unknown or malformed ids.
  const other = client();
  await other("POST", "/api/auth/register", { name: "Dritt", company: "Drittfirma", email: "dritt@x.de", password: "sicheres-passwort" });
  assert.equal((await other("GET", `/print/notes?ids=${rich._id}`)).status, 404);
  assert.equal((await member("GET", "/print/notes?ids=" + "a".repeat(24))).status, 404);
  assert.equal((await member("GET", "/print/notes?ids=../../etc")).status, 404);
  assert.ok([307, 308].includes((await anon("GET", `/print/notes?ids=${rich._id}`)).status));
});

/* ---------- Erweiterungen: Text in Aufträgen/Aufgaben, Verknüpfungen, Tabellen, Bilder, Druckansichten, Auswahl-Export ---------- */
test("Aufträge und Aufgaben: formatierte Beschreibung, Klartext wird abgeleitet", async () => {
  const t = (text, marks) => ({ type: "text", text, ...(marks ? { marks } : {}) });
  const doc = { type: "doc", content: [{ type: "paragraph", content: [t("Leistung: "), t("Bad komplett", [{ type: "bold" }])] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [t("Fliesen")] }] }] }] };
  const made = await owner("POST", "/api/orders", { title: "Bad formatiert", customerId: privCustomer._id, descriptionDoc: doc });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const order = made.data;
  assert.equal(order.description, "Leistung: Bad komplett\n– Fliesen");
  assert.equal(order.descriptionDoc.content[0].content[1].marks[0].type, "bold");
  const page = (await owner("GET", `/print/order/${order._id}`)).data;
  assert.match(page, /<strong>Bad komplett<\/strong>/);
  assert.equal((await owner("PATCH", `/api/orders/${order._id}`, { descriptionDoc: { type: "doc", content: [{ type: "script" }] } })).status, 400);
  const plain = (await owner("PATCH", `/api/orders/${order._id}`, { description: "nur Text" })).data;
  assert.equal(plain.descriptionDoc, null);

  const task = (await member("POST", "/api/tasks", { headline: "Formatiert", doc })).data;
  assert.equal(task.text, "Leistung: Bad komplett\n– Fliesen");
  assert.match((await member("GET", "/api/search?q=bad komplett")).data.map(h => h.title).join(), /Formatiert/);
  await owner("DELETE", `/api/orders/${order._id}`);
});

test("Notizen: Kunde und Auftrag verknüpfen, fremde ids abgelehnt, Löschen hebt Verknüpfung auf", async () => {
  const c = (await owner("POST", "/api/customers", { name: "Verknüpft GmbH", type: "firma" })).data;
  const o = (await owner("POST", "/api/orders", { title: "Mit Notiz", customerId: c._id })).data;
  const note = (await member("POST", "/api/notes", { headline: "Zum Kunden", customerId: c._id, orderId: o._id })).data;
  assert.equal(note.customerId, c._id);
  assert.equal(note.orderId, o._id);
  assert.equal((await member("POST", "/api/notes", { headline: "x", customerId: "a".repeat(24) })).status, 404);
  const other = client();
  const reg = await other("POST", "/api/auth/register", { name: "Fremd", company: "Fremdfirma", email: "fremd@x.de", password: "sicheres-passwort" });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  assert.equal((await other("POST", "/api/notes", { headline: "x", customerId: c._id })).status, 404);

  assert.equal((await owner("DELETE", `/api/orders/${o._id}`)).status, 200);
  assert.equal((await member("GET", `/api/notes/${note._id}`)).data.orderId, "");
  assert.equal((await owner("DELETE", `/api/customers/${c._id}`)).status, 200);
  const after = (await member("GET", `/api/notes/${note._id}`)).data;
  assert.equal(after.customerId, "");
  assert.equal(after.headline, "Zum Kunden"); // the note itself stays
});

test("Notizen: Tabellen und Bilder; externe Bilder und Skripte werden abgelehnt", async () => {
  const t = text => ({ type: "text", text });
  const cell = (type, text) => ({ type, attrs: { colspan: 1, rowspan: 1, colwidth: null, style: "x" }, content: [{ type: "paragraph", content: [t(text)] }] });
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const doc = { type: "doc", content: [
    { type: "table", content: [{ type: "tableRow", content: [cell("tableHeader", "Was"), cell("tableHeader", "Wer")] }, { type: "tableRow", content: [cell("tableCell", "Rohre"), cell("tableCell", "Max")] }] },
    { type: "image", attrs: { src: png, alt: "Foto Baustelle", width: 320, onerror: "alert(1)" } },
  ] };
  const n = (await member("POST", "/api/notes", { headline: "Tabelle", doc })).data;
  assert.equal(n.text, "Was | Wer\nRohre | Max\n[Bild: Foto Baustelle]");
  assert.deepEqual(n.doc.content[0].content[0].content[0].attrs, { colspan: 1, rowspan: 1, colwidth: null });
  assert.equal(n.doc.content[1].attrs.onerror, undefined);
  const page = (await member("GET", `/print/notes?ids=${n._id}`)).data;
  assert.match(page, /<th>.*Was.*<\/th>/s);
  assert.match(page, /<img src="data:image\/png;base64,/);
  for (const src of ["https://evil.test/a.png", "javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4="])
    assert.equal((await member("POST", "/api/notes", { headline: "Bild", doc: { type: "doc", content: [{ type: "image", attrs: { src } }] } })).status, 400);
});

test("Druckansichten: mehrere Rechnungen, Stundenzettel, Bestellliste, Kundenblatt", async () => {
  const issued = (await owner("GET", "/api/invoices")).data.filter(i => i.issued).slice(0, 2);
  const batch = await owner("GET", `/print/invoices?ids=${issued.map(i => i._id).join(",")}`);
  assert.equal(batch.status, 200);
  for (const i of issued) assert.match(batch.data, new RegExp(`Rechnung ${i.number}|Stornorechnung ${i.number}`));
  assert.equal((await stranger("GET", `/print/invoices?ids=${issued[0]._id}`)).status === 200, false);

  // Time sheet: members see their own, admins anyone; nobody sees other firms.
  const team = (await owner("GET", "/api/team")).data;
  const max = team.find(m => m.email === "max@petersen.de"), boss = team.find(m => m.role === "owner");
  const month = new Date().toISOString().slice(0, 7);
  const own = await member("GET", `/print/timesheet?month=${month}`);
  assert.equal(own.status, 200);
  assert.match(own.data, /Stundenzettel/);
  assert.match(own.data, /Max/);
  assert.match(own.data, /8:00(<!-- -->)? Std\./);
  assert.equal((await member("GET", `/print/timesheet?month=${month}&user=${boss.id}`)).status, 404);
  assert.equal((await owner("GET", `/print/timesheet?month=${month}&user=${max.id}`)).status, 200);

  // Order list: below minimum stock by default, chosen articles with ids.
  const p = (await owner("POST", "/api/products", { title: "Fitting 22 mm", stock: 2, minStock: 10, price: 3.5 })).data;
  const all = (await owner("GET", "/print/reorder")).data;
  assert.match(all, /Fitting 22 mm/);
  assert.match(all, /<b>18<\/b>/); // 2 × 10 − 2
  assert.match((await owner("GET", `/print/reorder?ids=${p._id}`)).data, /Ausgewählte Artikel/);

  const sheet = await owner("GET", `/print/customer/${privCustomer._id}`);
  assert.equal(sheet.status, 200);
  assert.match(sheet.data, /Kundenblatt|Familie Hansen/);
  assert.match(sheet.data, /Rechnungen \((<!-- -->)?\d+/);
  const other = client();
  await other("POST", "/api/auth/register", { name: "Blatt", company: "Blattfirma", email: "blatt@x.de", password: "sicheres-passwort" });
  assert.equal((await other("GET", `/print/customer/${privCustomer._id}`)).status, 404);
  assert.equal((await other("GET", "/print/reorder")).data.includes("Fitting"), false);
});

test("CSV-Export nur der ausgewählten Einträge", async () => {
  const list = (await owner("GET", "/api/expenses")).data;
  const extra = (await owner("POST", "/api/expenses", { date: new Date().toISOString().slice(0, 10), vendor: "Tankstelle Nord", gross: 50, vat: 19 })).data;
  const csv = (await owner("GET", `/api/export/expenses?ids=${extra._id}`)).data;
  assert.match(csv, /Tankstelle Nord/);
  for (const x of list) assert.doesNotMatch(csv, new RegExp(x.vendor));
  assert.match((await owner("GET", "/api/export/expenses")).data, /Baumarkt Nord/);
});

/* ---------- Kalender: Serien, Erinnerungen, Teilnehmer, Wecker, Abo ---------- */
test("Termine: Serie, Erinnerungen, Teilnehmer und Ausnahmen werden geprüft und gespeichert", async () => {
  const team = (await owner("GET", "/api/team")).data;
  const max = team.find(m => m.email === "max@petersen.de");
  const ev = await member("POST", "/api/events", {
    title: "Teamrunde", startDate: "2026-11-02T08:00:00.000Z", endDate: "2026-11-02T09:00:00.000Z", reminders: [15, 1440, 15], attendees: [max.id],
    recurrence: { freq: "weekly", interval: 1, byDay: [1, 3, 9], count: 6 }, description: "Wochenplanung", allDay: false,
  });
  assert.equal(ev.status, 201, JSON.stringify(ev.data));
  assert.deepEqual(ev.data.reminders, [1440, 15]);
  assert.deepEqual(ev.data.recurrence, { freq: "weekly", interval: 1, byDay: [1, 3], until: "", count: 6 });
  assert.deepEqual(ev.data.attendees, [max.id]);
  for (const bad of [{ reminders: [7] }, { reminders: [0, 5, 10, 15, 30, 60] }, { attendees: ["a".repeat(24)] }, { recurrence: { freq: "hourly" } },
    { recurrence: { freq: "daily", interval: 0 } }, { recurrence: { freq: "daily", until: "morgen" } }, { exdates: ["2.11.2026"] }])
    assert.equal((await member("PATCH", `/api/events/${ev.data._id}`, bad)).status, 400, JSON.stringify(bad));
  const ex = (await member("PATCH", `/api/events/${ev.data._id}`, { exdates: ["2026-11-04"] })).data;
  assert.deepEqual(ex.exdates, ["2026-11-04"]);
  const once = (await member("PATCH", `/api/events/${ev.data._id}`, { recurrence: null })).data;
  assert.equal(once.recurrence, null);
  await member("PATCH", `/api/events/${ev.data._id}`, { recurrence: { freq: "weekly", byDay: [1, 3], count: 6 } });

  // Another firm's people cannot be invited.
  const other = client();
  await other("POST", "/api/auth/register", { name: "Kal", company: "Kalenderfirma", email: "kal@x.de", password: "sicheres-passwort" });
  assert.equal((await other("POST", "/api/events", { title: "x", startDate: "2026-11-02T08:00:00.000Z", attendees: [max.id] })).status, 400);
});

test("Serientermine: Wochentage, Anzahl, Monatsende und Ausnahmen", async () => {
  const { occurrences, nextAlarm, describeRecurrence } = await import("../lib/calendar-shared.js");
  const ev = (start, recurrence, exdates = []) => ({ startDate: new Date(start).toISOString(), endDate: new Date(new Date(start).getTime() + 3600e3).toISOString(), recurrence, exdates });
  const keys = (e, a = "2026-01-01", b = "2027-12-31") => occurrences(e, new Date(a), new Date(b)).map(o => o.key);
  assert.deepEqual(keys(ev("2026-11-02T09:00:00", { freq: "weekly", interval: 1, byDay: [1, 3], count: 5 })), ["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11", "2026-11-16"]);
  assert.deepEqual(keys(ev("2026-11-02T09:00:00", { freq: "weekly", interval: 1, byDay: [1, 3], count: 5 }, ["2026-11-04"])), ["2026-11-02", "2026-11-09", "2026-11-11", "2026-11-16"]);
  assert.deepEqual(keys(ev("2026-10-31T08:00:00", { freq: "monthly", interval: 1, until: "2027-03-31" })), ["2026-10-31", "2026-12-31", "2027-01-31", "2027-03-31"]);
  assert.deepEqual(keys(ev("2024-02-29T08:00:00", { freq: "yearly", interval: 1 }), "2024-01-01", "2029-01-01"), ["2024-02-29", "2028-02-29"]);
  assert.deepEqual(keys(ev("2026-11-02T09:00:00", null)), ["2026-11-02"]);
  // Only what overlaps the window comes back.
  assert.equal(occurrences(ev("2026-01-01T09:00:00", { freq: "daily", interval: 1 }), new Date("2026-06-01T00:00:00"), new Date("2026-06-08T00:00:00")).length, 7);
  assert.equal(describeRecurrence({ freq: "weekly", interval: 2, byDay: [1, 3], until: "2026-12-31" }), "Alle 2 Wochen am Mo, Mi · bis 31.12.2026");
  assert.equal(nextAlarm({ enabled: true, time: "06:30", days: [1, 2, 3, 4, 5] }, new Date("2026-11-21T20:00:00")).getDate(), 23); // Saturday evening → Monday
  assert.equal(nextAlarm({ enabled: false, time: "06:30", days: [1] }), null);
  assert.equal(nextAlarm({ enabled: true, time: "06:30", days: [], date: "2020-01-01" }), null);
});

test("Wecker: nur für die eigene Person sichtbar, auch nicht für Admins", async () => {
  const mine = await member("POST", "/api/alarms", { label: "Material abholen", time: "06:30", days: [1, 2, 3, 4, 5], sound: "digital" });
  assert.equal(mine.status, 201, JSON.stringify(mine.data));
  assert.equal(mine.data.userName, "Max");
  for (const bad of [{ time: "25:00", days: [1] }, { time: "07:00", days: [] }, { time: "07:00", days: [1], sound: "laut" }, { time: "", days: [1] }])
    assert.equal((await member("POST", "/api/alarms", bad)).status, 400, JSON.stringify(bad));
  assert.equal((await member("POST", "/api/alarms", { time: "07:00", days: [], date: "2026-12-24" })).status, 201);
  assert.equal((await member("GET", "/api/alarms")).data.length, 2);
  assert.equal((await owner("GET", "/api/alarms")).data.length, 0); // the owner is admin, but alarms are private
  for (const [method, body] of [["GET"], ["PATCH", { enabled: false }], ["DELETE"]])
    assert.equal((await owner(method, `/api/alarms/${mine.data._id}`, body)).status, 403);
  const me = (await owner("GET", "/api/auth/me")).data;
  const team = (await owner("GET", "/api/team")).data;
  assert.equal((await owner("POST", "/api/alarms", { time: "07:00", days: [1], userId: team.find(m => m.email === "max@petersen.de").id })).status, 403);
  assert.ok(me.user.id);
  assert.equal((await member("PATCH", `/api/alarms/${mine.data._id}`, { enabled: false })).data.enabled, false);
});

test("Kalender-Abo: Serien, Ausnahmen, ganztägige Termine und Erinnerungen als Alarm", async () => {
  await owner("POST", "/api/events", { title: "Betriebsurlaub", allDay: true, startDate: new Date("2026-12-23T00:00:00+01:00").toISOString(), endDate: new Date("2026-12-31T23:59:00+01:00").toISOString() });
  const { token } = (await owner("POST", "/api/ical")).data;
  const ics = (await anon("GET", `/api/ical/${token}.ics`)).data;
  assert.match(ics, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Berlin/);
  assert.match(ics, /DTSTART;TZID=Europe\/Berlin:20261102T090000/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6/);
  assert.match(ics, /EXDATE;TZID=Europe\/Berlin:20261104T090000/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.match(ics, /TRIGGER:-PT15M/);
  assert.match(ics, /DESCRIPTION:Wochenplanung/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261223\r\nDTEND;VALUE=DATE:20270101/);
});

/* ---------- Web Push ---------- */
const { createECDH, randomBytes: rnd } = await import("node:crypto");
const ece = (await import("http_ece")).default;
// A fake device: its key pair decrypts what the push service receives, exactly like a browser would.
function device(name) {
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  const auth = rnd(16);
  return {
    sub: { endpoint: `http://127.0.0.1:${PUSH_PORT}/push/${name}`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } },
    read: msg => JSON.parse(ece.decrypt(msg.body, { version: "aes128gcm", privateKey: ecdh, authSecret: auth }).toString("utf8")),
  };
}
const waitFor = async (check, ms = 6000) => { for (let t = 0; t < ms; t += 200) { const hit = check(); if (hit) return hit; await new Promise(r => setTimeout(r, 200)); } return null; };
const maxPhone = device("max");

test("Push: Gerät anmelden, nur echte Push-Dienste, verschlüsselte Test-Nachricht", async () => {
  const info = (await member("GET", "/api/push")).data;
  assert.match(info.publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.equal(info.devices, 0);
  for (const bad of [{ subscription: { ...maxPhone.sub, endpoint: "https://evil.test/collect" } }, { subscription: { ...maxPhone.sub, endpoint: "http://192.168.0.10/x" } },
    { subscription: { endpoint: maxPhone.sub.endpoint, keys: { p256dh: "kurz", auth: "x" } } }, {}])
    assert.equal((await member("POST", "/api/push", bad)).status, 400, JSON.stringify(bad).slice(0, 80));
  assert.equal((await member("POST", "/api/push", { subscription: maxPhone.sub })).status, 200);
  assert.equal((await member("POST", "/api/push", { subscription: maxPhone.sub })).data.devices, 1); // same device again: still one
  assert.equal((await anon("POST", "/api/push", { subscription: maxPhone.sub })).status, 401);

  pushed.length = 0;
  assert.equal((await member("POST", "/api/push/test")).data.sent, 1);
  const msg = await waitFor(() => pushed.find(p => p.path === "/push/max"));
  assert.ok(msg, "Push-Dienst hat nichts erhalten");
  assert.equal(msg.headers["content-encoding"], "aes128gcm");
  assert.match(msg.headers.authorization, /^vapid t=.+, k=/);
  assert.ok(Number(msg.headers.ttl) > 0);
  assert.equal(maxPhone.read(msg).title, "Nahtbord");
  assert.equal((await owner("POST", "/api/push/test")).status, 409); // the owner has no device
});

test("Push: fällige Erinnerung und Wecker gehen nur an die betroffene Person, einmal", async () => {
  const team = (await owner("GET", "/api/team")).data;
  const boss = team.find(m => m.role === "owner");
  pushed.length = 0;
  const start = new Date(Date.now() - 5000);
  await member("POST", "/api/events", { title: "Push-Termin Max", startDate: start.toISOString(), endDate: new Date(start.getTime() + 1800000).toISOString(), reminders: [0], location: "Lager" });
  await owner("POST", "/api/events", { title: "Nur Chef", startDate: start.toISOString(), endDate: new Date(start.getTime() + 1800000).toISOString(), reminders: [0], attendees: [boss.id] });
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  await member("POST", "/api/alarms", { label: "Push-Wecker", time, days: [], date: today });

  const titles = () => pushed.filter(p => p.path === "/push/max").map(p => maxPhone.read(p));
  assert.ok(await waitFor(() => titles().some(m => m.title === "Push-Termin Max") && titles().some(m => m.title === "⏰ Push-Wecker")), JSON.stringify(titles()));
  const ev = titles().find(m => m.title === "Push-Termin Max");
  assert.match(ev.body, /Lager \(Zum Beginn\)/);
  assert.match(ev.url, /^\/calendar\?open=/);
  assert.equal(titles().find(m => m.title === "⏰ Push-Wecker").alarm, true);
  assert.ok(!titles().some(m => m.title === "Nur Chef")); // Max is not invited
  await new Promise(r => setTimeout(r, 2500)); // two more scheduler runs: nothing is sent twice
  assert.equal(titles().filter(m => m.title === "Push-Termin Max").length, 1);
  assert.equal(titles().filter(m => m.title === "⏰ Push-Wecker").length, 1);
});

test("Push: abgelaufene Geräte werden entfernt, Abmelden stoppt Push", async () => {
  const old = device("gone");
  await member("POST", "/api/push", { subscription: old.sub });
  assert.equal((await member("GET", "/api/push")).data.devices, 2);
  await member("POST", "/api/push/test");
  assert.equal((await member("GET", "/api/push")).data.devices, 1); // the push service answered 410 Gone
  assert.equal((await member("DELETE", "/api/push", { endpoint: maxPhone.sub.endpoint })).data.removed, 1);
  assert.equal((await member("GET", "/api/push")).data.devices, 0);
  assert.equal((await member("POST", "/api/push/test")).status, 409);
});
