"""Testes do cliente `requests` do painel (rede simulada com monkeypatch)."""

from __future__ import annotations

from typing import Any

import pytest
import requests

import cliente
from cliente import ErroDaAPI, RespostaTexto


class RespostaFalsa:
    def __init__(self, status: int, corpo: Any) -> None:
        self.status_code = status
        self._corpo = corpo

    def json(self) -> Any:
        if isinstance(self._corpo, Exception):
            raise self._corpo
        return self._corpo


def test_normalizar_url() -> None:
    assert cliente.normalizar_url(" http://localhost:8000/ ") == "http://localhost:8000"
    with pytest.raises(ErroDaAPI):
        cliente.normalizar_url("localhost:8000")


def test_gerar_texto_envia_header_e_corpo_corretos(monkeypatch: pytest.MonkeyPatch) -> None:
    visto: dict[str, Any] = {}

    def falso_post(url: str, **kwargs: Any) -> RespostaFalsa:
        visto["url"] = url
        visto.update(kwargs)
        return RespostaFalsa(200, {"texto": '{"ok": true}', "provedor": "ollama", "modelo": "qwen2.5:7b", "latencia_ms": 2500})

    monkeypatch.setattr(requests, "post", falso_post)
    r = cliente.gerar_texto("http://api/", "minha-chave", "oi", max_tokens=100, temperatura=0.5, formato_json=False)
    assert r == RespostaTexto('{"ok": true}', "ollama", "qwen2.5:7b", 2500)
    assert visto["url"] == "http://api/v1/ia-generativa/texto"
    assert visto["headers"] == {"X-API-Key": "minha-chave"}
    assert visto["json"] == {"prompt": "oi", "max_tokens": 100, "temperatura": 0.5, "formato_json": False}


@pytest.mark.parametrize(
    ("status", "trecho"),
    [(401, "recusou a chave"), (429, "Limite de requisições"), (503, "HTTP 503"), (502, "HTTP 502")],
)
def test_erros_http_viram_mensagens_legiveis(monkeypatch: pytest.MonkeyPatch, status: int, trecho: str) -> None:
    monkeypatch.setattr(requests, "post", lambda url, **kw: RespostaFalsa(status, {"detail": "erro do servidor"}))
    with pytest.raises(ErroDaAPI, match=trecho):
        cliente.gerar_texto("http://api", "k", "oi")


def test_timeout_e_falha_de_conexao(monkeypatch: pytest.MonkeyPatch) -> None:
    def estourar(url: str, **kw: Any) -> RespostaFalsa:
        raise requests.Timeout()

    monkeypatch.setattr(requests, "post", estourar)
    with pytest.raises(ErroDaAPI, match="demorou demais"):
        cliente.gerar_texto("http://api", "k", "oi")

    def recusar(url: str, **kw: Any) -> RespostaFalsa:
        raise requests.ConnectionError()

    monkeypatch.setattr(requests, "post", recusar)
    with pytest.raises(ErroDaAPI, match="Não foi possível conectar"):
        cliente.gerar_texto("http://api", "k", "oi")


def test_consultar_saude_sucesso_e_falha(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        requests,
        "get",
        lambda url, **kw: RespostaFalsa(200, {"status": "ok", "provedor": "ollama", "modelo": "m", "versao": "1.0.0"}),
    )
    assert cliente.consultar_saude("http://api")["provedor"] == "ollama"

    monkeypatch.setattr(requests, "get", lambda url, **kw: RespostaFalsa(500, {}))
    with pytest.raises(ErroDaAPI, match="HTTP 500"):
        cliente.consultar_saude("http://api")
