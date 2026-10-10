"""Demo em linha de comando do loop central de Regência.

Não é o jogo final (isso é trabalho do CP5 em Godot), é a prova de conceito do
pipeline de interpretação: você digita um decreto, ele passa pelo LLM (ou pelo
stub simulado, se não houver LLM_API_KEY configurada), é validado, e o
efeito resultante é impresso.

Uso:
    python -m regencia.main
"""

from __future__ import annotations

from regencia.esquemas import ObjetoNivel, SnapshotNivel
from regencia.interprete_ia import ErroDeInterpretacao, interpretar_decreto
from regencia.validador import DecretoInvalidoError, validar_decreto


def _nivel_de_exemplo() -> SnapshotNivel:
    return SnapshotNivel(
        objetos=[
            ObjetoNivel(id="porta_norte", tipo="porta", posicao=(12, 3)),
            ObjetoNivel(id="porta_leste", tipo="porta", posicao=(40, 3)),
            ObjetoNivel(id="explorador", tipo="jogador", posicao=(10, 3)),
            ObjetoNivel(id="poco_central", tipo="decoracao", posicao=(25, 0)),
        ]
    )


def executar_decreto(frase: str, snapshot: SnapshotNivel) -> None:
    """Executa um ciclo completo: interpretar -> validar -> reportar."""
    try:
        decreto = interpretar_decreto(frase, snapshot)
    except ErroDeInterpretacao as erro:
        print(f"[erro de interpretação] {erro}")
        return

    try:
        resultado = validar_decreto(decreto, snapshot)
    except DecretoInvalidoError as erro:
        print(f"[decreto rejeitado] {erro}")
        return

    efeito_final = resultado.decreto_ajustado or decreto
    print(f"[decreto aplicado] {efeito_final.model_dump_json()}")
    print(f"[validador] {resultado.motivo}")


def main() -> None:
    snapshot = _nivel_de_exemplo()
    print("Regência, demo de linha de comando do interpretador de decretos.")
    print("Digite um decreto do Regente (ou 'sair' para encerrar).\n")
    while True:
        try:
            frase = input("Regente diz: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if frase.lower() in {"sair", "exit", "quit"}:
            break
        if frase:
            executar_decreto(frase, snapshot)


if __name__ == "__main__":
    main()
