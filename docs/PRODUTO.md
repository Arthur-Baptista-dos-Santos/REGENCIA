# Regencia como produto

## Proposta

Um coop assimetrico de plataforma em que uma pessoa joga o Regente e fala o que quer que aconteca no mundo, em portugues livre, e outra controla o personagem. A IA entende a frase; o validador garante que o desafio segue vencivel. A novidade e a **linguagem natural como mecanica**, e nao como enfeite.

## Estado atual (jogavel)

- 5 niveis com dificuldade crescente, bot que joga sozinho para demonstracao e para provar que cada nivel e vencivel.
- Configuracoes (volume, musica, tremor de tela), pausa, recordes salvos no navegador.
- Instalavel como app (PWA) e funciona offline com o interpretador local.
- Sem instalacao: abre no navegador, e a IA pode rodar no proprio navegador (Qwen2.5-3B via WebGPU, sem servidor, qualidade medida em docs/evidencias).

## Publico

Jogadores casuais de navegador e de coop local; escolas e clubes de programacao e linguagem (a mecanica ensina a descrever intencoes com precisao).

## Hipoteses de monetizacao (a validar)

| Caminho | Como | Risco |
|---|---|---|
| itch.io | Pague quanto quiser, com pacote zip da pasta `web/` | Baixa descoberta sem divulgacao |
| Versao educacional | Licenca para escolas, sem dependencia de nuvem (Ollama local) | Exige hardware razoavel |
| Pacotes de niveis | Novos niveis e o editor de decretos | Precisa de mais conteudo |

Nao ha numeros de mercado neste documento: nenhuma estimativa foi medida. Validar com testes de jogo e uma pagina de lancamento.

## Roadmap

1. Mais niveis e um tutorial guiado.
2. Hospedar a API (FastAPI) com um modelo na nuvem para quem nao tem GPU boa: o back-end ja aceita qualquer servico compativel com a API de chat da OpenAI.
3. Modo coop online (dois jogadores em maquinas diferentes).
4. Telemetria opcional e anonima dos decretos que o validador recusou, para melhorar o catalogo.
5. Editor de niveis.

## Lancamento no itch.io

```bash
cd web && zip -r ../regencia-web.zip .
```

Enviar o zip como projeto HTML, marcar "This file will be played in the browser" e usar `assets/og.png` como capa.
