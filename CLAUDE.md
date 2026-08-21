# Editor de Diagramas — Claude Code

## Regra de manutenção (leia antes de mexer em qualquer coisa)

**Qualquer alteração na estrutura do projeto** — pasta nova, arquivo-chave movido ou
renomeado, mudança de decisão de arquitetura, dependência nova de peso — **atualiza o(s)
doc(s) correspondente(s) em `docs/` no mesmo commit.** Se a mudança também alterar o que foi
entregue ou o que falta, atualize o [CHECKLIST.md](CHECKLIST.md) junto. Vale para você
(Claude) e para o GitHub Copilot (mesma regra em
[.github/copilot-instructions.md](.github/copilot-instructions.md)) — os docs não podem ficar
para trás do código.

**Toda interface nova já nasce traduzível.** Textos visíveis, `accessibilityLabel`, mensagens,
ações e placeholders devem usar uma chave de `editor/src/i18n/<idioma>.json`, nunca uma string
solta no componente. Ao criar uma feature, inclua a mesma chave nos três catálogos atuais
(`pt-BR.json`, `en.json`, `es.json`) e registre a decisão/impacto na documentação da feature
e no `CHECKLIST.md` quando ela alterar o que foi entregue.

## O produto, em uma frase

Um editor de diagramas Mermaid, documentos Markdown e rabiscos (desenho livre) para celular
(Expo/React Native): toca num elemento do desenho — nó, aresta, tabela, coluna, traço — e edita
ali mesmo, sem abrir painel para o que se faz o tempo todo. Documento e diagrama são a mesma
coisa: um bloco ` ```mermaid ` num `.md` abre no canvas com todas as ferramentas e volta
atualizado. Uma segunda tab, separada dos documentos, é um **cliente de banco de dados**
(estilo DBeaver/TablePlus) — conecta em bancos de verdade (Postgres/MySQL/SQLite/SQL Server),
explora tabelas, edita linhas e desenha o diagrama entidade-relacionamento, tudo pelo celular.
Ver [docs/17-db-client.md](docs/17-db-client.md). **O app inteiro fica atrás de login** (JWT
accessToken/refreshToken, multi-conta) antes de mostrar qualquer tab — ver
[docs/18-autenticacao.md](docs/18-autenticacao.md).

O app real vive em [`editor/`](editor/). A especificação funcional completa dos documentos
Mermaid/Markdown/Rabisco (a fonte de verdade para qualquer detalhe fino, código exato incluído)
é [ESPECIFICACAO-APP-RN-EXPO.md](ESPECIFICACAO-APP-RN-EXPO.md); o protótipo web funcional que
resolve qualquer ambiguidade de comportamento é [editor-mermaid.html](editor-mermaid.html). O
cliente de banco de dados tem sua própria especificação, [DB-MOBILE.md](DB-MOBILE.md), e seu
próprio protótipo navegável, [prototipo.html](prototipo.html). Os arquivos em `docs/`
reorganizam as duas specs por assunto, com mais contexto por parte — comece pelos diagramas.

**A pasta `cognition` é um monorepo** (workspaces do npm, `package.json` na raiz):
[`editor/`](editor/) é o app Expo (documentos + cliente de banco); [`backend/`](backend/) é a
API própria do cliente de banco (NestJS) — os dois times de código vivem juntos, mas
`backend/` não é dependência de build do `editor/`, é um serviço HTTP à parte que o app
consome.

## Comece aqui

[docs/15-diagramas.md](docs/15-diagramas.md) — cinco fluxos em Mermaid (arquitetura em
camadas, ponte RN↔WebView, ciclo do modelo, ida-e-volta documento↔diagrama, roteiro de build)
dão a visão de relance antes de entrar em qualquer doc individual.

Para saber **o que já foi construído e o que falta**, o ponto de retomada é o
[CHECKLIST.md](CHECKLIST.md) — não esta lista abaixo, que é só o índice dos assuntos.

## Roteiro (`docs/`)

| Arquivo | Cobre | Status |
|---|---|---|
| [00-visao-geral.md](docs/00-visao-geral.md) | O produto, os 5 tipos de arquivo, as 3 promessas | referência |
| [01-decisao-arquitetura.md](docs/01-decisao-arquitetura.md) | WebView como canvas vs. 100% nativo, e por quê | referência |
| [02-setup-e-estrutura.md](docs/02-setup-e-estrutura.md) | Comandos, configs, pastas, por que escalam | Etapa 0 ✅ |
| [03-design-system.md](docs/03-design-system.md) | Tokens, os 9 componentes base, regras "parece nativo" | Etapa 2 ✅ |
| [04-dominio.md](docs/04-dominio.md) | Tipos, regra de ouro, serialize/parse/catálogo/mutations | Etapa 1 ✅ |
| [05-estado.md](docs/05-estado.md) | Store zustand, `applyLive`/`commitLive` | Etapa 5 ✅ |
| [06-canvas.md](docs/06-canvas.md) | Runtime offline, ponte RN↔WebView, tema, gestos | Etapas 3-4 ✅ |
| [07-selecao.md](docs/07-selecao.md) | As 3 camadas de seleção, chaves `kind:id` | Etapas 1, 8 ✅ |
| [08-barra-de-acoes.md](docs/08-barra-de-acoes.md) | ActionBar, 3 superfícies, criação encadeada | Etapas 6-7, 9 ✅ |
| [09-editor-de-codigo.md](docs/09-editor-de-codigo.md) | Realce por sobreposição, tokenizador | Etapa 5 ✅ |
| [10-markdown.md](docs/10-markdown.md) | Editor, barra de formatação, diagramas embutidos | Etapas 11-12 ✅ |
| [11-assistente-ia.md](docs/11-assistente-ia.md) | Backend próprio, escopo, validação antes de aplicar | Etapa 15 ✅ |
| [12-persistencia-e-export.md](docs/12-persistencia-e-export.md) | SQLite/biblioteca, exportar/compartilhar/importar | Etapas 13-14 ✅ |
| [13-qualidade-e-testes.md](docs/13-qualidade-e-testes.md) | Acessibilidade, as 2 camadas de teste de interface | Etapa 16 ✅ |
| [14-nativo-e-armadilhas.md](docs/14-nativo-e-armadilhas.md) | Rota 100% nativa (opcional), armadilhas conhecidas | referência |
| [15-diagramas.md](docs/15-diagramas.md) | Os 5 fluxos em Mermaid do projeto | referência |
| [16-rabisco.md](docs/16-rabisco.md) | Canvas Skia nativo, roadmap R1-R5 do desenho livre | Etapas R1-R2 ✅ |
| [17-db-client.md](docs/17-db-client.md) | Cliente de banco de dados: app + backend NestJS/Knex/Prisma/CASL | Etapa DB1 ✅ |
| [18-autenticacao.md](docs/18-autenticacao.md) | Login/registro/refresh/recuperação de senha, JWT accessToken+refreshToken, multi-conta, app inteiro atrás do gate | Etapa Auth ✅ |

## Como este projeto foi construído

**Em etapas, com checklist visível** — as 16 etapas do roteiro original estão implementadas
(ver [CHECKLIST.md](CHECKLIST.md) para o que cada uma entregou e para as pendências
conhecidas — nenhuma delas bloqueia o app, mas nenhuma foi verificada visualmente num device
de verdade: este ambiente não tem simulador iOS/Android). Trabalho novo continua no mesmo
espírito: mudança pequena e testável por vez, docs atualizados no mesmo commit. Testes de
interface entram junto com a feature que os motiva, não numa etapa de "testes" separada — ver
a estratégia completa em [docs/13-qualidade-e-testes.md](docs/13-qualidade-e-testes.md).

## GitHub Copilot

As mesmas regras valem para o Copilot, em
[.github/copilot-instructions.md](.github/copilot-instructions.md) (instruções gerais) e
[.github/instructions/dominio.instructions.md](.github/instructions/dominio.instructions.md)
(regra de ouro do domínio, aplicada só a `editor/src/domain/**`).
