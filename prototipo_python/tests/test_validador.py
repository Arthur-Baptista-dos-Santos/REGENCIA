"""Testes do validador determinístico de jogabilidade."""

from __future__ import annotations

import pytest

from regencia.esquemas import EfeitoGenerico, ObjetoNivel, SnapshotNivel
from regencia.validador import DecretoInvalidoError, existe_caminho_ate_saida, validar_decreto


@pytest.fixture
def snapshot_exemplo() -> SnapshotNivel:
    return SnapshotNivel(
        objetos=[
            ObjetoNivel(id="porta_norte", tipo="porta", posicao=(12, 3)),
            ObjetoNivel(id="explorador", tipo="jogador", posicao=(10, 3)),
        ]
    )


def test_decreto_dentro_do_limite_e_aprovado_sem_ajuste(snapshot_exemplo: SnapshotNivel) -> None:
    decreto = EfeitoGenerico(alvo_id="porta_norte", intensidade=50, area="pequena", duracao_s=-1, polaridade="prejudica")

    resultado = validar_decreto(decreto, snapshot_exemplo)

    assert resultado.aprovado
    assert resultado.decreto_ajustado is not None
    assert resultado.decreto_ajustado.intensidade == 50


def test_intensidade_acima_do_limite_e_atenuada_automaticamente(snapshot_exemplo: SnapshotNivel) -> None:
    decreto = EfeitoGenerico(alvo_id="porta_norte", intensidade=100, area="grande", duracao_s=-1, polaridade="prejudica")

    resultado = validar_decreto(decreto, snapshot_exemplo)

    assert resultado.aprovado
    assert resultado.decreto_ajustado is not None
    assert resultado.decreto_ajustado.intensidade == 90
    assert "atenuado" in resultado.motivo


def test_alvo_inexistente_levanta_erro_em_vez_de_ser_aplicado_silenciosamente(snapshot_exemplo: SnapshotNivel) -> None:
    decreto = EfeitoGenerico(alvo_id="porta_que_nao_existe", intensidade=50, area="pequena", duracao_s=-1, polaridade="ajuda")

    with pytest.raises(DecretoInvalidoError):
        validar_decreto(decreto, snapshot_exemplo)


def test_existe_caminho_ate_saida_em_grid_aberto() -> None:
    assert existe_caminho_ate_saida(largura=5, altura=5, celulas_bloqueadas=set(), inicio=(0, 0), saida=(4, 4))


def test_existe_caminho_ate_saida_retorna_falso_quando_bloqueado() -> None:
    bloqueios = {(x, 2) for x in range(5)}  # parede completa na linha 2

    assert not existe_caminho_ate_saida(largura=5, altura=5, celulas_bloqueadas=bloqueios, inicio=(0, 0), saida=(4, 4))
