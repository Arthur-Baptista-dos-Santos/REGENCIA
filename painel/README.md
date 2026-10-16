# `Painel Streamlit`

Painel que consome a API do grupo com a biblioteca `requests`: testa a saude da API, envia prompts e mostra texto, provedor, modelo e latencia.

## `Quick Start`

```bash
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py            # http://localhost:8501
```

Na barra lateral informe a URL da API (`http://localhost:8000`) e a `API_KEY` do back-end. A chave fica so na sessao do navegador e nao e gravada em disco.

## `Estrutura`

- `cliente.py`: cliente `requests` (`consultar_saude`, `gerar_texto`, `ErroDaAPI`), sem dependencia do Streamlit.
- `app.py`: interface.
- `tests/`: 8 testes com `requests` simulado (`pytest -q`).

## `Integrantes`

Arthur Baptista dos Santos (RM 565346), João Pedro de Moura Dutra Franco (RM 561738), Nelson Félix Neto (RM 565603).
