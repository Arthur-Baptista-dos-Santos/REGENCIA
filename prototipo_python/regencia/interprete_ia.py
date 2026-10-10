"""Cliente do interpretador de decretos: a camada de IA generativa em si.

Usa a API de um modelo de linguagem (tool use / function calling) quando `LLM_API_KEY`
está configurada. Sem chave, cai automaticamente em `interpretar_simulado`, um
stub determinístico, só para permitir rodar a demo (`main.py`) sem custo de API
durante o desenvolvimento inicial. A troca para Llama 3.2 via Ollama (alternativa
gratuita citada no relatório) entra no mesmo ponto de extensão, sem mudar o
restante do pipeline.
"""

from __future__ import annotations

import json
import os
from typing import Any, Final

from regencia.esquemas import DecretoInterpretado, EfeitoGenerico, SnapshotNivel

# ⚠️ DADOS INSUFICIENTES: VALIDAÇÃO NECESSÁRIA: confirme o identificador exato do
# modelo na documentação vigente do provedor antes de
# rodar em produção, strings de modelo mudam com o tempo e podem incluir sufixo de data.
_MODELO_PADRAO: Final = "claude-sonnet-5"

_PROMPT_SISTEMA: Final = """Você é o interpretador de decretos do jogo Regência. Recebe (1) um snapshot
do estado atual do nível em JSON e (2) uma frase livre e ambígua dita pelo jogador
Regente. Escolha UMA função do catálogo e preencha seus parâmetros, resolvendo
qualquer referência ambígua contra os objetos do snapshot. Se a intenção não
corresponder a nenhuma função nomeada, use efeito_generico. Responda APENAS com a
chamada de função, sem texto adicional."""


class ErroDeInterpretacao(Exception):
    """Levantado quando o modelo não devolve uma chamada de função válida."""


def interpretar_decreto(frase: str, snapshot: SnapshotNivel) -> DecretoInterpretado:
    """Interpreta um decreto do Regente e devolve a chamada de função estruturada.

    Args:
        frase: o texto (já transcrito, se veio de voz) dito pelo Regente.
        snapshot: o estado atual do nível.

    Returns:
        Um `DecretoInterpretado` pronto para passar pelo validador determinístico.
    """
    chave_api = os.environ.get("LLM_API_KEY")
    if not chave_api:
        return _interpretar_simulado(frase, snapshot)
    return _interpretar_via_api(frase, snapshot, chave_api)


def _interpretar_via_api(frase: str, snapshot: SnapshotNivel, chave_api: str) -> DecretoInterpretado:
    try:
        import anthropic
    except ImportError as exc:
        raise ErroDeInterpretacao(
            "SDK do provedor não instalado: rode `pip install anthropic` ou use o modo simulado"
        ) from exc

    cliente = anthropic.Anthropic(api_key=chave_api)
    resposta = cliente.messages.create(
        model=_MODELO_PADRAO,
        max_tokens=512,
        system=_PROMPT_SISTEMA,
        messages=[
            {
                "role": "user",
                "content": f"ESTADO DO NÍVEL:\n{snapshot.model_dump_json()}\n\nDECRETO DO REGENTE:\n\"{frase}\"",
            }
        ],
    )
    texto = "".join(bloco.text for bloco in resposta.content if bloco.type == "text")
    try:
        dados = json.loads(texto)
    except json.JSONDecodeError as exc:
        raise ErroDeInterpretacao(f"resposta do modelo não é JSON válido: {texto!r}") from exc
    return _dados_para_decreto(dados)


def _dados_para_decreto(dados: dict[str, Any]) -> DecretoInterpretado:
    from regencia.esquemas import ClimaLocal, SpawnarObstaculo, TransformarMaterial

    mapa: dict[str, type[DecretoInterpretado]] = {
        "transformar_material": TransformarMaterial,
        "clima_local": ClimaLocal,
        "spawnar_obstaculo": SpawnarObstaculo,
        "efeito_generico": EfeitoGenerico,
    }
    nome_funcao = dados.get("funcao")
    if not isinstance(nome_funcao, str) or nome_funcao not in mapa:
        raise ErroDeInterpretacao(f"função desconhecida devolvida pelo modelo: {nome_funcao!r}")
    decreto: DecretoInterpretado = mapa[nome_funcao](**dados)
    return decreto


def _interpretar_simulado(frase: str, snapshot: SnapshotNivel) -> DecretoInterpretado:
    """Stub determinístico usado quando não há chave de API configurada.

    Resolve "aquela porta"/"a porta" para o objeto do tipo porta mais próximo do
    Explorador, e sempre devolve um efeito genérico, suficiente para exercitar o
    pipeline ponta a ponta (validador + aplicação) sem chamar nenhuma API paga.
    """
    explorador = snapshot.encontrar("explorador")
    portas = [o for o in snapshot.objetos if o.tipo == "porta"]
    alvo = None
    if portas and explorador is not None:
        alvo = min(portas, key=lambda o: abs(o.posicao[0] - explorador.posicao[0]))
    elif portas:
        alvo = portas[0]

    return EfeitoGenerico(
        alvo_id=alvo.id if alvo else None,
        intensidade=70,
        area="pequena",
        duracao_s=-1,
        polaridade="prejudica",
    )
