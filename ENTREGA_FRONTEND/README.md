# `Entrega de Front-end: Checkpoint 5`

Pasta de entrega da disciplina de **Front-end**. Reune, em um so lugar, tudo o que o enunciado pede e onde cada item pode ser verificado. O projeto completo (jogo, back-end e painel) esta no repositorio: https://github.com/Arthur-Baptista-dos-Santos/REGENCIA

Video de Front-end: https://youtu.be/1-x3sWunHAc

Os nomes, RMs e links da entrega tambem estao em [DADOS_DA_ENTREGA.txt](DADOS_DA_ENTREGA.txt).

---

## `Integrantes`

| Nome | RM |
|---|---|
| Arthur Baptista dos Santos | 565346 |
| João Pedro de Moura Dutra Franco | 561738 |
| Nelson Félix Neto | 565603 |

---

## `Requisitos minimos do enunciado e onde estao`

| Requisito (enunciado, Front-end) | Onde esta | Como conferir |
|---|---|---|
| Back-end FastAPI com rota dedicada a IA generativa, em router, com a chamada ao servico externo isolada em provider | [`backend/app/routers/ia_generativa.py`](../backend/app/routers/ia_generativa.py) e [`backend/app/providers/ia_provider.py`](../backend/app/providers/ia_provider.py) | Trechos 1, 2 e 3 em [trechos_de_codigo.md](trechos_de_codigo.md) |
| Autenticacao protegendo a rota (API Key via `X-API-Key`) | [`backend/app/security.py`](../backend/app/security.py) | Trecho 4; no Swagger, botao *Authorize*; [chamadas_curl.txt](evidencias/chamadas_curl.txt) mostra 401 sem chave e 401 com chave errada |
| Evidencia de que o jogo consome essa mesma API em tempo de execucao | [`web/js/api.js`](../web/js/api.js) | Trecho 6; capturas `08_jogo_via_api.png` e `12_log_chamadas_api.jpg` em [evidencias](evidencias) |
| Documentacao automatica (Swagger em `/docs`) | `http://localhost:8000/docs` com a API rodando | Captura `09_swagger.png` |
| CORS (citado na avaliacao de Front) | [`backend/app/main.py`](../backend/app/main.py) | Trecho 5; preflight real registrado em [chamadas_curl.txt](evidencias/chamadas_curl.txt) |
| Front de consumo via `requests` (painel Streamlit) | [`painel/`](../painel) | Trecho 7; captura `10_painel_streamlit.png` |
| Link do repositorio (GitHub) com back-end e jogo | https://github.com/Arthur-Baptista-dos-Santos/REGENCIA | Pastas `backend/`, `web/` e `painel/` |
| Video simples explicando o jogo e a arquitetura | https://youtu.be/1-x3sWunHAc | Assistir ao video |

Endpoint implementado (modalidade **texto**): `POST /v1/ia-generativa/texto`, o mesmo sugerido no enunciado.

---

## `Jogo publicado`

https://arthur-baptista-dos-santos.github.io/REGENCIA/

O jogo abre no navegador sem instalar nada. Para ele usar a API do grupo, abra **Configuracoes**, informe a URL da API (`http://localhost:8000`) e a `API_KEY`, marque *Usar a API* e clique em *Testar conexao*. Em Configuracoes o jogo lista as ultimas chamadas feitas a rota (hora, rota, status HTTP, tempo e modelo).

---

## `Como rodar (resumo)`

```bash
git clone https://github.com/Arthur-Baptista-dos-Santos/REGENCIA.git
cd REGENCIA/backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # defina API_KEY
ollama pull qwen2.5:7b        # IA local
uvicorn app.main:app --port 8000
```

Swagger: http://localhost:8000/docs. Detalhes completos no [README principal](../README.md) e em [backend/README.md](../backend/README.md).

---

## `Conteudo desta pasta`

| Item | O que e |
|---|---|
| [DADOS_DA_ENTREGA.txt](DADOS_DA_ENTREGA.txt) | Nomes, RMs e todos os links em texto simples |
| [trechos_de_codigo.md](trechos_de_codigo.md) | Trechos reais do codigo, um por requisito |
| [evidencias/](evidencias) | Capturas de tela (jogo via API, registro de chamadas, Swagger, painel, conexao) e registro das chamadas reais com curl |

---

## `Licenca`

Distribuido sob a licenca MIT. Veja [LICENSE](../LICENSE).
