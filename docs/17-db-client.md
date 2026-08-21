# Cliente de banco de dados — app + backend

> Fonte completa da especificação funcional: [DB-MOBILE.md](../DB-MOBILE.md) (88KB, o
> documento que o usuário escreveu com TODAS as funcionalidades pretendidas, rota por rota).
> Protótipo visual/contrato de API: [prototipo.html](../prototipo.html) — um iPhone navegável
> ao lado de um inspetor de rotas. Este doc é o resumo operacional: o que foi construído, onde,
> e o que ficou de fora nesta entrega.

## Em uma frase

Um cliente de banco de dados estilo DBeaver/TablePlus, dentro do mesmo app Expo do editor de
diagramas, como uma tab nova e separada dos documentos. O celular nunca abre socket com o
banco-alvo: fala HTTP com um backend próprio (NestJS), que fala com Postgres/MySQL/SQLite/SQL
Server/Oracle via Knex.

```
┌──────────────┐   axios/HTTP    ┌──────────────────┐   Knex    ┌───────────────────────┐
│  editor/      │ ──────────────► │  backend/         │ ─────────► │ bancos-ALVO           │
│  tab "Banco   │ ◄────────────── │  (NestJS)         │ ◄───────── │ pg·mysql·sqlite·mssql │
│  de Dados"    │     JSON        │                   │            └───────────────────────┘
└──────────────┘                 │  Prisma ──────────────────────► Postgres PRÓPRIO
                                  │  (users/roles/       (docker-compose, dados do backend
                                  │   permissions/         em si — nunca os bancos-alvo)
                                  │   connections)
                                  └──────────────────┘
```

## Por que duas ferramentas de acesso a dado (Knex **e** Prisma)

Decisão confirmada com o usuário — não é redundância, são dois problemas diferentes:

- **Knex** fala com os bancos-alvo — Postgres, MySQL, SQLite, SQL Server, Oracle, escolhidos em
  runtime pelo usuário do app, schema desconhecido até conectar. Prisma não serve aqui: geraria
  um client em tempo de compilação para um schema que só existe depois.
- **Prisma** guarda os dados PRÓPRIOS do backend — usuários, roles, permissões (CASL) e o
  registro de conexões salvas (com a senha cifrada). Schema fixo e conhecido de antemão,
  exatamente o ponto forte do Prisma — e roda sobre um **Postgres via Docker**
  (`docker-compose.yml` na raiz do monorepo), separado de qualquer banco-alvo.

**Regra de ouro, sem exceção: criar/alterar tabela do NOSSO sistema é sempre Prisma (schema +
migration em `backend/prisma/`), nunca Knex.** Knex não cria, não altera e não migra tabela
nenhuma — ele só CONECTA e CONSULTA um banco-alvo que o usuário configurou em runtime (schema
de terceiros, desconhecido em tempo de build, é por isso que existe). Qualquer dado novo que o
BACKEND EM SI precisa guardar (uma tabela, uma coluna, um índice) entra em
`backend/prisma/schema.prisma` (espelhado em `schema.test.prisma`, ver "Testes" abaixo) e vira
uma migration nova em `backend/prisma/migrations/` — o mesmo caminho que `User`/`Session`/
`PasswordResetToken`/`Role`/`Permission`/`Connection` já seguem.

## Regra de ouro: nada que o usuário digita vira SQL

A mesma regra do domínio original do resto do app (`docs/04-dominio.md`), adaptada: em vez de
"nunca editar Mermaid por regex", aqui é **nunca deixar texto digitado virar statement**. Não
existe console de SQL livre nem filtro por "expressão SQL" — o construtor de consultas (filtro,
ordenação, projeção) sempre vira `knex(tabela).where(...).orderBy(...)` com o **identificador**
validado contra o catálogo real (nunca aceito direto do cliente) e o **valor** sempre por bind.
Onde o backend precisa de SQL que o builder não alcança (introspecção de catálogo, `PRAGMA` do
SQLite, `SHOW CREATE TABLE`), é sempre SQL que o PRÓPRIO backend escreve — fixo, sem receber
nada do usuário além de identificador já validado. Detalhe completo em `DB-MOBILE.md`, seção
"REGRA DE PROJETO".

