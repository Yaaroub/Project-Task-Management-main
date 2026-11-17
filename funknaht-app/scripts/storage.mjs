// Shared helper for scripts: finds the target database for a firm (same layout as lib/db.js).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

export const CONTROL_FILE = resolve(process.env.SQLITE_PATH || "data/funknaht.sqlite");
export const TENANT_DIR = resolve(process.env.TENANT_DIR || join(dirname(CONTROL_FILE), "tenants"));

// Returns { db, org, insert(collection,id,data) }.
// With a firm: writes into data/tenants/<firm>.sqlite. Without any firm yet: parks rows in the
// control database; the first registered firm takes them over automatically.
export function openTarget(preferredOrg) {
  mkdirSync(dirname(CONTROL_FILE), { recursive: true });
  const control = new DatabaseSync(CONTROL_FILE);
  control.exec(`CREATE TABLE IF NOT EXISTS documents (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (collection, id));`);
  if (!control.prepare("SELECT 1 FROM pragma_table_info('documents') WHERE name='org'").get()) control.exec("ALTER TABLE documents ADD COLUMN org TEXT");
  const hasOrgs = control.prepare("SELECT 1 FROM sqlite_master WHERE name='orgs'").get();
  const org = preferredOrg || (hasOrgs && control.prepare("SELECT id FROM orgs ORDER BY created_at LIMIT 1").get()?.id) || null;
  if (org && !/^[a-f0-9]{24}$/i.test(org)) throw new Error("Ungültige Firmen-ID.");
  if (!org) {
    const stmt = control.prepare("INSERT OR IGNORE INTO documents(collection,id,data,org) VALUES(?,?,?,NULL)");
    return { db: control, org: null, file: CONTROL_FILE, insert: (c, i, d) => stmt.run(c, i, d).changes };
  }
  control.close();
  mkdirSync(TENANT_DIR, { recursive: true });
  const file = join(TENANT_DIR, `${org}.sqlite`);
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS documents (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (collection, id));
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  const stmt = db.prepare("INSERT OR IGNORE INTO documents(collection,id,data) VALUES(?,?,?)");
  return { db, org, file, insert: (c, i, d) => stmt.run(c, i, d).changes };
}

