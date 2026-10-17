/* Service worker do Regência: deixa o jogo instalável e abrindo offline.
 * Só intercepta GET do mesmo domínio (a API de IA e as bibliotecas externas passam direto). */
const VERSAO = 'regencia-v4';
const ARQUIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'favicon.svg',
  'js/logica.js', 'js/api.js', 'js/modelo_navegador.js', 'js/jogo.js',
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

// rede primeiro, cache como reserva: quem está online sempre recebe a versão nova (sem mistura de arquivos
// antigos e novos depois de uma atualização) e quem está offline continua jogando com a última cópia guardada
self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  evento.respondWith(
    caches.open(VERSAO).then(async (cache) => {
      try {
        const resp = await fetch(req, { cache: 'no-cache' });
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      } catch (e) {
        const guardado = await cache.match(req);
        if (guardado) return guardado;
        throw e;
      }
    }),
  );
});