## Monorepo

```
cognition/
  package.json          workspaces: ["editor", "backend"]
  docker-compose.yml     Postgres — só os dados PRÓPRIOS do backend
  editor/                app Expo (documentos + cliente de banco)
  backend/                API do cliente de banco (NestJS)
```

## Backend (`backend/`)

```
backend/
  prisma/
    schema.prisma          User, Session, PasswordResetToken, Role, Permission (CASL),
                            Connection — provider postgresql
    schema.test.prisma      MESMOS modelos, provider sqlite — só para os testes automatizados
                            (ver "Testes" abaixo)
  src/
    main.ts                 prefixo /api/v1, CORS, 0.0.0.0, Swagger em /api/docs
    prisma/                 PrismaService (adaptador @prisma/adapter-pg)
    auth/                   login/registro/refresh/me/logout/esqueci-redefinir senha (JWT
                            accessToken+refreshToken) — autenticação virou transversal ao app
                            inteiro, não mais algo só do cliente de banco; detalhe completo em
                            docs/18-autenticacao.md
    mail/                   MailService (SMTP com fallback de log — docs/18-autenticacao.md)
    users/                  CRUD de usuário, papéis atribuídos
    permissions/             CaslAbilityFactory + PermissionsGuard + @CheckAbility() + CRUD de Role/Permission
    connections/            CRUD de conexão salva (senha cifrada AES-256-GCM), KnexPoolService
                            (uma instância knex por conexão, em memória), GET /drivers
    catalog/                schemas/tables/tables/:t/ddl/rows — IntrospectService orquestra,
                            NUNCA sabe qual dialeto: pede pro DialectRegistry
      dialects/              pg/mysql/sqlite/mssql/oracle .strategy.ts, mesma interface
    erd/                     Mermaid erDiagram a partir do catálogo (schema inteiro ou vizinhança)
    mutations/               insert/update/delete em uma transação, trava otimista, preview
  test/                     e2e (supertest) + helpers de bootstrap
```

**Swagger**: `/api/docs` assim que o servidor sobe (`@nestjs/swagger`, decorators nos DTOs).

**CASL**: `Permission` (Prisma) é uma regra `can`/`cannot` por `action`+`subject`, com condição
opcional estilo Mongo (`{"ownerId": "..."}`). `PermissionsGuard` monta a `Ability` do usuário a
cada request (sem cache — revogar uma role vale na hora) e o decorator `@CheckAbility(action,
subject)` marca o que uma rota exige. Rotas de escrita (`connections` create/update/delete,
`roles`, `users`) exigem permissão explícita; leitura de catálogo só exige estar autenticado.

## App (`editor/src/features/dbclient/`)

