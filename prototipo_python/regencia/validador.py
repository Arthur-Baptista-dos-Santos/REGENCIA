"""Validador determinístico de jogabilidade.

Fica ENTRE a saída do LLM e a aplicação no motor de jogo. Nunca usa IA, é código
de regras puro, porque a garantia de "o nível continua vencível" precisa ser
auditável e não pode depender do julgamento do modelo (ver Etapa 2.1 do relatório).
"""

from __future__ import annotations

from dataclasses import dataclass

from regencia.esquemas import DecretoInterpretado, EfeitoGenerico, SnapshotNivel


class DecretoInvalidoError(Exception):
    """Levantado quando um decreto interpretado referencia um objeto inexistente."""


@dataclass(frozen=True)
class ResultadoValidacao:
    """Resultado da validação de um decreto contra o estado do nível."""

    aprovado: bool
    motivo: str
    decreto_ajustado: DecretoInterpretado | None = None


_INTENSIDADE_MAXIMA_SEGURA = 90


def validar_decreto(decreto: DecretoInterpretado, snapshot: SnapshotNivel) -> ResultadoValidacao:
    """Valida (e, se preciso, atenua) um decreto antes de aplicá-lo ao mundo.

    Args:
        decreto: a chamada de função estruturada devolvida pelo LLM.
        snapshot: o estado do nível usado para resolver a decisão.

    Returns:
        Um `ResultadoValidacao` indicando se o decreto pode ser aplicado como está,
        precisa ser ajustado, ou deve ser rejeitado.

    Raises:
        DecretoInvalidoError: se o decreto referenciar um `alvo_id` que não existe
            no snapshot, sinal de alucinação do modelo, nunca deve ser aplicado.
    """
    alvo_id = getattr(decreto, "alvo_id", None)
    if alvo_id is not None and snapshot.encontrar(alvo_id) is None:
        raise DecretoInvalidoError(
            f"o modelo referenciou o objeto '{alvo_id}', que não existe no snapshot atual do nível"
        )

    if isinstance(decreto, EfeitoGenerico) and decreto.intensidade > _INTENSIDADE_MAXIMA_SEGURA:
        ajustado = decreto.model_copy(update={"intensidade": _INTENSIDADE_MAXIMA_SEGURA})
        return ResultadoValidacao(
            aprovado=True,
            motivo=(
                f"intensidade {decreto.intensidade} excedia o limite seguro "
                f"({_INTENSIDADE_MAXIMA_SEGURA}); efeito atenuado automaticamente"
            ),
            decreto_ajustado=ajustado,
        )

    return ResultadoValidacao(aprovado=True, motivo="decreto dentro dos limites configurados", decreto_ajustado=decreto)


def existe_caminho_ate_saida(largura: int, altura: int, celulas_bloqueadas: set[tuple[int, int]], inicio: tuple[int, int], saida: tuple[int, int]) -> bool:
    """Busca em largura (BFS) simples: confirma que a saída ainda é alcançável.

    Placeholder textual para o "validador de completabilidade" descrito no roadmap
    (Fase 2), a versão real usará o NavMesh nativo do Godot sobre a grade do nível.
    """
    visitados = {inicio}
    fila = [inicio]
    while fila:
        x, y = fila.pop(0)
        if (x, y) == saida:
            return True
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            vizinho = (x + dx, y + dy)
            dentro_do_grid = 0 <= vizinho[0] < largura and 0 <= vizinho[1] < altura
            if dentro_do_grid and vizinho not in celulas_bloqueadas and vizinho not in visitados:
                visitados.add(vizinho)
                fila.append(vizinho)
    return False
