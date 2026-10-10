// Gera web/index.html (documento completo, abre com duplo clique) a partir de web/pagina.html (fragmento usado no Artifact).
const fs = require('fs'), path = require('path');
const frag = fs.readFileSync(path.join(__dirname, 'web', 'pagina.html'), 'utf8');
const html = '<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>\n' + frag + '\n</body></html>\n';
fs.writeFileSync(path.join(__dirname, 'web', 'index.html'), html);
console.log('web/index.html gerado (' + html.length + ' bytes)');