```
dbclient/
  types.ts               espelha as respostas do backend
  api/
    http.ts               axios + interceptor de auth (token do useSettings)
    routes.ts              mapa único de rotas
    services.ts             uma função por rota, tipada — inclui runQuery() (Etapa DB2)
  lib/
    sql-highlight.ts        tokenizador SQL (mesmo formato de Token do realce de Mermoid) +
                            paleta — plugado no CodeEditor genérico via props (ver abaixo).
                            Vocabulário cobre DML (console livre) E DDL (`CREATE TABLE`/tipos de
                            coluna), porque a aba DDL de TableScreen usa o MESMO tokenizador pra
                            colorir o `CREATE TABLE ...` que o backend remonta do catálogo —
                            texto puro (`<Text selectable>`) antes, sem realce nenhum
  drivers.ts               catálogo de dialetos + campos do knexfile (pg/mysql2/tedious/
                           better-sqlite3 nesta entrega — oracle fica de fora até o driver
                           `oracledb` ser instalado no backend)
  screens/
    ConnectionsScreen · ConnectionFormScreen · DatabaseScreen · TableScreen — sem tela de login
                            aqui dentro: a aba abre direto na lista de conexões, porque o app
                            inteiro já está atrás do gate de autenticação (docs/18-autenticacao.md)
    DataGrid                grade COMPARTILHADA (Dados de TableScreen e resultado de QueryTab):
                            número de linha tocável (folha copiar/duplicar/excluir/editar
                            registro inteiro — cabeçalho mostra o `tag` tabela+chave da linha,
                            ex. "orders · id=5", não só "Ações da linha" sem dizer de qual
                            linha), célula tocável abre folha de opções (nunca edita direto —
                            editar valor/definir NULL, filtrar por esse valor, excluir esse
                            valor = filtro `neq`, copiar — cabeçalho mostra o nome da coluna com
                            `tag` "COLUNA", deixando claro o que está sendo tocado), rodapé com
                            total/página atual/total de páginas/tamanho de página, borda laranja
                            quando o resultado não é editável (views, sem PK, ou SELECT com JOIN
                            no console). Busca (`search`/`onSearchChange`/`onSearchSubmit`, só no
                            Dados/TableScreen — o campo migrou de `TableScreen` pra cá) e o botão
                            de abrir o editor de filtro moram na MESMA linha: campo de busca à
                            esquerda (`flex:1`), botão só-ícone circular e subtil (mesmo desenho
                            do X do `Sheet`, não `Chip`) no canto direito, azul quando algum
                            filtro está ativo. Filtros ativos aparecem numa segunda linha, como
                            pills planas e coloridas (protótipo `.pill`, `flexWrap: 'wrap'` — usa
                            a largura da barra e quebra linha sozinha, nunca some atrás de um
                            scroll lateral) com rótulo legível ("status é igual a ABERTO"), mais
                            um pill cinza "limpar tudo"
    FiltersSheet             editor de UMA condição por vez (coluna+operador de listas fechadas,
                            nunca texto livre — mesma regra de ouro do resto do app); operador
                            filtrado pelo tipo da coluna (só `contains`/`startsWith`/`endsWith`
                            em colunas de texto). Redesenhado seguindo `prototipo.html`
                            (`folhaFiltro`) — antes era uma folha só com lista de filtros ativos +
                            construtor embutido (poluída, "pouco Apple", pedido do usuário); o
                            gatilho pra abrir (novo filtro) é o ícone de filtro na barra de busca
                            do `DataGrid` (pedido seguinte do usuário — nada de pill própria "+
                            Filtro" competindo com a busca), tocar num pill de filtro ativo
                            reabre este editor já preenchido; `draft` é controlado pelo
                            `DataGrid` (não estado local do `FiltersSheet`), mesmo motivo do bug
                            já corrigido em `RecordFormSheet` (estado que só reseta quando
                            referência de prop muda quebra num fluxo "sempre `index: null`" como
                            "novo filtro")
    RecordFormSheet          formulário de registro (criar E editar) com tipo/obrigatoriedade
                            por coluna e toggle NULL por campo nullable; ação primária é um
                            `TintedButton` "Salvar" cheio (não `Chip`, mesmo motivo do resto do
                            lote — `Chip` genérico não é Apple-like) e cancelar é só o X do
                            `Sheet` (sem botão duplicado); erro de mutação (ex.: violação de
                            UNIQUE) sai num `Banner` — bug real corrigido aqui: o catch usava
                            `String(e)` num erro que já era um objeto `ApiErrorBody` (não
                            `Error`), sempre virando literalmente "[object Object]" em vez do
                            `.message` que o backend manda; sucesso dispara toast "Registro
                            criado."/"Registro atualizado." (`DataGrid.submitForm`) — antes não
                            havia nenhum feedback visual de que a criação deu certo
    DiagramCard              cartão de ERD COMPARTILHADO (Diagrama de DatabaseScreen e de
                            TableScreen): alternâncias "mostrar colunas"/"só chaves"/
                            profundidade (só vizinhança de tabela), "ver código Mermaid" +
                            copiar, exportar PNG/PDF/texto/copiar reaproveitando o MESMO
                            ShareSheet e services/export.ts da tela de Diagrama de documentos
    QueryTab                 aba "Consulta" (DatabaseScreen, Etapa DB2) — console SQL livre,
                            ver seção própria abaixo
    MermaidView             reaproveita o MESMO runtime WebView dos diagramas Mermaid do resto
                            do app (features/diagram/canvas/) — não é um motor novo; agora
                            forwardRef pro handle exportPng/exportSvg (DiagramCard usa)
```

