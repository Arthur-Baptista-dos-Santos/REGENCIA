"""Esquemas (contratos de dados) trocados entre o motor de jogo e o interpretador de IA.

Todo objeto que atravessa a fronteira LLM -> motor de jogo passa por aqui antes de
ser aplicado. Isso é o que torna a saída do modelo verificável (ver `validador.py`).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Polaridade = Literal["ajuda", "prejudica"]
Area = Literal["pequena", "media", "grande"]
Material = Literal["espelho", "lava", "gelo", "vidro"]
TipoClima = Literal["chuva_acida", "neblina", "vento"]


class ObjetoNivel(BaseModel):
    """Um objeto endereçável dentro do snapshot do nível."""

    id: str
    tipo: str
    posicao: tuple[float, float]


class SnapshotNivel(BaseModel):
    """Estado atual do nível, enviado ao LLM a cada decreto do Regente."""

    objetos: list[ObjetoNivel]

    def encontrar(self, objeto_id: str) -> ObjetoNivel | None:
        """Retorna o objeto com o id informado, ou None se não existir."""
        return next((o for o in self.objetos if o.id == objeto_id), None)


class TransformarMaterial(BaseModel):
    funcao: Literal["transformar_material"] = "transformar_material"
    alvo_id: str
    novo_material: Material
    duracao_s: float = Field(gt=0)


class ClimaLocal(BaseModel):
    funcao: Literal["clima_local"] = "clima_local"
    tipo: TipoClima
    area: Area
    duracao_s: float = Field(gt=0)


class SpawnarObstaculo(BaseModel):
    funcao: Literal["spawnar_obstaculo"] = "spawnar_obstaculo"
    tipo: str
    posicao_relativa_a: str
    tamanho: Area


class EfeitoGenerico(BaseModel):
    """Camada de fallback: cobre qualquer intenção fora do catálogo nomeado.

    Existe para que o sistema nunca responda "não é possível fazer isso",
    ver a limitação documentada na Seção 2.1 do relatório técnico.
    """

    funcao: Literal["efeito_generico"] = "efeito_generico"
    alvo_id: str | None
    intensidade: int = Field(ge=0, le=100)
    area: Area
    duracao_s: float = Field(description="-1 significa efeito permanente para o nível atual")
    polaridade: Polaridade


DecretoInterpretado = TransformarMaterial | ClimaLocal | SpawnarObstaculo | EfeitoGenerico
