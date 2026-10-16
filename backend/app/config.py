"""Configuração do back-end, lida de variáveis de ambiente (ou de um arquivo .env).

Nenhum segredo fica no código: a chave da API do grupo e, se usado, a chave do
provedor externo vêm sempre do ambiente.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

NomeProvedor = Literal["ollama", "openai", "simulado"]


class Settings(BaseSettings):
    """Parâmetros da aplicação. Prefixo das variáveis: nenhum (ex.: API_KEY)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Credencial que o jogo (cliente) envia no header X-API-Key. Obrigatória.
    api_key: SecretStr = Field(min_length=8, description="Chave exigida no header X-API-Key")

    # Qual serviço de IA generativa de texto atende as requisições.
    provedor: NomeProvedor = "ollama"

    # Ollama (modelo local, sem chave e sem custo).
    ollama_url: str = "http://localhost:11434"
    ollama_modelo: str = "qwen2.5:7b"

    # Qualquer serviço compatível com a API de chat da OpenAI (OpenAI, Groq, Gemini, LM Studio...).
    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: SecretStr | None = None
    openai_modelo: str = "gpt-4o-mini"

    # Origens autorizadas pelo CORS, separadas por vírgula.
    cors_origins: str = (
        "http://localhost:8000,http://127.0.0.1:8000,http://localhost:8080,http://127.0.0.1:8080,"
        "http://localhost:5500,http://127.0.0.1:5500,https://arthur-baptista-dos-santos.github.io"
    )

    # Limites de proteção.
    timeout_s: float = Field(default=45.0, gt=0, le=300)
    max_prompt_chars: int = Field(default=8000, ge=100, le=100_000)
    limite_requisicoes_por_minuto: int = Field(default=30, ge=1, le=10_000)

    @property
    def origens_cors(self) -> list[str]:
        """Lista de origens permitidas, já separada e sem espaços."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def obter_settings() -> Settings:
    """Cria as configurações uma única vez por processo."""
    return Settings()  # api_key vem do ambiente
