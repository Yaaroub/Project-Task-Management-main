// Fills an empty database with demo data. Usage: npm run seed
// Demo data goes into the database of SEED_ORG_ID, else the first firm, else it waits for the first registration.
import { randomBytes } from "node:crypto";
import { openTarget } from "./storage.mjs";

const target = openTarget(process.env.SEED_ORG_ID);
const { db } = target;
const file = target.file;
const existing = target.org
  ? db.prepare("SELECT COUNT(*) AS n FROM documents WHERE collection IN ('todos','projects')").get().n
  : db.prepare("SELECT COUNT(*) AS n FROM documents WHERE collection IN ('todos','projects') AND org IS NULL").get().n;
if (existing > 0) {
  console.log("Datenbank enthält bereits Daten – nichts geändert.");
  process.exit(0);
}

const id = () => randomBytes(12).toString("hex");
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const at = (n, h) => { const d = new Date(Date.now() + n * 86400000); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const now = new Date().toISOString();
const put = (collection, doc) => { const _id = id(); target.insert(collection, _id, JSON.stringify({ _id, createdAt: now, updatedAt: now, ...doc })); return _id; };

const web = put("projects", { name: "Website Heizung & Sanitär", description: "Neue Website mit Online-Terminbuchung.", color: "fjord", archived: false, deadline: day(21) });
const net = put("projects", { name: "WLAN Kanzlei am Markt", description: "Netzwerk prüfen, Mesh einrichten, Gäste-WLAN trennen.", color: "brass", archived: false, deadline: day(9) });
const meta = (priority, dueDate, extra = {}) => ({ priority, labels: [], assignee: "", dueDate, subtasks: [], comments: [], storyPoints: 0, ...extra });
const task = (headline, status, projectId, m, extra = {}) => put("todos", {
  headline, text: "", status, isDone: status === "done", isProgressing: status === "doing", projectId, meta: m, timeSpent: 0, ...extra,
  ...(status === "done" ? { completedAt: at(-Math.floor(Math.random() * 10), 12) } : {}),
});
task("Startseite gestalten", "doing", web, meta("Hoch", day(2), { labels: ["Design"], assignee: "Yarob", subtasks: [{ id: "1", title: "Hero-Text", done: true }, { id: "2", title: "Bilder auswählen", done: false }] }), { timeSpent: 95 });
task("Buchungsformular anbinden", "todo", web, meta("Kritisch", day(-1), { labels: ["Backend"] }));
task("Impressum & Datenschutz", "review", web, meta("Mittel", day(5)));
task("Domain umziehen", "done", web, meta("Mittel", day(-3)));
task("Router-Firmware aktualisieren", "done", net, meta("Hoch", day(-2)));
task("Access Points montieren", "todo", net, meta("Mittel", day(4), { assignee: "Yarob" }));
task("Gäste-WLAN einrichten", "todo", net, meta("Niedrig", day(8)));
task("Angebot für Hof Brodersen schreiben", "todo", "", meta("Hoch", day(1), { labels: ["Vertrieb"] }));

const product = (title, category, price, stock, minStock) => put("products", {
  title, category, price, taxes: Math.round(price * 0.19 * 100) / 100, ads: 0, discount: 0, total: Math.round(price * 1.19 * 100) / 100, stock, minStock,
  movements: [{ type: "IN", quantity: stock, notes: "Anfangsbestand", date: now, stockAfter: stock }],
});
product("Mesh Access Point", "Netzwerk", 89, 6, 4);
product("Patchkabel Cat 6, 2 m", "Netzwerk", 4.5, 3, 20);
product("Router Business", "Netzwerk", 219, 2, 1);
product("USB-C Ladegerät", "Zubehör", 19.9, 14, 5);

put("kalanders", { title: "Termin Kanzlei am Markt", startDate: at(1, 10), endDate: at(1, 12), location: "Plön", color: "brass" });
put("kalanders", { title: "Abnahme Website", startDate: at(6, 14), endDate: at(6, 15), location: "Online", color: "fjord" });
put("notizs", { headline: "Checkliste Netzwerkprüfung", text: "# Vor Ort\n- [x] Router-Modell notieren\n- [ ] Kanalbelegung messen\n- [ ] **Gäste-WLAN** isolieren", pinned: true, color: "brass" });
put("notizs", { headline: "Ideen Betriebsportal", text: "Erinnerungen per E-Mail, _iCal-Abgleich_, Kundenkartei.", pinned: false, color: "" });
console.log("Demo-Daten angelegt in " + file);
