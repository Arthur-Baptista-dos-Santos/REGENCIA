# Arquitetura

## Objetivo

Separar o jogo (front-end) do servico de IA generativa. O jogo chama uma API propria do grupo; so essa API conhece o servico externo.

## Fluxo de um decreto

1. O jogador digita o decreto (ex.: "transforma aquela porta num espelho").
2. `web/js/jogo.js` monta o contexto (objetos do nivel, materiais, limites) e pede ao cliente `web/js/api.js`.
3. `api.js` faz `POST /v1/ia-generativa/texto` com o header `X-API-Key`.
4. No back-end: CORS, autenticacao, limite de requisicoes e validacao do corpo (Pydantic).
5. O router chama o provider; o provider fala com o Ollama (ou outro servico) e devolve o texto.
6. O jogo extrai o JSON, passa pelo **validador deterministico** (`web/js/logica.js`: alvo existe, valores dentro dos limites, fase continua vencivel) e so entao aplica o efeito.

## Camadas e responsabilidades

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Rota | `backend/app/routers/ia_generativa.py` | HTTP, dependencias de seguranca, traducao de erros |
| Provider | `backend/app/providers/ia_provider.py` | Unico ponto que conhece o servico de IA |
| Seguranca | `backend/app/security.py` | API Key e limite de requisicoes |
| Configuracao | `backend/app/config.py` | Variaveis de ambiente, sem segredos no codigo |
| Cliente | `web/js/api.js` | Chamada da API, timeout garantido, normalizacao de URL |
| Validador | `web/js/logica.js` | Garante jogabilidade independente da IA |

## Decisoes

| Decisao | Motivo |
|---|---|
| Dois projetos no mesmo repositorio | Cumpre a separacao pedida e mantem o historico unico |
| Ollama local como padrao | Sem custo, sem chave externa, reproduzivel; `qwen2.5:7b` foi o melhor no teste com o prompt real do jogo e o validador |
| Provider trocavel | Mudar de servico e mudar variavel de ambiente |
| Saida da IA tratada como nao confiavel | Alucinacao nao pode quebrar o jogo |
| Cadeia de fallback no jogo | API do grupo, modelo no navegador (WebGPU), IA do ambiente, interpretador local: o jogo nunca trava |
| Modelo no navegador com prompt curto e saida por gramatica JSON | Medido: o prompt longo original errou o alvo e derrubou o driver da GPU integrada; o curto com gramatica acerta a funcao em 95% das parafrases (docs/evidencias/benchmark_webllm.md) |
| Qwen2.5-3B e nao 1.5B no navegador | Nas parafrases, 95% contra 70% de funcao correta; custo: 2,5 GB de download unico e o dobro da latencia |
| Service worker com rede primeiro | Evita servir arquivos antigos depois de uma atualizacao; offline continua funcionando com a ultima copia |
| Limite em memoria | Simples e suficiente para uma instancia; com varias instancias, usar Redis |

## Limitacoes conhecidas

- A API precisa estar rodando em maquina acessivel ao jogador. No site do GitHub Pages ela e `http://localhost:8000` do proprio jogador; para publico geral seria preciso hospedar a API e o modelo (custo de GPU ou de API paga).
- A chave digitada nas Configuracoes fica no `localStorage` do navegador do jogador.
- O modelo no navegador (Qwen2.5-3B, WebLLM) e mais lento que a API: 15 s por decreto numa GPU integrada Intel, medidos. Por isso a API do grupo vem primeiro na cadeia, e o jogo mostra um contador enquanto espera. Em GPU dedicada o tempo cai bastante.
- O limite de requisicoes e por processo.
- Latencia observada com `qwen2.5:7b` local: cerca de 3 a 4 s por decreto, em um computador pessoal.

## Evidencias

Capturas em `docs/img/` e chamadas reais em `docs/evidencias/chamadas_curl.txt`.
