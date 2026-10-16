"""Rota pública de verificação de saúde (sem autenticação e sem dados sensíveis)."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app import __version__
from app.schemas import SaudeResponse

router = APIRouter(tags=["Saúde"])


@router.get("/health", response_model=SaudeResponse, summary="Verifica se a API está no ar")
async def saude(request: Request) -> SaudeResponse:
    """Informa qual provedor e modelo estão configurados, sem revelar chaves."""
    return SaudeResponse(
        provedor=request.app.state.provedor.nome,
        modelo=request.app.state.provedor.modelo,
        versao=__version__,
    )
