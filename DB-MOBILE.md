# DB Mobile — cliente de banco de dados para celular
### Documento único: app em React Native / Expo (Expo Go) + API em NestJS com knex

App de celular para acessar bancos de dados, no espírito do DBeaver e do TablePlus, com
linguagem visual iOS. O celular nunca abre socket com o banco: fala HTTP com um backend
NestJS, que traduz cada rota em consulta ao catálogo ou em SQL usando knex.

```
┌──────────────┐   axios / HTTP   ┌─────────────────┐   knex   ┌──────────────────────┐
│  Expo Go     │ ───────────────► │  NestJS         │ ───────► │ pg · mysql · sqlite  │
│  (parte 2)   │ ◄─────────────── │  (parte 4)      │ ◄─────── │ mssql · oracle       │
└──────────────┘   JSON           └─────────────────┘          └──────────────────────┘
        ▲
        └── enquanto o backend não existe, quem responde é um mock local
```

O que o app faz: conexões salvas com todos os campos de configuração do knex por dialeto;
lista de tabelas e views; estrutura, índices e chaves; DDL; diagrama relacional em Mermaid
do banco inteiro ou da vizinhança de uma tabela; construtor de consultas; grade de dados com
busca, filtros, ordenação e **edição** (alterar célula, excluir e duplicar registro) gravando
em transação.

---

# PARTE 1 — O protótipo é a especificação

Junto deste documento vai `prototipo.html`. Abra no navegador: à esquerda um iPhone
navegável com dados falsos, à direita um **inspetor de rotas** que mostra, a cada toque,
qual rota foi disparada, com que parâmetros, o JSON de resposta e o que o backend fará com
knex naquela rota. A segunda aba lista o catálogo completo de rotas com essa descrição.

Use o protótipo para três coisas:

1. **Validar o desenho** com quem vai usar, antes de escrever backend.
2. **Consultar o contrato** — o JSON que aparece no inspetor é exatamente o que o NestJS
   precisa devolver.
3. **Testar sua implementação** — quando o backend existir, compare a resposta real com a
   do protótipo tela por tela.

O mesmo mock existe dentro do app (`src/api/mock.ts`), atrás de um interruptor. É por isso
que o app roda inteiro no Expo Go sem nenhum servidor no ar.

---

# REGRA DE PROJETO: nada que vem do usuário vira SQL

A fronteira não é entre "usar `knex.raw` ou não" — é entre **SQL que o backend escreve** e
**texto que o usuário digita**.

**Proibido, sem exceção:** qualquer caminho que leve texto digitado a virar statement.
Isso derruba duas features que existiam nas versões anteriores deste projeto:

| Feature | Por que caiu |
|---|---|
| Console de SQL livre (`POST /query`) | o statement era digitado e executado como texto |
| Filtro por "expressão SQL" (`whereRaw` com fragmento do usuário) | mesmo problema, em pedaço menor |

No lugar do console entrou o **construtor de consultas**: tabela, colunas, condições,
ordenação e limite, que o servidor transforma em
`knex(tabela).select(...).where(...).orderBy(...).limit(...)`. A tela mostra o SQL
equivalente, mas como *leitura*.

**Onde o dado do usuário aparece, é sempre estrutura, nunca texto:**

| Entrada do usuário | Como entra na consulta |
|---|---|
| filtro (coluna, operador, valor) | `where` / `whereNot` / `whereIn` / `whereBetween` / `whereNull` — coluna conferida contra o catálogo, valor por binding |
| busca rápida | `whereILike` agrupado em `where(b => …)`, identificador por `??` |
| ordenação e projeção | nome conferido contra a lista real de colunas antes de ir ao builder |
| edição de célula, exclusão, duplicação | `update` / `del` / `insert` do builder, com a PK no `where` |

**Permitido:** o SQL que o próprio backend escreve, que é fixo e não recebe nada do
usuário além de identificadores vindos do catálogo. Isso cobre a leitura de catálogo, e é
onde `knex.raw` continua sendo a ferramenta certa:

| Uso interno | Fica |
|---|---|
| `select 1` no ping, `select version()` | `knex.raw`, é mais simples e direto |
| `pg_index` + `unnest(indkey)` + `array_agg` | `knex.raw` — não há como abrir o vetor `indkey` pelo builder |
| `obj_description()`, `pg_total_relation_size()` | `knex.raw` — são funções |
| `SHOW CREATE TABLE`, `SHOW INDEX`, `SHOW DATABASES` | `knex.raw` — são comandos |
| `PRAGMA table_info` e companhia (SQLite) | `knex.raw`, com `knex.ref()` no identificador |
| `pg_cancel_backend(pid)`, `KILL QUERY` | `knex.raw` com binding do pid |
| `cast(col as text) ilike ?` na busca | `orWhereRaw` com `??` no nome e binding no valor |

Nas consultas internas que **recebem um identificador** (nome de tabela ou coluna), duas
regras seguem valendo: o identificador vem do catálogo, nunca direto do cliente, e vai por
`??` ou `knex.ref()` em vez de ser concatenado.

Com isso o SQLite volta ao catálogo de dialetos: o `PRAGMA` que ele exige é SQL nosso, com
identificador controlado, e não tem nada a ver com entrada de usuário.

---

# PARTE 2 — O app no Expo Go

## 2.1 Subir em 5 minutos

```bash
npx create-expo-app@latest dbmobile --template blank-typescript
cd dbmobile

# crie os arquivos da estrutura da seção 2.7 seguindo o plano da Parte 6

npx expo install react-native-screens react-native-safe-area-context react-native-webview \
  @react-native-async-storage/async-storage expo-clipboard expo-status-bar
npm i axios @react-navigation/native @react-navigation/native-stack

npx expo start
```

Leia o QR Code com o **Expo Go**. Nenhuma dependência aqui exige código nativo próprio —
tudo o que é nativo (`webview`, `async-storage`, `screens`) já vem compilado dentro do
Expo Go. Por isso **não** existe `expo prebuild`, `pod install` nem Android Studio neste fluxo.

O que quebraria o Expo Go, e por isso não é usado:
- driver de banco no celular (`pg`, `sqlite3`…) — são módulos Node/nativos; é justamente por
  isso que o banco fica atrás do NestJS;
- editores de código nativos (CodeMirror nativo, Monaco) — o editor com realce foi feito com
  duas camadas de `Text`/`TextInput`, sem nada nativo;
- `react-native-svg` com renderer de Mermaid embutido — o Mermaid roda dentro de uma `WebView`.

## 2.2 O interruptor: mock ↔ NestJS

`src/api/http.ts`:

```ts
export const settings = {
  useMock: true,                        // ← o interruptor
  baseURL: 'http://192.168.0.10:3333',  // IP da máquina, não localhost
  timeout: 30000,
};

function apply() {
  http.defaults.baseURL = settings.baseURL + API_PREFIX;
  (http.defaults as any).adapter = settings.useMock ? mockAdapter : undefined;
}
```

Trocar o **adapter** do axios, e não a camada de serviços, é o que faz mock e servidor real
serem indistinguíveis para as telas: `api.tables(id)` é a mesma linha nos dois modos.
Dá para virar a chave em runtime (tela **Bancos → Backend**), e a escolha fica em `AsyncStorage`.

Três coisas que costumam travar aqui:

| Sintoma | Causa | Correção |
|---|---|---|
| `Network Error` em tudo | `baseURL` com `localhost` | use o IP da máquina na LAN, ou `npx expo start --tunnel` + backend exposto |
| Funciona no simulador, falha no aparelho | celular em outra rede/VLAN | mesma Wi-Fi, ou túnel |
| `Network Error` só no Android | Android bloqueia HTTP puro | ver 2.6 |
| CORS | NestJS sem `enableCors()` | ver 4.10 |

## 2.3 Onde ficam as rotas

Um arquivo, `src/api/routes.ts`. Nenhuma tela monta URL:

```ts
export const R = {
  tables:   (id: string) => `/connections/${enc(id)}/tables`,
  tableDdl: (id: string, t: string) => `/connections/${enc(id)}/tables/${enc(t)}/ddl`,
  rowsDaConsulta: (id: string, t: string) => `/connections/${enc(id)}/tables/${enc(t)}/rows`,
  // …
};
```

`src/api/services.ts` põe tipo em cima disso — uma função por rota. Se o backend mudar de
`/connections` para `/datasources`, o diff é de um arquivo.

## 2.4 Cada tela e a rota que ela dispara

| Tela | Toque | Rota |
|---|---|---|
| Bancos | abrir | `GET /connections` → `POST /connections/:id/connect` |
| Conexão | trocar dialeto | nenhuma (catálogo local) |
| Conexão | Testar | `POST /connections/test` |
| Conexão | Salvar | `POST /connections` ou `PATCH /connections/:id` |
| Banco → Tabelas | entrar | `GET /connections/:id/tables` |
| Banco → Consulta | Executar | `GET /connections/:id/tables/:t/rows?columns=…&filters=…` |
| Banco → Diagrama | entrar / alternar opções | `GET /connections/:id/erd?columns=&keysOnly=` |
| Tabela → Dados | entrar / paginar | `GET .../tables/:t/rows?limit=50&offset=` |
| Tabela → Dados | + Filtro, filtrar por célula, ordenar | mesma rota com `filters=<json>`, `where=`, `orderBy=`, `dir=` |
| Tabela → Dados | digitar na caixa de busca | mesma rota com `q=<termo>&qMode=tudo\|texto` (debounce de 350 ms) |
| Tabela → Dados | editar célula, marcar exclusão, duplicar | nada — vai para o buffer local |
| Tabela → Dados | Revisar e salvar | `POST .../mutations/preview` e, na confirmação, `POST .../mutations` |
| Tabela → Estrutura | entrar | `GET .../tables/:t` |
| Tabela → DDL | entrar | `GET .../tables/:t/ddl` |
| Tabela → Diagrama | entrar / mudar profundidade | `GET .../tables/:t/erd?depth=1..3` |

## 2.5 As peças que não são triviais

**Formulário de conexão gerado por catálogo** (`src/drivers.ts`). Cada campo declara o
caminho exato dentro do knexfile:

```ts
f('connection.ssl.rejectUnauthorized', 'Validar certificado', 'switch', { section: 'ssl' })
f('pool.acquireTimeoutMillis', 'Obter conexão (ms)', 'number', { section: 'pool', default: 60000 })
```

A tela lê o catálogo e desenha; campo novo é uma linha nova, nunca um `if` na tela. As
seções viram as abas **Conexão · SSL/TLS · Avançado · Pool**. Cobertura por dialeto:

| Dialeto | Campos além de host/porta/usuário/senha/banco |
|---|---|
| pg, pgnative, cockroachdb, redshift | `searchPath`, `application_name`, `statement_timeout`, `query_timeout`, `keepAlive`, `version`, bloco `ssl` completo |
| mysql, mysql2 | `socketPath`, `charset`, `timezone`, `flags`, `multipleStatements`, `dateStrings`, `supportBigNumbers`, `bigNumberStrings` |
| oracledb | `connectString`, `externalAuth`, `stmtCacheSize`, `fetchAsString` |
| mssql (tedious) | `options.encrypt`, `options.trustServerCertificate`, `options.instanceName`, `domain`, `options.requestTimeout`, `options.appName`, `options.readOnlyIntent` |
| todos | `connectionString`, `acquireConnectionTimeout`, `debug`, `asyncStackTraces`, bloco `pool.*` do tarn |

**Construtor de consultas** (`src/screens/DatabaseScreen.tsx`, aba Consulta). Escolha de
tabela, colunas, condições, ordenação e limite; a tela mostra a consulta equivalente em SQL
para leitura e dispara `GET .../rows` com esses parâmetros. Como o construtor sabe a tabela
de origem, o resultado cai direto na grade editável — sem nenhuma adivinhação sobre a
proveniência das linhas.

