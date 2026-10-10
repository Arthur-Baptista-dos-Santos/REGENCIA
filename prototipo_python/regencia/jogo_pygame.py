"""Demo visual e jogável do loop central de Regência.

Não é o jogo final (isso é trabalho do CP5 em Godot, com física real), é uma
prova de conceito jogável em Pygame que reaproveita a mesma cadeia usada em
`main.py` (interprete_ia -> validador -> efeito) e a torna visível: o
Explorador anda de verdade num nível pequeno enquanto o Regente digita
decretos que a IA interpreta e o validador aprova (ou atenua) em tempo real.

Cena de fundo gerada por IA generativa (Bing Image Creator / DALL·E 3), ver
Etapa 2 do relatório técnico para o prompt exato usado.

Controles:
    Setas / A-D   move o Explorador
    Espaço        pula
    Clique na caixa de texto, digite um decreto, Enter para aplicar
    Esc           encerra

Uso:
    python -m regencia.jogo_pygame
"""

from __future__ import annotations

from pathlib import Path

import pygame

from regencia.esquemas import DecretoInterpretado, EfeitoGenerico, ObjetoNivel, SnapshotNivel
from regencia.interprete_ia import ErroDeInterpretacao, interpretar_decreto
from regencia.validador import DecretoInvalidoError, validar_decreto

LARGURA, ALTURA = 1280, 720
CHAO_Y = ALTURA - 110
RAIZ_PROJETO = Path(__file__).resolve().parents[2]
CENA_FUNDO = RAIZ_PROJETO / "mockup" / "assets" / "gameplay_scene.jpg"

COR_TEXTO = (236, 232, 242)
COR_MUTED = (162, 156, 184)
COR_BRASS = (220, 171, 92)
COR_INDIGO = (150, 162, 236)
COR_PERIGO = (230, 144, 126)
COR_PAINEL = (19, 16, 25, 210)


def resumir_decreto(decreto: DecretoInterpretado) -> str:
    """Descrição curta e legível de um decreto já validado, usada no HUD e testável sem pygame."""
    if isinstance(decreto, EfeitoGenerico):
        alvo = decreto.alvo_id or "área geral"
        return f"efeito genérico em {alvo} (intensidade {decreto.intensidade}, {decreto.area})"
    if decreto.funcao == "transformar_material":
        return f"{decreto.alvo_id} vira {decreto.novo_material} por {decreto.duracao_s:.0f}s"
    if decreto.funcao == "clima_local":
        return f"{decreto.tipo} ({decreto.area}) por {decreto.duracao_s:.0f}s"
    return f"spawna {decreto.tipo} perto de {decreto.posicao_relativa_a}"


