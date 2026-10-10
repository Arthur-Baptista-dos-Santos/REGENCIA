"""Testes do modo simulado do interpretador (sem chamar nenhuma API paga)."""

from __future__ import annotations

import pytest

from regencia.esquemas import EfeitoGenerico, ObjetoNivel, SnapshotNivel
from regencia.interprete_ia import interpretar_decreto


def test_modo_simulado_resolve_a_porta_mais_proxima_do_explorador(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    snapshot = SnapshotNivel(
        objetos=[
            ObjetoNivel(id="porta_norte", tipo="porta", posicao=(12, 3)),
            ObjetoNivel(id="porta_leste", tipo="porta", posicao=(40, 3)),
            ObjetoNivel(id="explorador", tipo="jogador", posicao=(10, 3)),
        ]
    )

    decreto = interpretar_decreto("transforma aquela porta ali num espelho", snapshot)

    assert isinstance(decreto, EfeitoGenerico)
    assert decreto.alvo_id == "porta_norte"  # mais próxima do explorador (distância 2) do que porta_leste (30)
