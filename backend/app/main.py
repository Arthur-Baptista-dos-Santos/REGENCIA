"""Ponto de entrada da API: monta o FastAPI, o CORS e os routers.

Execução local:  uvicorn app.main:app --reload
Documentação:    http://localhost:8000/docs (Swagger) e /redoc
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app import __version__
from app.config import Settings, obter_settings
from app.providers.ia_provider import ErroProvedor, ProvedorTexto, criar_provedor
from app.routers import ia_generativa, saude

DESCRICAO = """
API de IA generativa de texto do jogo **Regência**.

O jogo (front-end em JavaScript) **não chama o serviço de IA diretamente**: ele envia o contexto
para esta API, que autentica a chamada, aplica limites e repassa o pedido ao provedor configurado
(modelo local no Ollama ou serviço compatível com a API da OpenAI).

**Autenticação:** envie o header `X-API-Key` (botão *Authorize* abaixo).
"""


registro = logging.getLogger("regencia.api")


def criar_app(settings: Settings | None = None, provedor: ProvedorTexto | None = None) -> FastAPI:
    """Cria a aplicação. Os parâmetros permitem trocar configuração e provedor nos testes."""
    cfg = settings or obter_settings()

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
        """Na inicialização, tenta aquecer o provedor; se ele estiver fora do ar, a API sobe mesmo assim."""
        try:
            await app.state.provedor.aquecer()
            registro.info("Provedor %s aquecido.", app.state.provedor.nome)
        except ErroProvedor as exc:
            registro.warning("Não foi possível aquecer o provedor: %s", exc)
        yield

    app = FastAPI(
        lifespan=ciclo_de_vida,
        title="Regência: API de IA generativa",
        description=DESCRICAO,
        version=__version__,
        docs_url="/docs",
        redoc_url="/redoc",
    )
    app.state.provedor = provedor or criar_provedor(cfg)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.origens_cors,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["X-API-Key", "Content-Type"],
        allow_private_network=True,  # permite o preflight de sites públicos (GitHub Pages) que chamam uma API em localhost
        max_age=600,
    )

    app.include_router(saude.router)
    app.include_router(ia_generativa.router)

    @app.get("/", include_in_schema=False)
    async def raiz() -> RedirectResponse:
        return RedirectResponse(url="/docs")

    return app


_app_unico: FastAPI | None = None


def __getattr__(nome: str) -> FastAPI:
    """Cria `app` só quando o uvicorn pede (`app.main:app`), assim importar este módulo nos testes
    não exige a variável API_KEY."""
    global _app_unico
    if nome == "app":
        if _app_unico is None:
            _app_unico = criar_app()
        return _app_unico
    raise AttributeError(nome)