Nova tab **Banco de Dados** em `app/(tabs)/dbclient.tsx`, ícone `database` (lucide). Telas
aninhadas empilham fora do grupo de tabs, em `app/db/` (`db/connection.tsx`, `db/[id]/
index.tsx`, `db/[id]/[table].tsx`) — mesmo padrão de `app/doc/[id].tsx`. Endereço do backend e
token de sessão persistem em `useSettings` (mesmo mecanismo de tema/idioma, `expo-sqlite/
kv-store` — sem trazer `AsyncStorage` como dependência nova). i18n: chaves novas em `src/i18n/
{pt-BR,en,es}.json` sob `"dbclient"`.

**Reaproveitado do design system existente, não recriado**: `GroupedList`/`Row`/`Field`/
`Segmented`/`Sheet`/`Chip`/`NavBar`/`AlertDialog`/`Fab` — o "parece Apple/iPhone" pedido já
existe em `editor/src/design/`, DB-MOBILE.md desenhava um `theme.ts`/`ui/index.tsx` próprios
que teriam duplicado tudo isso. Três componentes NOVOS nasceram aqui e foram promovidos pro
design system geral (`docs/03-design-system.md`) por servirem qualquer tela do app, não só o
cliente de banco: `RowSwitch` (o `Switch` nativo nasce grande demais pra uma `Row`, encolhido
0.8× e centralizado), `TintedButton` (botão de largura cheia, fundo azul translúcido — resolve
onde `Chip` vinha sendo usado errado, como botão comum fora de um HUD sobre canvas: Executar
consulta, Compartilhar diagrama, Copiar DDL) e `Banner` (erro/aviso com fundo tingido na cor do
tom, nunca mais texto vermelho solto sem moldura). O overlay do console SQL (§ abaixo) reaproveita o MESMO
`CodeEditor` do editor de Mermaid — o componente ganhou props opcionais `tokenizer`/`palette`
(default Mermoid) em vez de duplicar toda a técnica de sobreposição texto colorido + TextInput
transparente + o trabalho de teclado/scroll já resolvido lá (três bugs reais documentados no
próprio arquivo).

## Console SQL livre — "Consulta" (Etapa DB2, toggle de escrita na DB3)

Terceira aba de `DatabaseScreen` (entre Tabelas e Diagrama), pedida explicitamente pelo usuário
DEPOIS de usar o app de verdade e comparar com `prototipo.html` — e por escolha própria dele,
diverge do protótipo original ali (que reservava "console SQL" pra outra coisa). É a **única**
rota do app inteiro em que o texto que o usuário digita vira SQL de verdade, uma exceção
controlada e documentada à "REGRA DE PROJETO" (seção acima):

- Backend: `POST /connections/:id/query` (`catalog.controller.ts`) → `IntrospectService#rawQuery`
  → `sql-safety.ts#checkReadOnlySql()`. Só aceita **uma** instrução `SELECT`/`WITH`, sem `;` no
  meio, e varre a string INTEIRA (não só o primeiro token) atrás de uma lista de palavras de
  escrita — pega até uma CTE gravável tipo `WITH t AS (DELETE FROM x RETURNING *) SELECT ...`.
  Heurística por regex, não um parser de SQL de verdade: erra pro lado de REJEITAR uma consulta
  legítima (ex.: uma string literal que só MENCIONE "insert") antes de arriscar deixar passar
  escrita — escolha deliberada, não uma lacuna.
