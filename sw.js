// Network-first with offline fallback. Bump VERSION to drop old caches on release.
const VERSION = 'nb-7';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'src/main.js', 'src/core/storage.js', 'src/core/lives.js', 'src/core/i18n.js', 'src/core/ads.js',
  'src/game/game.js', 'src/game/levels.js', 'src/map/map.js', 'src/map/roads.js', 'src/data/zones.js', 'src/ui/modal.js', 'src/title/title.js', 'src/version.js',
  'src/i18n/en.js', 'src/i18n/sv.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // no-cache: ask the server every time, or GitHub Pages' max-age=600 delays new versions.
  e.respondWith(
    fetch(req.url, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req)));
});
