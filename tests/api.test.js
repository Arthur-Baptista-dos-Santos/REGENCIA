'use strict';
// Testes do cliente da API do jogo (sem rede: fetch simulado). Rodar: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../web/js/api.js');

const resposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });

test('normalizarUrl remove barras finais e rejeita o que nao e http(s)', () => {
  assert.equal(A.normalizarUrl('http://localhost:8000/'), 'http://localhost:8000');
  assert.equal(A.normalizarUrl('  https://api.exemplo.com///  '), 'https://api.exemplo.com');
  assert.equal(A.normalizarUrl('javascript:alert(1)'), '');
  assert.equal(A.normalizarUrl('localhost:8000'), '');
  assert.equal(A.normalizarUrl(null), '');
});

test('extrairJson aceita JSON puro e JSON cercado de texto; recusa o resto', () => {
  assert.deepEqual(A.extrairJson('{"a":1}'), { a: 1 });
  assert.deepEqual(A.extrairJson('Claro! Aqui esta: {"a":{"b":2}} pronto.'), { a: { b: 2 } });
  assert.throws(() => A.extrairJson('sem json'), { code: 'invalid_json' });
  assert.throws(() => A.extrairJson('{quebrado'), { code: 'invalid_json' });
});

test('o cliente envia POST com X-API-Key, corpo no formato da API e devolve o JSON do texto gerado', async () => {
  let visto;
  const f = async (url, init) => { visto = { url, init }; return resposta(200, { texto: '{"funcao":"transformar_material"}', provedor: 'ollama', modelo: 'qwen2.5:7b', latencia_ms: 2500 }); };
  const c = A.criarClienteAPI({ url: 'http://localhost:8000/', chave: 'minha-chave', fetchFn: f });
  const r = await c.json('interprete isto');
  assert.deepEqual(r, { funcao: 'transformar_material' });
  assert.equal(visto.url, 'http://localhost:8000/v1/ia-generativa/texto');
  assert.equal(visto.init.method, 'POST');
  assert.equal(visto.init.headers['X-API-Key'], 'minha-chave');
  const corpo = JSON.parse(visto.init.body);
  assert.equal(corpo.prompt, 'interprete isto');
  assert.equal(corpo.formato_json, true);
  assert.deepEqual(c.ultimoMeta, { provedor: 'ollama', modelo: 'qwen2.5:7b', latencia_ms: 2500 });
});

test('sem chave configurada o cliente nem tenta a rede', async () => {
  let chamou = false;
  const c = A.criarClienteAPI({ url: 'http://x', chave: '', fetchFn: async () => { chamou = true; return resposta(200, {}); } });
  await assert.rejects(() => c.json('oi'), { code: 'api_auth' });
  assert.equal(chamou, false);
});

test('status HTTP da API viram codigos que o jogo sabe tratar', async () => {
  const casos = [[401, 'api_auth'], [403, 'api_auth'], [422, 'api_pedido_invalido'], [429, 'rate_limited'], [502, 'api_erro'], [503, 'api_provedor_fora'], [504, 'timeout']];
  for (const [status, code] of casos) {
    const c = A.criarClienteAPI({ url: 'http://x', chave: 'k', fetchFn: async () => resposta(status, {}) });
    await assert.rejects(() => c.json('oi'), { code }, 'status ' + status);
  }
});

test('falha de rede vira api_rede e cancelamento vira cancelled', async () => {
  const falha = A.criarClienteAPI({ url: 'http://x', chave: 'k', fetchFn: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(() => falha.json('oi'), { code: 'api_rede' });
  const aborta = A.criarClienteAPI({ url: 'http://x', chave: 'k', fetchFn: async () => { const e = new Error('abortado'); e.name = 'AbortError'; throw e; } });
  await assert.rejects(() => aborta.json('oi'), { code: 'cancelled' });
});

test('resposta da API com texto que nao e JSON vira invalid_json', async () => {
  const c = A.criarClienteAPI({ url: 'http://x', chave: 'k', fetchFn: async () => resposta(200, { texto: 'nao sei', provedor: 'p', modelo: 'm', latencia_ms: 1 }) });
  await assert.rejects(() => c.json('oi'), { code: 'invalid_json' });
});

test('saude: sucesso devolve provedor e modelo; erro nao lanca excecao', async () => {
  const ok = A.criarClienteAPI({ url: 'http://x', chave: '', fetchFn: async () => resposta(200, { status: 'ok', provedor: 'ollama', modelo: 'qwen2.5:7b', versao: '1.0.0' }) });
  assert.deepEqual(await ok.saude(), { ok: true, provedor: 'ollama', modelo: 'qwen2.5:7b', versao: '1.0.0' });
  const fora = A.criarClienteAPI({ url: 'http://x', chave: '', fetchFn: async () => { throw new TypeError('x'); } });
  assert.deepEqual(await fora.saude(), { ok: false, motivo: 'API inacessivel' });
  const erro = A.criarClienteAPI({ url: 'http://x', chave: '', fetchFn: async () => resposta(500, {}) });
  assert.equal((await erro.saude()).ok, false);
});

test('a URL padrao aponta para o back-end local', () => {
  assert.equal(A.criarClienteAPI({ chave: 'k', fetchFn: async () => resposta(200, {}) }).url, 'http://localhost:8000');
});