def custo_em_vontade(decreto: DecretoInterpretado) -> int:
    """Quanto do recurso 'Vontade' um decreto consome, proporcional à magnitude do efeito."""
    if isinstance(decreto, EfeitoGenerico):
        return max(5, decreto.intensidade // 10)
    return 15


class Explorador:
    """Física mínima e determinística: gravidade + colisão com o chão. Sem IA aqui."""

    def __init__(self, x: float, y: float) -> None:
        self.rect = pygame.Rect(int(x), int(y), 34, 48)
        self.vy = 0.0
        self.no_chao = False

    def atualizar(self, teclas: pygame.key.ScancodeWrapper) -> None:
        velocidade = 4.6
        if teclas[pygame.K_LEFT] or teclas[pygame.K_a]:
            self.rect.x -= int(velocidade)
        if teclas[pygame.K_RIGHT] or teclas[pygame.K_d]:
            self.rect.x += int(velocidade)
        if (teclas[pygame.K_SPACE] or teclas[pygame.K_UP] or teclas[pygame.K_w]) and self.no_chao:
            self.vy = -12.5

        self.vy += 0.6  # gravidade
        self.rect.y += int(self.vy)
        if self.rect.bottom >= CHAO_Y:
            self.rect.bottom = CHAO_Y
            self.vy = 0.0
            self.no_chao = True
        else:
            self.no_chao = False
        self.rect.x = max(20, min(LARGURA - 20 - self.rect.width, self.rect.x))


class CaixaDeTexto:
    def __init__(self, rect: pygame.Rect, fonte: pygame.font.Font) -> None:
        self.rect = rect
        self.fonte = fonte
        self.texto = ""
        self.ativa = True

    def tratar_evento(self, evento: pygame.event.Event) -> str | None:
        if evento.type != pygame.KEYDOWN or not self.ativa:
            return None
        if evento.key == pygame.K_RETURN:
            frase, self.texto = self.texto.strip(), ""
            return frase or None
        if evento.key == pygame.K_BACKSPACE:
            self.texto = self.texto[:-1]
        elif evento.unicode.isprintable():
            self.texto += evento.unicode
        return None

    def desenhar(self, tela: pygame.Surface) -> None:
        pygame.draw.rect(tela, (30, 26, 40), self.rect, border_radius=8)
        pygame.draw.rect(tela, COR_BRASS, self.rect, width=2, border_radius=8)
        rotulo = self.fonte.render(f"Regente diz: {self.texto}", True, COR_TEXTO)
        tela.blit(rotulo, (self.rect.x + 12, self.rect.y + self.rect.height // 2 - rotulo.get_height() // 2))


def _carregar_fundo() -> pygame.Surface:
    if CENA_FUNDO.exists():
        img = pygame.image.load(str(CENA_FUNDO)).convert()
        return pygame.transform.smoothscale(img, (LARGURA, ALTURA))
    fundo = pygame.Surface((LARGURA, ALTURA))
    fundo.fill((28, 24, 38))
    return fundo


def executar() -> None:
    import os

    pygame.init()
    pygame.display.set_caption("Regência, protótipo jogável (CP4/CP5)")
    tela = pygame.display.set_mode((LARGURA, ALTURA))
    relogio = pygame.time.Clock()
    fonte = pygame.font.SysFont("consolas", 17)
    fonte_pequena = pygame.font.SysFont("consolas", 13)
    fonte_titulo = pygame.font.SysFont("georgia", 22, bold=True)

    fundo = _carregar_fundo()
    snapshot = SnapshotNivel(
        objetos=[
            ObjetoNivel(id="porta_norte", tipo="porta", posicao=(920, CHAO_Y - 90)),
            ObjetoNivel(id="explorador", tipo="jogador", posicao=(140, CHAO_Y - 48)),
        ]
    )
    porta_rect = pygame.Rect(900, CHAO_Y - 130, 60, 130)
    explorador = Explorador(140, CHAO_Y - 48)
    caixa = CaixaDeTexto(pygame.Rect(40, ALTURA - 56, LARGURA - 80, 40), fonte)

    vontade = 100
    log: list[tuple[str, tuple[int, int, int]]] = []
    flash_porta_ate = 0
    modo_ia = "REAL (API)" if os.environ.get("LLM_API_KEY") else "SIMULADO (sem LLM_API_KEY)"

    rodando = True
    while rodando:
        agora = pygame.time.get_ticks()
        for evento in pygame.event.get():
            if evento.type == pygame.QUIT or (evento.type == pygame.KEYDOWN and evento.key == pygame.K_ESCAPE):
                rodando = False
            else:
                frase = caixa.tratar_evento(evento)
                if frase:
                    try:
                        decreto = interpretar_decreto(frase, snapshot)
                        resultado = validar_decreto(decreto, snapshot)
                        efeito = resultado.decreto_ajustado or decreto
                        custo = custo_em_vontade(efeito)
                        vontade = max(0, vontade - custo)
                        flash_porta_ate = agora + 500
                        log.append((f"> {frase}", COR_MUTED))
                        log.append((f"[aplicado] {resumir_decreto(efeito)} (-{custo} vontade)", COR_BRASS))
                        log.append((f"[validador] {resultado.motivo}", COR_INDIGO))
                    except ErroDeInterpretacao as erro:
                        log.append((f"[erro de interpretação] {erro}", COR_PERIGO))
                    except DecretoInvalidoError as erro:
                        log.append((f"[decreto rejeitado] {erro}", COR_PERIGO))
                    log[:] = log[-6:]

        explorador.atualizar(pygame.key.get_pressed())

        tela.blit(fundo, (0, 0))
        overlay_chao = pygame.Surface((LARGURA, ALTURA - CHAO_Y), pygame.SRCALPHA)
        overlay_chao.fill((10, 8, 14, 140))
        tela.blit(overlay_chao, (0, CHAO_Y))

        cor_porta = COR_BRASS if agora < flash_porta_ate else (90, 70, 40)
        pygame.draw.rect(tela, cor_porta, porta_rect, border_radius=4)
        pygame.draw.rect(tela, (20, 16, 10), porta_rect, width=3, border_radius=4)
        rotulo_porta = fonte_pequena.render("porta_norte", True, COR_TEXTO)
        tela.blit(rotulo_porta, (porta_rect.x, porta_rect.y - 18))

        pygame.draw.rect(tela, COR_INDIGO, explorador.rect, border_radius=6)
        tela.blit(fonte_pequena.render("Explorador", True, COR_TEXTO), (explorador.rect.x - 8, explorador.rect.y - 18))

        _desenhar_hud(tela, fonte, fonte_pequena, fonte_titulo, vontade, modo_ia, log)
        caixa.desenhar(tela)

        pygame.display.flip()
        relogio.tick(60)

    pygame.quit()


def _desenhar_hud(
    tela: pygame.Surface,
    fonte: pygame.font.Font,
    fonte_pequena: pygame.font.Font,
    fonte_titulo: pygame.font.Font,
    vontade: int,
    modo_ia: str,
    log: list[tuple[str, tuple[int, int, int]]],
) -> None:
    tela.blit(fonte_titulo.render("REGÊNCIA", True, COR_BRASS), (24, 16))
    tela.blit(fonte_pequena.render(f"Modo IA: {modo_ia}", True, COR_MUTED), (24, 46))
    tela.blit(
        fonte_pequena.render("Cena: Bing Image Creator (DALL·E 3), ver Etapa 2 do relatório", True, COR_MUTED),
        (24, 64),
    )

    pygame.draw.rect(tela, (30, 26, 40), (24, 88, 260, 22), border_radius=6)
    pygame.draw.rect(tela, COR_BRASS, (24, 88, max(0, int(260 * vontade / 100)), 22), border_radius=6)
    tela.blit(fonte_pequena.render(f"Vontade: {vontade}/100", True, COR_TEXTO), (30, 91))

    painel = pygame.Surface((520, 140), pygame.SRCALPHA)
    painel.fill(COR_PAINEL)
    tela.blit(painel, (LARGURA - 540, 20))
    for i, (linha, cor) in enumerate(log[-6:]):
        tela.blit(fonte_pequena.render(linha[:78], True, cor), (LARGURA - 528, 30 + i * 20))


if __name__ == "__main__":
    executar()