- **Toggle "Permitir alterar dados"** (Etapa DB3, pedido explícito do usuário — só existe **nesta
  aba**, em nenhum outro lugar do app): uma `Row`+`RowSwitch` acima do editor, desligada por
  padrão a cada vez que a aba abre (não persiste — nada de "esquecer ligado" entre sessões).
  Ligada, um `Banner` laranja fica visível lembrando que a consulta pode alterar dados de
  verdade. Só libera `INSERT`/`UPDATE`/`DELETE` como instrução única de topo — `DROP`/`ALTER`/
  `TRUNCATE`/`CREATE`/`GRANT`/etc. continuam bloqueados SEMPRE, com ou sem o toggle, porque
  alteram schema ou servidor inteiro, não "os dados de uma tabela" (o que o usuário pediu).
  **Verificação dos dois lados, nenhum dos dois confiando no outro**: o app faz uma checagem
  rápida (`QueryTab.tsx`, mesma ideia de olhar a primeira palavra) só pra dar feedback
  instantâneo sem round-trip quando o toggle está desligado; a fonte de verdade é sempre
  `checkReadOnlySql(sql, { allowWrite })` no backend — passar por cima do app e chamar a rota
  direto (Swagger, curl) ainda cai na mesma validação. Mesmo com o toggle ligado no app, uma
  conexão marcada **`readOnly`** continua bloqueando escrita (código `READ_ONLY`, mesma exceção
  que `ReadOnlyGuard` usa nas rotas de `mutations` — o toggle da tela não sobrepõe a marcação da
  conexão). Resultado de escrita não tem linhas pra desenhar grade: a resposta ganha um campo
  `affectedRows` (contagem por dialeto — `rowCount` no pg, `changes` no sqlite, validados ao
  vivo; `affectedRows`/`rowsAffected` no mysql/mssql, mesma lacuna de "sem servidor pra testar"
  já disclosed pros outros dialetos) e o app mostra um banner "N linha(s) afetada(s)" em vez da
  `DataGrid`.
- Editável célula a célula só quando o `SELECT` vem de **uma tabela só, sem JOIN** — a mesma
  `DataGrid` do resto do app decide isso olhando `edicao.editavel`/`edicao.table` que o backend
  devolve (mesmo campo que `rows()` já preenche pra Dados). Com JOIN, a grade renderiza mas com
  **borda laranja** e sem nenhuma ação de escrita — só ver/copiar.
- App: `CodeEditor` com o tokenizador de `lib/sql-highlight.ts` (realce de sintaxe de verdade,
  mesma técnica de sobreposição do editor Mermaid) + um erro de SQL real vindo do backend
  (mensagem/código `UNSAFE_QUERY` ou o erro nativo do driver) exibido abaixo, não um alerta
  genérico.
- Ao abrir a aba, o campo já vem preenchido com uma consulta pronta pra rodar de cara — lista os
  nomes de tabela do catálogo do banco-alvo. O texto muda por dialeto (`QueryTab.tsx`, busca o
  `client` da conexão via `getConnection`): `sqlite_master` no SQLite (não tem
  `information_schema`), `information_schema.tables` nos demais, com o filtro de schema variando
  (`DATABASE()` no MySQL, `table_type = 'BASE TABLE'` no SQL Server, `schema = 'public'` no
  Postgres). Só um ponto de partida — o usuário substitui pelo que quiser.

## O que ficou fora desta entrega (disclosed, não escondido)

- **Construtor de consultas visual** (montar um SELECT com tabela+colunas escolhidas por toque,
  sem digitar SQL). O console SQL livre (acima) cobre o caso de uso de forma diferente — texto
  em vez de builder —, e a mesma grade filtrável/paginável/com busca já mora na aba **Dados** de
  cada tabela; o builder visual solto continua fora.
- **Edição em lote com revisão antes de salvar** (buffer de várias mudanças, preview, confirmar
  tudo de uma vez). A edição do app hoje é uma mutação por ação (tocar numa célula, duplicar uma
  linha, etc. aplicam na hora — ainda passam pela mesma rota `mutations` do backend, então
  preview/trava otimista/transação continuam existindo por trás — só não tem a etapa de revisão
  em lote na UI).
