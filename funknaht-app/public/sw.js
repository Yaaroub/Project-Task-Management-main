// Nahtbord service worker: shows reminders and alarms that arrive by Web Push, also when no tab is open.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Nahtbord";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    tag: data.tag || undefined,          // same tag as the in-tab reminder: shown only once
    renotify: !!data.tag,
    requireInteraction: !!data.alarm,    // alarms stay until they are dismissed
    icon: "/icon.svg", badge: "/icon.svg",
    data: { url: data.url || "/" },
    vibrate: data.alarm ? [300, 150, 300, 150, 600] : [200, 100, 200],
  }));
});

// A click focuses an open Nahtbord tab (and navigates it) or opens a new one.
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const tab = all.find(c => new URL(c.url).origin === self.location.origin);
    if (tab) { await tab.focus(); if ("navigate" in tab) return tab.navigate(target.href); return; }
    return self.clients.openWindow(target.href);
  })());
});
