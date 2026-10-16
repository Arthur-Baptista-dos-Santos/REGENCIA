"""Providers de IA generativa de texto.

É a única camada que conhece os serviços externos. O router só chama
`ProvedorTexto.gerar` e não sabe se por trás está um modelo local (Ollama), um
serviço compatível com a API da OpenAI ou o modo simulado dos testes.
"""

from __future__ import annotations

import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings


class ErroProvedor(Exception):
    """O serviço de IA respondeu com erro ou com um formato inesperado (vira HTTP 502)."""


class ProvedorIndisponivel(ErroProvedor):
    """Não foi possível conectar ao serviço de IA (vira HTTP 503)."""


class TempoEsgotado(ErroProvedor):
    """O serviço de IA não respondeu dentro do limite (vira HTTP 504)."""


@dataclass(frozen=True)
class ResultadoTexto:
    """Texto gerado e metadados da chamada."""

    texto: str
    provedor: str
    modelo: str
    latencia_ms: int


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


def _milissegundos_desde(inicio: float) -> int:
    return int((time.perf_counter() - inicio) * 1000)


MANTER_MODELO_CARREGADO = "30m"


class ProvedorOllama(ProvedorTexto):
    """Modelo local servido pelo Ollama (sem chave e sem custo por chamada)."""

    nome = "ollama"

    def __init__(self, url: str, modelo: str, timeout_s: float, cliente: httpx.AsyncClient | None = None) -> None:
        self.modelo = modelo
        self._url = url.rstrip("/")
        self._timeout = timeout_s
        self._cliente = cliente

    async def aquecer(self) -> None:
        """Carrega o modelo na memória para a primeira jogada não esperar o carregamento."""
        await _post_json(
            f"{self._url}/api/generate",
            {"model": self.modelo, "prompt": "", "keep_alive": MANTER_MODELO_CARREGADO, "stream": False},
            {},
            self._timeout,
            self._cliente,
            self.nome,
        )

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


class ProvedorOpenAICompat(ProvedorTexto):
    """Qualquer serviço que implemente `POST /chat/completions` no formato da OpenAI."""

    nome = "openai"

    def __init__(
        self,
        base_url: str,
        chave: str | None,
        modelo: str,
        timeout_s: float,
        cliente: httpx.AsyncClient | None = None,
    ) -> None:
        self.modelo = modelo
        self._base_url = base_url.rstrip("/")
        self._chave = chave
        self._timeout = timeout_s
        self._cliente = cliente

    async def gerar(self, prompt: str, *, max_tokens: int, temperatura: float, formato_json: bool) -> ResultadoTexto:
        corpo: dict[str, object] = {
            "model": self.modelo,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperatura,
        }
        if formato_json:
            corpo["response_format"] = {"type": "json_object"}
        cabecalhos = {"Authorization": f"Bearer {self._chave}"} if self._chave else {}
        inicio = time.perf_counter()
        dados = await _post_json(f"{self._base_url}/chat/completions", corpo, cabecalhos, self._timeout, self._cliente, self.nome)
        try:
            texto = str(dados["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as exc:
            raise ErroProvedor("Resposta do provedor sem choices[0].message.content.") from exc
        return ResultadoTexto(texto, self.nome, self.modelo, _milissegundos_desde(inicio))


class ProvedorSimulado(ProvedorTexto):
    """Provedor determinístico, SEM IA, para testes automatizados e demonstração offline.

    A resposta traz `provedor: "simulado"` para nunca ser confundida com uma geração real.
    """

    nome = "simulado"
    modelo = "regras-fixas"

    async def gerar(self, prompt: str, *, max_tokens: int, temperatura: float, formato_json: bool) -> ResultadoTexto:
        resposta = {
            "funcao": "efeito_generico",
            "alvo_id": "explorador",
            "propriedade": "velocidade",
            "polaridade": "prejudica",
            "intensidade": 50,
            "area": "media",
            "duracao_s": 10,
        }
        return ResultadoTexto(json.dumps(resposta), self.nome, self.modelo, 0)


async def _post_json(
    url: str,
    corpo: dict[str, object],
    cabecalhos: dict[str, str],
    timeout_s: float,
    cliente: httpx.AsyncClient | None,
    nome: str,
) -> dict[str, Any]:
    """POST JSON com tratamento padronizado dos erros de rede e de resposta."""
    try:
        if cliente is not None:
            resposta = await cliente.post(url, json=corpo, headers=cabecalhos, timeout=timeout_s)
        else:
            async with httpx.AsyncClient() as novo:
                resposta = await novo.post(url, json=corpo, headers=cabecalhos, timeout=timeout_s)
    except httpx.TimeoutException as exc:
        raise TempoEsgotado(f"O provedor {nome} não respondeu em {timeout_s:.0f} s.") from exc
    except httpx.TransportError as exc:
        raise ProvedorIndisponivel(f"Não foi possível conectar ao provedor {nome}.") from exc
    if resposta.status_code >= 400:
        raise ErroProvedor(f"O provedor {nome} respondeu HTTP {resposta.status_code}.")
    try:
        dados = resposta.json()
    except ValueError as exc:
        raise ErroProvedor(f"O provedor {nome} devolveu um corpo que não é JSON.") from exc
    if not isinstance(dados, dict):
        raise ErroProvedor(f"O provedor {nome} devolveu um JSON inesperado.")
    return dados


def criar_provedor(settings: Settings) -> ProvedorTexto:
    """Escolhe o provedor conforme a configuração (variável PROVEDOR)."""
    if settings.provedor == "ollama":
        return ProvedorOllama(settings.ollama_url, settings.ollama_modelo, settings.timeout_s)
    if settings.provedor == "openai":
        chave = settings.openai_api_key.get_secret_value() if settings.openai_api_key else None
        return ProvedorOpenAICompat(settings.openai_base_url, chave, settings.openai_modelo, settings.timeout_s)
    return ProvedorSimulado()
