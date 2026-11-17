// Consistent online backup (works while the app is running).
//   npm run backup                 → data/backups/<zeit>/control.sqlite + tenants/<firma>.sqlite (alle Firmen)
//   npm run backup -- --org <id>   → nur die Datenbank dieser Firma
// Env: BACKUP_DIR (default data/backups), BACKUP_KEEP (default 14 newest backup folders)
// Restore one firm: stop the app, copy tenants/<firma>.sqlite back into data/tenants/, start again.
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { CONTROL_FILE, TENANT_DIR } from "./storage.mjs";

const root = resolve(process.env.BACKUP_DIR || "data/backups");
const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
const orgArg = process.argv.indexOf("--org");
const onlyOrg = orgArg > -1 ? process.argv[orgArg + 1] : null;
if (onlyOrg && !/^[a-f0-9]{24}$/i.test(onlyOrg)) { console.error("Ungültige Firmen-ID."); process.exit(1); }

const stamp = new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
const dir = join(root, stamp + (onlyOrg ? `_${onlyOrg}` : ""));
mkdirSync(join(dir, "tenants"), { recursive: true });

function copy(source, target) {
  const db = new DatabaseSync(source);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  db.close();
  const check = new DatabaseSync(target, { readOnly: true });
  const ok = Object.values(check.prepare("PRAGMA integrity_check").get())[0] === "ok";
  check.close();
  if (!ok) throw new Error("Sicherung beschädigt: " + target);
  return statSync(target).size;
}

let bytes = 0, firms = 0;
if (!onlyOrg) bytes += copy(CONTROL_FILE, join(dir, "control.sqlite"));
const files = existsSync(TENANT_DIR) ? readdirSync(TENANT_DIR).filter(f => /^[a-f0-9]{24}\.sqlite$/i.test(f)) : [];
for (const f of files) {
  if (onlyOrg && f !== `${onlyOrg}.sqlite`) continue;
  bytes += copy(join(TENANT_DIR, f), join(dir, "tenants", f));
  firms++;
}
if (onlyOrg && !firms) { rmSync(dir, { recursive: true, force: true }); console.error("Keine Datenbank für diese Firma gefunden."); process.exit(1); }

// Keep only the newest full backups (single-firm backups are kept separately by name).
const old = readdirSync(root).filter(d => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(d)).sort().reverse().slice(keep);
for (const d of old) rmSync(join(root, d), { recursive: true, force: true });
console.log(`Sicherung erstellt: ${dir} (${firms} Firma/Firmen, ${Math.round(bytes / 1024)} KB). ${old.length} alte entfernt.`);