- **Dialeto Oracle na lista do app**: o driver `oracledb` é pesado (§4.1 do DB-MOBILE.md) e não
  foi instalado no backend — a estratégia de introspecção existe (`oracle.strategy.ts`), só não
  aparece como opção selecionável na tela de Conexão até o driver entrar.
- **Filtros salvos, exportar CSV/JSON, túnel SSH, múltiplas abas**: já eram "fora" no
  DB-MOBILE.md original (seção "O que ficou de fora"), continuam fora.

## Testes

- **Backend, unitário** (Jest, 39/39): `crypto.util.spec.ts` (cifra/decifra AES-256-GCM),
  `filters.service.spec.ts` (todo filtro vira bind, nunca concatenação — inclusive um teste que
  tenta injetar `DROP TABLE` num nome de coluna e confirma que é rejeitado antes de tocar no
  query builder), `casl-ability.factory.spec.ts` (regras can/cannot/condição por role),
  `sql-safety.spec.ts` (o validador do console SQL livre: aceita SELECT/WITH simples, detecta
  JOIN, rejeita qualquer palavra de escrita mesmo escondida numa CTE, rejeita múltiplas
  instruções, aceita um `;` final solto; com `allowWrite: true` — aceita INSERT/UPDATE/DELETE e
  extrai a tabela, continua rejeitando DROP/ALTER/TRUNCATE e múltiplas instruções, SELECT
  continua funcionando igual).
- **Backend, e2e** (supertest, app Nest real, 31/31): dois arquivos —
  `test/dbclient.e2e-spec.ts` (fluxo completo: login → criar conexão → conectar → tabelas →
  estrutura → DDL → linhas com filtro/paginação/busca → coluna inexistente rejeitada → ERD →
  console SQL livre (SELECT numa tabela só = editável com `edicao.table`, JOIN = não editável,
  escrita/múltiplas instruções = `400 UNSAFE_QUERY`; com `allowWrite` — INSERT/UPDATE/DELETE
  rodam de verdade e devolvem `affectedRows` certo, sem o toggle continuam rejeitados, DROP
  continua rejeitado mesmo com o toggle, conexão `readOnly` bloqueia mesmo com o toggle) →
  preview de mutation → aplicar → conflito otimista com rollback confirmado → `NULL_PK` →
  `READ_ONLY` → senha nunca exposta → desconectar/excluir) e `test/permissions.e2e-spec.ts`
  (usuário só-leitura consegue listar mas não criar conexão nem gerenciar roles — CASL de
  verdade, não só a forma da rota). Banco de metadados = SQLite (`schema.test.prisma`, ver
  abaixo); banco-alvo = SQLite de exemplo criado na hora (`test/sample-target-db.ts`, tabelas
  `customers`/`orders` com PK, FK e índice).
- **App**: `vitest` (217/217) + `npx tsc --noEmit` limpo — `drivers.test.ts` (utilitários puros
  `getPath`/`setPath`/`baseConfigFor`); a `DataGrid`/`FiltersSheet`/`RecordFormSheet`/
  `DiagramCard`/`QueryTab` novos não têm teste de simulador (mesma limitação do resto do app,
  sem device real neste ambiente) — validados por tipo (`tsc`) e pela suíte e2e do backend que
  exercita cada rota que eles chamam.

