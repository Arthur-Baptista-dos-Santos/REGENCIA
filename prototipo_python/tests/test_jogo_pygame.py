"""Testes da lógica pura do demo jogável (nada aqui toca a janela/pygame.display)."""

from __future__ import annotations

from regencia.esquemas import ClimaLocal, EfeitoGenerico, TransformarMaterial
from regencia.jogo_pygame import custo_em_vontade, resumir_decreto


def test_resumir_efeito_generico_com_alvo() -> None:
    decreto = EfeitoGenerico(alvo_id="porta_norte", intensidade=70, area="pequena", duracao_s=-1, polaridade="prejudica")

    resumo = resumir_decreto(decreto)

    assert "porta_norte" in resumo
    assert "70" in resumo


def test_resumir_efeito_generico_sem_alvo_usa_area_geral() -> None:
    decreto = EfeitoGenerico(alvo_id=None, intensidade=30, area="grande", duracao_s=-1, polaridade="ajuda")

    assert "área geral" in resumir_decreto(decreto)


def test_resumir_transformar_material() -> None:
    decreto = TransformarMaterial(alvo_id="porta_norte", novo_material="espelho", duracao_s=45)

    assert resumir_decreto(decreto) == "porta_norte vira espelho por 45s"


def test_custo_em_vontade_efeito_generico_e_proporcional_a_intensidade() -> None:
    fraco = EfeitoGenerico(alvo_id=None, intensidade=20, area="pequena", duracao_s=-1, polaridade="ajuda")
    forte = EfeitoGenerico(alvo_id=None, intensidade=90, area="grande", duracao_s=-1, polaridade="prejudica")

    assert custo_em_vontade(fraco) < custo_em_vontade(forte)


def test_custo_em_vontade_tem_piso_minimo() -> None:
    decreto = EfeitoGenerico(alvo_id=None, intensidade=0, area="pequena", duracao_s=-1, polaridade="ajuda")

    assert custo_em_vontade(decreto) == 5


def test_custo_em_vontade_efeito_nomeado_e_fixo() -> None:
    decreto = ClimaLocal(tipo="chuva_acida", area="media", duracao_s=10)

    assert custo_em_vontade(decreto) == 15
