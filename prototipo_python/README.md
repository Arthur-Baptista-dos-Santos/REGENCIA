# Regência: protótipo do interpretador de decretos

## Propósito

Prova de conceito do núcleo de IA generativa de Regência: um decreto em linguagem
natural do Regente entra, uma chamada de função estruturada e validada sai. Este
código cobre apenas o interpretador e o validador, a integração com o motor
Godot 4 (movimento do Explorador, física, UI) é o objetivo do CP5 e ainda não
está aqui.

## Quick Start

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -e ".[dev]"
cp .env.example .env        # opcional, sem isso, roda em modo simulado
python -m regencia.main
```

Sem `LLM_API_KEY` configurada, o interpretador cai automaticamente em um
stub determinístico (`interpretar_simulado`), suficiente para exercitar o
pipeline ponta a ponta sem custo de API durante o desenvolvimento inicial.

## Arquitetura

```
Input do jogador (texto/voz)
        v
regencia.interprete_ia  --(function-calling)--> modelo de linguagem (ou stub simulado)
        v
regencia.validador      --(pathfinding + clamps, sem IA)--> decreto ajustado
        v
[Godot, aplicação no game state, ainda não implementado neste repositório]
```

Ver `Regencia_CP4_Relatorio.docx` (pasta pai) para a arquitetura completa,
incluindo as camadas de UI, memória e o roadmap de fases.

## Uso

```bash
python -m regencia.main
# Regente diz: transforma aquela porta ali num espelho
```

## Testes

```bash
pytest
ruff check .
mypy regencia
```