A folha de condição é a mesma da barra de filtros da aba Dados: coluna → operador → valor.
Um componente, dois lugares.

**Mermaid dentro de WebView** (`src/ui/MermaidView.tsx`). HTML inline, `mermaid@11` de CDN,
tema alinhado à paleta do app, pinch-to-zoom ligado. Sem internet, a tela mostra o código e
oferece copiar — o diagrama continua útil.

## 2.6 Ajustes de plataforma

Android bloqueia HTTP puro por padrão. Em desenvolvimento com Expo Go isso já vem liberado;
quando você gerar um build próprio, `app.json`:

```json
{ "expo": { "android": { "usesCleartextTraffic": true } } }
```

Em produção, sirva o backend por HTTPS e apague essa flag.

---
---

## 2.7 Estrutura de arquivos do app

```
App.tsx                      navegação (stack nativa)
src/
  theme.ts                   tokens iOS: cores, espaçamentos, tipografia, cores de token SQL
  types.ts                   contratos de dados (o que trafega nas rotas)
  drivers.ts                 catálogo de dialetos + TODOS os campos de config do knex
  api/
    routes.ts                mapa único de rotas — nenhuma tela monta URL
    http.ts                  axios + interruptor mock/real + normalização de erro
    services.ts              uma função por rota, tipada
    mock.ts                  backend falso em memória: catálogo, DDL, ERD, filtros,
                             busca, executor SQL e mutações
  lib/
    sql.ts                   tokenizador — só realce, para exibir DDL e a prévia da consulta
    filters.ts               operadores, prévia do WHERE, serialização dos parâmetros
    mutations.ts             buffer de alterações pendentes
    mermaid.ts               metadados → erDiagram, e recorte de vizinhança
  ui/
    index.tsx                primitivos: Group, Row, Field, Segmented, Button, DataGrid…
    (sem SqlEditor: não há edição de SQL)
    GradeEditavel.tsx        grade com edição — usada na aba Dados e no resultado do SQL
    MermaidView.tsx          WebView que desenha o Mermaid
  screens/
    ConnectionsScreen.tsx    lista de conexões + configuração do backend
    ConnectionFormScreen.tsx formulário dinâmico por dialeto
    DatabaseScreen.tsx       Tabelas | SQL | Diagrama
    TableScreen.tsx          Dados | Estrutura | DDL | Diagrama da vizinhança
```

A estrutura do backend NestJS está na seção 4.2.

## 2.8 Configuração de conexão: tudo que o knex aceita

O formulário é **gerado** a partir de `src/drivers.ts`. Cada campo declara um caminho que é
exatamente o caminho no knexfile:

```ts
f('connection.ssl.rejectUnauthorized', 'Validar certificado', 'switch', { section: 'ssl' })
```

Campo novo = uma linha nova. As seções viram abas: **Conexão · SSL/TLS · Avançado · Pool**.

### Mapa campo → knexfile

| Seção | Campo na tela | knexfile |
|---|---|---|
| Conexão | Servidor, Porta, Usuário, Senha, Banco | `connection.{host,port,user,password,database}` |
| Conexão (SQLite) | Arquivo do banco | `connection.filename` (`:memory:` aceito) |
| Conexão (Oracle) | Connect string | `connection.connectString` (EZConnect ou alias do tnsnames) |
| Avançado | Connection string | `connection.connectionString` — quando preenchida, sobrepõe host/porta/usuário |
| Avançado (pg) | search_path | `searchPath: string[]` |
| Avançado (pg) | application_name, statement_timeout, query_timeout, keepAlive | `connection.*` |
| Avançado (pg) | Versão forçada | `version` (necessário atrás de pgbouncer) |
| Avançado (mysql) | Charset, Timezone, Flags, multipleStatements, dateStrings, supportBigNumbers, bigNumberStrings, socketPath | `connection.*` |
| Avançado (sqlite) | useNullAsDefault | `useNullAsDefault: true` (obrigatório) |
| Avançado (mssql) | instanceName, encrypt, trustServerCertificate, requestTimeout, appName, readOnlyIntent | `connection.options.*` |
| Avançado (mssql) | Domínio | `connection.domain` (NTLM) |
| Avançado (oracle) | externalAuth, stmtCacheSize | `connection.*` |
| Avançado (todos) | Timeout do knex | `acquireConnectionTimeout` |
| Avançado (todos) | Log de SQL, Stack traces | `debug`, `asyncStackTraces` |
| SSL | Usar SSL, Validar certificado, CA, Cert, Key, SNI | `connection.ssl.*` (o switch `enabled` é traduzido: desligado remove a chave `ssl`) |
| Pool | mínimo, máximo, acquire/create/idle/reap/retry, propagateCreateError | `pool.*` (tarn) |

Dialetos cobertos: `pg`, `pgnative`, `cockroachdb`, `redshift`, `mysql`, `mysql2`,
`sqlite3`, `better-sqlite3`, `oracledb`, `mssql` (tedious).

A tradução tela → knexfile é o `toKnexConfig()` do `KnexPoolService` (seção 4.3). Ela também:
- remove chaves vazias (knex reclama de `''`),
- decifra a senha,
- transforma `searchPath: "public, integracao"` em array,
- descarta host/porta quando há `connectionString`.

---

## 2.9 Realce de SQL, só para leitura

Não existe editor de SQL neste app — nada é digitado como SQL e nada é executado a partir de
texto. O tokenizador (`src/lib/sql.ts`) continua no projeto, mas com outro papel: deixar
legível o que é **exibido**. Dois lugares o usam:

- a prévia da consulta no construtor, mostrando o `select … from … where …` equivalente ao
  que o servidor vai montar com o builder;
- o DDL remontado do catálogo, na aba DDL da tabela.

```ts
// realce = tokens coloridos, sem edição
export function tokenize(sql: string): Token[] { /* palavras-chave, tipos, strings, números, comentários */ }
```

O linter que existia antes (aspas abertas, parênteses, `DELETE` sem `WHERE`) foi removido
junto com o editor: sem texto digitado, não há o que analisar.

## 2.10 As telas

**Bancos** — lista de conexões com bolinha colorida (o hábito do TablePlus: vermelho é
produção, e você vê isso antes de digitar qualquer coisa). Rodapé com o interruptor do
backend. Toque abre; a cor da conexão passa a tingir o título e os botões das telas seguintes.

**Conexão** — nome, cor, somente-leitura; faixa horizontal de dialetos; abas
Conexão / SSL / Avançado / Pool geradas do catálogo; **Testar conexão** mostra a versão do
servidor e a latência, ou o erro cru do driver.

**Banco** — segmented de três:
- *Tabelas*: busca, agrupadas em Tabelas e Views, com contagem de linhas; rodapé com total.
- *Consulta*: construtor — tabela, colunas, condições (mesma folha de filtro da aba Dados),
  ordenação e limite. Mostra a consulta que o servidor vai montar, em leitura. O resultado cai
  na mesma grade editável: um selo diz **editável · tabela** ou **somente leitura**, e o motivo
  mais comum de bloqueio é ter tirado a chave primária das colunas.
- *Diagrama*: opções (mostrar colunas, só chaves, ver código), diagrama, copiar Mermaid.

**Tabela** — segmented de quatro: *Dados* (paginado, 50 por vez, editável, com busca rápida em todas as colunas e barra de filtros: chips
de filtro ativo, prévia do WHERE, ordenação por toque no cabeçalho e "filtrar por este valor"
na célula), *Estrutura*
(colunas com selos PK/FK/UK, índices, FKs, referenciada por), *DDL* (monoespaçado,
selecionável, copiar), *Diagrama* (vizinhança com profundidade 1–3).

Linguagem visual: fundo `#F2F2F7`, cartões brancos de canto 10, separadores hairline com
recuo de 16, tipografia do sistema, azul `#007AFF` para ação, verde/laranja/vermelho só para
estado. Nada de sombra decorativa, nada de gradiente. Dados sempre em monoespaçada.

---

---

# PARTE 3 — Contrato da API

Prefixo: `/api/v1`. Tudo JSON. Erro sempre no mesmo formato:

```json
{ "message": "relação \"pedidoss\" não existe", "code": "42P01", "position": 15, "hint": "..." }
```

## 3.1 Todas as rotas

| Método | Rota | Para quê |
|---|---|---|
| GET | `/drivers` | Dialetos disponíveis e quais pacotes estão instalados no servidor |
| GET | `/connections` | Lista conexões salvas (sem senha em claro) |
| POST | `/connections` | Cria conexão |
| GET | `/connections/:id` | Lê uma conexão |
| PATCH | `/connections/:id` | Atualiza |
| DELETE | `/connections/:id` | Remove (fecha o pool antes) |
| POST | `/connections/test` | Testa sem salvar |
| POST | `/connections/:id/connect` | Abre o pool knex |
| POST | `/connections/:id/disconnect` | `knex.destroy()` |
| GET | `/connections/:id/status` | Pool vivo? quantas conexões em uso |
| GET | `/connections/:id/databases` | Bancos do servidor |
| GET | `/connections/:id/schemas` | Schemas |
| GET | `/connections/:id/tables` | Tabelas e views com contagem e tamanho |
| GET | `/connections/:id/tables/:table` | Colunas, índices, FKs, quem referencia |
| GET | `/connections/:id/tables/:table/ddl` | DDL da tabela |
| GET | `/connections/:id/tables/:table/rows` | Linhas paginadas: projeção, busca, filtros e ordenação — atende a aba Dados e o construtor de consultas |
| POST | `/connections/:id/tables/:table/rows/cancel` | Cancela a consulta em andamento (`pg_cancel_backend`) |
| GET | `/connections/:id/tables/:table/count` | `count(*)` exato |
| GET | `/connections/:id/tables/:table/erd` | Mermaid da tabela + vizinhas |
| GET | `/connections/:id/erd` | Mermaid do schema inteiro |
| POST | `/connections/:id/tables/:table/mutations/preview` | Mostra o SQL que seria executado |
| POST | `/connections/:id/tables/:table/mutations` | Aplica insert/update/delete em uma transação |

## 3.2 Detalhe de cada rota

#### `GET /drivers`
Devolve os dialetos e se o driver npm correspondente está instalado no servidor.
O formulário de conexão do app usa o catálogo **local** (`src/drivers.ts`) como fonte
dos campos; a rota serve para avisar "o servidor não tem `oracledb` instalado".

#### `POST /connections/test`
Body: o objeto de conexão inteiro. O backend monta um knex com `pool: {min:0,max:1}`,
roda a query de versão do dialeto e destrói o pool.

```json
{ "ok": true, "serverVersion": "PostgreSQL 15.6 …", "latencyMs": 42 }
```

