// Formatted note text, used by server and browser.
// A note is stored as a document tree (the editor's JSON), never as HTML. The server only accepts the
// node types, marks and attribute values listed here, so a note can never carry script or foreign markup.

export const FONTS = [["", "Standardschrift"], ["Arial, Helvetica, sans-serif", "Arial"], ["Verdana, Geneva, sans-serif", "Verdana"], ["Georgia, serif", "Georgia"],
  ["'Times New Roman', Times, serif", "Times New Roman"], ["'Courier New', Courier, monospace", "Courier New"], ["'Comic Sans MS', 'Comic Sans', cursive", "Comic Sans"]];
export const SIZES = [["", "Normal"], ["12px", "12"], ["14px", "14"], ["16px", "16"], ["18px", "18"], ["22px", "22"], ["28px", "28"], ["36px", "36"]];
// Mid-tone colours that stay readable on the dark and the light design.
export const TEXT_COLORS = [["#E5484D", "Rot"], ["#F08A24", "Orange"], ["#D9A520", "Gold"], ["#2FA36B", "Grün"], ["#1FA3A3", "Türkis"], ["#3B82F6", "Blau"], ["#8B5CF6", "Violett"], ["#E24C9B", "Pink"], ["#8A8F98", "Grau"]];
export const MARKER_COLORS = [["rgba(250,204,21,.42)", "Gelb"], ["rgba(74,222,128,.36)", "Grün"], ["rgba(96,165,250,.38)", "Blau"], ["rgba(244,114,182,.38)", "Rosa"], ["rgba(251,146,60,.42)", "Orange"]];

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?(\s*[,\s]\s*[\d.]+%?){2}(\s*[,/]\s*[\d.]+%?)?\s*\))$/i;
const FONT = /^[\w\s,'"-]{1,90}$/;
const SIZE = /^\d{1,3}(\.\d{1,2})?(px|pt|em|rem|%)$/;
const HREF = /^(https?:\/\/|mailto:|tel:)[^\s<>"]{1,2000}$/i;
// Pictures are stored inside the note as small data URLs (the editor shrinks them before inserting).
const IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGE = 1500000;
const span = v => (Number.isInteger(v) && v >= 1 && v <= 50 ? v : 1);
const widths = v => (Array.isArray(v) && v.length <= 50 && v.every(w => Number.isInteger(w) && w >= 20 && w <= 3000) ? v : null);
const cell = a => ({ colspan: span(a.colspan), rowspan: span(a.rowspan), colwidth: widths(a.colwidth) });
const short = (v, max) => (typeof v === "string" && v.length <= max ? v : null);
const ALIGN = ["left", "center", "right", "justify"];
const pick = (value, ok) => (typeof value === "string" && ok(value) ? value : null);

// Attributes each node may keep; everything else is dropped.
const NODES = {
  doc: () => ({}),
  paragraph: a => ({ textAlign: pick(a.textAlign, v => ALIGN.includes(v)) }),
  heading: a => ({ level: [1, 2, 3].includes(a.level) ? a.level : 2, textAlign: pick(a.textAlign, v => ALIGN.includes(v)) }),
  bulletList: () => ({}),
  orderedList: a => ({ start: Number.isInteger(a.start) && a.start > 0 && a.start < 100000 ? a.start : 1, type: pick(a.type, v => ["a", "A", "i", "I", "1"].includes(v)) }),
  listItem: () => ({}),
  taskList: () => ({}),
  taskItem: a => ({ checked: a.checked === true }),
  blockquote: () => ({}),
  horizontalRule: () => ({}),
  hardBreak: () => ({}),
  text: () => ({}),
  table: () => ({}),
  tableRow: () => ({}),
  tableHeader: cell,
  tableCell: cell,
  image: a => {
    if (typeof a.src !== "string" || a.src.length > MAX_IMAGE || !IMAGE.test(a.src)) throw new Error("Bild ungültig oder zu groß (höchstens etwa 1 MB).");
    const size = v => (Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= 4000 ? Math.round(Number(v)) : null);
    return { src: a.src, alt: short(a.alt, 300), title: short(a.title, 300), width: size(a.width), height: size(a.height) };
  },
};
// A mark with a null result is removed (e.g. a link that does not start with http, mailto or tel).
const MARKS = {
  bold: () => ({}), italic: () => ({}), underline: () => ({}), strike: () => ({}), code: () => ({}),
  highlight: a => ({ color: pick(a.color, v => COLOR.test(v)) }),
  textStyle: a => ({ color: pick(a.color, v => COLOR.test(v)), fontFamily: pick(a.fontFamily, v => FONT.test(v)), fontSize: pick(a.fontSize, v => SIZE.test(v)) }),
  link: a => (pick(a.href, v => HREF.test(v)) ? { href: a.href, target: "_blank", rel: "noopener noreferrer nofollow", class: null } : null),
};

// Returns a clean copy of the document or throws an Error with a message for the user.
export function cleanDoc(input) {
  if (!input || typeof input !== "object" || input.type !== "doc") throw new Error("Notiztext ungültig.");
  let count = 0;
  const node = (n, depth) => {
    if (!n || typeof n !== "object" || Array.isArray(n) || !Object.hasOwn(NODES, n.type)) throw new Error("Notiztext enthält ein nicht erlaubtes Element.");
    if (depth > 24 || ++count > 20000) throw new Error("Notiztext ist zu lang oder zu tief verschachtelt.");
    const attrs = NODES[n.type](n.attrs && typeof n.attrs === "object" ? n.attrs : {});
    const out = { type: n.type, ...(Object.keys(attrs).length ? { attrs } : {}) };
    if (n.type === "text") {
      if (typeof n.text !== "string" || !n.text) throw new Error("Notiztext ungültig.");
      out.text = n.text;
      const marks = (Array.isArray(n.marks) ? n.marks : []).map(m => {
        if (!m || typeof m !== "object" || !Object.hasOwn(MARKS, m.type)) throw new Error("Notiztext enthält eine nicht erlaubte Formatierung.");
        const a = MARKS[m.type](m.attrs && typeof m.attrs === "object" ? m.attrs : {});
        return a && { type: m.type, ...(Object.keys(a).length ? { attrs: a } : {}) };
      }).filter(Boolean);
      if (marks.length) out.marks = marks;
    } else if (n.content !== undefined) {
      if (!Array.isArray(n.content)) throw new Error("Notiztext ungültig.");
      out.content = n.content.map(c => node(c, depth + 1));
    }
    return out;
  };
  const doc = node(input, 0);
  if (JSON.stringify(doc).length > 6000000) throw new Error("Der Text ist zu lang oder enthält zu viele Bilder.");
  return doc;
}

// Plain text of a document: one line per block. Used for search, the CSV export and the calendar of old clients.
export function docText(doc) {
  const lines = [];
  const inline = n => (n.type === "text" ? n.text : n.type === "hardBreak" ? "\n" : (n.content || []).map(inline).join(""));
  const walk = (n, prefix = "") => {
    if (["paragraph", "heading"].includes(n.type)) { const t = inline(n); if (t.trim()) lines.push(prefix + t); }
    else if (n.type === "taskItem") (n.content || []).forEach((c, i) => walk(c, i ? "  " : n.attrs?.checked ? "[x] " : "[ ] "));
    else if (n.type === "listItem") (n.content || []).forEach((c, i) => walk(c, i ? "  " : "– "));
    else if (n.type === "tableRow") { const t = (n.content || []).map(c => (c.content || []).map(inline).join(" ").trim()).join(" | ").replace(/(\s*\|\s*)+$/, ""); if (t.replace(/[\s|]/g, "")) lines.push(prefix + t); }
    else if (n.type === "image") { if (n.attrs?.alt) lines.push(prefix + "[Bild: " + n.attrs.alt + "]"); }
    else (n.content || []).forEach(c => walk(c, prefix));
  };
  walk(doc);
  return lines.join("\n").slice(0, 100000);
}

// Older notes were written in a small Markdown dialect; they open as a formatted document.
export function markdownToDoc(text = "") {
  const inline = line => line.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g).filter(Boolean).map(part => {
    const mark = part.startsWith("**") && part.endsWith("**") && part.length > 4 ? ["bold", 2] : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? ["code", 1]
      : part.startsWith("_") && part.endsWith("_") && part.length > 2 ? ["italic", 1] : null;
    return mark ? { type: "text", text: part.slice(mark[1], -mark[1]), marks: [{ type: mark[0] }] } : { type: "text", text: part };
  });
  const para = line => ({ type: "paragraph", ...(line.trim() ? { content: inline(line) } : {}) });
  const content = [];
  for (const line of String(text).split("\n")) {
    const item = line.match(/^\s*[-*]\s+(\[( |x)\]\s+)?(.*)/i);
    const head = line.match(/^(#{1,3})\s+(.*)/);
    if (item) {
      const kind = item[1] ? "taskList" : "bulletList";
      if (content.at(-1)?.type !== kind) content.push({ type: kind, content: [] });
      content.at(-1).content.push(item[1] ? { type: "taskItem", attrs: { checked: item[2].toLowerCase() === "x" }, content: [para(item[3])] } : { type: "listItem", content: [para(item[3])] });
    } else if (head) content.push({ type: "heading", attrs: { level: head[1].length }, content: inline(head[2]) });
    else if (line.trim()) content.push(para(line));
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

// Templates for new notes (Notizen → „Vorlage“).
const T = text => ({ type: "text", text });
const P = text => ({ type: "paragraph", ...(text ? { content: [T(text)] } : {}) });
const H = (level, text) => ({ type: "heading", attrs: { level }, content: [T(text)] });
const TASKS = items => ({ type: "taskList", content: items.map(t => ({ type: "taskItem", attrs: { checked: false }, content: [P(t)] })) });
const TABLE = (head, rows) => ({ type: "table", content: [
  { type: "tableRow", content: head.map(h => ({ type: "tableHeader", content: [P(h)] })) },
  ...Array.from({ length: rows }, () => ({ type: "tableRow", content: head.map(() => ({ type: "tableCell", content: [P("")] })) })),
] });
export const TEMPLATES = [
  ["protokoll", "Besprechungsprotokoll", () => ({ type: "doc", content: [P("Datum: … · Ort: … · Teilnehmer: …"), H(2, "Themen"), { type: "orderedList", content: [{ type: "listItem", content: [P("")] }] },
    H(2, "Ergebnisse"), P(""), H(2, "Aufgaben"), TABLE(["Was", "Wer", "Bis wann"], 3)] })],
  ["baustelle", "Baustellenbericht", () => ({ type: "doc", content: [P("Datum: … · Baustelle: … · Wetter: …"), H(2, "Ausgeführte Arbeiten"), { type: "bulletList", content: [{ type: "listItem", content: [P("")] }] },
    H(2, "Personal und Stunden"), TABLE(["Name", "Von", "Bis", "Stunden"], 2), H(2, "Material"), TABLE(["Material", "Menge"], 2), H(2, "Besonderheiten / Mängel"), P(""), H(2, "Fotos"), P("Fotos über das Bild-Symbol einfügen.")] })],
  ["uebergabe", "Übergabeprotokoll", () => ({ type: "doc", content: [P("Kunde: … · Objekt: … · Datum: …"), H(2, "Übergeben"), TASKS(["Arbeiten vollständig ausgeführt", "Funktion vorgeführt", "Unterlagen und Anleitungen übergeben", "Baustelle gereinigt"]),
    H(2, "Restarbeiten / Mängel"), TABLE(["Punkt", "Erledigen bis"], 2), H(2, "Unterschriften"), P("Auftraggeber: ______________________    Auftragnehmer: ______________________")] })],
  ["checkliste", "Checkliste", () => ({ type: "doc", content: [TASKS(["", "", ""])] })],
  ["telefon", "Telefonnotiz", () => ({ type: "doc", content: [P("Anrufer: … · Telefon: … · Zeit: …"), H(2, "Anliegen"), P(""), H(2, "Rückruf / Nächster Schritt"), TASKS([""])] })],
];
