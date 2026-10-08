/* ADIC2 La Cabana — retired service worker.
   The first version of the menu installed an offline cache ("cabana-v1"). The current menu does not use
   a service worker, so this file replaces the old one on returning phones: it clears every cache,
   unregisters itself and reloads open tabs once so they show the current menu. */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: "window" });
    tabs.forEach((tab) => tab.navigate(tab.url));
  })());
});
