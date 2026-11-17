import "server-only";
import { HttpError } from "./db";
import { TOPICS, searchHelp } from "./help";
import { getWorkspace } from "./workspace";
import { overview } from "./overview";
import { MODULES } from "./workspace-shared";

// The AI help talks to any OpenAI-compatible endpoint (Ollama on the own server, Groq, OpenRouter, Gemini …).
// Without AI_BASE_URL and AI_MODEL the help answers from the built-in manual only.
const config = () => ({
  base: (process.env.AI_BASE_URL || "").replace(/\/+$/, ""),
  model: process.env.AI_MODEL || "",
  key: process.env.AI_API_KEY || "",
  timeout: Math.min(180, Math.max(5, Number(process.env.AI_TIMEOUT_SECONDS) || 45)) * 1000,
  effort: process.env.AI_REASONING_EFFORT || "", // "low" keeps reasoning models (e.g. gpt-oss on Groq) short and fast
});

// A model on the own machine or network: nothing leaves the house.
function isLocal(base) {
  try {
    const host = new URL(base).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || host === "host.docker.internal" || host.endsWith(".local") || host.endsWith(".internal")
      || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  } catch { return false; }
}

export function aiStatus() {
  const { base, model, key } = config();
  // A provider on the internet needs a key; a model on the own machine (Ollama) does not.
  const configured = !!base && !!model && (!!key || isLocal(base));
  return { configured, model: configured ? model : "", local: configured && isLocal(base) };
}

