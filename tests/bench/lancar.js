/* Executa uma fila de benchmarks (webllm_bench.js) e envia cada resultado a um receptor local (POST ?nome=arquivo.json).
 * Se a GPU reiniciar no meio, recarregue a pagina e chame de novo: os passos concluidos e o progresso do passo atual
 * ficam no localStorage e a fila continua de onde parou.
 * Uso:  window.__lancar([{ modelo: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', arquivo: 'bench_webllm_qwen2.5-3b_todos.json' }], 'http://localhost:8799') */
(function () {
  window.__lancar = async function (passos, receptor) {
    window.__fila = 'rodando'; window.__filaErro = null;
    const feitos = JSON.parse(localStorage.getItem('bench:feitos') || '[]');
    try {
      for (const p of passos) {
        if (feitos.includes(p.arquivo)) continue;
        const r = await window.__bench.rodar({ modelo: p.modelo, estrategia: p.estrategia || 'compacto+schema', casos: p.casos, retomar: true });
        await fetch(receptor + '/?nome=' + p.arquivo, { method: 'POST', body: JSON.stringify(r, null, 1) });
        feitos.push(p.arquivo); localStorage.setItem('bench:feitos', JSON.stringify(feitos));
      }
      window.__fila = 'fim';
    } catch (e) { window.__filaErro = String((e && e.message) || e).slice(0, 200); window.__fila = 'erro'; }
  };
})();
