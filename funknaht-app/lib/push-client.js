"use client";
import { api } from "./client";

// Browser side of Web Push: service worker, subscription at the browser's push service, registration at Nahtbord.
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
// iPhone and iPad only allow push for web apps added to the home screen.
export const needsInstall = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia?.("(display-mode: standalone)").matches && !navigator.standalone;

const toKey = base64 => {
  const raw = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("Dieser Browser unterstützt keine Push-Hinweise.");
  if (needsInstall()) throw new Error("Auf iPhone und iPad: Teilen → „Zum Home-Bildschirm“, Nahtbord von dort öffnen und Push dort einschalten.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Hinweise wurden nicht erlaubt. Sie lassen sich in den Website-Einstellungen des Browsers freigeben.");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const { publicKey } = await api("push");
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another server key cannot be reused.
  if (sub && sub.options?.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== publicKey.replace(/=+$/, "")) { await sub.unsubscribe(); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
  await api("push", { method: "POST", body: { subscription: sub.toJSON() } });
  try { localStorage.setItem("nb-push", "1"); } catch {}
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    await api("push", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  try { localStorage.removeItem("nb-push"); } catch {}
}
