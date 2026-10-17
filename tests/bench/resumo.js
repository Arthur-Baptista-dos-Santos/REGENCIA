/* Resume os JSON gerados por webllm_bench.js em docs/evidencias/benchmark_webllm.md.
 * Uso: node tests/bench/resumo.js */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', '..', 'docs', 'evidencias');
const arquivos = fs.readdirSync(dir).filter((f) => /^bench_webllm_.*\.json$/.test(f)).sort();

const linha = (nome, conj, r) => '| ' + [nome, conj, r.casos, r.json_valido_pct + '%', r.funcao_correta_pct + '%', r.parametros_corretos_pct + '%', r.aprovado_pelo_validador_pct + '%',
  r.latencia_mediana_ms ? (r.latencia_mediana_ms / 1000).toFixed(1) + ' s' : 'instantaneo'].join(' | ') + ' |';

const linhas = [], locais = {};
for (const a of arquivos) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, a), 'utf8'));
  const rotulo = d.modelo.replace('-Instruct-q4f16_1-MLC', '') + (d.estrategia === 'completo' ? ' (prompt original longo, sem gramatica)' : ' (prompt curto + gramatica JSON)');
  for (const [nome, r] of [['originais', d.ia.original], ['parafrases', d.ia.parafrase]]) if (r.casos) linhas.push(linha(rotulo, nome, r));
  for (const [nome, r] of [['originais', d.local.original], ['parafrases', d.local.parafrase]]) if (r.casos) locais[nome] = r;
}
for (const [nome, r] of Object.entries(locais)) linhas.push(linha('Interpretador local (palavras-chave)', nome, r));

const md = [
  '# Benchmark do modelo no navegador (WebLLM)',
  '',
  'Gerado por `tests/bench/webllm_bench.js` (executado no navegador, WebGPU) e resumido por `tests/bench/resumo.js`.',
  'Cada frase passa pelo prompt real do jogo e pelo validador real (`logica.js`), no nivel 1.',
  '',
  '- **originais**: 20 frases escritas com as palavras que o interpretador local conhece (favorece o local).',
  '- **parafrases**: 20 frases com girias e sinonimos que o interpretador local nao conhece (mede a vantagem de usar um modelo).',
  '- **json valido**: a resposta virou um decreto do catalogo. **funcao**: acertou a funcao pedida. **parametros**: acertou alvo, material, tipo, propriedade e polaridade esperados.',
  '- **aprovado**: o validador do jogo aceitou o decreto (rejeicoes por justica, como "sem superficie livre", contam contra, mesmo com a interpretacao certa).',
  '',
  '| Interpretador | Conjunto | Casos | JSON valido | Funcao | Parametros | Aprovado | Latencia mediana |',
  '|---|---|---|---|---|---|---|---|',
  ...linhas,
  '',
  '## Por que o prompt curto',
  '',
  'O prompt original do jogo (cerca de 1000 tokens, sem gramatica) foi testado no Qwen2.5-1.5B: levou 22 s por decreto, respondeu errado no primeiro teste (a frase "transforma aquela porta num espelho" virou chuva acida) e, em duas execucoes longas, o driver da GPU integrada foi reiniciado (DXGI_ERROR_DEVICE_REMOVED). Com prompt curto (cerca de 400 tokens) e saida restrita por gramatica JSON, as 80 inferencias completas da tabela (40 no 3B e 40 no 1.5B) rodaram sem reinicio do driver e o alvo passou a ser sempre um id existente. Uma execucao anterior do 1.5B parou por um defeito do motor de gramatica do WebLLM (erro GrammarMatcher); o jogo e o benchmark agora recarregam o modelo (ja em cache) e repetem a chamada. Esta observacao e qualitativa (as execucoes longas nao terminaram, entao nao ha tabela para o prompt original).',
  '',
  '**Versao do schema medida:** os numeros acima foram obtidos antes de o schema excluir `saida`, marcos e inimigos dos alvos de transformar e remover (ajuste posterior que so remove opcoes que o validador ja recusava, corrigindo casos como "aquela entrada" virar a saida). A repeticao da medicao nao foi concluida porque a GPU integrada reiniciou o computador durante a execucao; os valores da versao nova nao foram medidos.',
  '',
  'Como reproduzir: abra o jogo num Chrome ou Edge com WebGPU, carregue `js/modelo_navegador.js` e `tests/bench/webllm_bench.js` e rode `await window.__bench.rodar({ modelo: "Qwen2.5-3B-Instruct-q4f16_1-MLC", estrategia: "compacto+schema" })`.',
  '',
  'Maquina de medicao: notebook com GPU integrada Intel (Gen12), onde o modelo e lento. Em GPU dedicada a latencia cai bastante.',
  '',
].join('\n');
fs.writeFileSync(path.join(dir, 'benchmark_webllm.md'), md);
console.log(md);
