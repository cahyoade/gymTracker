const CACHE = 'form-shell-v2.0.1';
const ASSETS = ['./', './index.html', './styles.css', './manifest.webmanifest', './js/app.js', './js/model.js', './js/db.js', './js/backup.js', './js/config.js', './js/google.js', './js/records.js', './js/theme.js', './js/progression.js', './js/measurements.js', './js/body-progress-ui.js', './js/strength.js', './js/strength-progress-ui.js', './js/catalog.js', './js/catalog-ui.js', './js/food-seeds.js', './js/nutrition.js', './js/nutrition-ui.js', './js/nutrition-controller.js', './data/exercises.json', './data/EXERCISES-LICENSE.txt', './icons/mark.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];
const assetPaths = new Set(ASSETS.map(path => new URL(path, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('form-shell-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'APPLY_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match(new URL('./index.html', self.registration.scope)).then(cached => cached || fetch(event.request)));
  } else if (assetPaths.has(url.pathname)) {
    event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(cached => cached || fetch(event.request)));
  }
});
