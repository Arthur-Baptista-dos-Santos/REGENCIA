"""Cliente da API de IA generativa do jogo, feito com `requests`.

Isolado da interface (Streamlit) para poder ser testado sem abrir a tela.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests

ROTA_TEXTO = "/v1/ia-generativa/texto"
ROTA_SAUDE = "/health"


class ErroDaAPI(Exception):
    """A API respondeu com erro ou não pôde ser alcançada. A mensagem já é legível para o usuário."""


@dataclass(frozen=True)
class RespostaTexto:
    """Resposta da rota de texto."""

    texto: str
    provedor: str
    modelo: str
    latencia_ms: int


def normalizar_url(url: str) -> str:
    """Remove espaços e a barra final. Aceita apenas http(s)."""
    limpa = url.strip().rstrip("/")
    if not limpa.lower().startswith(("http://", "https://")):
        raise ErroDaAPI("Informe a URL da API começando com http:// ou https://")
    return limpa


def consultar_saude(url: str, timeout_s: float = 5.0) -> dict[str, Any]:
    """GET /health (público). Devolve o JSON de saúde da API."""
    try:
        resposta = requests.get(normalizar_url(url) + ROTA_SAUDE, timeout=timeout_s)
    except requests.RequestException as exc:
        raise ErroDaAPI("Não foi possível conectar à API. Confira a URL e se o back-end está rodando.") from exc
    if resposta.status_code != 200:
        raise ErroDaAPI(f"A API respondeu HTTP {resposta.status_code} em /health.")
    dados = resposta.json()
    if not isinstance(dados, dict):
        raise ErroDaAPI("Resposta inesperada de /health.")
    return dados


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

    dados = resposta.json()
    return RespostaTexto(
        texto=str(dados["texto"]),
        provedor=str(dados["provedor"]),
        modelo=str(dados["modelo"]),
        latencia_ms=int(dados["latencia_ms"]),
    )
