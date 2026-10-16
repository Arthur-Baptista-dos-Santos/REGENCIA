// Gera web/index.html (documento completo, abre com duplo clique) a partir de web/pagina.html (fragmento da página).
const fs = require('fs'), path = require('path');

const URL_SITE = 'https://arthur-baptista-dos-santos.github.io/REGENCIA/';
const DESCRICAO = 'Jogo cooperativo em que o Regente dita decretos em português e uma IA os transforma em efeitos de jogo. Jogue no navegador, sem instalar nada.';

const frag = fs.readFileSync(path.join(__dirname, 'web', 'pagina.html'), 'utf8');
const cabeca = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${DESCRICAO}">
<meta name="theme-color" content="#0d0b12">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<meta property="og:type" content="website">
<meta property="og:title" content="Regência">
<meta property="og:description" content="${DESCRICAO}">
<meta property="og:url" content="${URL_SITE}">
<meta property="og:image" content="${URL_SITE}assets/og.png">
<meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary_large_image">`;
const registro = `<script>
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* sem offline: o jogo segue normal */ }); });
}
</script>`;
const html = '<!doctype html>\n<html lang="pt-BR"><head>\n' + cabeca + '\n</head><body>\n' + frag + '\n' + registro + '\n</body></html>\n';
fs.writeFileSync(path.join(__dirname, 'web', 'index.html'), html);
console.log('web/index.html gerado (' + html.length + ' bytes)');
