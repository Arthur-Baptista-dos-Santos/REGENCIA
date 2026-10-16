"""Rota de IA generativa de texto: o jogo envia o contexto e recebe o texto gerado."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.config import Settings, obter_settings
from app.providers.ia_provider import (
    ErroProvedor,
    ProvedorIndisponivel,
    ProvedorTexto,
    TempoEsgotado,
)
from app.schemas import ErroResponse, TextoRequest, TextoResponse
from app.security import limitar_requisicoes

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
    responses={
        401: {"model": ErroResponse, "description": "API Key ausente ou inválida."},
        422: {"description": "Corpo da requisição inválido."},
        429: {"model": ErroResponse, "description": "Limite de requisições por minuto atingido."},
        502: {"model": ErroResponse, "description": "O serviço de IA respondeu com erro."},
        503: {"model": ErroResponse, "description": "O serviço de IA está indisponível."},
        504: {"model": ErroResponse, "description": "O serviço de IA demorou demais."},
    },
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
