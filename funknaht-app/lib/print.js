import "server-only";

// Helpers for the print pages (/print/...): ids from the address and German formats.
export const parseIds = (value, max = 100) => [...new Set(String(value || "").split(",").filter(id => /^[0-9a-f]{24}$/.test(id)))].slice(0, max);
export const money = n => (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
export const day = d => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
export const hours = m => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`;
export const isAdmin = session => session.role === "owner" || session.role === "admin";
// Loads documents by id and silently drops ids that do not belong to the firm.
export function pickDocs(r, ids) {
  return ids.map(id => { try { return r.normalize(r.store.get(id)); } catch { return null; } }).filter(Boolean);
}
