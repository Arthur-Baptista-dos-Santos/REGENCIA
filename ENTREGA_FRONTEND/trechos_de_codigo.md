# Trechos de codigo (copiados dos arquivos reais do repositorio)

Cada trecho abaixo foi copiado dos arquivos reais que estao no GitHub (comentarios com reticencias marcam partes omitidas). Servem de evidencia de cada requisito do enunciado de Front-end.

### 1. Router da rota de IA generativa

Arquivo: `backend/app/routers/ia_generativa.py`. Rota `POST /v1/ia-generativa/texto`, organizada em router e protegida por dependencia (autenticacao e limite). O router so conhece a interface do provider.

```python
router = APIRouter(
    prefix="/v1/ia-generativa",
    tags=["IA generativa"],
    dependencies=[Depends(limitar_requisicoes)],  # inclui a autenticação por X-API-Key
)


def obter_provedor(request: Request) -> ProvedorTexto:
    """Entrega o provedor criado na inicialização (pode ser trocado nos testes)."""
    provedor: ProvedorTexto = request.app.state.provedor
    return provedor


@router.post(
    "/texto",
    response_model=TextoResponse,
    summary="Gera texto com IA generativa",
    # ... (descricao das respostas de erro omitida)
)
async def gerar_texto(
    corpo: TextoRequest,
    provedor: ProvedorTexto = Depends(obter_provedor),
    settings: Settings = Depends(obter_settings),
) -> TextoResponse:
    """Recebe o contexto do jogo e devolve o texto gerado pelo provedor configurado.

    O jogo usa esta rota para interpretar o decreto do Regente: envia o estado do
    nível e a frase do jogador e recebe um JSON, que o próprio jogo valida antes
    de aplicar qualquer efeito.
    """
    if len(corpo.prompt) > settings.max_prompt_chars:
        raise HTTPException(
            status_code=422,
            detail=f"O prompt passou do limite de {settings.max_prompt_chars} caracteres.",
        )
    try:
        resultado = await provedor.gerar(
            corpo.prompt,
            max_tokens=corpo.max_tokens,
            temperatura=corpo.temperatura,
            formato_json=corpo.formato_json,
        )
    except TempoEsgotado as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except ProvedorIndisponivel as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ErroProvedor as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return TextoResponse(
        texto=resultado.texto,
        provedor=resultado.provedor,
        modelo=resultado.modelo,
        latencia_ms=resultado.latencia_ms,
    )
```

### 2. Provider (unica camada que fala com o servico de IA)

Arquivo: `backend/app/providers/ia_provider.py`. Contrato `ProvedorTexto`. As implementacoes (`ProvedorOllama`, `ProvedorOpenAICompat`, `ProvedorSimulado`) ficam no mesmo arquivo; o provedor ativo e escolhido por variavel de ambiente.

```python
class ProvedorTexto(ABC):
    """Contrato que todo provedor de texto precisa cumprir."""

    nome: str
    modelo: str

    async def aquecer(self) -> None:
        """Prepara o provedor antes da primeira requisição (ex.: carregar o modelo na memória). Padrão: nada."""
        return None

    @abstractmethod
    async def gerar(self, prompt: str, *, max_tokens: int, temperatura: float, formato_json: bool) -> ResultadoTexto:
        """Gera um texto a partir do prompt."""
```

### 3. Provider chamando o servico externo (Ollama)

Arquivo: `backend/app/providers/ia_provider.py`. Aqui acontece a chamada ao servico de IA. O jogo nunca executa este codigo: ele so chama a rota.

```python
    async def gerar(self, prompt: str, *, max_tokens: int, temperatura: float, formato_json: bool) -> ResultadoTexto:
        corpo: dict[str, object] = {
            "model": self.modelo,
            "stream": False,
            "messages": [{"role": "user", "content": prompt}],
            "options": {"temperature": temperatura, "num_predict": max_tokens},
            "keep_alive": MANTER_MODELO_CARREGADO,
        }
        if formato_json:
            corpo["format"] = "json"
        inicio = time.perf_counter()
        dados = await _post_json(f"{self._url}/api/chat", corpo, {}, self._timeout, self._cliente, self.nome)
        try:
            texto = str(dados["message"]["content"])
        except (KeyError, TypeError) as exc:
            raise ErroProvedor("Resposta do Ollama sem o campo message.content.") from exc
        return ResultadoTexto(texto, self.nome, self.modelo, _milissegundos_desde(inicio))
```

