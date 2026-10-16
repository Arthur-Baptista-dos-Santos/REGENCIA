"""Contratos de entrada e saída da API (validados pelo Pydantic e exibidos no Swagger)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class TextoRequest(BaseModel):
    """Pedido de geração de texto enviado pelo jogo (ou pelo painel)."""

    prompt: str = Field(
        min_length=1,
        description="Contexto completo enviado ao modelo (instruções, estado do nível e decreto do jogador).",
        examples=["Interprete o decreto do jogador e responda apenas com JSON: transforma aquela porta num espelho"],
    )
    max_tokens: int = Field(default=220, ge=16, le=1024, description="Limite de tokens da resposta.")
    temperatura: float = Field(default=0.2, ge=0.0, le=1.0, description="Aleatoriedade da geração.")
    formato_json: bool = Field(
        default=True,
        description="Quando verdadeiro, pede ao provedor que a resposta seja um objeto JSON válido.",
    )


class TextoResponse(BaseModel):
    """Texto gerado e metadados da chamada."""

    texto: str = Field(description="Texto devolvido pelo modelo (JSON em texto, quando formato_json=true).")
    provedor: str = Field(description="Serviço que gerou o texto: ollama, openai ou simulado.")
    modelo: str = Field(description="Identificador do modelo usado.")
    latencia_ms: int = Field(ge=0, description="Tempo gasto no provedor, em milissegundos.")


class SaudeResponse(BaseModel):
    """Estado da API, sem dados sensíveis."""

    status: str = "ok"
    provedor: str
    modelo: str
    versao: str


class ErroResponse(BaseModel):
    """Formato padrão dos erros devolvidos pela API."""

    detail: str
