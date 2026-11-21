/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// App shell is precached so the app opens offline; data comes from the
// IndexedDB snapshot. The API is never cached (always network).
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\/api\//] }));

self.skipWaiting();
clientsClaim();

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = { title: 'Focus', body: '' };
  try {
    data = event.data?.json() as PushPayload;
  } catch {
    data = { title: 'Focus', body: event.data?.text() ?? '' };
  }
  // Same tag as the in-page notification, so it replaces it silently instead of
  // duplicating. Always show something: Chrome penalises pushes that display nothing.
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: 'icon-192.png',
      badge: 'badge-96.png',
      data: { url: data.url ?? './' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data?.url as string) ?? './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const scoped = wins.find((w) => w.url.startsWith(self.registration.scope));
      if (scoped) {
        void scoped.navigate(target).catch(() => {});
        return scoped.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
