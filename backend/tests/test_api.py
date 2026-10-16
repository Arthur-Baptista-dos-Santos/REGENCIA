"""Testes da API: rotas, autenticação, validação, erros do provedor, CORS e documentação."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import criar_app
from app.providers.ia_provider import ErroProvedor, ProvedorIndisponivel, TempoEsgotado
from tests.conftest import ProvedorFalso

ROTA = "/v1/ia-generativa/texto"
ORIGEM_PAGES = "https://arthur-baptista-dos-santos.github.io"


def test_health_e_publico_e_nao_vaza_chave(cliente: TestClient) -> None:
    r = cliente.get("/health")
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["status"] == "ok" and corpo["provedor"] == "falso"
    assert "chave" not in r.text.lower() and "api_key" not in r.text.lower()


def test_swagger_e_openapi_estao_habilitados(cliente: TestClient) -> None:
    assert cliente.get("/docs").status_code == 200
    openapi = cliente.get("/openapi.json").json()
    assert ROTA in openapi["paths"]
    assert "APIKeyHeader" in openapi["components"]["securitySchemes"]


def test_sem_api_key_retorna_401(cliente: TestClient) -> None:
    r = cliente.post(ROTA, json={"prompt": "oi"})
    assert r.status_code == 401
    assert "X-API-Key" in r.json()["detail"]


def test_api_key_errada_retorna_401(cliente: TestClient) -> None:
    r = cliente.post(ROTA, json={"prompt": "oi"}, headers={"X-API-Key": "errada"})
    assert r.status_code == 401


def test_sucesso_repassa_parametros_ao_provedor(cliente: TestClient, cabecalhos: dict[str, str], provedor: ProvedorFalso) -> None:
    r = cliente.post(
        ROTA,
        json={"prompt": "transforma aquela porta num espelho", "max_tokens": 100, "temperatura": 0.5, "formato_json": False},
        headers=cabecalhos,
    )
    assert r.status_code == 200
    assert r.json() == {
        "texto": '{"funcao": "efeito_generico"}',
        "provedor": "falso",
        "modelo": "modelo-falso",
        "latencia_ms": 7,
    }
    assert provedor.chamadas == [
        {"prompt": "transforma aquela porta num espelho", "max_tokens": 100, "temperatura": 0.5, "formato_json": False}
    ]


def test_valores_padrao_pedem_json_e_temperatura_baixa(
    cliente: TestClient, cabecalhos: dict[str, str], provedor: ProvedorFalso
) -> None:
    cliente.post(ROTA, json={"prompt": "oi"}, headers=cabecalhos)
    assert provedor.chamadas[0]["formato_json"] is True
    assert provedor.chamadas[0]["temperatura"] == 0.2


def test_prompt_vazio_retorna_422(cliente: TestClient, cabecalhos: dict[str, str]) -> None:
    assert cliente.post(ROTA, json={"prompt": ""}, headers=cabecalhos).status_code == 422


def test_prompt_acima_do_limite_retorna_422(cliente: TestClient, cabecalhos: dict[str, str]) -> None:
    r = cliente.post(ROTA, json={"prompt": "x" * 201}, headers=cabecalhos)
    assert r.status_code == 422
    assert "limite" in r.json()["detail"]


def test_parametros_fora_da_faixa_retornam_422(cliente: TestClient, cabecalhos: dict[str, str]) -> None:
    assert cliente.post(ROTA, json={"prompt": "oi", "max_tokens": 5000}, headers=cabecalhos).status_code == 422
    assert cliente.post(ROTA, json={"prompt": "oi", "temperatura": 3}, headers=cabecalhos).status_code == 422


def test_erro_do_provedor_vira_502(cliente: TestClient, cabecalhos: dict[str, str], provedor: ProvedorFalso) -> None:
    provedor.erro = ErroProvedor("quebrou")
    assert cliente.post(ROTA, json={"prompt": "oi"}, headers=cabecalhos).status_code == 502


def test_provedor_indisponivel_vira_503(cliente: TestClient, cabecalhos: dict[str, str], provedor: ProvedorFalso) -> None:
    provedor.erro = ProvedorIndisponivel("fora do ar")
    assert cliente.post(ROTA, json={"prompt": "oi"}, headers=cabecalhos).status_code == 503


def test_tempo_esgotado_vira_504(cliente: TestClient, cabecalhos: dict[str, str], provedor: ProvedorFalso) -> None:
    provedor.erro = TempoEsgotado("demorou")
    assert cliente.post(ROTA, json={"prompt": "oi"}, headers=cabecalhos).status_code == 504


def test_limite_de_requisicoes_retorna_429_com_retry_after(cliente: TestClient, cabecalhos: dict[str, str]) -> None:
    for _ in range(5):
        assert cliente.post(ROTA, json={"prompt": "oi"}, headers=cabecalhos).status_code == 200
    r = cliente.post(ROTA, json={"prompt": "oi"}, headers=cabecalhos)
    assert r.status_code == 429
    assert r.headers["retry-after"] == "60"


def test_requisicao_nao_autenticada_nao_consome_o_limite(cliente: TestClient, cabecalhos: dict[str, str]) -> None:
    for _ in range(10):
        assert cliente.post(ROTA, json={"prompt": "oi"}).status_code == 401
    assert cliente.post(ROTA, json={"prompt": "oi"}, headers=cabecalhos).status_code == 200


def test_cors_preflight_autoriza_origem_do_github_pages(cliente: TestClient) -> None:
    r = cliente.options(
        ROTA,
        headers={
            "Origin": ORIGEM_PAGES,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-api-key,content-type",
            "Access-Control-Request-Private-Network": "true",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == ORIGEM_PAGES
    assert "x-api-key" in r.headers["access-control-allow-headers"].lower()
    assert r.headers["access-control-allow-private-network"] == "true"


def test_cors_nao_autoriza_origem_desconhecida(cliente: TestClient) -> None:
    r = cliente.options(
        ROTA,
        headers={"Origin": "https://site-malicioso.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in r.headers


def test_api_sobe_mesmo_com_provedor_indisponivel_no_aquecimento(settings: Settings) -> None:
    class ProvedorQueFalhaAoAquecer(ProvedorFalso):
        async def aquecer(self) -> None:
            raise ProvedorIndisponivel("Ollama fora do ar")

    with TestClient(criar_app(settings=settings, provedor=ProvedorQueFalhaAoAquecer())) as c:
        assert c.get("/health").status_code == 200
