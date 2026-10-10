/* jogo.js: Regência (MVP): loop, física, bot Explorador, pipeline de decretos (IA ao vivo ou
 * interpretador local), renderização em canvas e telas. A regra de jogo vive em logica.js (testada em Node). */
(function () {
  'use strict';
  const L = window.RegenciaLogica;
  const { TILE, LARGURA, ALTURA } = L;
  const $ = (id) => document.getElementById(id);
  const cv = $('tela'), ctx = cv.getContext('2d');
  const el = { menu: $('menu'), como: $('como'), intro: $('intro'), resumo: $('resumo'), fim: $('fim'), toast: $('aviso-toast'),
    frase: $('frase'), enviar: $('enviar'), status: $('status'), dicas: $('dicas'), rotulo: $('rotulo-frase'), iaStatus: $('ia-status'), iaToggle: $('ia-toggle'), iaBaixar: $('ia-baixar') };
  const REDUZIR = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FIXO = 1 / 120;

  // ---------- assets ----------
  const carregar = (src) => { const i = new Image(); i.onload = () => { i._ok = true; }; i.src = src; return i; };
  const imgMenu = carregar('assets/regente_concept.jpg'), imgJogo = carregar('assets/gameplay_scene.jpg');

  // ---------- áudio (efeitos procedurais, não são IA) ----------
  let audio = null, mudo = false;
  function iniciarAudio() { if (audio) return; try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; } }
  function tom(f, dur, tipo, vol, ate, atraso) {
    if (!audio || mudo) return;
    try {
      const t = audio.currentTime + (atraso || 0), o = audio.createOscillator(), g = audio.createGain();
      o.type = tipo || 'sine'; o.frequency.setValueAtTime(f, t); if (ate) o.frequency.exponentialRampToValueAtTime(ate, t + dur);
      g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* sem áudio: segue o jogo */ }
  }
  const SOM = {
    pulo: () => tom(380, 0.13, 'square', 0.03, 640), morte: () => { tom(220, 0.35, 'sawtooth', 0.05, 60); },
    decreto: () => { tom(523, 0.18, 'triangle', 0.05, 784); tom(784, 0.25, 'sine', 0.04, 1046, 0.1); },
    nao: () => tom(160, 0.2, 'square', 0.04, 110), pisao: () => tom(300, 0.1, 'square', 0.04, 600),
    marco: () => { tom(660, 0.12, 'triangle', 0.05); tom(880, 0.18, 'triangle', 0.05, null, 0.1); },
    vitoria: () => { [523, 659, 784, 1046].forEach((f, i) => tom(f, 0.22, 'triangle', 0.05, null, i * 0.12)); },
    derrota: () => { [392, 330, 262, 196].forEach((f, i) => tom(f, 0.28, 'sawtooth', 0.04, null, i * 0.14)); },
    espelho: () => tom(900, 0.22, 'sine', 0.05, 300),
  };

  // ---------- estado ----------
  let tela = 'menu';       // menu | jogo
  function setTela(t) { tela = t; $('barra').hidden = t !== 'jogo'; }
  let J = null;           // partida
  let sampleFn = null, iaDisponivel = false, iaViva = false, primeiraChamadaIA = true;
  let provedor = null;   // 'ambiente' (IA do ambiente de publicação) | 'navegador' (modelo local via WebGPU) | null
  let baixando = false;
  const teclas = { esq: false, dir: false, pulo: false };
  let particulas = [], tremor = 0, relogioVisual = 0;

  // ---------- utilidades de UI ----------
  const mostrar = (e) => { e.hidden = false; };
  const esconder = (e) => { e.hidden = true; };
  function fecharPaineis() { [el.menu, el.como, el.intro, el.resumo, el.fim, el.toast].forEach(esconder); }
  let toastTimer = 0;
  function aviso(txt, ms) { el.toast.textContent = txt; mostrar(el.toast); clearTimeout(toastTimer); toastTimer = setTimeout(() => esconder(el.toast), ms || 2400); }
  function definirStatus(txt, classe) { el.status.textContent = txt || ''; el.status.className = classe || ''; }
  const aproximar = (v, alvo, passo) => (v < alvo ? Math.min(alvo, v + passo) : Math.max(alvo, v - passo));
  const rand = (a, b) => a + Math.random() * (b - a);
  const sinal = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

  // ---------- IA ao vivo (capacidade `sample` do Artifact) ----------
  const MODELO_NAVEGADOR = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
  const URL_WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
  function atualizarMenuIA() {
    const temGPU = !!navigator.gpu;
    el.iaBaixar.hidden = true; el.iaToggle.hidden = true;
    if (baixando) return;
    if (iaDisponivel) {
      const nome = provedor === 'navegador' ? 'modelo de linguagem rodando neste navegador' : 'IA do ambiente';
      el.iaStatus.textContent = iaViva ? 'IA ao vivo: ligada (' + nome + ').' : 'IA ao vivo: desligada (interpretador local).';
      el.iaToggle.hidden = false; el.iaToggle.textContent = iaViva ? 'Desligar' : 'Ligar';
    } else if (temGPU) {
      el.iaStatus.textContent = 'IA ao vivo desligada: usando o interpretador local. Você pode ativar um modelo de linguagem que roda no seu navegador.';
      el.iaBaixar.hidden = false;
    } else {
      el.iaStatus.textContent = 'IA ao vivo indisponível neste navegador (sem WebGPU): usando o interpretador local. O jogo funciona igual.';
    }
  }
  async function iniciarIA() {
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        const s = await window.claude.use('sample');
        if (s) { sampleFn = s; iaDisponivel = true; iaViva = true; provedor = 'ambiente'; }
      }
    } catch (e) { /* sem IA do ambiente */ }
    atualizarMenuIA();
  }
  /** Baixa (1ª vez, ~1 GB, fica em cache) e inicia um modelo de linguagem que roda 100% no navegador, via WebGPU. */
  async function ativarIANavegador() {
    if (baixando || provedor === 'navegador') return;
    if (!navigator.gpu) { aviso('Este navegador não tem WebGPU. Use Chrome ou Edge recentes no computador.', 3500); return; }
    baixando = true; el.iaBaixar.hidden = true; el.iaToggle.hidden = true;
    el.iaStatus.textContent = 'Preparando o modelo de linguagem… (a 1ª vez baixa cerca de 1 GB e fica guardado no navegador)';
    try {
      const m = await import(URL_WEBLLM);
      const motor = await m.CreateMLCEngine(MODELO_NAVEGADOR, {
        initProgressCallback: (p) => { el.iaStatus.textContent = 'Modelo de linguagem: ' + Math.round((p.progress || 0) * 100) + '% ' + (p.text.includes('Fetching') ? '(baixando)' : '(carregando na GPU)'); },
      });
      sampleFn = {
        json: async (prompt, opts) => {
          if (opts && opts.signal && opts.signal.aborted) throw { code: 'cancelled' };
          const aborta = () => { try { motor.interruptGenerate(); } catch (e) { /* sem geração em curso */ } };
          if (opts && opts.signal) opts.signal.addEventListener('abort', aborta, { once: true });
          const r = await motor.chat.completions.create({
            messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 220,
          });
          if (opts && opts.signal && opts.signal.aborted) throw { code: 'cancelled' };
          const texto = (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '';
          const ini = texto.indexOf('{'), fim = texto.lastIndexOf('}');
          try { return JSON.parse(texto.slice(ini, fim + 1)); } catch (e) { throw { code: 'invalid_json', message: texto.slice(0, 80) }; }
        },
      };
      iaDisponivel = true; iaViva = true; provedor = 'navegador'; primeiraChamadaIA = false;
      aviso('Modelo de linguagem pronto: agora os decretos são interpretados por IA.', 3000);
    } catch (e) {
      console.error('Falha ao iniciar o modelo no navegador:', e && (e.message || e));
      aviso('Não foi possível iniciar o modelo neste navegador. Seguindo com o interpretador local.', 4000);
    } finally { baixando = false; atualizarMenuIA(); }
  }
  function tratarErroIA(e) {
    const code = e && e.code;
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) {
      iaViva = false; atualizarMenuIA(); aviso('IA ao vivo recusada/indisponível: seguindo com o interpretador local.', 3200);
    } else if (code === 'rate_limited') aviso('Limite de uso da IA atingido: usei o interpretador local neste decreto.', 3200);
    else if (code === 'timeout') aviso('A IA demorou demais: usei o interpretador local neste decreto.', 3000);
    else aviso('Resposta da IA inválida (' + (code || 'erro') + '): usei o interpretador local.', 3000);
  }
  async function chamarIA(prompt) {
    const ctl = new AbortController();
    const limite = provedor === 'navegador' ? 40000 : (primeiraChamadaIA ? 60000 : 15000);
    let timer = 0;
    // o tempo limite é garantido por uma corrida: o jogo nunca fica esperando a IA, mesmo que ela ignore o cancelamento
    const tempo = new Promise((_, rejeita) => { timer = setTimeout(() => { ctl.abort(); rejeita({ code: 'timeout', message: 'tempo esgotado' }); }, limite); });
    try { return await Promise.race([sampleFn.json(prompt, { modelTier: 'quick', cache: false, signal: ctl.signal }), tempo]); }
    catch (e) { if (e && e.code === 'cancelled') throw { code: 'timeout', message: 'tempo esgotado' }; throw e; }
    finally { clearTimeout(timer); primeiraChamadaIA = false; }
  }

  // ---------- papéis / fluxo ----------
  function papeisDoNivel(modo, idx) {
    if (modo === 'treino') return { regenteHumano: true, exploradorHumano: true, rotR: 'Você', rotE: 'Você' };
    if (modo === 'coop') { const a = idx % 2 === 0; return { regenteHumano: true, exploradorHumano: true, rotR: a ? 'Jogador 1' : 'Jogador 2', rotE: a ? 'Jogador 2' : 'Jogador 1' }; }
    const reg = idx % 2 === 0;
    return { regenteHumano: reg, exploradorHumano: !reg, rotR: reg ? 'Você' : 'Regente-IA', rotE: reg ? 'Bot Explorador' : 'Você' };
  }
  function iniciarModo(modo) {
    iniciarAudio();
    J = { modo, nivelIdx: 0, placar: { humano: 0, p1: 0, p2: 0 }, cronicasTotal: [], token: 0, estado: null, fim: false };
    abrirIntro();
  }
  function abrirIntro() {
    const idx = J.nivelIdx, def = L.NIVEIS[idx], p = papeisDoNivel(J.modo, idx);
    fecharPaineis(); setTela('menu');
    $('intro-nivel').textContent = J.modo === 'treino' ? 'Treino livre' : 'Nível ' + (idx + 1) + ' de ' + L.NIVEIS.length;
    $('intro-nome').textContent = def.nome;
    let papel, texto;
    if (J.modo === 'treino') { papel = 'Explorador + Regente'; texto = 'Você anda com as setas E dita decretos na caixa de texto. Sem tempo, sem derrota. R reinicia · 1, 2, 3 trocam de nível.'; }
    else if (J.modo === 'coop') { papel = p.rotR + ' é o REGENTE'; texto = p.rotR + ' digita os decretos; ' + p.rotE + ' joga com as setas (↑ pula). ' + (idx > 0 ? 'Trocaram de papel!' : ''); }
    else if (p.regenteHumano) { papel = 'Você é o REGENTE'; texto = 'O Explorador é um bot que planeja o próprio caminho. Dite decretos em português para atrapalhá-lo antes que o tempo acabe, sem nunca bloquear a saída de vez.'; }
    else { papel = 'Você é o EXPLORADOR'; texto = 'O Regente-IA vai decretar contra você' + (iaViva ? ' (com IA ao vivo)' : ' (modo local)') + '. Chegue ao portal de saída: setas ou A/D, ↑/W/Espaço pulam.'; }
    $('intro-papel').textContent = papel; $('intro-texto').textContent = texto; $('intro-dica').textContent = def.dica;
    mostrar(el.intro);
  }
  function iniciarNivel() {
    iniciarAudio();
    const idx = J.nivelIdx;
    J.estado = L.criarEstado(idx); J.papel = papeisDoNivel(J.modo, idx);
    J.token++; J.fim = false; J.pausado = false; J.log = []; J.cronicas = []; J.pendente = false; J.puloEdge = false;
    J.bot = { plano: null, timer: 0, parado: 0, ultimoX: 0, inicio: 9, pausa: 0, pausaChave: '' };
    J.regenteIA = { proximo: 4, ocupado: false };
    J.legenda = ''; J.tempoDeAviso = 0;
    particulas = []; tremor = 0; fecharPaineis(); setTela('jogo');
    const reg = J.papel.regenteHumano;
    el.frase.disabled = !reg; el.enviar.disabled = !reg; el.frase.value = '';
    el.rotulo.textContent = reg ? (J.papel.rotR === 'Você' ? 'Regente diz:' : J.papel.rotR + ' diz:') : 'Regente-IA decreta…';
    el.frase.placeholder = reg ? 'ex.: transforma aquela porta ali num espelho' : 'o Regente-IA está no comando';
    montarDicas(idx, reg);
    definirStatus(reg ? 'Digite um decreto e aperte Enter.' : 'Chegue ao portal de saída!', '');
    if (reg) setTimeout(() => el.frase.focus(), 50); else el.frase.blur();
  }
  const DICAS = [
    ['transforma aquela porta ali num espelho', 'chove ácido perto do poço', 'coloca espinhos na frente dele', 'aumenta a gravidade dele', 'transforma o chão do final em gelo'],
    ['coloca um monstro na frente dele', 'transforma a plataforma em vidro', 'o vento sopra contra ele', 'neblina cobre tudo', 'some com os espinhos'],
    ['cria um muro na frente dele', 'transforma o chão do meio em lava', 'chove ácido perto do poço', 'deixa ele bem devagar', 'faz o slime ficar gigante'],
  ];
  function montarDicas(idx, reg) {
    el.dicas.textContent = '';
    if (!reg) return;
    for (const d of DICAS[idx % DICAS.length]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = d;
      b.addEventListener('click', () => { el.frase.value = d; el.frase.focus(); }); el.dicas.appendChild(b);
    }
  }
  function terminar(vencedor, motivo) {
    if (!J || J.fim) return;
    J.fim = true; const S = J.estado;
    const aplicados = J.cronicas.filter((c) => c.resultado === 'aplicado' || c.resultado === 'ajustado').length;
    const pts = vencedor === 'explorador' ? 100 + Math.round(Math.max(0, S.tempoRestante)) + Math.max(0, S.vidas) * 10
      : 100 + (S.vidasMax - Math.max(0, S.vidas)) * 15 + Math.min(60, aplicados * 6);
    let paraQuem = '';
    if (J.modo === 'campanha') {
      const humano = J.papel.regenteHumano ? 'regente' : 'explorador';
      const ganho = humano === vencedor ? pts : 20; J.placar.humano += ganho; J.ultimoGanho = ganho; paraQuem = humano === vencedor ? 'você' : 'você (participação)';
    } else if (J.modo === 'coop') {
      const par = J.nivelIdx % 2 === 0, p1Regente = par;
      const p1 = (vencedor === 'regente') === p1Regente; J.placar[p1 ? 'p1' : 'p2'] += pts; J.ultimoGanho = pts; paraQuem = p1 ? 'Jogador 1' : 'Jogador 2';
    } else { J.ultimoGanho = 0; }
    J.resultado = { vencedor, motivo, pts: J.ultimoGanho, paraQuem, tempo: Math.round(S.tempoTotal - S.tempoRestante), aplicados };
    J.cronicasTotal.push(...J.cronicas);
    if (vencedor === 'explorador') SOM.vitoria(); else SOM.derrota();
    setTimeout(() => { if (J && J.fim && tela === 'jogo') abrirResumo(); }, 1100);
  }
  function selosDe(fonte) {
    if (fonte === 'ia') return ['IA ao vivo', 'ia'];
    if (fonte === 'regente-ia') return ['Regente-IA ao vivo', 'ia'];
    if (fonte === 'regente-local') return ['Regente-IA · local', 'bot'];
    if (fonte === 'local-fallback') return ['local (fallback)', 'local'];
    return ['local', 'local'];
  }
  function abrirResumo() {
    const r = J.resultado, S = J.estado;
    setTela('menu'); fecharPaineis(); el.frase.blur();
    const humanoGanhou = J.modo === 'campanha' ? (J.papel.regenteHumano ? r.vencedor === 'regente' : r.vencedor === 'explorador') : null;
    $('res-titulo').textContent = r.vencedor === 'explorador' ? 'O Explorador chegou ao portal!' : 'O Regente venceu!';
    $('res-motivo').textContent = r.motivo + (humanoGanhou === null ? '' : humanoGanhou ? ' · Boa!' : ' · Na próxima você leva.');
    $('res-pontos').textContent = J.modo === 'treino' ? 'livre' : String(r.pts);
    $('res-decretos').textContent = String(r.aplicados); $('res-tempo').textContent = r.tempo + 's';
    const ul = $('res-lista'); ul.textContent = '';
    const lista = J.cronicas.slice(-7);
    if (!lista.length) { const li = document.createElement('li'); li.textContent = 'Nenhum decreto neste nível.'; ul.appendChild(li); }
    for (const c of lista) {
      const li = document.createElement('li'); const [txt, cls] = selosDe(c.fonte);
      const s = document.createElement('span'); s.className = 'selo ' + cls; s.textContent = txt;
      const f = document.createElement('span'); f.className = 'frase'; f.textContent = '“' + c.frase + '”';
      const m = document.createElement('span'); m.className = 'meta';
      m.textContent = c.resultado === 'rejeitado' ? '✖ ' + c.motivo : (c.resultado === 'sem_vontade' ? 'Vontade insuficiente' : '✔ ' + c.resumo + (c.ajustes && c.ajustes.length ? ' · ' + c.ajustes.join('; ') : '') + (c.ms ? ' · ' + c.ms + 'ms' : ''));
      f.appendChild(m); li.appendChild(s); li.appendChild(f); ul.appendChild(li);
    }
    const ultimo = J.nivelIdx >= L.NIVEIS.length - 1 || J.modo === 'treino';
    $('res-prox').textContent = J.modo === 'treino' ? 'Jogar de novo' : ultimo ? 'Ver resultado final' : 'Próximo nível (troca de papéis)';
    mostrar(el.resumo);
  }
  function abrirFim() {
    setTela('menu'); fecharPaineis();
    const ia = J.cronicasTotal.filter((c) => c.fonte === 'ia' || c.fonte === 'regente-ia').length;
    const loc = J.cronicasTotal.filter((c) => !(c.fonte === 'ia' || c.fonte === 'regente-ia')).length;
    $('fim-ia').textContent = String(ia); $('fim-local').textContent = String(loc);
    if (J.modo === 'coop') {
      $('fim-pontos').textContent = J.placar.p1 + ' × ' + J.placar.p2; $('fim-rotulo-pontos').textContent = 'Jogador 1 × Jogador 2';
      $('fim-titulo').textContent = J.placar.p1 === J.placar.p2 ? 'Empate de Regentes.' : (J.placar.p1 > J.placar.p2 ? 'Jogador 1' : 'Jogador 2') + ' é o Regente Supremo!';
    } else {
      $('fim-pontos').textContent = String(J.placar.humano); $('fim-rotulo-pontos').textContent = 'pontos';
      const p = J.placar.humano; $('fim-titulo').textContent = p >= 380 ? 'Regente Supremo' : p >= 260 ? 'Mestre dos Decretos' : p >= 140 ? 'Aprendiz do Trono' : 'Súdito Curioso';
    }
    $('fim-nota').textContent = ia ? 'Decretos interpretados ao vivo por IA. Cada resposta passou pelo validador determinístico antes de virar efeito.' : 'Todos os decretos foram interpretados pelo modo local (sem IA ao vivo nesta sessão).';
    mostrar(el.fim);
  }
  function voltarMenu() { fecharPaineis(); setTela('menu'); J = null; particulas = []; el.frase.blur(); el.frase.disabled = true; el.enviar.disabled = true; el.dicas.textContent = ''; definirStatus('', ''); mostrar(el.menu); atualizarMenuIA(); }

  // ---------- decretos ----------
  async function interpretarFrase(frase) {
    const S = J.estado;
    if (iaViva && sampleFn) {
      const t0 = performance.now();
      try {
        const bruto = await chamarIA(L.montarPromptInterprete(frase, S));
        const c = L.coagirDecreto(bruto);
        if (!c.ok) throw { code: 'invalid_schema', message: c.erro };
        return { bruto: c.decreto, fonte: 'ia', ms: Math.round(performance.now() - t0) };
      } catch (e) { tratarErroIA(e); }
    }
    return { bruto: L.interpretarLocal(frase, S), fonte: iaViva ? 'local-fallback' : 'local', ms: 0 };
  }
  function centroDoEfeito(ef) {
    const S = J.estado;
    if (ef.zona) return { x: ef.zona.x + ef.zona.w / 2, y: ef.zona.y + ef.zona.h / 2 };
    const o = S.objetos.find((x) => x.id === ef.alvoId);
    if (o) return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    return { x: S.explorador.x, y: S.explorador.y };
  }
  function explodir(x, y, cor, n) {
    if (REDUZIR) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), v = rand(40, 220); particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, vida: rand(0.4, 0.9), max: 0.9, cor, tam: rand(2, 4.5) }); }
  }
  function executarDecreto(bruto, meta) {
    const S = J.estado;
    const v = L.validarDecreto(bruto, S);
    const entrada = { frase: meta.frase, fonte: meta.fonte, ms: meta.ms || 0, t: Math.round(S.relogio) };
    if (!v.aprovado) {
      Object.assign(entrada, { resultado: 'rejeitado', motivo: v.motivo }); J.log.push(entrada); J.cronicas.push(entrada);
      SOM.nao(); definirStatus('✖ ' + v.motivo, 'ruim'); return false;
    }
    const custo = J.modo === 'treino' ? Math.ceil(v.custo / 3) : v.custo;
    if (S.vontade < custo) {
      Object.assign(entrada, { resultado: 'sem_vontade' }); J.log.push(entrada); J.cronicas.push(entrada);
      SOM.nao(); definirStatus('Vontade insuficiente (' + Math.floor(S.vontade) + '/' + custo + '). Espere recarregar.', 'aviso'); return false;
    }
    S.vontade = Math.max(0, S.vontade - custo);
    const ef = L.aplicarDecreto(S, v.decreto);
    Object.assign(entrada, { resultado: v.ajustes.length ? 'ajustado' : 'aplicado', resumo: ef.resumo, ajustes: v.ajustes, custo });
    J.log.push(entrada); J.cronicas.push(entrada);
    const c = centroDoEfeito(ef); explodir(c.x, c.y, '#dcab5c', 26); SOM.decreto(); if (!REDUZIR) tremor = Math.max(tremor, 3);
    definirStatus('✔ ' + ef.resumo + (v.ajustes.length ? '  (' + v.ajustes.join('; ') + ')' : '') + '  −' + custo + ' Vontade', 'bom');
    return true;
  }
  async function decretar(frase) {
    if (!J || tela !== 'jogo' || J.fim || !J.papel.regenteHumano || J.pendente) return;
    frase = L.limitarTexto(frase, 160).trim(); if (!frase) return;
    const tok = J.token; J.pendente = true; el.enviar.disabled = true;
    definirStatus(iaViva ? 'A IA está interpretando o decreto…' : 'Interpretando decreto (modo local)…', 'aviso');
    try {
      let r = await interpretarFrase(frase);
      if (!J || J.token !== tok || J.fim) return;
      if (r.fonte === 'ia') {
        // a IA pode errar (alvo inventado, valor fora do catálogo): se o validador achar um erro do modelo, o decreto é refeito pelo interpretador local
        const pre = L.validarDecreto(r.bruto, J.estado);
        if (!pre.aprovado && /não existe|malformado|protegid/.test(pre.motivo)) r = { bruto: L.interpretarLocal(frase, J.estado), fonte: 'local-fallback', ms: r.ms };
      }
      executarDecreto(r.bruto, { frase, fonte: r.fonte, ms: r.ms });
    } finally { if (J && J.token === tok) { J.pendente = false; el.enviar.disabled = !J.papel.regenteHumano; } }
  }
  async function pensarRegenteIA(dt) {
    const R = J.regenteIA, S = J.estado;
    R.proximo -= dt;
    if (R.proximo > 0 || R.ocupado || J.papel.regenteHumano || J.fim || S.vontade < 28) return;
    R.ocupado = true; const tok = J.token;
    try {
      let bruto = null, fala = '', fonte = 'regente-local', ms = 0;
      if (iaViva && sampleFn) {
        const t0 = performance.now();
        try {
          const r = await chamarIA(L.montarPromptRegente(S));
          const c = L.coagirDecreto(r && r.decreto);
          if (c.ok) { bruto = c.decreto; fala = L.limitarTexto(r.fala || '', 120); fonte = 'regente-ia'; ms = Math.round(performance.now() - t0); }
        } catch (e) { tratarErroIA(e); }
      }
      if (!bruto) { const par = L.FRASES_REGENTE[Math.floor(Math.random() * L.FRASES_REGENTE.length)]; fala = par[0]; bruto = L.interpretarLocal(par[1], S); }
      if (!J || J.token !== tok || J.fim) return;
      const ok = executarDecreto(bruto, { frase: fala || 'Decreto do Regente-IA', fonte, ms });
      if (ok && fala) { J.legendaIA = fala; J.legendaAte = S.relogio + 3.2; }
      R.proximo = ok ? rand(6, 9) : rand(2, 3);
    } finally { R.ocupado = false; }
  }

  // ---------- física ----------
  const colidiveis = (S) => S.objetos.filter((o) => o.ativo && L.efetivo(o).solido && !['saida', 'checkpoint'].includes(o.tipo));
  function matar(razao) {
    const S = J.estado, e = S.explorador;
    if (e.morto > 0 || e.invul > 0 || J.fim) return;
    if (J.modo !== 'treino') S.vidas--;
    explodir(e.x + e.w / 2, e.y + e.h / 2, '#e6907e', 30); SOM.morte(); if (!REDUZIR) tremor = 8;
    e.morto = 0.9; e.vx = 0; e.vy = 0; e.exposicao = 0; J.ultimaMorte = razao;
    definirStatus('☠ ' + razao + (J.modo === 'treino' ? '' : ', vidas: ' + Math.max(0, S.vidas)), 'ruim');
    if (S.vidas <= 0 && J.modo !== 'treino') terminar('regente', 'O Explorador ficou sem vidas (' + razao + ').');
  }
  function renascer() { const S = J.estado, e = S.explorador; e.x = S.spawn.x; e.y = S.spawn.y; e.vx = 0; e.vy = 0; e.invul = 1.6; e.noChao = false; }
  function moverExplorador(dt, ent) {
    const S = J.estado, e = S.explorador, mods = L.modificadores(S, 'explorador');
    const nw = 22 * mods.escala, nh = 30 * mods.escala;
    if (Math.abs(nh - e.h) > 0.01) { e.y += e.h - nh; e.x += (e.w - nw) / 2; e.w = nw; e.h = nh; e.escala = mods.escala; }
    let vento = 0;
    for (const z of L.zonasClima(S)) if (z.clima === 'vento' && L.sobrepoe(z.zona, e)) vento += (z.direcao === 'direita' ? 1 : -1) * 110;
    const alvoVx = ent.dir * 190 * mods.vel * (ent.escalaVel || 1) + vento;
    const sup = e.superficie;
    const atrito = e.noChao ? (mods.antiGelo ? 1 : mods.atritoBaixo ? 0.04 : sup ? L.efetivo(sup).atrito : 1) : 1;
    const taxa = e.noChao ? (atrito < 0.5 ? 260 : 2800) : 1500;
    e.vx = aproximar(e.vx, alvoVx, taxa * dt);
    if (ent.dir) e.dir = ent.dir;
    e.coyote = e.noChao ? 0.1 : (e.coyote || 0) - dt;
    e.buffer = ent.puloPress ? 0.12 : (e.buffer || 0) - dt;
    if (e.buffer > 0 && e.coyote > 0) { e.vy = -620; e.coyote = 0; e.buffer = 0; e.noChao = false; e.pulando = true; SOM.pulo(); }
    if (!ent.puloSegurando && e.vy < -230 && e.pulando) e.vy = -230;
    if (e.vy >= 0) e.pulando = false;
    e.vy = Math.min(900, e.vy + 1800 * mods.grav * dt);
    const solidos = colidiveis(S);
    e.x += e.vx * dt;
    for (const o of solidos) if (L.sobrepoe(e, o)) { if (e.vx > 0 || (e.vx === 0 && e.x < o.x)) e.x = o.x - e.w; else e.x = o.x + o.w; e.vx = 0; }
    e.x = Math.max(0, Math.min(LARGURA - e.w, e.x));
    e.noChao = false; e.superficie = null;
    e.y += e.vy * dt;
    for (const o of solidos) if (L.sobrepoe(e, o)) {
      if (e.vy > 0) { e.y = o.y - e.h; e.noChao = true; e.superficie = o; } else { e.y = o.y + o.h; }
      e.vy = 0;
    }
    e.anim += dt * Math.min(1.5, Math.abs(e.vx) / 120);
    // vidro quebra sob o peso; espelho reflete
    if (e.superficie && L.efetivo(e.superficie).quebradico) {
      const o = e.superficie; o.vidroT = (o.vidroT || 0) + dt;
      if (o.vidroT > 0.55) { o.ativo = false; S.efeitos.push({ id: 'vq' + (++S.contadorIds), tipo: 'remover', alvoId: o.id, restante: 4, duracao: 4, resumo: 'vidro quebrou', oculto: true }); explodir(o.x + o.w / 2, o.y, '#dbeafe', 22); SOM.espelho(); }
    }
    e.refletirCd = (e.refletirCd || 0) - dt;
    const caixa = { x: e.x - 2, y: e.y - 2, w: e.w + 4, h: e.h + 4 };
    for (const o of S.objetos) if (o.ativo && L.efetivo(o).refletor && e.refletirCd <= 0 && L.sobrepoe(caixa, o)) {
      explodir(e.x + e.w / 2, e.y + e.h / 2, '#dbeafe', 24); e.x = S.spawn.x; e.y = S.spawn.y; e.vx = 0; e.vy = 0; e.refletirCd = 0.9; SOM.espelho();
      definirStatus('🪞 O espelho refletiu o Explorador de volta ao último marco!', 'aviso');
    }
    if (e.y > ALTURA + 40) matar('caiu no abismo');
  }
  function atualizarInimigos(dt) {
    const S = J.estado, e = S.explorador, solidos = colidiveis(S);
    for (const o of S.objetos) {
      if (!o.ativo || o.tipo !== 'inimigo') continue;
      const m = L.modificadores(S, o.id), nw = 26 * m.escala, nh = 22 * m.escala;
      if (Math.abs(nh - o.h) > 0.01) { o.y += o.h - nh; o.x += (o.w - nw) / 2; o.w = nw; o.h = nh; }
      const vel = 50 * m.vel; o.vx = (o.vx >= 0 ? 1 : -1) * vel;
      o.x += o.vx * dt;
      for (const s of solidos) if (L.sobrepoe(o, s)) { o.x -= o.vx * dt; o.vx = -o.vx; break; }
      const sonda = { x: o.vx > 0 ? o.x + o.w + 2 : o.x - 3, y: o.y + o.h + 2, w: 1, h: 1 };
      const chaoSob = solidos.some((s) => L.sobrepoe({ x: o.x, y: o.y + o.h, w: o.w, h: 2 }, s));
      if (chaoSob && !solidos.some((s) => L.sobrepoe(sonda, s))) o.vx = -o.vx;
      if (!chaoSob) { o.vy = (o.vy || 0) + 1500 * dt; o.y += o.vy * dt; } else o.vy = 0;
      if (o.y > ALTURA + 40) o.ativo = false;
      if (e.morto <= 0 && e.invul <= 0) {
        const h = { x: o.x + 3, y: o.y + 3, w: o.w - 6, h: o.h - 3 };
        if (L.sobrepoe(e, h)) {
          if (e.vy > 60 && e.y + e.h - o.y < 16) { o.ativo = false; e.vy = -380; e.pulando = false; explodir(o.x + o.w / 2, o.y, '#7ecaa4', 18); SOM.pisao(); definirStatus('Slime esmagado!', 'bom'); }
          else matar('um slime pegou o Explorador');
        }
      }
    }
  }
  function checarMundo(dt) {
    const S = J.estado, e = S.explorador;
    if (e.morto > 0 || J.fim) return;
    for (const o of S.objetos) {
      if (!o.ativo || o.tipo === 'inimigo') continue;
      const ef = L.efetivo(o);
      // perigo sólido (lava): tocar por qualquer lado, inclusive pisar em cima, mata; perigo vazado (espinhos, poço): hitbox menor
      const toca = ef.solido ? L.sobrepoe({ x: e.x - 1, y: e.y - 1, w: e.w + 2, h: e.h + 3 }, o) : L.sobrepoe(e, { x: o.x + 5, y: o.y + 6, w: o.w - 10, h: o.h - 6 });
      if (ef.perigoso && toca) { matar(o.material === 'lava' ? 'lava!' : o.tipo === 'poco' ? 'caiu no ácido' : 'espinhos'); return; }
      if (o.tipo === 'checkpoint' && !o.atingido && L.sobrepoe(e, o)) {
        o.atingido = true; S.spawn = { x: o.x + 5, y: o.y + o.h - 30 }; S.vontade = Math.min(100, S.vontade + 15);
        explodir(o.x + 8, o.y + 10, '#96a2ec', 20); SOM.marco(); aviso('Marco alcançado: +15 de Vontade para o Regente.', 2000);
      }
      if (o.tipo === 'saida' && L.sobrepoe(e, { x: o.x + 10, y: o.y, w: o.w - 20, h: o.h })) { explodir(o.x + o.w / 2, o.y + o.h / 2, '#dcab5c', 50); terminar('explorador', 'Chegou ao portal de saída com ' + Math.max(0, Math.round(S.tempoRestante)) + 's de sobra.'); return; }
    }
    let naChuva = false;
    for (const z of L.zonasClima(S)) if (z.clima === 'chuva_acida' && L.sobrepoe(z.zona, e)) naChuva = true;
    e.exposicao = naChuva ? e.exposicao + dt : Math.max(0, e.exposicao - dt * 0.8);
    if (e.exposicao >= 1.6) matar('derretido pela chuva ácida');
  }

  // ---------- bot Explorador (usa o MESMO planejador do validador) ----------
  function pensarBot(dt) {
    const S = J.estado, e = S.explorador, b = J.bot;
    if (e.morto > 0) { b.plano = null; return { dir: 0, puloPress: false, puloSegurando: false }; }
    if (S.relogio < b.inicio) return { dir: 0, puloPress: false, puloSegurando: false }; // tempo de preparação do Regente
    const cel = L.celulaDoPe(e.x, e.y, e.w, e.h);
    let nevoa = false; for (const z of L.zonasClima(S)) if (z.clima === 'neblina' && L.sobrepoe(z.zona, e)) nevoa = true;
    b.timer -= dt;
    if (e.noChao && b.timer <= 0) {
      const g = L.criarGrade(S.objetos), o = L.origemPisavel(g, cel.c, cel.r);
      b.plano = o ? L.planificar(g, o, L.predicadoSaida(S)) : null; b.timer = nevoa ? 0.7 : 0.18;
    }
    b.parado = Math.abs(e.x - b.ultimoX) < 0.4 * dt * 60 ? b.parado + dt : 0; b.ultimoX = e.x;
    const p = b.plano && b.plano[0];
    if (!p) return { dir: 0, puloPress: false, puloSegurando: false };
    const tx = (p.c2 + 0.5) * TILE, cx = e.x + e.w / 2, dx = tx - cx;
    const mods = L.modificadores(S, 'explorador');
    let dir = Math.abs(dx) < 3 ? 0 : sinal(dx), puloPress = false;
    const sobe = (p.acao === 'pular' || p.acao === 'degrau') && p.r2 < p.r;
    if (!e.noChao) {
      // subindo: sobe na vertical até o pé passar da superfície de destino; só então avança
      const abaixo = sobe && p.acao === 'pular' && e.y + e.h > (p.r2 + 1) * TILE - 3 && e.vy < 0;
      dir = abaixo || Math.abs(dx) < 6 ? 0 : sinal(dx);
      return { dir, puloPress: false, puloSegurando: true, escalaVel: 1 };
    }
    // cauteloso: antes de cada salto o bot "olha em volta" por um instante (dá tempo ao Regente de reagir)
    const chave = p.c + ',' + p.r + '>' + p.c2 + ',' + p.r2;
    if ((p.acao === 'pular' || p.acao === 'degrau') && b.pausaChave !== chave) { b.pausaChave = chave; b.pausa = 0.9; }
    if (b.pausa > 0) { b.pausa -= dt; return { dir: 0, puloPress: false, puloSegurando: false }; }
    if (p.acao === 'degrau' && Math.abs(dx) < 1.25 * TILE) puloPress = true;
    if (p.acao === 'pular' && sobe) {
      // subida em salto: alinha com o centro da célula de origem e salta na vertical
      const ox = (p.c + 0.5) * TILE - cx;
      dir = Math.abs(ox) < 4 ? 0 : sinal(ox);
      if (Math.abs(ox) < 6) puloPress = true;
    } else if (p.acao === 'pular') {
      const h = (p.r - p.r2) * TILE, g = 1800 * mods.grav, v0 = 620, disc = v0 * v0 - 2 * g * h;
      const t = disc > 0 ? (v0 + Math.sqrt(disc)) / g : v0 / g, alcance = 190 * mods.vel * t;
      if (Math.abs(dx) <= alcance * 0.93) puloPress = true;
    }
    for (const o of S.objetos) if (o.ativo && o.tipo === 'inimigo' && Math.abs(o.y - e.y) < 30 && sinal(o.x - e.x) === (dir || e.dir) && Math.abs(o.x - e.x) < 70) puloPress = true;
    if (b.parado > 0.9 && dir !== 0) { puloPress = true; b.parado = 0; b.timer = 0; }
    return { dir, puloPress, puloSegurando: true, escalaVel: p.acao === 'pular' ? 1 : 0.42 };
  }

  function passoMundo(dt) {
    const S = J.estado, e = S.explorador;
    S.relogio += dt;
    if (J.modo !== 'treino') S.tempoRestante -= dt;
    S.vontade = Math.min(100, S.vontade + (J.modo === 'treino' ? 12 : 7) * dt);
    const preparando = !J.papel.exploradorHumano && S.relogio < J.bot.inicio; // o mundo é montado antes do Explorador chegar
    if (!preparando) for (const ef of L.tickEfeitos(S, dt)) if (!ef.oculto) { const c = centroDoEfeito(ef); if (c) explodir(c.x, c.y, '#a29cb8', 8); }
    atualizarInimigos(dt);
    if (e.morto > 0) { e.morto -= dt; if (e.morto <= 0 && !J.fim) renascer(); }
    else {
      e.invul = Math.max(0, e.invul - dt);
      let ent;
      if (J.papel.exploradorHumano) { ent = { dir: (teclas.dir ? 1 : 0) - (teclas.esq ? 1 : 0), puloPress: J.puloEdge, puloSegurando: teclas.pulo }; J.puloEdge = false; }
      else ent = pensarBot(dt);
      moverExplorador(dt, ent);
      if (!preparando) checarMundo(dt);
    }
    if (!J.papel.regenteHumano) pensarRegenteIA(dt);
    if (J.modo !== 'treino' && S.tempoRestante <= 0 && !J.fim) terminar('regente', 'O tempo acabou, o Explorador não chegou à saída.');
  }

  // ---------- entrada ----------
  const digitando = () => document.activeElement === el.frase;
  window.addEventListener('keydown', (ev) => {
    if (tela !== 'jogo' || !J) return;
    const k = ev.key;
    if (k === 'ArrowLeft') { teclas.esq = true; ev.preventDefault(); }
    else if (k === 'ArrowRight') { teclas.dir = true; ev.preventDefault(); }
    else if (k === 'ArrowUp') { if (!teclas.pulo) J.puloEdge = true; teclas.pulo = true; ev.preventDefault(); }
    else if (!digitando()) {
      if (k === 'a' || k === 'A') teclas.esq = true;
      else if (k === 'd' || k === 'D') teclas.dir = true;
      else if (k === 'w' || k === 'W' || k === ' ') { if (!teclas.pulo) J.puloEdge = true; teclas.pulo = true; ev.preventDefault(); }
      else if (k === 'Enter' && J.papel.regenteHumano) { el.frase.focus(); ev.preventDefault(); }
      else if ((k === 'r' || k === 'R') && J.modo === 'treino') { iniciarNivel(); }
      else if (J.modo === 'treino' && ['1', '2', '3'].includes(k)) { J.nivelIdx = Number(k) - 1; iniciarNivel(); }
      else if (k === 'm' || k === 'M') { mudo = !mudo; aviso(mudo ? 'Som desligado' : 'Som ligado', 1200); }
      else if (k === 'p' || k === 'P' || k === 'Escape') { J.pausado = !J.pausado; aviso(J.pausado ? 'PAUSADO (P continua)' : 'Continuando', 1200); }
    } else if (k === 'Escape') el.frase.blur();
  });
  window.addEventListener('keyup', (ev) => {
    const k = ev.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') teclas.esq = false;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') teclas.dir = false;
    else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') teclas.pulo = false;
  });
  window.addEventListener('blur', () => { teclas.esq = teclas.dir = teclas.pulo = false; });
  el.frase.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); const t = el.frase.value; el.frase.value = ''; J && (J.legenda = ''); decretar(t); } });
  el.frase.addEventListener('input', () => { if (J) J.legenda = el.frase.value; });
  el.enviar.addEventListener('click', () => { const t = el.frase.value; el.frase.value = ''; J && (J.legenda = ''); decretar(t); el.frase.focus(); });
  document.querySelectorAll('#toque button').forEach((b) => {
    const k = b.dataset.k;
    const on = (ev) => { ev.preventDefault(); if (k === 'pulo') { if (!teclas.pulo && J) J.puloEdge = true; teclas.pulo = true; } else teclas[k] = true; };
    const off = (ev) => { ev.preventDefault(); teclas[k] = false; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  });
  $('m-campanha').addEventListener('click', () => iniciarModo('campanha'));
  $('m-coop').addEventListener('click', () => iniciarModo('coop'));
  $('m-treino').addEventListener('click', () => iniciarModo('treino'));
  $('m-como').addEventListener('click', () => { esconder(el.menu); mostrar(el.como); });
  $('como-voltar').addEventListener('click', () => { esconder(el.como); mostrar(el.menu); });
  $('intro-ok').addEventListener('click', iniciarNivel);
  $('res-prox').addEventListener('click', () => {
    if (J.modo === 'treino') { iniciarNivel(); return; }
    if (J.nivelIdx >= L.NIVEIS.length - 1) { abrirFim(); return; }
    J.nivelIdx++; abrirIntro();
  });
  $('fim-menu').addEventListener('click', voltarMenu);
  el.iaToggle.addEventListener('click', () => { iaViva = !iaViva; atualizarMenuIA(); });
  el.iaBaixar.addEventListener('click', ativarIANavegador);

  // ---------- renderização ----------
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fundo(img, escuro) {
    if (img._ok) { const r = Math.max(LARGURA / img.naturalWidth, ALTURA / img.naturalHeight), w = img.naturalWidth * r, h = img.naturalHeight * r; ctx.drawImage(img, (LARGURA - w) / 2, (ALTURA - h) / 2, w, h); }
    else { const g = ctx.createLinearGradient(0, 0, 0, ALTURA); g.addColorStop(0, '#1b1730'); g.addColorStop(1, '#0d0b12'); ctx.fillStyle = g; ctx.fillRect(0, 0, LARGURA, ALTURA); }
    ctx.fillStyle = 'rgba(10,8,18,' + escuro + ')'; ctx.fillRect(0, 0, LARGURA, ALTURA);
  }
  function blocoPedra(o) {
    const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h); g.addColorStop(0, '#34304d'); g.addColorStop(1, '#1b1830');
    ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let y = o.y + 16; y < o.y + o.h; y += 16) { ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); }
    for (let y = o.y, k = 0; y < o.y + o.h; y += 16, k++) for (let x = o.x + (k % 2 ? 16 : 0); x < o.x + o.w; x += 32) { ctx.moveTo(x, y); ctx.lineTo(x, Math.min(y + 16, o.y + o.h)); }
    ctx.stroke();
    if (o.tipo === 'chao' || o.tipo === 'plataforma') { ctx.fillStyle = 'rgba(220,171,92,.9)'; ctx.fillRect(o.x, o.y, o.w, 3); }
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeRect(o.x + .5, o.y + .5, o.w - 1, o.h - 1);
  }
  function porta(o) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(o.x - 3, o.y - 3, o.w + 6, o.h + 3, 14); ctx.fill();
    const g = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0); g.addColorStop(0, '#6b4a22'); g.addColorStop(.5, '#8a6230'); g.addColorStop(1, '#5a3d1b');
    ctx.fillStyle = g; rr(o.x, o.y, o.w, o.h, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); for (let x = o.x + 16; x < o.x + o.w; x += 16) { ctx.moveTo(x, o.y + 6); ctx.lineTo(x, o.y + o.h); } ctx.stroke();
    ctx.fillStyle = '#dcab5c'; ctx.beginPath(); ctx.arc(o.x + o.w - 10, o.y + o.h * 0.55, 3, 0, 7); ctx.fill();
  }
  function poco(o, t) {
    const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h); g.addColorStop(0, '#9be86a'); g.addColorStop(1, '#2d6b2a');
    ctx.fillStyle = g; ctx.fillRect(o.x, o.y + 8, o.w, o.h - 8);
    ctx.fillStyle = '#c9ff8f'; ctx.beginPath(); ctx.moveTo(o.x, o.y + 8);
    for (let x = 0; x <= o.w; x += 8) ctx.lineTo(o.x + x, o.y + 6 + Math.sin(t * 3 + x * .25) * 2.5);
    ctx.lineTo(o.x + o.w, o.y + 12); ctx.lineTo(o.x, o.y + 12); ctx.fill();
    ctx.fillStyle = 'rgba(220,255,180,.7)'; for (let i = 0; i < 3; i++) { const bx = o.x + ((i * 23 + t * 14) % o.w), by = o.y + 14 + ((t * 20 + i * 11) % 18); ctx.beginPath(); ctx.arc(bx, by, 2, 0, 7); ctx.fill(); }
  }
  function espinhos(o) {
    ctx.fillStyle = '#c9c3dc'; for (let x = o.x; x < o.x + o.w; x += 16) { ctx.beginPath(); ctx.moveTo(x, o.y + o.h); ctx.lineTo(x + 8, o.y + 4); ctx.lineTo(x + 16, o.y + o.h); ctx.fill(); }
    ctx.strokeStyle = '#6b6585'; ctx.lineWidth = 1; for (let x = o.x; x < o.x + o.w; x += 16) { ctx.beginPath(); ctx.moveTo(x, o.y + o.h); ctx.lineTo(x + 8, o.y + 4); ctx.lineTo(x + 16, o.y + o.h); ctx.stroke(); }
  }
  function slime(o, t) {
    const s = 1 + Math.sin(t * 7 + o.x) * .06, cx = o.x + o.w / 2, base = o.y + o.h;
    ctx.fillStyle = '#58c987'; ctx.beginPath(); ctx.ellipse(cx, base - o.h * .45 * s, o.w / 2, o.h * .5 * s, 0, Math.PI, 0); ctx.lineTo(cx + o.w / 2, base); ctx.lineTo(cx - o.w / 2, base); ctx.fill();
    ctx.fillStyle = '#1a1408'; ctx.beginPath(); ctx.arc(cx - 5, base - o.h * .5, 2.4, 0, 7); ctx.arc(cx + 5, base - o.h * .5, 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.ellipse(cx - 5, base - o.h * .75, 4, 2, 0, 0, 7); ctx.fill();
  }
  function marco(o, t) {
    ctx.fillStyle = '#6b6585'; ctx.fillRect(o.x + 6, o.y, 3, o.h);
    ctx.fillStyle = o.atingido ? '#7ecaa4' : '#a29cb8'; ctx.beginPath(); ctx.moveTo(o.x + 9, o.y + 2); ctx.lineTo(o.x + 28 + Math.sin(t * 4) * 2, o.y + 9); ctx.lineTo(o.x + 9, o.y + 16); ctx.fill();
  }
  function portal(o, t) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, pul = 1 + Math.sin(t * 3) * .05;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, o.h * .75 * pul); g.addColorStop(0, 'rgba(255,240,200,.95)'); g.addColorStop(.45, 'rgba(150,162,236,.8)'); g.addColorStop(1, 'rgba(150,162,236,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, o.w * .75 * pul, o.h * .55 * pul, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#dcab5c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(cx, cy, o.w * .42, o.h * .46, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); for (let a = 0; a < 6.3; a += .4) { const r = 4 + a * 4 + Math.sin(t * 2) * 2; ctx.lineTo(cx + Math.cos(a + t * 2) * r * .8, cy + Math.sin(a + t * 2) * r); } ctx.stroke();
  }
  function materialSobre(o, t) {
    ctx.save(); ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();
    if (o.material === 'lava') {
      const g = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h); g.addColorStop(0, '#ffd45a'); g.addColorStop(.5, '#ff7a1a'); g.addColorStop(1, '#a3200c'); ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = 'rgba(255,230,120,.55)'; for (let i = 0; i < o.w; i += 14) ctx.fillRect(o.x + i, o.y + 3 + Math.sin(t * 4 + i) * 3, 8, 3);
    } else if (o.material === 'gelo') {
      ctx.fillStyle = 'rgba(160,225,255,.65)'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
      for (let i = -o.h; i < o.w; i += 22) { ctx.beginPath(); ctx.moveTo(o.x + i, o.y + o.h); ctx.lineTo(o.x + i + o.h * .6, o.y); ctx.stroke(); }
    } else if (o.material === 'vidro') {
      const tr = o.vidroT > 0 ? Math.sin(t * 60) * 1.5 : 0;
      ctx.fillStyle = 'rgba(210,230,255,.4)'; ctx.fillRect(o.x + tr, o.y, o.w, o.h); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(o.x + o.w * .2, o.y); ctx.lineTo(o.x + o.w * .35, o.y + o.h * .5); ctx.lineTo(o.x + o.w * .3, o.y + o.h); ctx.moveTo(o.x + o.w * .7, o.y); ctx.lineTo(o.x + o.w * .6, o.y + o.h * .6); ctx.stroke();
    } else if (o.material === 'espelho') {
      const off = ((t * 90) % (o.w + o.h + 60)) - 30; const g = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
      g.addColorStop(0, '#e9eefc'); g.addColorStop(.5, '#9fb0d9'); g.addColorStop(1, '#dfe6f7'); ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.moveTo(o.x + off, o.y); ctx.lineTo(o.x + off + 14, o.y); ctx.lineTo(o.x + off - o.h + 14, o.y + o.h); ctx.lineTo(o.x + off - o.h, o.y + o.h); ctx.fill();
    }
    ctx.restore(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.strokeRect(o.x + .5, o.y + .5, o.w - 1, o.h - 1);
  }
  function desenharObjeto(o, t) {
    if (!o.ativo) return;
    switch (o.tipo) {
      case 'chao': case 'plataforma': case 'muro': case 'parede': blocoPedra(o); break;
      case 'ponte': { const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h); g.addColorStop(0, '#9a7036'); g.addColorStop(1, '#5b3f1c'); ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.fillStyle = '#dcab5c'; ctx.fillRect(o.x, o.y, o.w, 3); ctx.strokeStyle = 'rgba(0,0,0,.4)'; for (let x = o.x + 16; x < o.x + o.w; x += 16) { ctx.beginPath(); ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); ctx.stroke(); } break; }
      case 'caixa': ctx.fillStyle = '#8a6230'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeStyle = '#4a3216'; ctx.lineWidth = 3; ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3); ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + o.w, o.y + o.h); ctx.moveTo(o.x + o.w, o.y); ctx.lineTo(o.x, o.y + o.h); ctx.stroke(); break;
      case 'porta': porta(o); break;
      case 'poco': poco(o, t); break;
      case 'espinhos': espinhos(o); break;
      case 'inimigo': slime(o, t); break;
      case 'checkpoint': marco(o, t); break;
      case 'saida': portal(o, t); break;
      default: break;
    }
    if (o.material) materialSobre(o, t);
    if (o.gerado) { ctx.strokeStyle = 'rgba(220,171,92,.8)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeRect(o.x - 1, o.y - 1, o.w + 2, o.h + 2); ctx.setLineDash([]); }
  }
  function explorador(e, t) {
    if (e.morto > 0) return;
    if (e.invul > 0 && Math.floor(t * 14) % 2 === 0) return;
    const esc = e.h / 30, cx = e.x + e.w / 2, base = e.y + e.h;
    ctx.save(); ctx.translate(cx, base); ctx.scale((e.dir >= 0 ? 1 : -1) * esc, esc);
    const andando = Math.abs(e.vx) > 10 && e.noChao, ph = andando ? Math.sin(e.anim * 14) : 0;
    ctx.fillStyle = '#2a2540'; ctx.fillRect(-6, -8, 5, 8 + ph * 2); ctx.fillRect(1, -8, 5, 8 - ph * 2);
    ctx.fillStyle = '#96a2ec'; rr(-9, -22, 18, 15, 5); ctx.fill();
    ctx.fillStyle = '#5b66b8'; ctx.beginPath(); ctx.moveTo(-9, -20); ctx.lineTo(-13, -8 + Math.abs(ph) * 1.5); ctx.lineTo(-6, -8); ctx.fill();
    ctx.fillStyle = '#dcab5c'; ctx.fillRect(-9, -13, 18, 2);
    ctx.fillStyle = '#f0d2b0'; ctx.beginPath(); ctx.arc(0, -25, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#5b66b8'; ctx.beginPath(); ctx.arc(0, -26, 6.2, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#1a1408'; ctx.fillRect(2, -26, 2, 2);
    ctx.restore();
  }
  function zonaClima(z, t) {
    const r = z.zona; ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    const fadeIn = Math.min(1, (z.duracao - z.restante) / 0.4), fadeOut = Math.min(1, z.restante / 0.6), a = Math.min(fadeIn, fadeOut);
    if (z.clima === 'chuva_acida') {
      ctx.fillStyle = 'rgba(120,220,80,' + 0.13 * a + ')'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeStyle = 'rgba(170,255,110,' + 0.75 * a + ')'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let x = r.x; x < r.x + r.w; x += 11) { const y = r.y + ((t * 380 + x * 7) % r.h); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); } ctx.stroke();
    } else if (z.clima === 'vento') {
      const d = z.direcao === 'direita' ? 1 : -1; ctx.strokeStyle = 'rgba(200,215,255,' + 0.6 * a + ')'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < 12; i++) { const y = r.y + 14 + i * (r.h / 12), x = r.x + (((t * 260 * d) + i * 61) % r.w + r.w) % r.w; ctx.moveTo(x, y); ctx.lineTo(x + 34 * d, y + Math.sin(t * 6 + i) * 4); }
      ctx.stroke();
    } else {
      const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h); g.addColorStop(0, 'rgba(200,200,215,' + 0.25 * a + ')'); g.addColorStop(1, 'rgba(225,225,235,' + 0.78 * a + ')'); ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
  }
  function fitTexto(txt, max) { if (ctx.measureText(txt).width <= max) return txt; let s = txt; while (s.length > 3 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; }
  const FONTE_MONO = '500 12px "IBM Plex Mono", ui-monospace, monospace';
  function hud(t) {
    const S = J.estado;
    ctx.fillStyle = 'rgba(13,11,18,.72)'; rr(10, 8, 262, 106, 10); ctx.fill();
    ctx.font = '700 15px "Fraunces", Georgia, serif'; ctx.fillStyle = '#dcab5c'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('REGÊNCIA · ' + (J.modo === 'treino' ? 'Treino' : 'Nível ' + (J.nivelIdx + 1)) + ', ' + S.nome, 20, 28, 244);
    ctx.font = FONTE_MONO; ctx.fillStyle = '#a29cb8'; ctx.fillText('EXPLORADOR (' + J.papel.rotE + ')', 20, 46);
    ctx.font = '16px "Public Sans", system-ui, sans-serif';
    for (let i = 0; i < S.vidasMax; i++) { ctx.fillStyle = i < S.vidas || J.modo === 'treino' ? '#e6907e' : '#3a3450'; ctx.fillText('♥', 20 + i * 20, 66); }
    ctx.font = FONTE_MONO; ctx.fillStyle = '#a29cb8'; ctx.fillText('VONTADE (' + J.papel.rotR + ')', 20, 84);
    ctx.fillStyle = '#2a2540'; rr(20, 90, 236, 12, 6); ctx.fill();
    ctx.fillStyle = '#dcab5c'; rr(20, 90, Math.max(8, 236 * S.vontade / 100), 12, 6); ctx.fill();
    ctx.fillStyle = '#1a1408'; ctx.fillText(String(Math.floor(S.vontade)), 26, 100);
    // temporizador
    ctx.textAlign = 'center';
    if (J.modo === 'treino') { ctx.font = '600 13px "IBM Plex Mono", monospace'; ctx.fillStyle = '#96a2ec'; ctx.fillText('TREINO · R reinicia · 1-3 níveis', LARGURA / 2, 26); }
    else { const s = Math.max(0, Math.ceil(S.tempoRestante)); ctx.font = '700 26px "IBM Plex Mono", monospace'; ctx.fillStyle = s <= 10 ? '#e6907e' : '#ece8f2'; ctx.fillText(String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'), LARGURA / 2, 32); }
    // efeitos ativos
    ctx.textAlign = 'left'; ctx.font = FONTE_MONO; let y = 128;
    for (const ef of S.efeitos.filter((x) => !x.oculto).slice(-5)) {
      ctx.fillStyle = 'rgba(13,11,18,.7)'; rr(10, y - 12, 262, 18, 6); ctx.fill();
      ctx.fillStyle = '#96a2ec'; ctx.fillText('●', 16, y + 1); ctx.fillStyle = '#ece8f2'; ctx.fillText(fitTexto(ef.resumo, 190), 30, y + 1);
      ctx.fillStyle = '#dcab5c'; ctx.textAlign = 'right'; ctx.fillText(Math.max(0, Math.ceil(ef.restante)) + 's', 266, y + 1); ctx.textAlign = 'left'; y += 22;
    }
    // log de decretos
    const ultimos = J.log.slice(-4);
    if (ultimos.length) {
      const h = 14 + ultimos.length * 34; ctx.fillStyle = 'rgba(13,11,18,.78)'; rr(LARGURA - 346, 8, 336, h, 10); ctx.fill();
      ultimos.forEach((c, i) => {
        const yy = 26 + i * 34; const [nome, cls] = selosDe(c.fonte);
        ctx.font = '600 11px "IBM Plex Mono", monospace'; ctx.fillStyle = cls === 'ia' ? '#7ecaa4' : cls === 'bot' ? '#96a2ec' : '#dcab5c';
        const larguraSelo = ctx.measureText('[' + nome + '] ').width; ctx.fillText('[' + nome + ']', LARGURA - 336, yy);
        ctx.font = '500 12px "Public Sans", system-ui, sans-serif'; ctx.fillStyle = '#ece8f2'; ctx.fillText(fitTexto('“' + c.frase + '”', 318 - larguraSelo), LARGURA - 336 + larguraSelo, yy);
        ctx.font = FONTE_MONO; ctx.fillStyle = c.resultado === 'rejeitado' || c.resultado === 'sem_vontade' ? '#e6907e' : '#a29cb8';
        ctx.fillText(fitTexto(c.resultado === 'rejeitado' ? '✖ ' + c.motivo : c.resultado === 'sem_vontade' ? '✖ sem Vontade' : '✔ ' + c.resumo, 318), LARGURA - 336, yy + 15);
      });
    }
    // legenda ao vivo (o que o Regente está dizendo) + fala do Regente-IA
    let leg = '';
    if (J.papel.regenteHumano && J.legenda) leg = J.papel.rotR + ': ' + J.legenda;
    if (!J.papel.regenteHumano && J.legendaIA && S.relogio < J.legendaAte) leg = 'Regente-IA: ' + J.legendaIA;
    if (leg) { ctx.font = '500 15px "Public Sans", system-ui, sans-serif'; const w = Math.min(760, ctx.measureText(leg).width + 28); ctx.fillStyle = 'rgba(13,11,18,.82)'; rr(LARGURA / 2 - w / 2, ALTURA - 52, w, 30, 15); ctx.fill(); ctx.fillStyle = '#ece8f2'; ctx.textAlign = 'center'; ctx.fillText(fitTexto(leg, 730), LARGURA / 2, ALTURA - 32); }
    if (!J.papel.exploradorHumano && S.relogio < J.bot.inicio) { ctx.textAlign = 'center'; ctx.font = '700 18px "IBM Plex Mono", monospace'; ctx.fillStyle = '#96a2ec'; ctx.fillText('O Explorador entra em ' + Math.ceil(J.bot.inicio - S.relogio) + 's, prepare seus decretos!', LARGURA / 2, 84); }
    if (J.pendente || (J.regenteIA && J.regenteIA.ocupado)) { ctx.textAlign = 'center'; ctx.font = '600 13px "IBM Plex Mono", monospace'; ctx.fillStyle = '#dcab5c'; ctx.fillText((J.pendente ? 'interpretando decreto' : 'Regente-IA pensando') + '.'.repeat(1 + Math.floor(t * 3) % 3), LARGURA / 2, 56); }
    if (J.pausado) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, LARGURA, ALTURA); ctx.fillStyle = '#ece8f2'; ctx.textAlign = 'center'; ctx.font = '700 40px "Fraunces", serif'; ctx.fillText('PAUSADO', LARGURA / 2, ALTURA / 2); }
    if (J.fim) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, LARGURA, ALTURA); }
    ctx.textAlign = 'left';
  }
  function desenhar(dt) {
    relogioVisual += dt; const t = relogioVisual;
    ctx.save(); ctx.clearRect(0, 0, LARGURA, ALTURA);
    if (tela !== 'jogo' || !J || !J.estado) { fundo(imgMenu, 0.5); ctx.restore(); return; }
    if (tremor > 0.1) { ctx.translate(rand(-tremor, tremor), rand(-tremor, tremor)); tremor *= 0.88; }
    fundo(imgJogo, 0.6);
    const S = J.estado;
    for (const o of S.objetos) if (o.ativo && o.tipo !== 'inimigo') desenharObjeto(o, t);
    for (const o of S.objetos) if (o.ativo && o.tipo === 'inimigo') desenharObjeto(o, t);
    explorador(S.explorador, t);
    for (const z of L.zonasClima(S)) zonaClima(z, t);
    for (const p of particulas) { ctx.globalAlpha = Math.max(0, p.vida / p.max); ctx.fillStyle = p.cor; ctx.fillRect(p.x, p.y, p.tam, p.tam); }
    ctx.globalAlpha = 1;
    for (let i = particulas.length - 1; i >= 0; i--) { const p = particulas[i]; p.vida -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; if (p.vida <= 0) particulas.splice(i, 1); }
    hud(t); ctx.restore();
  }

  // ---------- loop ----------
  let ultimo = 0, acum = 0;
  function quadro(ts) {
    requestAnimationFrame(quadro);
    const dt = Math.min(0.05, (ts - ultimo) / 1000 || 0); ultimo = ts;
    if (tela === 'jogo' && J && J.estado && !J.pausado && !J.fim) { acum += dt; while (acum >= FIXO) { passoMundo(FIXO); acum -= FIXO; if (J.fim) break; } }
    desenhar(dt);
  }
  requestAnimationFrame(quadro);

  // gancho para testes automatizados no navegador (não afeta o jogo)
  window.__regencia = {
    L, estado: () => J, tela: () => tela, iniciarModo, iniciarNivel, decretar, executarDecreto, teclas,
    avancar(seg) { let n = Math.round(seg / FIXO); while (n-- > 0 && J && !J.fim) passoMundo(FIXO); }, desenhar: () => desenhar(0.016),
    ativarIANavegador, forcarIA(on, fn) { sampleFn = fn || sampleFn; iaDisponivel = !!sampleFn; iaViva = !!on && !!sampleFn; atualizarMenuIA(); },
  };

  setTela('menu');
  atualizarMenuIA();
  iniciarIA();
})();
