/* Calm Space service worker: caches the app so it works offline. No tracking, no network calls beyond loading the app itself. */
const CACHE = 'calm-space-v13-2026-10-26b'; // bump on every build
const VOICE = 'calm-space-voice-v1'; // recorded voice clips: kept across updates (file names change when a clip changes)
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './snd.js'];
const VOICES = ['isabella', 'emma', 'george', 'daniel'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== VOICE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Keep every clip of one voice for offline use. Isabella is asked for straight after install; another voice once it is chosen.
let saving = Promise.resolve();
function saveVoice(v) {
  saving = saving.then(async () => {
    const list = await fetch('./voice/files.json', {cache: 'no-cache'}).then(r => r.json());
    const c = await caches.open(VOICE);
    const have = new Set((await c.keys()).map(r => new URL(r.url).pathname));
    const todo = list.map(h => new URL('./voice/' + v + '/' + h + '.mp3', self.location).href).filter(u => !have.has(new URL(u).pathname));
    for (let i = 0; i < todo.length; i += 6) {
      await Promise.all(todo.slice(i, i + 6).map(u => fetch(u).then(r => r.ok ? c.put(u, r) : 0).catch(() => 0)));
    }
  }).catch(() => {});
  return saving;
}
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'save-voice' && VOICES.indexOf(d.v) >= 0) e.waitUntil(saveVoice(d.v));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (/\/voice\/[a-z]+\/[0-9a-f]+\.mp3$/.test(new URL(req.url).pathname)) { // clips: saved as they are played, then always from the device
    e.respondWith(caches.open(VOICE).then(c => c.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  if (req.mode === 'navigate') { // network first for the page itself, so updates arrive; the cache is the offline fallback
    e.respondWith(fetch(req).then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); } return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(
    caches.match(req, {ignoreSearch: true}).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return hit || net;
    })
  );
});
