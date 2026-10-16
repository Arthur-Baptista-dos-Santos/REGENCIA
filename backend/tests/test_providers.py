"""Testes dos providers com transporte HTTP simulado (sem rede e sem IA real)."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.config import Settings
from app.providers.ia_provider import (
    ErroProvedor,
    ProvedorIndisponivel,
    ProvedorOllama,
    ProvedorOpenAICompat,
    ProvedorSimulado,
    ProvedorTexto,
    TempoEsgotado,
    criar_provedor,
)


def _cliente(handler: httpx.MockTransport) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=handler)


def _gerar(prov: ProvedorTexto, formato_json: bool = True) -> str:
    return asyncio.run(prov.gerar("oi", max_tokens=20, temperatura=0.2, formato_json=formato_json)).texto


def test_ollama_monta_o_pedido_e_le_a_resposta() -> None:
    visto: dict[str, object] = {}

    def responder(req: httpx.Request) -> httpx.Response:
        visto["url"] = str(req.url)
        visto["corpo"] = json.loads(req.content)
        return httpx.Response(200, json={"message": {"role": "assistant", "content": '{"ok": true}'}})

    prov = ProvedorOllama("http://ollama:11434/", "qwen2.5:7b", 5, _cliente(httpx.MockTransport(responder)))
    r = asyncio.run(prov.gerar("oi", max_tokens=50, temperatura=0.1, formato_json=True))
    assert visto["url"] == "http://ollama:11434/api/chat"
    corpo = visto["corpo"]
    assert isinstance(corpo, dict)
    assert corpo["model"] == "qwen2.5:7b" and corpo["format"] == "json" and corpo["stream"] is False
    assert corpo["options"] == {"temperature": 0.1, "num_predict": 50}
    assert r.texto == '{"ok": true}' and r.provedor == "ollama" and r.modelo == "qwen2.5:7b"


def test_ollama_sem_formato_json_nao_envia_o_campo_format() -> None:
    corpos: list[dict[str, object]] = []

    def responder(req: httpx.Request) -> httpx.Response:
        corpos.append(json.loads(req.content))
        return httpx.Response(200, json={"message": {"content": "texto livre"}})

    prov = ProvedorOllama("http://x", "m", 5, _cliente(httpx.MockTransport(responder)))
    assert _gerar(prov, formato_json=False) == "texto livre"
    assert "format" not in corpos[0]


def test_openai_compat_envia_bearer_e_response_format() -> None:
    visto: dict[str, object] = {}

    def responder(req: httpx.Request) -> httpx.Response:
        visto["auth"] = req.headers.get("authorization")
        visto["url"] = str(req.url)
        visto["corpo"] = json.loads(req.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    prov = ProvedorOpenAICompat("https://api.exemplo/v1/", "segredo", "modelo-x", 5, _cliente(httpx.MockTransport(responder)))
    r = asyncio.run(prov.gerar("oi", max_tokens=30, temperatura=0.2, formato_json=True))
    assert visto["auth"] == "Bearer segredo"
    assert visto["url"] == "https://api.exemplo/v1/chat/completions"
    corpo = visto["corpo"]
    assert isinstance(corpo, dict) and corpo["response_format"] == {"type": "json_object"}
    assert r.texto == "{}" and r.provedor == "openai"


def test_openai_compat_sem_chave_nao_envia_authorization() -> None:
    def responder(req: httpx.Request) -> httpx.Response:
        assert "authorization" not in req.headers
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    prov = ProvedorOpenAICompat("http://local/v1", None, "m", 5, _cliente(httpx.MockTransport(responder)))
    assert _gerar(prov, formato_json=False) == "ok"


def test_resposta_com_formato_inesperado_levanta_erro_provedor() -> None:
    prov = ProvedorOllama("http://x", "m", 5, _cliente(httpx.MockTransport(lambda r: httpx.Response(200, json={"outro": 1}))))
    with pytest.raises(ErroProvedor):
        _gerar(prov)


def test_status_de_erro_do_provedor_levanta_erro_provedor() -> None:
    prov = ProvedorOllama("http://x", "m", 5, _cliente(httpx.MockTransport(lambda r: httpx.Response(500, text="falhou"))))
    with pytest.raises(ErroProvedor, match="HTTP 500"):
        _gerar(prov)


def test_corpo_que_nao_e_json_levanta_erro_provedor() -> None:
    prov = ProvedorOllama("http://x", "m", 5, _cliente(httpx.MockTransport(lambda r: httpx.Response(200, text="nao e json"))))
    with pytest.raises(ErroProvedor, match="não é JSON"):
        _gerar(prov)


def test_falha_de_conexao_vira_provedor_indisponivel() -> None:
    def recusar(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("recusada")

    prov = ProvedorOllama("http://x", "m", 5, _cliente(httpx.MockTransport(recusar)))
    with pytest.raises(ProvedorIndisponivel):
        _gerar(prov)


def test_timeout_vira_tempo_esgotado() -> None:
    def demorar(req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("lento")

    prov = ProvedorOllama("http://x", "m", 5, _cliente(httpx.MockTransport(demorar)))
    with pytest.raises(TempoEsgotado):
        _gerar(prov)


def test_provedor_simulado_devolve_json_valido_e_se_identifica() -> None:
    r = asyncio.run(ProvedorSimulado().gerar("qualquer", max_tokens=20, temperatura=0.2, formato_json=True))
    assert r.provedor == "simulado"
    assert json.loads(r.texto)["funcao"] == "efeito_generico"


@pytest.mark.parametrize(
    ("nome", "classe"),
    [("ollama", ProvedorOllama), ("openai", ProvedorOpenAICompat), ("simulado", ProvedorSimulado)],
)
def test_fabrica_escolhe_o_provedor_pela_configuracao(nome: str, classe: type) -> None:
    s = Settings(api_key="chave-de-teste-123", provedor=nome)
    assert isinstance(criar_provedor(s), classe)


def test_ollama_aquecer_carrega_o_modelo_e_mantem_na_memoria() -> None:
    visto: dict[str, object] = {}

    def responder(req: httpx.Request) -> httpx.Response:
        visto["url"] = str(req.url)
        visto["corpo"] = json.loads(req.content)
        return httpx.Response(200, json={"done": True})

    prov = ProvedorOllama("http://x", "qwen2.5:7b", 5, _cliente(httpx.MockTransport(responder)))
    asyncio.run(prov.aquecer())
    assert visto["url"] == "http://x/api/generate"
    corpo = visto["corpo"]
    assert isinstance(corpo, dict) and corpo["model"] == "qwen2.5:7b" and corpo["keep_alive"] == "30m"


def test_ollama_fora_do_ar_no_aquecimento_levanta_provedor_indisponivel() -> None:
    def recusar(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("recusada")

    prov = ProvedorOllama("http://x", "m", 5, _cliente(httpx.MockTransport(recusar)))
    with pytest.raises(ProvedorIndisponivel):
        asyncio.run(prov.aquecer())
