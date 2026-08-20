// ArkMap Studio — PWA service worker (no-op: instalowalnosc, zero cache).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
