# `Regencia API: IA generativa como servico`

API FastAPI que isola a chamada ao servico de IA generativa do jogo Regencia. O jogo (front-end) nunca fala com o servico de IA: ele chama esta API, que autentica, valida, limita e so entao aciona o provider.

## `Integrantes`

| Nome | RM |
|---|---|
| Arthur Baptista dos Santos | 565346 |
| João Pedro de Moura Dutra Franco | 561738 |
| Nelson Félix Neto | 565603 |

## `Quick Start`

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows  (Linux/Mac: source .venv/bin/activate)
pip install -r requirements.txt

cp .env.example .env            # defina API_KEY (minimo 8 caracteres)
python -c "import secrets; print(secrets.token_urlsafe(32))"

ollama pull qwen2.5:7b          # IA local (ou use PROVEDOR=openai / simulado)
uvicorn app.main:app --port 8000
```

Swagger: http://localhost:8000/docs (botao *Authorize*, cole a `API_KEY`).

## `Arquitetura`

```
app/
    main.py                  fabrica do app: CORS, routers, lifespan (aquece o modelo)
    config.py                Settings por variaveis de ambiente (pydantic-settings)
    security.py              X-API-Key (hmac.compare_digest) e limite de requisicoes
    schemas.py               contratos de entrada e saida (Pydantic)
    routers/
        ia_generativa.py     POST /v1/ia-generativa/texto
        saude.py             GET /health
    providers/
        ia_provider.py       ProvedorOllama, ProvedorOpenAICompat, ProvedorSimulado
```

O router so conhece a interface `ProvedorTexto`. Erros do provider sao traduzidos para HTTP: indisponivel 503, tempo esgotado 504, resposta invalida 502.

## `Configuracao`

| Variavel | Padrao | Descricao |
|---|---|---|
| `API_KEY` | (obrigatoria) | Chave esperada no header `X-API-Key` |
| `PROVEDOR` | `ollama` | `ollama`, `openai` ou `simulado` |
| `OLLAMA_URL` / `OLLAMA_MODELO` | `http://localhost:11434` / `qwen2.5:7b` | Servico e modelo locais |
| `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODELO` | | Qualquer servico compativel com a API de chat da OpenAI |
| `CORS_ORIGINS` | localhost e GitHub Pages | Origens permitidas, separadas por virgula |
| `TIMEOUT_S` | 45 | Tempo maximo da chamada ao servico de IA |
| `MAX_PROMPT_CHARS` | 8000 | Tamanho maximo do prompt |
| `LIMITE_REQUISICOES_POR_MINUTO` | 30 | Por chave e IP |

## `Uso`

```bash
curl http://localhost:8000/health

curl -X POST http://localhost:8000/v1/ia-generativa/texto \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"prompt": "transforma aquela porta num espelho", "max_tokens": 220, "temperatura": 0.2, "formato_json": true}'
```

Resposta: `{"texto": "...", "provedor": "ollama", "modelo": "qwen2.5:7b", "latencia_ms": 3937}`.

Erros: 401 (sem chave ou errada), 422 (validacao), 429 (limite), 502, 503, 504 (servico de IA).

## `Docker`

```bash
docker build -t regencia-api .
docker run --rm -p 8000:8000 --env-file .env regencia-api
```

Na raiz do repositorio, `docker compose up --build` sobe a API ja apontando para o Ollama do host.

## `Testes`

```bash
pip install pytest ruff mypy
pytest -q          # 32 testes: auth, validacao, erros, limite, CORS, Swagger, providers
ruff check .
mypy app tests
```

Os testes nao usam rede nem IA real: o provider e substituido por um falso e o HTTP por `httpx.MockTransport`.

## `Seguranca`

- A chave nunca fica no codigo nem no repositorio (`.env` esta no `.gitignore`).
- Comparacao de chave em tempo constante; limite de requisicoes so conta depois da autenticacao.
- CORS restrito as origens configuradas.
- O texto devolvido pela IA deve ser tratado pelo cliente como dado nao confiavel (o jogo valida tudo antes de aplicar).

## `Licenca`

MIT. Veja [../LICENSE](../LICENSE).