### 4. Autenticacao por API Key (header X-API-Key)

Arquivo: `backend/app/security.py`. Sem o header correto a resposta e 401. A comparacao usa `hmac.compare_digest`. O mesmo esquema aparece no botao *Authorize* do Swagger.

```python
cabecalho_api_key = APIKeyHeader(
    name="X-API-Key",
    auto_error=False,
    description="Chave da API do grupo. Em desenvolvimento, é o valor de API_KEY no arquivo .env.",
)


def verificar_api_key(
    chave: str | None = Depends(cabecalho_api_key),
    settings: Settings = Depends(obter_settings),
) -> str:
    """Exige o header X-API-Key correto; devolve a chave validada.

    A comparação usa `hmac.compare_digest` para não vazar, pelo tempo de resposta,
    quantos caracteres da chave estavam certos.
    """
    esperada = settings.api_key.get_secret_value()
    if chave is None or not hmac.compare_digest(chave.encode(), esperada.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key ausente ou inválida. Envie o header X-API-Key.",
        )
    return chave
```

### 5. CORS

Arquivo: `backend/app/main.py`. Somente as origens configuradas (jogo local e GitHub Pages) podem chamar a API pelo navegador.

```python
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.origens_cors,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["X-API-Key", "Content-Type"],
        allow_private_network=True,  # permite o preflight de sites públicos (GitHub Pages) que chamam uma API em localhost
        max_age=600,
    )
```

### 6. Lado do jogo: o front chama a API do grupo, nao o servico de IA

Arquivo: `web/js/api.js`. Chamada feita pelo jogo em tempo de execucao: POST na rota do grupo com o header X-API-Key. Nao existe chave nem URL de servico de IA no codigo do jogo.

```javascript
        resp = await f(url + ROTA_TEXTO, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': chave },
          body: JSON.stringify({ prompt: String(prompt), max_tokens: 220, temperatura: 0.2, formato_json: true }),
          signal: opcoes && opcoes.signal,
        });
```

### 7. Painel Streamlit consumindo a mesma rota com requests

Arquivo: `painel/cliente.py`. O painel usa a biblioteca `requests`, como pede o enunciado.

```python
def gerar_texto(
    url: str,
    chave: str,
    prompt: str,
    *,
    max_tokens: int = 220,
    temperatura: float = 0.2,
    formato_json: bool = True,
    timeout_s: float = 60.0,
) -> RespostaTexto:
    """POST /v1/ia-generativa/texto com o header X-API-Key."""
    try:
        resposta = requests.post(
            normalizar_url(url) + ROTA_TEXTO,
            headers={"X-API-Key": chave},
            json={"prompt": prompt, "max_tokens": max_tokens, "temperatura": temperatura, "formato_json": formato_json},
            timeout=timeout_s,
        )
    except requests.Timeout as exc:
        raise ErroDaAPI("A API demorou demais para responder.") from exc
    except requests.RequestException as exc:
        raise ErroDaAPI("Não foi possível conectar à API. Confira a URL e se o back-end está rodando.") from exc

    if resposta.status_code == 401:
        raise ErroDaAPI("A API recusou a chave (401). Confira o valor de X-API-Key.")
    if resposta.status_code == 429:
        raise ErroDaAPI("Limite de requisições por minuto atingido (429). Aguarde um instante.")
    if resposta.status_code >= 400:
        try:
            detalhe = resposta.json().get("detail", "")
        except ValueError:
            detalhe = ""
        raise ErroDaAPI(f"A API respondeu HTTP {resposta.status_code}. {detalhe}".strip())
```
