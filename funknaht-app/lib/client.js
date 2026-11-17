"use client";
import { useCallback, useEffect, useState } from "react";

export async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch("/api/" + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  // Session expired or signed out elsewhere: back to the login page.
  if (res.status === 401 && !path.startsWith("auth/")) { window.location.href = "/login"; throw new Error("Bitte erneut anmelden."); }
  if (!res.ok) throw new Error(data.error || "Anfrage fehlgeschlagen.");
  return data;
}

// Loads a list and offers optimistic local updates.
export function useCollection(name) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => api(name).then(setItems).catch(e => setError(e.message)), [name]);
  useEffect(() => { reload(); }, [reload]);
  const replace = useCallback(doc => setItems(list => list.map(i => (i._id === doc._id ? doc : i))), []);
  const add = useCallback(doc => setItems(list => [doc, ...(list || [])]), []);
  const drop = useCallback(id => setItems(list => list.filter(i => i._id !== id)), []);
  return { items, setItems, error, reload, replace, add, drop };
}

export const fmtDate = (value, opts = { day: "2-digit", month: "short" }) =>
  value ? new Date(value).toLocaleDateString("de-DE", opts) : "";
export const fmtMoney = n => (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
export const fmtMinutes = m => {
  m = Math.round(m || 0);
  return m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std. ${String(m % 60).padStart(2, "0")}`;
};
export const relTime = value => {
  const s = (Date.now() - Date.parse(value)) / 1000;
  if (s < 60) return "gerade";
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  return fmtDate(value);
};
export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