**Por que SQLite nos testes**: mais rápido e não depende de infraestrutura externa pra rodar em
CI/local a qualquer momento — decisão de teste, não limitação de ambiente. `docker compose up`
com o Postgres real (dados PRÓPRIOS do backend) já foi validado ao vivo neste ambiente — e a
segunda passada (depois do Docker voltar) exercitou `pg.strategy.ts` de ponta a ponta contra o
próprio Postgres do backend usado como banco-ALVO também (conexão `pg` de teste apontando pra
`dbmobile`): `tables`/`connect`/DDL/estrutura/ERD do schema inteiro/console SQL com SELECT
simples e com JOIN. Essa passada achou e corrigiu um bug real que o SQLite nunca teria pego —
ver "Bug achado testando ao vivo" abaixo. Fica ocasionalmente indisponível por motivos da
máquina local (não do código); nesse caso os testes automatizados continuam cobrindo tudo via
SQLite sem depender dele. `schema.prisma` (produção, via
`docker-compose.yml` + `DATABASE_URL`) e `schema.test.prisma` (só teste) têm os MESMOS modelos,
só o `provider` difere — o client de teste é gerado à parte (`prisma generate --schema=prisma/
schema.test.prisma`, roda sozinho via `pretest:e2e`) e injetado no lugar do `PrismaService` real
via `overrideProvider()` do Nest, então nenhum módulo de aplicação sabe que está em teste. O
schema do banco de teste é aplicado com **DDL escrito à mão** (`test/prisma-test-client.ts`),
não `prisma db push`/`migrate` — essas ferramentas alteram um banco de verdade, e tanto o CLI do
Prisma 7 quanto o próprio harness deste agente bloqueiam por padrão qualquer comando desse tipo
quando quem chama é um agente de IA, mesmo mirando um arquivo temporário recém-criado. SQL
explícito e determinístico não passa por esse caminho (e é mais fácil de auditar de qualquer
forma) — se os modelos mudarem em `schema.prisma`, atualize as duas cópias juntas.

**Bug achado testando ao vivo**: `pg.strategy.ts#indexes()`/`#foreignKeys()` agregavam nomes de
coluna com `array_agg(a.attname ...)`. `attname` é do tipo interno `name` do Postgres — o
agregado vira `_name` (OID 1003), pro qual o driver `pg` (`node-postgres`) não tem parser de
array registrado por padrão, e devolve a string literal `"{email}"` em vez de `["email"]`. Toda
consulta contra SQLite passa longe disso (dialeto totalmente diferente), então nenhum teste
automatizado jamais exercitaria esse caminho — só apareceu batendo DDL/estrutura/ERD contra um
Postgres de verdade, o que só ficou possível quando o Docker voltou. Sintoma: `GET .../ddl`
devolvia `500 {"message":"i.columns.map is not a function"}`; ERD do schema inteiro teria
quebrado do mesmo jeito em qualquer schema com FK (só não quebrou antes porque não tinha sido
batido contra um schema com FK de verdade). Corrigido casting pro tipo certo dentro do
agregado — `array_agg(a.attname::text ...)` vira `_text` (OID 1009), que o driver já
desserializa — nas três ocorrências do arquivo. Sem teste automatizado novo pra isso (exigiria
Postgres de verdade em CI, que este projeto não tem — mesma lacuna já documentada pros outros
três dialetos não-SQLite), mas validado manualmente de novo depois do fix: DDL, estrutura
(índices/FKs) e ERD do schema inteiro (`Connection`→`User`, `Permission`→`Role`, `UserRole`→
`User`/`Role`) todos corretos.

**Dialetos mysql/mssql/oracle**: código completo (`backend/src/catalog/dialects/`, consultas de
catálogo padrão documentadas — `information_schema`/`sys.*`/`ALL_*`), mas SEM teste de
integração ao vivo — não há servidor desses bancos disponível aqui. `sqlite.strategy.ts` é o
único testado de ponta a ponta pela suíte automatizada (usado nos dois lados: metadados do
backend via Prisma E banco-alvo de exemplo via Knex, propositalmente exercitando os dois
caminhos com a mesma tecnologia); **`pg.strategy.ts` já foi validado ao vivo** contra o Postgres
real do `docker-compose.yml` (dados PRÓPRIOS do backend, via Prisma — não um banco-alvo pg, mas
a mesma estratégia de dialeto serve os dois já que ambos falam Postgres), boot completo +
`curl` confirmando login/`/drivers`/DDL/estrutura/ERD, e — depois do toggle "Permitir alterar
dados" (Etapa DB3) — INSERT/UPDATE/DROP direto em `POST .../query` contra esse mesmo Postgres:
sem o toggle rejeitado, com o toggle `affectedRows` certo (`rowCount` do driver `pg`), DROP
continua rejeitado mesmo com o toggle. Validar mysql/mssql/oracle é rodar um servidor de
verdade desses bancos e repetir o mesmo roteiro do e2e manualmente — não custa nada de código
novo, é só não ter onde rodar aqui.

