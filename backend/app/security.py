"""Autenticação por API Key (header X-API-Key) e limite simples de requisições."""

from __future__ import annotations

import hmac
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader

from app.config import Settings, obter_settings

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


class LimitadorDeRequisicoes:
    """Janela deslizante de 60 s por cliente, em memória (suficiente para um único processo)."""

    def __init__(self) -> None:
        self._registros: dict[str, deque[float]] = defaultdict(deque)

    def reiniciar(self) -> None:
        """Esvazia os contadores (usado nos testes)."""
        self._registros.clear()

    def checar(self, cliente: str, limite: int, agora: float | None = None) -> None:
        """Levanta 429 se o cliente passou do limite na última janela de 60 s."""
        instante = time.monotonic() if agora is None else agora
        fila = self._registros[cliente]
        while fila and instante - fila[0] > 60.0:
            fila.popleft()
        if len(fila) >= limite:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Limite de {limite} requisições por minuto atingido. Tente de novo em instantes.",
                headers={"Retry-After": "60"},
            )
        fila.append(instante)


limitador = LimitadorDeRequisicoes()


def limitar_requisicoes(
    request: Request,
    chave: str = Depends(verificar_api_key),
    settings: Settings = Depends(obter_settings),
) -> None:
    """Dependência que aplica o limite por chave + IP, só depois da autenticação."""
    origem = request.client.host if request.client else "desconhecido"
    limitador.checar(f"{chave}|{origem}", settings.limite_requisicoes_por_minuto)
