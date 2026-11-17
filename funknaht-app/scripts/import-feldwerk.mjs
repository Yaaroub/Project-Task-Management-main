// Copies tasks, projects, products, events and notes from the old Express backend's SQLite file
// into the database of one firm (IMPORT_ORG_ID, else the first firm, else the first one to register).
// Usage: npm run import:feldwerk [-- path/to/feldwerk.sqlite]
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { openTarget } from "./storage.mjs";

const source = resolve(process.argv[2] || "../backend/data/feldwerk.sqlite");
if (!existsSync(source)) { console.error("Quelldatei nicht gefunden: " + source); process.exit(1); }

const from = new DatabaseSync(source, { readOnly: true });
const target = openTarget(process.env.IMPORT_ORG_ID);
const rows = from.prepare("SELECT collection,id,data FROM documents WHERE collection IN ('todos','projects','products','kalanders','notizs')").all();
let added = 0;
target.db.exec("BEGIN");
for (const r of rows) {
  const doc = JSON.parse(r.data);
  for (const k of ["createdAt", "updatedAt", "startDate", "endDate"]) if (doc[k] && typeof doc[k] !== "string") doc[k] = new Date(doc[k]).toISOString();
  added += target.insert(r.collection, r.id, JSON.stringify(doc));
}
target.db.exec("COMMIT");
console.log(`${added} von ${rows.length} Einträgen übernommen nach ${target.file}${target.org ? "" : " (wartet auf die erste Registrierung)"}.`);
