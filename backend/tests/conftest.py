"""Fixtures compartilhadas: aplicação com provedor falso, sem rede e sem IA real."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings, obter_settings
from app.main import criar_app
from app.providers.ia_provider import ProvedorTexto, ResultadoTexto
from app.security import limitador

CHAVE = "chave-de-teste-123"


class ProvedorFalso(ProvedorTexto):
    """Provedor controlado pelo teste: devolve um texto fixo ou levanta a exceção configurada."""

    nome = "falso"
    modelo = "modelo-falso"

    def __init__(self) -> None:
        self.texto = '{"funcao": "efeito_generico"}'
        self.erro: Exception | None = None
        self.chamadas: list[dict[str, object]] = []

    async def gerar(self, prompt: str, *, max_tokens: int, temperatura: float, formato_json: bool) -> ResultadoTexto:
        self.chamadas.append(
            {"prompt": prompt, "max_tokens": max_tokens, "temperatura": temperatura, "formato_json": formato_json}
        )
        if self.erro is not None:
            raise self.erro
        return ResultadoTexto(self.texto, self.nome, self.modelo, 7)


@pytest.fixture
def settings() -> Settings:
    return Settings(
        api_key=SecretStr(CHAVE),
        provedor="simulado",
        cors_origins="http://localhost:8000,https://arthur-baptista-dos-santos.github.io",
        limite_requisicoes_por_minuto=5,
        max_prompt_chars=200,
    )


@pytest.fixture
def provedor() -> ProvedorFalso:
    return ProvedorFalso()


@pytest.fixture
def cliente(settings: Settings, provedor: ProvedorFalso) -> Iterator[TestClient]:
    limitador.reiniciar()
    app = criar_app(settings=settings, provedor=provedor)
    app.dependency_overrides[obter_settings] = lambda: settings
    with TestClient(app) as c:
        yield c
    limitador.reiniciar()


@pytest.fixture
def cabecalhos() -> dict[str, str]:
    return {"X-API-Key": CHAVE}