#### `POST /connections/:id/connect`
`Knex(config)` + uma leitura mínima do catálogo (`information_schema.tables` com `limit 1`,
para a falha aparecer no connect, não na primeira consulta.
A instância fica em memória (`Map id → knex`) e é reusada por todas as rotas seguintes.

#### `GET /connections/:id/tables?schema=&search=`
```json
{ "tables": [ { "schema":"public","name":"pedidos","type":"table",
                "comment":"Pedidos de saída","rows":5210,"sizeBytes":937800 } ] }
```
`rows` é estimativa (`pg_class.reltuples`, `information_schema.tables.table_rows`) —
barato. Contagem exata só no `/count`.

#### `GET /connections/:id/tables/:table`
```json
{
  "table":    { "schema":"public","name":"pedidos","type":"table","rows":5210 },
  "columns":  [ { "name":"id","type":"bigint","nullable":false,"default":"nextval(...)",
                  "isPrimary":true,"isUnique":true,"isAutoIncrement":true,"position":1 } ],
  "indexes":  [ { "name":"pedidos_pkey","columns":["id"],"unique":true,"primary":true,"method":"btree" } ],
  "foreignKeys":  [ { "name":"pedidos_cliente_id_fkey","columns":["cliente_id"],
                      "refTable":"clientes","refColumns":["id"],"onDelete":"RESTRICT" } ],
  "referencedBy": [ { "name":"pedido_itens_pedido_id_fkey","table":"pedido_itens",
                      "columns":["pedido_id"],"refColumns":["id"] } ]
}
```
`referencedBy` é o que dá o lado "muitos" no diagrama e a lista "quem depende desta tabela".

#### `GET /connections/:id/tables/:table/rows`

Parâmetros: `columns`, `limit`, `offset`, `orderBy`, `dir`, `filters` (JSON) e `q` + `qMode`.
Esta rota atende tanto a aba **Dados** quanto o **construtor de consultas** — não existe rota
de SQL livre. `columns` é a projeção escolhida no construtor; vazio significa todas.

```
?columns=id,numero,status&limit=50&offset=0&orderBy=criado_em&dir=desc
&filters=[{"column":"status","op":"eq","value":"ABERTO"},
          {"column":"total","op":"between","value":"100","value2":"200"},
          {"column":"faturado_em","op":"isNull"}]
&q=PED1000&qMode=tudo
```

Resposta em **matriz**, não em objetos — preserva ordem das colunas e não perde colunas
de nome repetido:
```json
{ "fields":[{"name":"id","type":"bigint"}], "rows":[[1],[2]],
  "total":394, "totalSemFiltro":5210, "offset":0, "limit":50, "colunasBuscadas":2 }
```

`editavel` só é verdadeiro quando a projeção inclui a chave primária — sem ela não há como
montar o `where` do UPDATE. Tirar `id` das colunas devolve
`motivoBloqueio: "Inclua a chave primária (id) nas colunas para poder editar."`.

`total` é a contagem **com** o filtro (exata, porque o `count(*)` filtrado costuma usar
índice); `totalSemFiltro` é a estimativa do catálogo. É o que permite mostrar
"1–50 de 394, de 5.210 sem filtro".

**Operadores aceitos em `filters`** e a tradução para knex:

| `op` | Significado | knex |
|---|---|---|
| `eq` `neq` `gt` `gte` `lt` `lte` | comparação | `where(col, '=', v)` / `whereNot` |
| `contains` `startsWith` `endsWith` | texto | `whereILike(col, '%v%')` (pg) · `whereLike` nos demais |
| `in` | lista separada por vírgula | `whereIn(col, [...])` |
| `between` | usa `value` e `value2` | `whereBetween(col, [a, b])` |
| `isNull` `notNull` | nulidade | `whereNull` / `whereNotNull` |

Regras que o backend aplica sempre: nome de coluna **conferido contra o catálogo**
(coluna inexistente → 400 com `code: 42703`), valor **sempre como binding**, e `orderBy`
validado da mesma forma. Nenhuma string do cliente é concatenada em SQL.

#### Busca rápida (`q` + `qMode`)

Um termo, várias colunas, `OR` entre elas e `AND` com todo o resto. É a caixa de busca do
TablePlus, e no celular acaba sendo o caminho mais usado — mais que montar filtro por coluna.

| `qMode` | O que faz | Custo |
|---|---|---|
| `tudo` (padrão) | `cast` de toda coluna para texto e compara com `ILIKE` | varredura: nenhum índice é usado |
| `texto` | só colunas textuais, sem `cast` | mais barato, e indexável com trigram no pg; não acha número nem data |

O `cast` é SQL nosso: `orWhereRaw('cast(?? as text) ilike ?', [coluna, padrao])`, com o
identificador vindo do catálogo por `??` e o termo do usuário como binding. O que o usuário
digitou é valor, nunca fragmento de statement.

Cast e sensibilidade a maiúsculas mudam por dialeto:

| Família | Fragmento |
|---|---|
| pg | `cast(?? as text) ilike ?` |
| mysql | `cast(?? as char) like ?` (o collation padrão já é insensível) |
| sqlite | `cast(?? as text) like ?` (insensível só para ASCII) |
| mssql | `upper(cast(?? as nvarchar(max))) like upper(?)` |
| oracle | `upper(cast(?? as varchar2(4000))) like upper(?)` |

Tabela sem nenhuma coluna de texto com `qMode=texto` devolve 400 com `code: NO_TEXT_COLUMN`.

> Se a varredura incomodar em tabela grande, existe um meio-termo que dá para implementar
> sem `cast`: colunas de texto com `ILIKE` e colunas de número/data com **igualdade**, cada
> uma entrando só quando o termo converte para aquele tipo. Continua usando índice, mas
> buscar `499` deixa de achar `1499`.

O `OR` **precisa** ficar agrupado — `q.where(b => { alvo.forEach(c => b.orWhereRaw(tpl, [c.name, padrao])) })`.
Sem o agrupamento vira `status = 'ABERTO' and a ilike '%x%' or b ilike '%x%'`, e o `or` anula
o filtro anterior: a tela mostraria linhas que não passaram no filtro. É o erro clássico aqui.

A resposta traz `colunasBuscadas` para a tela poder dizer "7 colunas varridas". No app, o
campo tem debounce de 350 ms — sem isso cada tecla vira uma consulta.

Na tela: a caixa de busca no topo faz a busca rápida; `+ Filtro` abre a folha coluna → operador → valor; toque no cabeçalho ordena
(crescente → decrescente → sem ordem); toque numa célula oferece **filtrar por este valor**
e **excluir este valor** — que é o clique-direito do DBeaver, e na prática o caminho mais
usado. A prévia do `WHERE` fica visível acima da grade antes de qualquer coisa ir ao banco.

#### `GET /connections/:id/erd?columns=true&keysOnly=true&schema=`
```json
{ "mermaid": "erDiagram\n  CLIENTES ||--o{ PEDIDOS : \"cliente_id\"\n…", 
  "tables": ["clientes","pedidos"], "relations": 9 }
```

#### `GET /connections/:id/tables/:table/erd?depth=1`
Mesma saída, recortada: a tabela + tudo que ela referencia + tudo que a referencia,
`depth` níveis. É o "ver diagrama desta tabela" do DBeaver.

#### `POST .../tables/:table/mutations` e `.../mutations/preview`

Edição da grade. O app não manda nada enquanto você digita: alterar célula, marcar linha
para exclusão e duplicar registro só mexem em um buffer local. O botão Salvar faz duas
chamadas — primeiro `preview`, que devolve o SQL sem executar; depois `mutations`, que
aplica tudo dentro de **uma transação**.

```json
{
  "optimistic": true,
  "changes": [
    { "kind":"insert", "values": {"numero":"PED999","cliente_id":3,"status":"ABERTO"} },
    { "kind":"update", "key": {"id":42}, "set": {"status":"FATURADO"}, "was": {"status":"ABERTO"} },
    { "kind":"delete", "key": {"id":51} }
  ]
}
```

Resposta:
```json
{ "ok":true, "applied":3, "durationMs":34,
  "results":[ {"kind":"insert","affected":1,"returned":{"id":5211}},
              {"kind":"update","affected":1}, {"kind":"delete","affected":1} ] }
```

A ordem é `insert → update → delete`, para não colidir com chave única recém-liberada.

**Sem chave primária, sem edição.** Para atualizar ou excluir é preciso apontar a linha sem
ambiguidade. Um WHERE com todas as colunas parece resolver, mas em tabela com linhas
repetidas atinge mais de uma — e aí o estrago já aconteceu. O DBeaver faz igual: tabela sem
PK abre em leitura. A rota `rows` já devolve `primaryKey`, `autoIncrement`, `editavel` e
`motivoBloqueio`, então a tela sabe disso antes de oferecer o menu de edição. Views e
conexões marcadas somente leitura caem no mesmo bloqueio.

**Trava otimista.** O UPDATE leva no WHERE, além da PK, o valor **original** das colunas
alteradas:

```sql
update "pedidos" set "status" = $1, "total" = $2
 where "id" = $3 and "status" = $4 and "total" = $5
-- bindings: ["FATURADO", 99.9, 42, "ABERTO", 12.5]
```

Se outra pessoa mexeu na linha entre a leitura e o salvamento, o UPDATE encontra zero
linhas. Como toda operação precisa afetar **exatamente 1**, isso vira `409 CONFLICT` e a
transação inteira volta atrás — em vez de sobrescrever o trabalho alheio em silêncio.
Original `NULL` vira `is null`, não `= null`.

No DELETE a trava fica só na PK, de propósito: comparar a linha inteira parece mais seguro,
mas `numeric` e `timestamptz` voltam formatados de outro jeito e produzem conflito falso em
linha que ninguém tocou. A checagem de "afetou exatamente 1" já cobre a linha ter sumido.

**O preview usa `.toString()` do knex**, que interpola os bindings — serve para *mostrar*.
A execução real usa bindings de verdade. São dois caminhos diferentes de propósito: o que
você lê na tela é legível, o que vai ao banco é parametrizado.

Erros: `NO_PK`, `READ_ONLY`, `NULL_PK` (chave natural em branco no insert), `42703` (coluna
inexistente), `CONFLICT` (com `index` da operação e `affected`).

## 3.3 Introspecção por dialeto

Cada estratégia de dialeto (seção 4.5) implementa a mesma interface, com uma consulta por conceito:

| Conceito | pg | mysql | sqlite | mssql | oracle |
|---|---|---|---|---|---|
| Tabelas | `pg_class` + `pg_namespace` (tipo, comentário, `reltuples`, `pg_total_relation_size`) | `information_schema.tables` | `sqlite_master` + `count(*)` | `sys.tables` + `sys.partitions` | `all_tables` |
| Colunas | `information_schema.columns` | idem | `PRAGMA table_info` | idem | `all_tab_columns` |
| Índices | `pg_index` + `unnest(indkey)` (método e predicado parcial) | `SHOW INDEX` | `PRAGMA index_list/index_info` | `sys.indexes` + `sys.index_columns` | `all_indexes` |
| FKs | `pg_constraint` (contype='f', `conkey`/`confkey`) | `key_column_usage` + `referential_constraints` | `PRAGMA foreign_key_list` | `sys.foreign_keys` | `all_constraints` (type 'R') |
| DDL | remontado do catálogo | `SHOW CREATE TABLE` | `sqlite_master.sql` | remontado | remontado |

`isPrimary` / `isUnique` não vêm de `information_schema.columns` — são derivados dos índices.
É o mesmo caminho que o DBeaver usa e é o que faz a cardinalidade do ERD sair certa.

---

## 3.4 ERD: como o Mermaid é gerado

Entrada: lista de tabelas com colunas e FKs. Saída: `erDiagram`.

Regra de cardinalidade (o mesmo gerador roda no app, em `src/lib/mermaid.ts`, e no backend, no `MermaidService`):

| Situação da coluna da FK | Notação | Leitura |
|---|---|---|
| aceita NULL, não é única | `PAI \|\|--o{ FILHO` | zero ou muitos |
| NOT NULL, não é única | `PAI \|\|--\|{ FILHO` | um ou muitos |
| única/PK e NOT NULL | `PAI \|\|--\|\| FILHO` | um para um |
| única/PK e aceita NULL | `PAI \|\|--o\| FILHO` | zero ou um |

Detalhes que evitam diagrama quebrado:
- nomes viram `[A-Z0-9_]` (Mermaid não aceita hífen nem espaço em entidade);
- tipos perdem parênteses: `varchar(60)` → `varchar_60`;
- relação cuja tabela-pai está fora do recorte é omitida — senão o Mermaid inventa uma
  caixa vazia;
- rótulo da relação é a coluna da FK, que é a informação que falta quando há duas FKs
  para a mesma tabela (`origem_id` e `destino_id` → duas linhas legíveis).

Recorte por tabela (`neighborhood`): BFS sobre o grafo de FKs nas duas direções, `depth` níveis.
`depth=1` é o padrão e é o que cabe numa tela de celular.

Renderização: `src/ui/MermaidView.tsx` — WebView com `mermaid@11` de CDN, tema base ajustado
para a paleta do app, pinch-to-zoom ligado. Sem rede, a tela oferece "Ver código Mermaid" e
"Copiar Mermaid" — o diagrama continua útil mesmo sem desenhar.

---

---

# PARTE 4 — A API em NestJS + knex
## 4.1 Criar o projeto

```bash
npm i -g @nestjs/cli
nest new dbmobile-api        # escolha npm
cd dbmobile-api

npm i knex @nestjs/config class-validator class-transformer
npm i pg mysql2 sqlite3 tedious              # drivers que você vai usar
npm i -D @types/node
# opcionais e pesados, só instale se precisar:
# npm i oracledb better-sqlite3 pg-native
```

O knex não traz driver nenhum: você instala o do banco. É por isso que a rota `GET /drivers`
existe — ela responde quais `require.resolve` funcionam neste servidor.

## 4.2 Estrutura de módulos

```
src/
  main.ts
  app.module.ts
  common/
    filters/database-exception.filter.ts   traduz erro de driver no formato do app
    guards/read-only.guard.ts              bloqueia escrita em conexão de leitura
    dto/                                   validação de entrada
  connections/
    connections.module.ts
    connections.controller.ts              /connections*
    connections.service.ts                 registro + cifra da senha
    knex-pool.service.ts                   Map<id, Knex>, tradução para knexfile
  catalog/
    catalog.module.ts
    catalog.controller.ts                  /tables, /schemas, /ddl, /rows
    introspect.service.ts                  orquestra as estratégias
    ddl.service.ts
    dialects/
      dialect.types.ts
      pg.strategy.ts  mysql.strategy.ts  sqlite.strategy.ts  mssql.strategy.ts  oracle.strategy.ts
      dialect.registry.ts
  erd/
    erd.module.ts  erd.controller.ts  mermaid.service.ts
  (não há módulo de SQL livre: o construtor de consultas usa a rota `rows` do catálogo)
  mutations/
    mutations.module.ts  mutations.controller.ts  mutations.service.ts
    dto/mutation.dto.ts                    edição da grade, uma transação por chamada
```

Regra que evita bagunça: **controller não conhece dialeto**. Ele pede
`introspect.tables(id, schema)` e o registro de estratégias decide se vai em `pg_class`,
`information_schema` ou `PRAGMA`.

## 4.3 O pool: uma instância knex por conexão salva

```ts
// src/connections/knex-pool.service.ts
import { Injectable, OnModuleDestroy, InternalServerErrorException } from '@nestjs/common';
import Knex from 'knex';
import type { Knex as KnexType } from 'knex';
import { ConnectionConfig } from './connection.types';

@Injectable()
export class KnexPoolService implements OnModuleDestroy {
  private readonly live = new Map<string, KnexType>();

  /** Traduz o objeto que veio da tela no knexfile. É aqui que mora toda a manha por dialeto. */
  toKnexConfig(cfg: ConnectionConfig, decrypt: (s: string) => string): KnexType.Config {
    const conn: any = JSON.parse(JSON.stringify(cfg.connection ?? {}));
    if (conn.password) conn.password = decrypt(conn.password);

    // o app manda ssl: { enabled, rejectUnauthorized, ca, cert, key }
    if (conn.ssl) {
      const { enabled, ...ssl } = conn.ssl;
      if (!enabled) delete conn.ssl;
      else conn.ssl = Object.fromEntries(Object.entries(ssl).filter(([, v]) => v !== '' && v != null));
    }
    // connection string ganha do resto
    if (conn.connectionString) {
      for (const k of ['host', 'port', 'user', 'password', 'database']) delete conn[k];
    }
    // knex reclama de string vazia; melhor a chave não existir
    Object.keys(conn).forEach(k => (conn[k] === '' || conn[k] === undefined) && delete conn[k]);

    const out: KnexType.Config = {
      client: cfg.driver,
      connection: conn,
      pool: cfg.pool && Object.keys(cfg.pool).length ? cfg.pool : { min: 0, max: 5 },
      acquireConnectionTimeout: cfg.acquireConnectionTimeout ?? 60_000,
      debug: !!cfg.debug,
      asyncStackTraces: !!cfg.asyncStackTraces,
    };
    if (cfg.searchPath)      (out as any).searchPath = String(cfg.searchPath).split(',').map(s => s.trim());
    if (cfg.useNullAsDefault) out.useNullAsDefault = true;
    if (cfg.version)         (out as any).version = cfg.version;
    return out;
  }

  /** Abre (ou reaproveita) o pool. */
  async open(cfg: ConnectionConfig, decrypt: (s: string) => string): Promise<KnexType> {
    const existente = this.live.get(cfg.id);
    if (existente) return existente;

    const knex = Knex(this.toKnexConfig(cfg, decrypt));
    try {
      // SQL nosso, fixo, sem nada do usuário: raw é a ferramenta certa aqui
      await knex.raw(cfg.driver === 'oracledb' ? 'select 1 from dual' : 'select 1');
    } catch (err) {
      await knex.destroy();
      throw err;                       // o filtro de exceção traduz
    }
    this.live.set(cfg.id, knex);
    return knex;
  }

  get(id: string): KnexType | undefined { return this.live.get(id); }

  require(id: string): KnexType {
    const k = this.live.get(id);
    if (!k) throw new InternalServerErrorException({ message: 'Conexão não está aberta.', code: 'NOT_CONNECTED' });
    return k;
  }

  async close(id: string) {
    const k = this.live.get(id);
    if (k) { await k.destroy(); this.live.delete(id); }
  }

  /** Teste sem salvar: pool de 1, pergunta a versão, destrói. */
  async probe(cfg: ConnectionConfig, decrypt: (s: string) => string) {
    const knex = Knex(this.toKnexConfig({ ...cfg, pool: { min: 0, max: 1 } }, decrypt));
    const t0 = Date.now();
    try {
      const v = await this.serverVersion(knex, cfg.driver);
      return { ok: true, serverVersion: v, latencyMs: Date.now() - t0 };
    } finally {
      await knex.destroy();
    }
  }

  private async serverVersion(knex: KnexType, client: string): Promise<string> {
    if (/^(pg|pgnative|cockroachdb|redshift)$/.test(client)) return (await knex.raw('select version()')).rows[0].version;
    if (/^mysql/.test(client))  return (await knex.raw('select version() as v'))[0][0].v;
    if (client === 'mssql')     return (await knex.raw('select @@version as v'))[0].v;
    if (/sqlite/.test(client))  return 'SQLite ' + (await knex.raw('select sqlite_version() as v'))[0].v;
    if (client === 'oracledb')  return (await knex.raw('select banner as v from v$version where rownum = 1'))[0].V;
    return 'desconhecida';
  }

  async onModuleDestroy() {
    await Promise.all([...this.live.values()].map(k => k.destroy()));
    this.live.clear();
  }
}
```

`OnModuleDestroy` não é enfeite: sem ele, `nest start --watch` deixa pools órfãos a cada
reload e você esgota `max_connections` do banco de desenvolvimento em meia hora.

## 4.4 Registro de conexões e cifra da senha

```ts
// src/connections/connections.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ConnectionConfig } from './connection.types';

@Injectable()
export class ConnectionsService {
  private readonly store = new Map<string, ConnectionConfig>();
  private readonly secret: Buffer;

  constructor(config: ConfigService) {
    this.secret = crypto.createHash('sha256')
      .update(config.get<string>('APP_SECRET') ?? 'troque-isto').digest();
  }

  encrypt(txt: string) {
    if (!txt) return txt;
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this.secret, iv);
    const out = Buffer.concat([c.update(txt, 'utf8'), c.final()]);
    return 'enc:' + [iv, c.getAuthTag(), out].map(b => b.toString('base64')).join('.');
  }

  decrypt = (txt: string) => {
    if (typeof txt !== 'string' || !txt.startsWith('enc:')) return txt;
    const [iv, tag, data] = txt.slice(4).split('.').map(s => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', this.secret, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  };

  list()  { return [...this.store.values()].map(c => this.mask(c)); }

  get(id: string) {
    const c = this.store.get(id);
    if (!c) throw new NotFoundException({ message: `Conexão ${id} não encontrada.`, code: 'NOT_FOUND' });
    return c;
  }

  save(cfg: Partial<ConnectionConfig>): ConnectionConfig {
    const id = cfg.id ?? 'c' + crypto.randomBytes(6).toString('hex');
    const atual = this.store.get(id);
    const senha = cfg.connection?.password;
    const final = {
      ...atual, ...cfg, id,
      createdAt: atual?.createdAt ?? new Date().toISOString(),
      connection: {
        ...atual?.connection, ...cfg.connection,
        password: senha && !senha.startsWith('enc:') ? this.encrypt(senha) : (senha ?? atual?.connection?.password),
      },
    } as ConnectionConfig;
    this.store.set(id, final);
    return this.mask(final);
  }

  remove(id: string) { this.get(id); this.store.delete(id); }

  /** Nunca devolva a senha, nem cifrada — o app não precisa dela. */
  private mask(c: ConnectionConfig): ConnectionConfig {
    const { password, ...resto } = c.connection ?? {};
    return { ...c, connection: { ...resto, ...(password ? { password: '••••••••' } : {}) } };
  }
}
```

Em memória basta para começar. Para persistir, troque o `Map` por um arquivo JSON cifrado ou
uma tabela de metadados — a interface pública do serviço não muda.

## 4.5 Estratégia por dialeto

```ts
// src/catalog/dialects/dialect.types.ts
import type { Knex } from 'knex';

export type Family = 'pg' | 'mysql' | 'sqlite' | 'mssql' | 'oracle';

export interface DialectStrategy {
  readonly family: Family;
  readonly clients: string[];                    // clientes knex atendidos
  defaultSchema(cfg: any): string;
  listSchemas(knex: Knex): Promise<string[]>;
  listDatabases(knex: Knex): Promise<string[]>;
  listTables(knex: Knex, schema: string): Promise<TableRef[]>;
  columns(knex: Knex, table: string, schema: string): Promise<ColumnMeta[]>;
  indexes(knex: Knex, table: string, schema: string): Promise<IndexMeta[]>;
  foreignKeys(knex: Knex, schema: string): Promise<ForeignKeyMeta[]>;   // todas do schema
}

export const DIALECT_STRATEGIES = Symbol('DIALECT_STRATEGIES');
```

Aqui é território de SQL nosso: nada nestas consultas vem do usuário além do nome do
schema e da tabela, que saem do catálogo e vão por binding. Boa parte do catálogo é
**tabela** (`information_schema.columns`, `pg_class`, `sys.indexes`) e sai bem pelo query
builder; o resto exige função (`unnest`, `array_agg`, `obj_description`) ou comando
(`SHOW INDEX`, `PRAGMA`), e aí `knex.raw` é a ferramenta certa. Os dois estilos convivem
nas estratégias abaixo — o critério é legibilidade, não dogma.

### PostgreSQL

```ts
// src/catalog/dialects/pg.strategy.ts
@Injectable()
export class PgStrategy implements DialectStrategy {
  readonly family = 'pg' as const;
  readonly clients = ['pg', 'pgnative', 'cockroachdb', 'redshift'];

  defaultSchema(cfg: any) { return (cfg.searchPath ?? 'public').split(',')[0].trim(); }

  listSchemas(knex: Knex) {
    return knex('information_schema.schemata')
      .pluck('schema_name')
      .whereNotIn('schema_name', ['pg_catalog', 'information_schema'])
      .whereNot('schema_name', 'like', 'pg_toast%')
      .orderBy('schema_name');
  }

  listDatabases(knex: Knex) {
    return knex('pg_database').pluck('datname').where('datistemplate', false).orderBy('datname');
  }

  /**
   * `obj_description(oid)` e `pg_total_relation_size(oid)` são funções — fora do builder.
   * O comentário está em `pg_description` (uma tabela, dá para juntar) e o tamanho sai de
   * `relpages`, que é coluna: páginas × 8 KB. É estimativa, e a contagem de linhas já era.
   */
  async listTables(knex: Knex, schema: string): Promise<TableRef[]> {
    const tipos: Record<string, TableRef['type']> = { r: 'table', p: 'table', v: 'view', m: 'matview' };
    const rows = await knex('pg_class as c')
      .join('pg_namespace as n', 'n.oid', 'c.relnamespace')
      .leftJoin('pg_description as d', function () {
        this.on('d.objoid', '=', 'c.oid').andOnVal('d.objsubid', '=', 0);
      })
      .where('n.nspname', schema)
      .whereIn('c.relkind', ['r', 'p', 'v', 'm'])
      .orderBy('c.relname')
      .select({
        name: 'c.relname', kind: 'c.relkind', comment: 'd.description',
        rows: 'c.reltuples', pages: 'c.relpages',
      });

    return rows.map(r => ({
      schema, name: r.name, type: tipos[r.kind], comment: r.comment ?? null,
      rows: Math.max(0, Math.trunc(Number(r.rows))),
      sizeBytes: Number(r.pages) * 8192,
    }));
  }

  async columns(knex: Knex, table: string, schema: string): Promise<ColumnMeta[]> {
    const rows = await knex('information_schema.columns')
      .where({ table_schema: schema, table_name: table })
      .orderBy('ordinal_position')
      .select('column_name', 'data_type', 'is_nullable', 'column_default', 'ordinal_position',
              'character_maximum_length', 'numeric_precision', 'numeric_scale');

    return rows.map(r => ({
      name: r.column_name, type: r.data_type,
      nullable: r.is_nullable === 'YES', default: r.column_default,
      position: Number(r.ordinal_position),
      maxLength: r.character_maximum_length, precision: r.numeric_precision, scale: r.numeric_scale,
      // identidade aparece no default (`nextval(...)`) — é texto, dá para inspecionar em JS
      isAutoIncrement: /^nextval\(/i.test(r.column_default ?? ''),
      isPrimary: false, isUnique: false, comment: null,   // preenchidos a partir dos índices
    }));
  }

  /**
   * `pg_index` guarda as colunas em `indkey`, um vetor que só se abre com `unnest`.
   * Sem equivalente no builder — e não faz falta: a consulta é fixa, os únicos valores
   * são o nome da tabela e do schema, ambos por binding.
   */
  async indexes(knex: Knex, table: string, schema: string): Promise<IndexMeta[]> {
    const r = await knex.raw(`
      select i.relname as name, ix.indisunique as unique, ix.indisprimary as primary,
             am.amname as method, pg_get_expr(ix.indpred, ix.indrelid) as predicate,
             array_agg(a.attname order by k.ord) as columns
        from pg_index ix
        join pg_class i on i.oid = ix.indexrelid
        join pg_class t on t.oid = ix.indrelid
        join pg_namespace n on n.oid = t.relnamespace
        join pg_am am on am.oid = i.relam
        join unnest(ix.indkey) with ordinality k(attnum, ord) on true
        join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
       where t.relname = ? and n.nspname = ?
       group by 1,2,3,4,5`, [table, schema]);
    return r.rows;
  }

  /**
   * FKs por `information_schema`, sem `pg_constraint` nem `array_agg`: a consulta traz
   * uma linha por coluna e o agrupamento acontece em JavaScript. Fica mais legível e
   * roda igual em MySQL e SQL Server, que expõem as mesmas views.
   */
  async foreignKeys(knex: Knex, schema: string): Promise<ForeignKeyMeta[]> {
    const rows = await knex('information_schema.referential_constraints as rc')
      .join('information_schema.key_column_usage as kcu', function () {
        this.on('kcu.constraint_name', '=', 'rc.constraint_name')
            .andOn('kcu.constraint_schema', '=', 'rc.constraint_schema');
      })
      .join('information_schema.constraint_column_usage as ccu', function () {
        this.on('ccu.constraint_name', '=', 'rc.unique_constraint_name')
            .andOn('ccu.constraint_schema', '=', 'rc.unique_constraint_schema');
      })
      .where('rc.constraint_schema', schema)
      .orderBy(['kcu.constraint_name', 'kcu.ordinal_position'])
      .select({
        name: 'rc.constraint_name', table: 'kcu.table_name', column: 'kcu.column_name',
        refTable: 'ccu.table_name', refColumn: 'ccu.column_name',
        onDelete: 'rc.delete_rule', onUpdate: 'rc.update_rule',
        posicao: 'kcu.ordinal_position',
      });

    const por = new Map<string, ForeignKeyMeta>();
    for (const r of rows) {
      if (!por.has(r.name))
        por.set(r.name, {
          name: r.name, table: r.table, schema, columns: [],
          refTable: r.refTable, refSchema: schema, refColumns: [],
          onDelete: r.onDelete, onUpdate: r.onUpdate,
        });
      const fk = por.get(r.name)!;
      fk.columns.push(r.column);
      fk.refColumns.push(r.refColumn);
    }
    return [...por.values()];
  }
}
```

### MySQL

Aqui o builder ganha de lavada: `information_schema.statistics` traz índice, coluna,
posição e unicidade em colunas comuns — nada do parsing que o `SHOW INDEX` exigiria.

```ts
async indexes(knex: Knex, table: string, schema: string): Promise<IndexMeta[]> {
  const rows = await knex('information_schema.statistics')
    .where({ table_schema: schema, table_name: table })
    .orderBy(['index_name', 'seq_in_index'])
    .select('index_name', 'column_name', 'non_unique', 'index_type', 'seq_in_index');

  const por = new Map<string, IndexMeta>();
  for (const r of rows) {
    if (!por.has(r.index_name))
      por.set(r.index_name, {
        name: r.index_name, columns: [],
        unique: Number(r.non_unique) === 0, primary: r.index_name === 'PRIMARY',
        method: r.index_type,
      });
    por.get(r.index_name)!.columns.push(r.column_name);
  }
  return [...por.values()];
}

listDatabases(knex: Knex) {                      // no lugar de SHOW DATABASES
  return knex('information_schema.schemata').pluck('schema_name').orderBy('schema_name');
}
```

O auto-increment do MySQL está em `information_schema.columns.extra`, e as FKs saem das
mesmas views do PostgreSQL — com a diferença de que o MySQL põe a tabela referenciada
direto em `key_column_usage.referenced_table_name`, dispensando o join com
`constraint_column_usage`.

### SQL Server

`sys.tables`, `sys.indexes`, `sys.index_columns`, `sys.columns` e `sys.foreign_keys` são
views de catálogo — todas consultáveis pelo builder, com `join` normal. `is_identity` em
`sys.columns` dá o auto-increment sem inspecionar texto de default.

### DDL sem `SHOW CREATE TABLE`

Com o comando fora, o DDL é remontado a partir do catálogo — o mesmo caminho para todos os
dialetos, o que de quebra deixa a saída consistente em vez de cada banco formatando do seu
jeito:

```ts
// src/catalog/ddl.service.ts
async generate(id: string, tabela: string, schema: string) {
  const { colunas, indices, fks } = await this.introspect.tableDetail(id, tabela, schema);
  const q = (x: string) => `"${x}"`;

  const linhas = colunas.map(c => {
    let tipo = c.type;
    if (c.maxLength && /char/i.test(c.type)) tipo += `(${c.maxLength})`;
    else if (c.precision && /numeric|decimal/i.test(c.type))
      tipo += `(${c.precision}${c.scale != null ? ',' + c.scale : ''})`;
    return `  ${q(c.name)} ${tipo}${c.nullable ? '' : ' NOT NULL'}${c.default ? ` DEFAULT ${c.default}` : ''}`;
  });

  const pk = indices.find(i => i.primary);
  if (pk) linhas.push(`  CONSTRAINT ${q(pk.name)} PRIMARY KEY (${pk.columns.map(q).join(', ')})`);
  fks.forEach(f => linhas.push(
    `  CONSTRAINT ${q(f.name)} FOREIGN KEY (${f.columns.map(q).join(', ')}) ` +
    `REFERENCES ${q(f.refSchema)}.${q(f.refTable)} (${f.refColumns.map(q).join(', ')})` +
    `${f.onUpdate ? ` ON UPDATE ${f.onUpdate}` : ''}${f.onDelete ? ` ON DELETE ${f.onDelete}` : ''}`));

  const idx = indices.filter(i => !i.primary).map(i =>
    `CREATE ${i.unique ? 'UNIQUE ' : ''}INDEX ${q(i.name)} ON ${q(schema)}.${q(tabela)} ` +
    `(${i.columns.map(q).join(', ')})${i.predicate ? ` WHERE ${i.predicate}` : ''};`);

  return [`CREATE TABLE ${q(schema)}.${q(tabela)} (`, linhas.join(',\n'), ');', '', ...idx].join('\n').trim();
}
```

Repare que este DDL é **texto para exibição**, não algo que o sistema executa. Montar string
de SQL para mostrar na tela é diferente de montar string de SQL para mandar ao banco — a
regra vale para o segundo caso.

### SQLite

`sqlite_master` é tabela comum e sai pelo builder; colunas, índices e FKs só existem via
`PRAGMA`, que é comando. Como é SQL nosso e o identificador vem do catálogo, `knex.raw` com
`knex.ref()` resolve:

```ts
listTables(knex: Knex) {
  return knex('sqlite_master')
    .whereIn('type', ['table', 'view'])
    .whereNot('name', 'like', 'sqlite_%')
    .orderBy('name')
    .select('name', 'type');
}

originalDdl(knex: Knex, table: string) {
  return knex('sqlite_master').where('name', table).first('sql').then(r => r?.sql ?? null);
}

async columns(knex: Knex, table: string) {
  // knex.ref() garante o quoting do identificador; o nome veio do catálogo, não do cliente
  const info = await knex.raw(`PRAGMA table_info(${knex.ref(table)})`);
  return info.map((c: any, i: number) => ({
    name: c.name, type: c.type || 'blob', nullable: !c.notnull, default: c.dflt_value,
    isPrimary: !!c.pk, isUnique: !!c.pk, position: i + 1,
  }));
}
```

## 4.6 Introspecção: o detalhe que faz o ERD sair certo

```ts
// src/catalog/introspect.service.ts
@Injectable()
export class IntrospectService {
  constructor(
    private readonly conns: ConnectionsService,
    private readonly pool: KnexPoolService,
    private readonly registry: DialectRegistry,
  ) {}

  private ctx(id: string, schemaQuery?: string) {
    const cfg = this.conns.get(id);
    const knex = this.pool.require(id);
    const dialeto = this.registry.for(cfg.driver);
    return { cfg, knex, dialeto, schema: schemaQuery ?? dialeto.defaultSchema(cfg) };
  }

  /**
   * information_schema.columns NÃO diz o que é PK nem o que é UNIQUE.
   * Isso vem dos índices — e é exatamente essa informação que decide a
   * cardinalidade no diagrama. Por isso as duas leituras andam juntas.
   */
  async tableDetail(id: string, table: string, schemaQuery?: string) {
    const { knex, dialeto, schema } = this.ctx(id, schemaQuery);
    const [colunas, indices, fks, tabelas] = await Promise.all([
      dialeto.columns(knex, table, schema),
      dialeto.indexes(knex, table, schema),
      dialeto.foreignKeys(knex, schema),
      dialeto.listTables(knex, schema),
    ]);

    const pk = new Set(indices.filter(i => i.primary).flatMap(i => i.columns));
    const uk = new Set(indices.filter(i => i.unique && i.columns.length === 1).flatMap(i => i.columns));
    colunas.forEach(c => { c.isPrimary = pk.has(c.name); c.isUnique = c.isPrimary || uk.has(c.name); });

    const info = tabelas.find(t => t.name === table);
    if (!info) throw new NotFoundException({ message: `Tabela ${table} não encontrada.`, code: 'NOT_FOUND' });

    return {
      table: info,
      columns: colunas,
      indexes: indices,
      foreignKeys: fks.filter(f => f.table === table),
      referencedBy: fks.filter(f => f.refTable === table),
      checks: [],
    };
  }
}
```

## 4.7 Controllers

```ts
// src/catalog/catalog.controller.ts
@Controller('connections/:id')
export class CatalogController {
  constructor(
    private readonly introspect: IntrospectService,
    private readonly ddl: DdlService,
  ) {}

  @Get('schemas')
  schemas(@Param('id') id: string) { return this.introspect.schemas(id); }

  @Get('tables')
  tables(@Param('id') id: string, @Query() q: ListTablesDto) {
    return this.introspect.tables(id, q.schema, q.search);
  }

  @Get('tables/:table')
  table(@Param('id') id: string, @Param('table') table: string, @Query('schema') schema?: string) {
    return this.introspect.tableDetail(id, table, schema);
  }

  @Get('tables/:table/ddl')
  ddlDaTabela(@Param('id') id: string, @Param('table') table: string, @Query('schema') schema?: string) {
    return this.ddl.generate(id, table, schema);
  }

  @Get('tables/:table/rows')
  rows(@Param('id') id: string, @Param('table') table: string, @Query() q: RowsQueryDto) {
    return this.introspect.rows(id, table, q);
  }
}
```

```ts
// src/common/dto/rows-query.dto.ts
export class RowsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit = 50;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset = 0;

  @IsOptional() @IsString() @Matches(/^[A-Za-z_][\w$]*$/)   // barra injeção já no DTO
  orderBy?: string;

  @IsOptional() @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

  @IsOptional() @IsString()
  schema?: string;
}
```

O `orderBy` ainda é validado uma segunda vez contra as colunas reais dentro do serviço.
Nome de coluna nunca entra em query por interpolação:

```ts
let q = knex(table).select('*').limit(dto.limit).offset(dto.offset);
if (dto.orderBy && colunas.some(c => c.name === dto.orderBy))
  q = q.orderBy(dto.orderBy, dto.dir ?? 'asc');
```

### Busca rápida (uma caixa, todas as colunas)

```ts
// src/common/dto/rows-query.dto.ts (acréscimo)
@IsOptional() @IsString() @MaxLength(200)
q?: string;

@IsOptional() @IsIn(['tudo', 'texto'])
qMode: 'tudo' | 'texto' = 'tudo';
```

```ts
// src/catalog/filters.service.ts (acréscimo)
private static readonly TEMPLATE: Record<Family, string> = {
  pg:     'cast(?? as text) ilike ?',
  mysql:  'cast(?? as char) like ?',            // collation padrão já é insensível
  sqlite: 'cast(?? as text) like ?',            // insensível só para ASCII
  mssql:  'upper(cast(?? as nvarchar(max))) like upper(?)',
  oracle: 'upper(cast(?? as varchar2(4000))) like upper(?)',
};
private static readonly EH_TEXTO = /char|text|uuid|json|enum|clob/i;

search(q: Knex.QueryBuilder, termo: string | undefined, modo: 'tudo' | 'texto',
       colunas: ColumnMeta[], family: Family) {
  if (!termo?.trim()) return { q, colunasBuscadas: 0 };

  const alvo = modo === 'texto'
    ? colunas.filter(c => FiltersService.EH_TEXTO.test(c.type))
    : colunas;
  if (!alvo.length)
    throw new BadRequestException({
      message: 'Nenhuma coluna de texto nesta tabela. Use a busca em todas as colunas.',
      code: 'NO_TEXT_COLUMN',
    });

  const tpl = FiltersService.TEMPLATE[family];
  const padrao = `%${termo.trim()}%`;

  return {
    colunasBuscadas: alvo.length,
    // fragmento fixo nosso; `??` é o identificador do catálogo e `?` é o termo do usuário.
    // o OR PRECISA ficar agrupado — ver a nota logo abaixo
    q: q.where(b => { alvo.forEach(c => b.orWhereRaw(tpl, [c.name, padrao])); }),
  };
}
```

SQL gerado no PostgreSQL, com filtro e busca juntos:

```sql
select * from "pedidos"
 where "status" = ?
   and (cast("id" as text) ilike ? or cast("numero" as text) ilike ?
     or cast("status" as text) ilike ? or cast("total" as text) ilike ?
     or cast("criado_em" as text) ilike ?)
 limit ?
-- bindings: ["ABERTO","%PED1%","%PED1%","%PED1%","%PED1%","%PED1%",50]
```

Quatro coisas para não errar:

1. **Agrupe o OR.** Sem o `where(b => …)` sai
   `status = 'ABERTO' and a ilike '%x%' or b ilike '%x%'` — o `or` anula o filtro e a tela
   passa a mostrar linhas que não deveriam estar ali. É o bug mais comum desta funcionalidade.
2. **`??` é binding de identificador.** O nome da coluna vai por binding, nunca concatenado,
   mesmo vindo do catálogo — e o termo do usuário vai por `?`, como qualquer valor.
3. **`tudo` é varredura.** `cast` em toda coluna descarta qualquer índice. Em tabela grande,
   o modo `texto` com índice trigram (`create index … using gin (col gin_trgm_ops)`) é o
   caminho; o app avisa isso na tela quando a tabela passa de 100 mil linhas.
4. **Debounce no cliente.** 350 ms de silêncio antes de disparar. Sem isso, digitar "FATURADO"
   são oito varreduras na tabela.

### Filtros da grade (o painel de filtro do DBeaver)

O app manda `filters` como JSON e, opcionalmente, `where` cru. O DTO valida a forma; o
serviço valida os nomes contra o catálogo e traduz cada item em cláusula do knex.

```ts
// src/common/dto/filter.dto.ts
export enum FilterOp {
  eq='eq', neq='neq', gt='gt', gte='gte', lt='lt', lte='lte',
  contains='contains', startsWith='startsWith', endsWith='endsWith',
  in='in', between='between', isNull='isNull', notNull='notNull',
}

export class FilterDto {
  @IsString() @Matches(/^[A-Za-z_][\w$]*$/)   // a forma; a existência é checada no serviço
  column!: string;

  @IsEnum(FilterOp)
  op!: FilterOp;

  @IsOptional() @IsString() value?: string;
  @IsOptional() @IsString() value2?: string;   // só para `between`
}

// src/common/dto/rows-query.dto.ts (acréscimo)
export class RowsQueryDto {
  // … limit, offset, orderBy, dir, schema

  /** Chega como string na query string; vira lista validada aqui. */
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    try { return plainToInstance(FilterDto, JSON.parse(value)); }
    catch { throw new BadRequestException({ message: 'Parâmetro `filters` não é um JSON válido.', code: 'BAD_FILTER' }); }
  })
  @IsArray() @ValidateNested({ each: true }) @Type(() => FilterDto)
  filters?: FilterDto[];

}
```

```ts
// src/catalog/filters.service.ts
@Injectable()
export class FiltersService {
  /** Traduz filtros em cláusulas. Coluna conferida contra o catálogo, valor sempre binding. */
  apply(q: Knex.QueryBuilder, filtros: FilterDto[], colunas: ColumnMeta[], family: Family) {
    const like = family === 'pg' ? 'whereILike' : 'whereLike';   // ILIKE só existe no pg

    for (const f of filtros) {
      if (!colunas.some(c => c.name === f.column))
        throw new BadRequestException({ message: `Coluna "${f.column}" não existe nesta tabela.`, code: '42703' });

      const col = f.column, v = f.value;
      switch (f.op) {
        case FilterOp.eq:         q = q.where(col, '=', v); break;
        case FilterOp.neq:        q = q.whereNot(col, v); break;
        case FilterOp.gt:         q = q.where(col, '>', v); break;
        case FilterOp.gte:        q = q.where(col, '>=', v); break;
        case FilterOp.lt:         q = q.where(col, '<', v); break;
        case FilterOp.lte:        q = q.where(col, '<=', v); break;
        case FilterOp.contains:   q = (q as any)[like](col, `%${v}%`); break;
        case FilterOp.startsWith: q = (q as any)[like](col, `${v}%`); break;
        case FilterOp.endsWith:   q = (q as any)[like](col, `%${v}`); break;
        case FilterOp.in:         q = q.whereIn(col, String(v).split(',').map(s => s.trim())); break;
        case FilterOp.between:    q = q.whereBetween(col, [v, f.value2]); break;
        case FilterOp.isNull:     q = q.whereNull(col); break;
        case FilterOp.notNull:    q = q.whereNotNull(col); break;
      }
    }
    return q;
  }

}
```

```ts
// uso no IntrospectService.rows()
const comFiltro = (base: Knex.QueryBuilder) => {
  const q = this.filters.apply(base, dto.filters ?? [], colunas, family);
  return this.filters.search(q, dto.q, dto.qMode, colunas, family).q;
};

let q = comFiltro(knex(table).select('*')).limit(dto.limit).offset(dto.offset);
if (dto.orderBy) {
  if (!colunas.some(c => c.name === dto.orderBy))
    throw new BadRequestException({ message: `Não dá para ordenar por "${dto.orderBy}".`, code: '42703' });
  q = q.orderBy(dto.orderBy, dto.dir ?? 'asc');
}

const temFiltro = (dto.filters?.length ?? 0) > 0 || !!dto.q?.trim();
const [rows, comFiltroCount, totalBruto] = await Promise.all([
  q,
  temFiltro ? comFiltro(knex(table)).count({ c: '*' }) : null,   // exato: o WHERE costuma usar índice
  knex(table).count({ c: '*' }),
]);
```

O SQL que sai disso, conferido com `toSQL().toNative()` no PostgreSQL:

```sql
select * from "pedidos"
 where "status" = $1 and "total" between $2 and $3 and "numero" ilike $4
   and "faturado_em" is null and "id" in ($5, $6, $7)
 order by "total" desc limit $8
-- bindings: ["ABERTO","100","200","%PED10%","1","2","3",50]
```

Três coisas para não errar aqui:

1. **O mesmo WHERE precisa ir na contagem.** Se `count(*)` esquecer o filtro, a paginação
   mostra "1–50 de 5.210" enquanto só existem 394 linhas, e o botão Próxima leva a páginas
   vazias. Por isso os dois builders saem da mesma função `comFiltro`.
2. **`ILIKE` não existe fora do PostgreSQL.** No MySQL o `LIKE` já é insensível por causa
   do collation; no SQL Server depende do collation da coluna. É por isso que o método
   escolhe entre `whereILike` e `whereLike` pela família.
3. **Filtrar depois de paginar é errado.** `WHERE → ORDER BY → LIMIT/OFFSET` é a ordem do
   banco; o mock do app segue a mesma ordem justamente para não ensinar o comportamento
   errado enquanto o backend não existe.

**Atenção com o `ValidationPipe` global.** O bloco `connection` é livre por natureza — cada
dialeto tem chaves diferentes. Se você ligar `whitelist: true` sem cuidado, o Nest apaga
silenciosamente `options.instanceName`, `flags`, `stmtCacheSize` e você passa a tarde
procurando por que o SQL Server ignora a instância nomeada. Use:

```ts
// main.ts
app.useGlobalPipes(new ValidationPipe({
  transform: true,
  whitelist: false,               // o objeto `connection` é aberto de propósito
  forbidNonWhitelisted: false,
}));
```

E valide o `connection` como `@IsObject()` em vez de tentar tipar todas as chaves.

## 4.8 Somente leitura e cancelamento

Sem SQL livre, o guard de somente leitura fica bem mais simples: não há statement para
inspecionar. Escrita só acontece por uma porta — a rota de mutações — e é lá que ele age.

```ts
// src/common/guards/read-only.guard.ts
@Injectable()
export class ReadOnlyGuard implements CanActivate {
  constructor(private readonly conns: ConnectionsService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (this.conns.get(req.params.id).readOnly)
      throw new ForbiddenException({
        message: 'Conexão marcada como somente leitura. Nada foi enviado ao banco.',
        code: 'READ_ONLY',
      });
    return true;
  }
}
```

Aplicado só onde grava:

```ts
@Controller('connections/:id/tables/:table/mutations')
@UseGuards(ReadOnlyGuard)
export class MutationsController { /* … */ }
```

Repare no ganho estrutural: enquanto existia console de SQL, este guard precisava testar o
statement com uma expressão regular (`/^\s*(select|with|explain|show)\b/`) para adivinhar se
ele escrevia — e `WITH ... UPDATE` passava. Sem statement digitado, a garantia deixa de ser
heurística: as rotas de leitura só sabem construir `SELECT`.

### Cancelar uma consulta longa

Uma consulta do construtor pode demorar em tabela grande. Cancelar sem
`pg_cancel_backend` nem `KILL QUERY`:

```ts
// src/catalog/introspect.service.ts (recorte)
private readonly pids = new Map<string, number>();   // id da conexão -> pid da sessão no banco

async rows(id: string, tabela: string, dto: RowsQueryDto) {
  const knex = this.pool.require(id);
  // conexão dedicada: é o que permite cancelar depois
  const conn = await knex.client.acquireConnection();
  try {
    // consulta fixa nossa, para saber quem cancelar depois
    const { rows } = await knex.client.query(conn, { sql: 'select pg_backend_pid() as pid' });
    this.pids.set(id, rows[0].pid);
    // timeout por statement, também SQL nosso
    await knex.client.query(conn, { sql: `set local statement_timeout = ${Number(dto.timeout ?? 30000)}` });
    return await this.montaConsulta(knex, conn, tabela, dto);
  } finally {
    this.pids.delete(id);
    knex.client.releaseConnection(conn);
  }
}

/**
 * `pg_cancel_backend` aborta a consulta e mantém a conexão viva — melhor que derrubar o
 * socket. É SQL nosso, com o pid por binding.
 */
async cancel(id: string) {
  const cfg  = this.conns.get(id);
  const knex = this.pool.require(id);
  const pid  = this.pids.get(id);
  if (!pid) return { ok: true };
  const fam = this.registry.for(cfg.driver).family;
  if (fam === 'pg')    await knex.raw('select pg_cancel_backend(?)', [pid]);
  if (fam === 'mysql') await knex.raw('kill query ?', [pid]);
  return { ok: true };
}
```

Alternativa a `set local`: `connection.statement_timeout` no PostgreSQL e
`connection.options.requestTimeout` no SQL Server, ambos no formulário de conexão (2.8) —
valem para a conexão inteira em vez de por consulta.

## 4.9 Edição da grade: uma transação por chamada

O app acumula alterações num buffer e manda tudo junto. Dois endpoints: `preview` (mostra o
SQL, não executa) e `mutations` (aplica em transação).

```ts
// src/mutations/dto/mutation.dto.ts
export enum ChangeKind { insert = 'insert', update = 'update', delete = 'delete' }

export class ChangeDto {
  @IsEnum(ChangeKind) kind!: ChangeKind;
  @IsOptional() @IsObject() key?: Record<string, any>;     // update/delete: PK
  @IsOptional() @IsObject() set?: Record<string, any>;     // update
  @IsOptional() @IsObject() was?: Record<string, any>;     // valores originais
  @IsOptional() @IsObject() values?: Record<string, any>;  // insert
}

export class MutationsDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ChangeDto)
  changes!: ChangeDto[];

  @IsOptional() @IsBoolean() optimistic = true;
}
```

```ts
// src/mutations/mutations.service.ts
@Injectable()
export class MutationsService {
  constructor(
    private readonly conns: ConnectionsService,
    private readonly pool: KnexPoolService,
    private readonly introspect: IntrospectService,
  ) {}

  /**
   * A trava vale para UPDATE, comparando só as colunas que estão sendo alteradas.
   * Para DELETE a identificação é a PK e ponto: comparar a linha inteira parece
   * mais seguro, mas numeric e timestamptz voltam formatados de outro jeito e o
   * resultado é conflito falso em linha que ninguém tocou. A checagem de
   * "afetou exatamente 1" já cobre o caso de a linha ter sumido.
   */
  private builder(trx: Knex, tabela: string, c: ChangeDto, otimista: boolean) {
    if (c.kind === ChangeKind.insert) return trx(tabela).insert(c.values!);

    let q = trx(tabela).where(c.key!);
    if (otimista && c.kind === ChangeKind.update) {
      for (const col of Object.keys(c.set ?? {})) {
        if (col in (c.key ?? {})) continue;              // não repetir a PK no WHERE
        const v = c.was?.[col];
        q = v === null || v === undefined ? q.whereNull(col) : q.where(col, v);
      }
    }
    return c.kind === ChangeKind.delete ? q.del() : q.update(c.set!);
  }

  async apply(id: string, tabela: string, dto: MutationsDto, schema?: string) {
    const cfg = this.conns.get(id);
    if (cfg.readOnly)
      throw new ForbiddenException({ message: 'Conexão marcada como somente leitura. Nada foi enviado ao banco.', code: 'READ_ONLY' });

    const knex = this.pool.require(id);
    const colunas = await this.introspect.columns(id, tabela, schema);
    this.valida(dto.changes, colunas, tabela);

    const pk = colunas.filter(c => c.isPrimary).map(c => c.name);
    const fam = this.registry.for(cfg.driver).family;
    const t0 = Date.now();

    const results = await knex.transaction(async trx => {
      const out: any[] = [];
      for (const [i, c] of dto.changes.entries()) {
        let q = this.builder(trx, tabela, c, dto.optimistic);
        if (c.kind === ChangeKind.insert && pk.length && (fam === 'pg' || fam === 'mssql'))
          q = q.returning(pk);

        const r = await q;
        const afetadas = c.kind === ChangeKind.insert
          ? 1
          : (typeof r === 'number' ? r : Array.isArray(r) ? r.length : Number(r ?? 0));

        // a checagem que transforma "sobrescreveu sem avisar" em erro visível
        if (c.kind !== ChangeKind.insert && afetadas !== 1)
          throw new ConflictException({
            message: afetadas === 0
              ? 'A linha foi alterada ou removida por outra pessoa desde que você a carregou. Nada foi gravado.'
              : `A operação atingiria ${afetadas} linhas, e deveria atingir exatamente 1. Nada foi gravado.`,
            code: 'CONFLICT', index: i, affected: afetadas,
          });

        out.push({ kind: c.kind, affected: afetadas, ...(Array.isArray(r) && r.length ? { returned: r[0] } : {}) });
      }
      return out;      // sair sem erro = COMMIT; qualquer throw = ROLLBACK
    });

    return { ok: true, applied: results.length, results, durationMs: Date.now() - t0 };
  }

  /** Sem PK não há como apontar a linha sem ambiguidade — logo, não se edita. */
  private valida(changes: ChangeDto[], colunas: ColumnMeta[], tabela: string) {
    const nomes = colunas.map(c => c.name);
    const pk = colunas.filter(c => c.isPrimary).map(c => c.name);
    const auto = colunas.filter(c => c.isAutoIncrement).map(c => c.name);

    for (const c of changes) {
      if (c.kind !== ChangeKind.insert && !pk.length)
        throw new BadRequestException({
          message: `A tabela ${tabela} não tem chave primária. Sem ela não dá para identificar a linha com segurança.`,
          code: 'NO_PK',
        });
      for (const col of [...Object.keys(c.set ?? {}), ...Object.keys(c.values ?? {}), ...Object.keys(c.key ?? {})])
        if (!nomes.includes(col))
          throw new BadRequestException({ message: `Coluna "${col}" não existe em ${tabela}.`, code: '42703' });

      if (c.kind === ChangeKind.insert) {
        const faltando = pk.filter(x => !auto.includes(x) && (c.values?.[x] == null || c.values?.[x] === ''));
        if (faltando.length)
          throw new BadRequestException({ message: `Preencha a chave primária: ${faltando.join(', ')}.`, code: 'NULL_PK' });
      }
    }
  }
}
```

```ts
// src/mutations/mutations.controller.ts
@Controller('connections/:id/tables/:table/mutations')
export class MutationsController {
  constructor(private readonly service: MutationsService) {}

  @Post('preview')
  preview(@Param('id') id, @Param('table') t, @Body() dto: MutationsDto, @Query('schema') schema?: string) {
    return this.service.preview(id, t, dto, schema);
  }

  @Post()
  apply(@Param('id') id, @Param('table') t, @Body() dto: MutationsDto, @Query('schema') schema?: string) {
    return this.service.apply(id, t, dto, schema);
  }
}
```

O `preview` usa o mesmo builder com `.toString()`, que interpola os bindings — serve para
**mostrar**. A execução usa bindings de verdade. São dois caminhos de propósito: o que se lê
na tela é legível, o que vai ao banco é parametrizado.

SQL gerado, conferido no PostgreSQL:

```sql
-- update com trava otimista
update "pedidos" set "status" = $1, "total" = $2 where "id" = $3 and "status" = $4 and "total" = $5
-- update com valor original NULL
update "pedidos" set "faturado_em" = $1 where "id" = $2 and "faturado_em" is null
-- delete: só a PK
delete from "pedidos" where "id" = $1
-- pk composta
update "estoque" set "saldo" = $1 where "produto_id" = $2 and "endereco_id" = $3 and "lote" = $4 and "saldo" = $5
```

Cinco coisas para não errar:

1. **Sem PK, sem edição.** A rota `rows` já devolve `primaryKey`, `autoIncrement`, `editavel`
   e `motivoBloqueio`; a tela decide com isso antes de oferecer o menu. Views e conexões
   somente leitura caem no mesmo bloqueio.
2. **`afetadas !== 1` derruba a transação.** É essa linha que separa "avisou" de
   "sobrescreveu calado". Sem ela a trava otimista não serve para nada.
3. **`whereNull`, não `where(col, null)`.** `= null` nunca é verdadeiro em SQL; a comparação
   com original nulo tem que virar `is null`.
4. **A ordem `insert → update → delete`** evita colidir com chave única que só é liberada
   depois do delete.
5. **`returning` só existe em pg e mssql.** No MySQL e no SQLite o insert devolve o id
   gerado, com formato diferente — trate por família em vez de assumir array.

### Quando o resultado do construtor é editável

Sem SQL livre, a pergunta que antes exigia analisar texto vira uma checagem de conjunto: o
construtor já sabe de qual tabela veio o resultado, então basta a projeção conter a chave
primária.

```ts
// dentro do IntrospectService.rows()
const pk = colunas.filter(c => c.isPrimary).map(c => c.name);
const projetadas = dto.columns?.length ? dto.columns : colunas.map(c => c.name);
const pkNaProjecao = pk.length > 0 && pk.every(c => projetadas.includes(c));

const edicao = {
  primaryKey: pk,
  autoIncrement: colunas.filter(c => c.isAutoIncrement).map(c => c.name),
  editavel: info.type === 'table' && pkNaProjecao && !cfg.readOnly,
  motivoBloqueio:
    info.type !== 'table' ? 'Views não são editáveis.'
    : !pk.length          ? 'Tabela sem chave primária: não dá para identificar a linha com segurança.'
    : !pkNaProjecao       ? `Inclua a chave primária (${pk.join(', ')}) nas colunas para poder editar.`
    : cfg.readOnly        ? 'Conexão marcada como somente leitura.' : undefined,
};
```

Compare com o que existia quando havia SQL livre: uma bateria de expressões regulares para
detectar `JOIN`, vírgula no `FROM`, `GROUP BY`, `DISTINCT`, `UNION`, CTE e subconsulta, mais
a conferência de nomes repetidos — tudo heurística, tudo com risco de falso positivo gravando
no lugar errado. Proibir o SQL cru apagou essa classe inteira de problema.

## 4.10 Erro no formato que o app entende

O app espera sempre `{ message, code?, position?, hint? }`. Um filtro global garante isso,
inclusive para erros crus de driver:

```ts
// src/common/filters/database-exception.filter.ts
@Catch()
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('DB');

  catch(exception: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();

    if (exception instanceof HttpException) {
      const corpo = exception.getResponse();
      return res.status(exception.getStatus())
        .json(typeof corpo === 'string' ? { message: corpo } : corpo);
    }

    // erro vindo do driver
    const pg     = exception?.position || exception?.hint || exception?.detail;
    const mysql  = exception?.sqlMessage;
    const status = pg || mysql || exception?.code ? 400 : 500;

    this.logger.error(exception?.message, exception?.stack);

    res.status(status).json({
      message: mysql ?? exception?.message ?? 'Erro interno',
      code: exception?.code ?? exception?.errno,
      position: exception?.position ? Number(exception.position) : undefined,
      hint: exception?.hint ?? exception?.detail,
    });
  }
}
```

`position` e `hint` são o que fazem o banner de erro do app apontar onde o SQL quebrou.
Jogar isso fora e devolver "Internal server error" custa caro no celular, onde reler a query
é difícil.

```ts
// src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: true });                       // o app é um cliente externo
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
  app.useGlobalFilters(new DatabaseExceptionFilter());
  app.enableShutdownHooks();                              // dispara OnModuleDestroy e fecha os pools
  await app.listen(process.env.PORT ?? 3333, '0.0.0.0');  // 0.0.0.0, senão o celular não alcança
}
bootstrap();
```

Duas linhas que costumam faltar e custam uma tarde: `'0.0.0.0'` no `listen`
(sem isso só `localhost` responde) e `enableShutdownHooks()` (sem isso os pools não fecham).

## 4.11 Rota por rota: quem responde e o que faz

| Rota | Controller · método | O que faz com knex |
|---|---|---|
| `GET /drivers` | Connections · `drivers` | `require.resolve` de cada driver; diz o que está instalado |
| `GET /connections` | Connections · `list` | Lê o registro; mascara a senha |
| `POST /connections` | Connections · `create` | Cifra a senha e guarda. Não abre pool |
| `GET /connections/:id` | Connections · `one` | Lê uma conexão |
| `PATCH /connections/:id` | Connections · `update` | Atualiza; se `connection` mudou, `pool.close(id)` |
| `DELETE /connections/:id` | Connections · `remove` | `knex.destroy()` e remove do registro |
| `POST /connections/test` | Connections · `test` | `KnexPoolService.probe`: pool de 1, query de versão, destrói |
| `POST /connections/:id/connect` | Connections · `connect` | `Knex(config)` + ping no catálogo pelo builder; guarda no `Map` |
| `POST /connections/:id/disconnect` | Connections · `disconnect` | `knex.destroy()` |
| `GET /connections/:id/status` | Connections · `status` | `knex.client.pool.numUsed()` / `numFree()` |
| `GET .../databases` | Catalog · `databases` | pg: `pg_database` · mysql: `information_schema.schemata` · mssql: `sys.databases` — todas tabelas, lidas pelo builder |
| `GET .../schemas` | Catalog · `schemas` | pg: `pg_namespace` · mysql: `information_schema.schemata` · mssql: `sys.schemas` · oracle: `all_users` |
| `GET .../tables` | Catalog · `tables` | Tabelas e views com comentário, `reltuples` e `pg_total_relation_size` (estimativa é de propósito) |
| `GET .../tables/:t` | Catalog · `table` | Colunas + índices + FKs do schema; deriva PK/UNIQUE dos índices; separa `foreignKeys` de `referencedBy` |
| `GET .../tables/:t/ddl` | Catalog · `ddl` | remontado do catálogo em todos os dialetos; no SQLite o original também está em `sqlite_master` |
| `GET .../tables/:t/rows` | Catalog · `rows` | `knex(t).select('*')` + busca (`q`) como OR agrupado + filtros em `where/whereNot/whereIn/whereBetween/whereNull/whereILike`, `orderBy` conferido no catálogo; contagem com o mesmo recorte; resposta em matriz |
| `GET .../tables/:t/count` | Catalog · `count` | `knex(t).count('*')` exato, sob demanda |
| `GET .../erd` | Erd · `schema` | Lê tabelas + FKs, monta `erDiagram` |
| `GET .../tables/:t/erd` | Erd · `table` | BFS nas duas direções (`?depth=1..3`) e o mesmo gerador |
| `POST .../tables/:t/mutations/preview` | Mutations · `preview` | Mesmo builder com `.toString()`: mostra o SQL sem executar |
| `POST .../tables/:t/mutations` | Mutations · `apply` | `knex.transaction`: insert/update/delete com trava otimista; qualquer operação que não afete exatamente 1 linha derruba tudo (409) |
| `POST .../rows/cancel` | Catalog · `cancel` | pg: `pg_cancel_backend(pid)` · mysql: `KILL QUERY` |

## 4.12 Cardinalidade do ERD (o serviço de Mermaid)

A regra está na seção 3.4; aqui é só onde ela mora no NestJS.

```ts
// src/erd/mermaid.service.ts (regra central)
const cols     = fk.columns.map(c => tabela.columns.find(x => x.name === c)).filter(Boolean);
const opcional = cols.some(c => c.nullable);
const umPraUm  = cols.length > 0 && cols.every(c => c.isUnique || c.isPrimary);
const lado     = umPraUm ? (opcional ? 'o|' : '||') : (opcional ? 'o{' : '|{');
linhas.push(`  ${seguro(fk.refTable)} ||--${lado} ${seguro(tabela.name)} : "${fk.columns.join(', ')}"`);
```

Os cuidados que evitam diagrama quebrado — nome saneado, tipo sem parênteses, relação
com pai fora do recorte omitida, rótulo com a coluna da FK — estão detalhados na seção 3.4.

---

# PARTE 5 — Segurança

- Senhas cifradas em repouso com AES-256-GCM (`APP_SECRET`) e nunca devolvidas em claro
  pelo `GET /connections`.
- `orderBy` e nomes de tabela em `rows` são validados contra a lista real de colunas;
  identificadores passam por `knex.ref()`, valores por bindings.
- SQL livre é livre por definição — a proteção é a flag **somente leitura** por conexão,
  aplicada no servidor, não no app.
- O backend fica na sua rede. Se for expor, ponha autenticação na frente
  (o app já manda tudo por `http`, é só adicionar um interceptor de token em `http.ts`).
- Log: `debug: true` no knex derruba SQL no console do servidor — útil em dev, desligado
  em produção.

---

---

# PARTE 6 — Ordem de construção

O caminho que evita retrabalho: o app inteiro primeiro, com mock; o backend depois, um
módulo por vez, sempre comparando com o mock.

## Fase 1 — o app sozinho (nenhum servidor no ar)

1. `create-expo-app` + dependências da seção 2.1; app abre no Expo Go.
2. `theme.ts` e `ui/index.tsx` — `Group`, `Row`, `Field`, `Button`, `Segmented`.
3. `types.ts` — os contratos, antes de qualquer chamada.
4. `api/routes.ts` — todas as rotas da seção 3.1, mesmo as que ainda não existem.
5. `api/http.ts` com `useMock: true` e `api/mock.ts` respondendo só `/connections`.
6. `api/services.ts` + tela **Bancos** lendo do mock.
7. `drivers.ts` com pg e sqlite; tela **Conexão** renderizando os campos do catálogo.
8. Completar `drivers.ts` com os dez dialetos e as quatro seções (2.8).
9. Mock de `/tables` + aba **Tabelas** com busca.
10. Mock de `/tables/:t` + aba **Estrutura** com selos PK/FK/UK e índices.
11. Mock de `/ddl` + aba **DDL**.
12. `lib/sql.ts` (tokenize) — realce para exibir DDL e a prévia da consulta.
13. `DataGrid` + banner de erro com `code` e `message`.
14. Aba **Consulta**: tabela, colunas, condições, ordenação, limite sobre a rota `rows`.
15. `lib/mermaid.ts` + `MermaidView` + abas de diagrama, banco inteiro e vizinhança (3.4).
16. `lib/filters.ts` + barra de filtros, ordenação por cabeçalho e busca rápida (3.2).
17. `lib/mutations.ts` + `GradeEditavel` — buffer, seleção, folhas e gravação em duas
    etapas (preview → confirmação).
18. Selo *editável / somente leitura* no resultado do construtor, a partir do bloco `edicao` da rota `rows`.

Ao fim da fase 1 o app faz tudo e não existe backend nenhum. É esta fase que valida o
desenho com quem vai usar.

## Fase 2 — o NestJS, módulo por módulo

1. `nest new` + `main.ts` (prefixo, CORS, `0.0.0.0`, filtro de exceção, shutdown hooks).
2. `ConnectionsModule` com `ConnectionsService` em memória + `GET/POST /connections`.
3. `KnexPoolService` com `toKnexConfig` e `probe`; `POST /connections/test` funcionando
   contra um Postgres local. Este é o passo de maior risco — resolva SSL e pool aqui.
4. `connect` / `disconnect` / `status`.
5. `CatalogModule` com `PgStrategy` só: `schemas`, `tables`, `tables/:t`.
6. `DdlService` + `tables/:t/ddl`.
7. `rows` com `RowsQueryDto`; depois filtros, busca e ordenação (`FiltersService`).
8. `ErdModule` — o gerador é o mesmo do app, portado para o serviço.
9. `ReadOnlyGuard` no módulo de mutações e o `cancel` por conexão dedicada.
11. `MutationsModule`: comece pelo `preview` (não escreve nada, dá para testar à vontade),
    depois o `apply` com transação. Teste o conflito abrindo a mesma linha em duas sessões.
12. `MysqlStrategy` e `SqliteStrategy`. É aqui que o desenho de estratégias se paga: nenhuma
    tela muda, nenhum controller muda.
13. `MssqlStrategy` e `OracleStrategy`, se você tiver esses bancos.

**Como validar cada passo:** vire `useMock` para `false` no app e navegue a mesma tela. Se
ela funcionar igual, o contrato foi cumprido. O mock é o teste de contrato, e o
`prototipo.html` é o gabarito visual.

---

# PARTE 7 — O que ficou de fora

- **Filtros salvos e histórico de queries** por conexão. Cabe em `AsyncStorage`, sem
  servidor.
- **Exportar resultado** em CSV/JSON — `POST /export` já está reservado no mapa de rotas.
- **Túnel SSH** (`ssh2` no backend; os campos já estão previstos em `ConnectionConfig.ssh`).
- **Múltiplas abas de SQL** por conexão.
- **Autenticação**: hoje o backend é aberto e depende de estar na sua rede. Se for expor,
  ponha um guard de token e um interceptor em `src/api/http.ts` para mandar o header.
- **Modo escuro**: os tokens já estão centralizados em `src/theme.ts`; falta o par escuro e
  o `useColorScheme`.
- **Diagrama interativo** (arrastar caixas) exigiria trocar o Mermaid por SVG próprio.
- **Edição de resultado com JOIN**: fica em leitura por decisão de projeto. Dá para
  implementar mapeando cada coluna à sua tabela de origem pelo `tableID` do driver, mas aí
  cada linha vira várias operações em tabelas diferentes, e a confirmação precisa deixar
  isso explícito.
