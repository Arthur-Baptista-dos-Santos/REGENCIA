/* api.js: cliente da API de IA generativa do grupo (back-end FastAPI).
 * O jogo NAO chama o servico de IA diretamente: envia o contexto para a API, que autentica
 * (header X-API-Key), aplica limites e repassa ao provedor. Modulo puro (sem DOM), testado em Node. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.RegenciaAPI = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROTA_TEXTO = '/v1/ia-generativa/texto';
  const ROTA_SAUDE = '/health';
  const URL_PADRAO = 'http://localhost:8000';

  /** Remove espacos e barras finais; devolve '' se a URL nao for http(s). */
  function normalizarUrl(u) {
    const s = String(u == null ? '' : u).trim().replace(/\/+$/, '');
    return /^https?:\/\/[^\s/]+/i.test(s) ? s : '';
  }

  /** Extrai o primeiro objeto JSON de um texto (modelos pequenos as vezes cercam o JSON de texto). */
  function extrairJson(texto) {
    const s = String(texto == null ? '' : texto);
    const ini = s.indexOf('{'), fim = s.lastIndexOf('}');
    if (ini < 0 || fim <= ini) throw { code: 'invalid_json', message: 'resposta sem objeto JSON' };
    try { return JSON.parse(s.slice(ini, fim + 1)); } catch (e) { throw { code: 'invalid_json', message: 'JSON invalido' }; }
  }

  /** Traduz o status HTTP da API em um codigo que o jogo sabe tratar. */
  function codigoDoStatus(status) {
    if (status === 401 || status === 403) return 'api_auth';
    if (status === 422) return 'api_pedido_invalido';
    if (status === 429) return 'rate_limited';
    if (status === 503) return 'api_provedor_fora';
    if (status === 504) return 'timeout';
    return 'api_erro';
  }

  /**
   * Cria o cliente. `config`: { url, chave, fetchFn? }.
   * O cliente tem a mesma forma que a IA do ambiente: json(prompt, opcoes) -> objeto.
   */
  function criarClienteAPI(config) {
    const url = normalizarUrl(config && config.url) || URL_PADRAO;
    const chave = String((config && config.chave) || '');
    const f = (config && config.fetchFn) || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const cliente = { url, ultimoMeta: null };

    cliente.json = async function (prompt, opcoes) {
      if (!f) throw { code: 'api_erro', message: 'fetch indisponivel' };
      if (!chave) throw { code: 'api_auth', message: 'sem API Key' };
      let resp;
      try {
        resp = await f(url + ROTA_TEXTO, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': chave },
          body: JSON.stringify({ prompt: String(prompt), max_tokens: 220, temperatura: 0.2, formato_json: true }),
          signal: opcoes && opcoes.signal,
        });
      } catch (e) {
        if (e && (e.name === 'AbortError' || e.code === 'cancelled')) throw { code: 'cancelled', message: 'cancelado' };
        throw { code: 'api_rede', message: 'nao foi possivel falar com a API' };
      }
      if (!resp.ok) throw { code: codigoDoStatus(resp.status), message: 'HTTP ' + resp.status };
      let corpo;
      try { corpo = await resp.json(); } catch (e) { throw { code: 'api_erro', message: 'corpo invalido' }; }
      cliente.ultimoMeta = { provedor: corpo.provedor, modelo: corpo.modelo, latencia_ms: corpo.latencia_ms };
      return extrairJson(corpo.texto);
    };

    /** Consulta GET /health (publico). Devolve { ok, provedor, modelo, versao } ou { ok: false, motivo }. */
    cliente.saude = async function () {
      if (!f) return { ok: false, motivo: 'fetch indisponivel' };
      try {
        const r = await f(url + ROTA_SAUDE, { method: 'GET' });
        if (!r.ok) return { ok: false, motivo: 'HTTP ' + r.status };
        const c = await r.json();
        return { ok: true, provedor: c.provedor, modelo: c.modelo, versao: c.versao };
      } catch (e) { return { ok: false, motivo: 'API inacessivel' }; }
    };

    return cliente;
  }

  return { ROTA_TEXTO, ROTA_SAUDE, URL_PADRAO, normalizarUrl, extrairJson, codigoDoStatus, criarClienteAPI };
});
