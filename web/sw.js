/* Service worker do Regência: deixa o jogo instalável e abrindo offline.
 * Só intercepta GET do mesmo domínio (a API de IA e as bibliotecas externas passam direto). */
const VERSAO = 'regencia-v2';
const ARQUIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'favicon.svg',
  'js/logica.js', 'js/api.js', 'js/jogo.js',
  'assets/gameplay_scene.jpg', 'assets/regente_concept.jpg',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n)))).then(() => self.clients.claim()),
  );
});

// stale-while-revalidate: responde do cache na hora e atualiza em segundo plano
self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  evento.respondWith(
    caches.open(VERSAO).then(async (cache) => {
      const guardado = await cache.match(req);
      const rede = fetch(req).then((resp) => { if (resp && resp.ok) cache.put(req, resp.clone()); return resp; }).catch(() => guardado);
      return guardado || rede;
    }),
  );
});