## Como rodar

```bash
# 1. Sobe o Postgres de dados próprios do backend
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env   # ajuste DATABASE_URL/JWT_SECRET/JWT_REFRESH_SECRET/APP_SECRET se preciso
                        # (SMTP é opcional — sem ele, "esqueci minha senha" só loga o token)
npm install
npx prisma migrate dev  # cria as tabelas no Postgres real
SEED_ADMIN_EMAIL=voce@exemplo.com SEED_ADMIN_PASSWORD=escolha-uma-senha npm run db:seed
npm run start:dev       # http://localhost:3333/api/v1, Swagger em /api/docs

# 3. App — a tela de Login (fora das tabs, docs/18-autenticacao.md) já aponta pro backend.
#    Endereço vem de EXPO_PUBLIC_API_URL, um .env por ambiente em editor/ (.env.development
#    aponta pro localhost, só funciona no simulador rodando na mesma máquina do backend — ver
#    docs/02-setup-e-estrutura.md §"URL do backend por ambiente"). Testando num celular físico,
#    edite editor/.env.development pro IP da máquina na LAN.
cd ../editor && npm run ios   # ou android/start
```

`npm run db:seed` (`prisma/seed.ts`) cria a primeira role (`admin`, `manage all`) e o primeiro
usuário — sem isso, ninguém consegue nem `POST /users`, porque essa rota já exige permissão
CASL de `create User`, que ninguém tem até existir um admin. Idempotente (pode rodar de novo
sem duplicar); sem as variáveis de ambiente, usa `admin@exemplo.com` / `troque-esta-senha`
(troque no primeiro login).

## Deploy em VPS

`backend/Dockerfile` (multi-stage: builda com devDependencies, roda com o `node_modules`
completo copiado do estágio de build — de propósito, ver comentário no próprio Dockerfile:
`prisma`/`ts-node` são devDependencies mas `prisma migrate deploy`/`npm run db:seed` precisam
rodar dentro do container já em produção) + o serviço `backend` em `docker-compose.yml` (raiz do
monorepo) são o caminho pra subir numa VPS de verdade — o `docker-compose.yml` de antes só tinha
o Postgres.

```bash
# Na VPS, com Docker + Docker Compose instalados:
git clone <repo> && cd cognition
cp backend/.env.example backend/.env
# Edite backend/.env: JWT_SECRET, JWT_REFRESH_SECRET, APP_SECRET (nunca os valores de exemplo
# em produção), SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD (senha forte, não o padrão), SMTP_* se
# quiser e-mail de verdade pro fluxo de "esqueci minha senha". DATABASE_URL pode ficar como está
# no .env.example — o serviço `backend` do compose SOBRESCREVE essa variável pra apontar pro
# nome do serviço `db` (DNS interno do compose), não `localhost` (ver docker-compose.yml).

docker compose up -d --build     # sobe Postgres + backend
docker compose exec backend npx prisma migrate deploy   # cria as tabelas (idempotente)
docker compose exec backend npm run db:seed             # cria o primeiro admin (idempotente)

# Confirma: http://<ip-da-vps>:3333/api/docs (Swagger) deve responder.
```

Porta `3333` fica exposta publicamente pelo `ports: ['3333:3333']` do serviço — pra uma VPS de
verdade exposta na internet (não só numa rede local/VPN), colocar um reverse proxy com HTTPS na
frente (Caddy/nginx/Traefik) é recomendado mas **não é feito aqui** — fica de fora desta entrega
por falta de domínio configurado no momento; documentado como pendência, não esquecido.

Depois de confirmar o backend respondendo, aponte o app pra ele: `editor/.env.hml` (ou
`.env.production`, dependendo do canal) leva `EXPO_PUBLIC_API_URL=http://<ip-da-vps>:3333` — ver
docs/02-setup-e-estrutura.md §"URL do backend por ambiente" pra como isso chega no bundle
publicado (`npm run update:hml`/`update:production` em `editor/`).
