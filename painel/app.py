"""Painel Streamlit que consome a API de IA generativa do jogo (via `requests`).

Executar:  streamlit run app.py
"""

from __future__ import annotations

import json

import streamlit as st

from cliente import ErroDaAPI, consultar_saude, gerar_texto

st.set_page_config(page_title="Regência: painel da API", page_icon="👑", layout="centered")

EXEMPLO = (
    "Você é o interpretador de decretos do jogo Regência. Responda com UM único objeto JSON, por exemplo "
    '{"funcao":"transformar_material","alvo_id":"porta_norte","novo_material":"espelho","duracao_s":12}. '
    'Decreto do jogador: "transforma aquela porta num espelho".'
)

st.title("Regência: painel da API de IA")
st.caption("Consome a API FastAPI do grupo com `requests`. O jogo usa a mesma rota.")

with st.sidebar:
    st.header("Conexão")
    url = st.text_input("URL da API", value="http://localhost:8000")
    chave = st.text_input("API Key (X-API-Key)", type="password")
    if st.button("Verificar saúde"):
        try:
            saude = consultar_saude(url)
            st.success(f"No ar: {saude['provedor']} · {saude['modelo']} (v{saude['versao']})")
        except ErroDaAPI as erro:
            st.error(str(erro))

st.subheader("Gerar texto")
prompt = st.text_area("Prompt enviado ao modelo", value=EXEMPLO, height=160)
col1, col2, col3 = st.columns(3)
max_tokens = col1.number_input("Máx. de tokens", min_value=16, max_value=1024, value=220, step=16)
temperatura = col2.slider("Temperatura", 0.0, 1.0, 0.2, 0.05)
formato_json = col3.checkbox("Resposta em JSON", value=True)

if st.button("Enviar para a API", type="primary"):
    if not chave:
        st.warning("Informe a API Key na barra lateral.")
    elif not prompt.strip():
        st.warning("Escreva um prompt.")
    else:
        with st.spinner("Aguardando a IA..."):
            try:
                resposta = gerar_texto(
                    url, chave, prompt, max_tokens=int(max_tokens), temperatura=float(temperatura), formato_json=formato_json
                )
            except ErroDaAPI as erro:
                st.error(str(erro))
            else:
                st.success(f"{resposta.provedor} · {resposta.modelo} · {resposta.latencia_ms} ms")
                try:
                    st.json(json.loads(resposta.texto))
                except json.JSONDecodeError:
                    st.code(resposta.texto)