const ROLE = { owner: "Inhaber", admin: "Admin", member: "Mitarbeiter", viewer: "Nur lesen" };
const money = n => (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

// Totals only – no names, addresses or texts. Sent to a local model, or to a provider only if AI_SHARE_FIGURES=1.
function figures(org, modules) {
  const o = overview(org), on = id => modules.includes(id), lines = [];
  if (on("tasks")) lines.push(`Aufgaben: ${o.counts.open} offen, davon ${o.counts.overdue} überfällig.`);
  if (on("orders")) lines.push(`Aufträge: ${o.orders.requests.count} Anfragen, ${o.orders.offers.count} offene Angebote, ${o.orders.active.count} beauftragt oder in Arbeit, ${o.orders.toBill.count} abzurechnen (${money(o.orders.toBill.value)}).`);
  if (on("invoices")) lines.push(`Rechnungen: ${o.invoices.open.count} offen (${money(o.invoices.open.value)}), davon ${o.invoices.overdue.count} überfällig (${money(o.invoices.overdue.value)}), ${o.invoices.drafts} Entwürfe.`);
  if (on("inventory")) lines.push(`Inventar: ${o.counts.products} Artikel, ${o.counts.lowStock} unter Mindestbestand.`);
  return lines.join("\n");
}

// Only the manual topics that fit the conversation are sent in full, the rest as titles.
// That keeps a request small enough for the tight token limits of free AI plans.
function systemPrompt(session, modules, page, withFigures, asked) {
  const areas = MODULES.filter(m => modules.includes(m[0])).map(m => m[2]).join(", ");
  const visible = TOPICS.filter(t => !t.module || modules.includes(t.module));
  const here = MODULES.find(m => m[2] === page)?.[0];
  let chosen = searchHelp(asked, modules).slice(0, 5);
  if (!chosen.length) chosen = visible.filter(t => (here ? t.module === here : ["start", "search", "areas"].includes(t.id))).slice(0, 4);
  const others = visible.filter(t => !chosen.includes(t)).map(t => t.title).join(" · ");
  const manual = chosen.map(t => `## ${t.title}\n${t.text}`).join("\n\n") + (others ? `\n\n## Weitere Themen der Anleitung (hier nur die Titel)\n${others}` : "");
  return [
    "Du bist die eingebaute Hilfe von Nahtbord, einer Software für kleine und mittlere Betriebe (Kunden, Aufträge, Rechnungen, Aufgaben, Lager, Zeiten, Ausgaben).",
    "Antworte auf Deutsch in der Sie-Form. Keine Anrede, keine Grußformel, kein Schlusssatz. Höchstens 120 Wörter.",
    "Schreibe reinen Text ohne Markdown: keine Sternchen, keine Überschriften. Mehrere Schritte als nummerierte Zeilen (1., 2., 3.).",
    "Verwende nur Menüpunkte, Knöpfe und Abläufe, die wörtlich in der Anleitung unten stehen. Erfinde keine Menüpfade, Knöpfe, Beispielnummern oder Funktionen und ergänze keine Schritte aus eigenem Wissen.",
    "Nur wenn die Anleitung die Frage gar nicht beantwortet, besteht deine ganze Antwort aus dem Satz „Das beschreibt die Anleitung nicht.“ Hänge diesen Satz niemals an eine Antwort an und rate nicht.",
    "Du kannst nichts in Nahtbord ändern, sondern nur erklären. Bei Steuer- und Rechtsfragen gibst du eine kurze Orientierung und verweist auf die Steuerberatung.",
    // No name is sent: the model does not need it, and it would only invite a salutation.
    `Rolle der fragenden Person: ${ROLE[session.role]}. Sichtbare Bereiche der Firma: Übersicht, ${areas}, Verwaltung.${page ? ` Aktuelle Seite: ${page}.` : ""}`,
    withFigures ? `Aktuelle Zahlen der Firma (nur Summen):\n${withFigures}` : "",
    `# Anleitung\n\n${manual}`,
  ].filter(Boolean).join("\n\n");
}

// Answer from the manual alone: best topic in full, further matches as links.
function manualAnswer(question, modules) {
  const hits = searchHelp(question, modules);
  if (!hits.length) {
    const basics = TOPICS.filter(t => ["start", "search", "areas"].includes(t.id));
    return { answer: "Dazu steht nichts in der Anleitung. Versuchen Sie es mit anderen Worten oder wählen Sie eines der Themen.", links: basics.map(t => ({ title: t.title, href: t.href })) };
  }
  const [best, ...rest] = hits;
  return { answer: `${best.title}\n\n${best.text}`, links: [best, ...rest.slice(0, 2)].map(t => ({ title: t === best ? `Öffnen: ${t.title}` : t.title, href: t.href, topic: t === best ? undefined : t.title })) };
}

// The help panel shows plain text, so Markdown marks a model adds anyway are removed.
const NOT_COVERED = /\s*Das beschreibt die Anleitung nicht\.\s*$/;
// Small models sometimes add the "not covered" sentence after a real answer; then it is dropped.
const plain = text => text.replace(/[ \t]+$/gm, "").replace(NOT_COVERED, (m, i) => (i > 40 ? "" : m)).replace(/\*\*(.+?)\*\*/gs, "$1").replace(/__(.+?)__/gs, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^(\s*)[*-]\s+/gm, "$1– ").replace(/`([^`\n]+)`/g, "$1").replace(/\n{3,}/g, "\n\n").trim();

// Simple per-person limit so a free AI quota is not used up by one browser tab.
const hits = new Map();
function throttle(userId) {
  const now = Date.now(), list = (hits.get(userId) || []).filter(t => now - t < 10 * 60000);
  if (list.length >= 40) throw new HttpError(429, "Zu viele Fragen in kurzer Zeit. Bitte in ein paar Minuten noch einmal versuchen.");
  list.push(now); hits.set(userId, list);
}

function cleanMessages(input) {
  if (!Array.isArray(input) || !input.length) throw new HttpError(400, "Bitte eine Frage eingeben.");
  const messages = input.slice(-12).map(m => {
    if (!m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string") throw new HttpError(400, "Ungültige Anfrage.");
    return { role: m.role, content: m.content.trim().slice(0, 2000) };
  }).filter(m => m.content);
  if (!messages.length || messages.at(-1).role !== "user") throw new HttpError(400, "Bitte eine Frage eingeben.");
  return messages;
}

export async function ask(session, { messages: input, page }) {
  const messages = cleanMessages(input);
  throttle(session.user.id);
  const org = session.org.id, ws = getWorkspace(org), { base, model, key, timeout, effort } = config();
  const question = messages.at(-1).content;
  const manual = manualAnswer(question, ws.modules);
  if (!aiStatus().configured || !ws.ai) return { source: "manual", ...manual };
  // Follow-up questions ("und wie storniere ich sie?") keep the topics of the earlier questions.
  const asked = messages.filter(m => m.role === "user").slice(-3).map(m => m.content).join(" ");

  const pageName = typeof page === "string" ? (MODULES.find(m => page.startsWith(m[1]))?.[2] || (page.startsWith("/admin") ? "Verwaltung" : "Übersicht")) : "";
  const share = isLocal(base) || process.env.AI_SHARE_FIGURES === "1";
  try {
    const res = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 1000, ...(effort ? { reasoning_effort: effort } : {}),
        messages: [{ role: "system", content: systemPrompt(session, ws.modules, pageName, share ? figures(org, ws.modules) : "", asked) }, ...messages] }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`KI-Dienst antwortet mit ${res.status}`);
    const answer = (await res.json())?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) throw new Error("KI-Dienst lieferte keine Antwort");
    return { source: "ai", answer: plain(answer).slice(0, 6000), links: searchHelp(question, ws.modules).slice(0, 2).map(t => ({ title: `Öffnen: ${t.title}`, href: t.href })) };
  } catch (error) {
    console.error("KI-Hilfe:", error.message);
    // The manual still answers when the model is offline, slow or over its free quota.
    return { source: "manual", notice: "Die KI ist gerade nicht erreichbar – Antwort aus der Anleitung.", ...manual };
  }
}

// Suggested questions for the page the person is on.
export function suggestions(org, page = "") {
  const modules = getWorkspace(org).modules;
  const visible = TOPICS.filter(t => !t.module || modules.includes(t.module));
  const here = MODULES.find(m => page.startsWith(m[1]))?.[0];
  const first = visible.filter(t => (here ? t.module === here : ["start", "areas", "team"].includes(t.id)));
  return [...first, ...visible.filter(t => !first.includes(t))].slice(0, 5).map(t => t.title);
}
