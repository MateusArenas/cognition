# SSH — cliente de terminal remoto (4ª tab)

## O que é

Uma 4ª tab do app (`editor/src/app/(tabs)/ssh.tsx`), irmã da Biblioteca e do Banco de Dados,
atrás do mesmo gate de login do app inteiro (`docs/18-autenticacao.md`): lista de hosts salvos,
credenciais (chave SSH ou senha), confiança de chave de host (TOFU) e um terminal interativo de
verdade — WebView com xterm.js no app, `ssh2` de verdade no backend NestJS. **É só cliente**: o
app nunca abre socket TCP direto pro host remoto (o React Native não tem essa capacidade — só
`fetch`/`WebSocket`), quem fala SSH de verdade é o backend, via socket.io.

## Decisão de escopo — por que MVP, não a spec inteira

Duas referências foram fornecidas: `SSH-MOBILE.md` (spec técnica) e `ssh_mobile_prototipo.html`
(protótipo navegável). As duas descrevem um produto SaaS **multiusuário completo** —
organizações, cofres compartilhados entre equipe, MFA, senha-mestra com envelope de criptografia
em 3 camadas, agentes para rede local, SFTP com fila, encaminhamento de porta, gravação de sessão
e auditoria — 5 fases, o próprio roadmap deles estima ~14-19 semanas.

**Decisão confirmada com o usuário**: construir agora só o essencial — hosts/credenciais e o
terminal em si — e documentar o resto como roadmap futuro tickável (seção no fim deste arquivo),
em vez de tentar entregar tudo de uma vez. Mesmo espírito do desvio já registrado quando o
Rabisco e as Tabelas CSV foram adicionados: **aqui o desvio é de escopo, não de arquitetura**.
Nosso `auth` é flat (`User` só, sem `Organization`/`Vault`, ver `docs/18-autenticacao.md`) — a
"cofre pessoal" da spec já é, na prática, o que `Connection` (cliente de banco) já faz hoje: dono
único via `ownerId`, segredo cifrado com `APP_SECRET`. Não existe conceito de time/
compartilhamento a construir agora.

## Backend — `backend/src/ssh/`

### Modelos Prisma (regra de ouro: tabela nossa → Prisma, nunca Knex — `docs/17-db-client.md`)

Cinco modelos novos em `backend/prisma/schema.prisma` (espelhados em `schema.test.prisma`),
todos com FK flat `ownerId → User.id` — sem organização, mesmo padrão de `Connection`. Prefixo
`Ssh*` pra não colidir com o `Session` de auth (refresh token) já existente:

- **`SshHost`** — label/address/port/username/authMethod ('key'|'password')/credentialId/
  groupName/tags/color/keepalive/startupCommand/lastConnectedAt.
- **`SshCredential`** — chave SSH ou senha, separada do host pra poder ser reusada em mais de
  um. `secretCiphertext` guarda a chave privada+passphrase (kind 'key', JSON cifrado) ou a senha
  (kind 'password') — sempre via `encrypt()`/`decrypt()` de `common/crypto.util.ts`.
- **`SshKnownHost`** — TOFU: `@@unique([ownerId, address, port, keyType])`, fingerprint SHA256
  aceito uma vez.
- **`SshSession`** — uma linha por sessão de terminal (aba); espelha o `Map` em memória do
  `SshManagerService`, é o que a tela "Sessões" lê.
- **`SshSnippet`** — comando pronto, `requireConfirm` ligado por padrão.

`tags` é `Json` (não `String[]`) — SQLite (schema de teste) não suporta lista escalar nativa no
Prisma, mesmo motivo já documentado no comentário de `Permission.fields`.

**Migration escrita à mão** (`backend/prisma/migrations/20260821120000_ssh/migration.sql`): este
ambiente de desenvolvimento bloqueia `prisma migrate dev`/`db push` quando quem chama é um agente
de IA (mesmo em schema temporário) — SQL explícito, no mesmo formato que as migrations anteriores
já usam, é o caminho já estabelecido neste repo pra esse cenário (ver comentário no topo de
`test/prisma-test-client.ts`).

### Criptografia — reusada, não duplicada

`connections/crypto.util.ts` (AES-256-GCM, chave derivada de `APP_SECRET`, prefixo `enc:`) subiu
pra `backend/src/common/crypto.util.ts` — `ssh/` não precisa depender de `connections/`.
`connections.service.ts` importa do novo lugar; nenhum comportamento mudou (mesmo `crypto.util.spec.ts`, só movido).

### Módulo `ssh/`

```
backend/src/ssh/
  ssh-key.util.ts        # gera Ed25519 (formato openssh-key-v1 escrito à mão — ver abaixo),
                          # fingerprint SHA256 de qualquer blob wire
  hosts.{controller,service}.ts        credentials.{controller,service}.ts
  known-hosts.{controller,service}.ts  snippets.{controller,service}.ts
  sessions.{controller,service}.ts
  ssh-manager.service.ts  # Map<sessionId, {conn: ssh2.Client, stream, buffer, detachTimer}>
  ssh.gateway.ts          # @WebSocketGateway({ namespace: '/ssh' })
  ws-jwt.util.ts          # verifica o JWT do handshake — sem precedente de WS neste backend
  ssh.module.ts
```

**`ssh-manager.service.ts`** espelha `connections/knex-pool.service.ts` (Map em memória, criação
preguiçosa, `destroy()` explícito, limpeza em `onModuleDestroy()`), com a chave sendo
`sessionId` (não `hostId` — o mesmo host pode ter várias abas abertas), mais o ring buffer de
replay (256 KB) e o timer de detach (10 min de carência quando o socket cai, sem matar a sessão
SSH — ela continua rodando no servidor).

**Achado real durante a implementação — `ssh2` não entende PKCS8**: a primeira versão de
`ssh-key.util.ts` gerava a chave Ed25519 via `node:crypto` em PKCS8 PEM (`generateKeyPairSync`
com `privateKeyEncoding: {type:'pkcs8', format:'pem'}`) e passava direto pra `ssh2`. Um teste
real (`ssh-manager.service.spec.ts`, servidor `ssh2.Server` de verdade em processo) travou com
`Cannot parse privateKey: Unsupported key format` — o parser de chave do `ssh2`
(`protocol/keyParser.js`) só entende dois formatos: PEM tradicional (`BEGIN RSA/DSA/EC PRIVATE
KEY`, que não existe pra Ed25519) e o formato binário `openssh-key-v1` novo. `ssh-key.util.ts`
serializa esse formato à mão (struct documentada no `PROTOCOL.key` do próprio OpenSSH: magic +
cifra/kdf "none" + chave pública wire + bloco privado com checkint duplicado + padding até
múltiplo de 8) — sem essa correção, toda chave gerada pelo app seria rejeitada por qualquer
servidor SSH de verdade. Só foi encontrado porque o teste usa um servidor `ssh2` REAL, não um
mock — reforça a decisão de teste abaixo.

Rotas REST (CASL-guardadas nas de escrita, `Subject` novo `'SshHost'` em `casl-ability.factory.ts`,
mesma granularidade que `'Connection'` já tem):

```
GET/POST/PATCH/DELETE /ssh/hosts            POST /ssh/hosts/:id/test
GET/POST/PATCH/DELETE /ssh/credentials      POST /ssh/credentials/generate
GET/DELETE            /ssh/known-hosts
GET/POST/PATCH/DELETE /ssh/snippets
GET/DELETE            /ssh/sessions
```

### Protocolo do gateway `/ssh`

Handshake autentica via `client.handshake.auth.token` (`ws-jwt.util.ts`, mesmo `JWT_SECRET` do
REST — sem esquema novo de token). Token inválido/vencido: aceita a conexão, emite `status` (sem
`sessionId`) com o código de erro, desconecta — não há middleware de auth do socket.io aqui
(diferente do padrão idiomático "rejeita no handshake"), então o cliente escuta os dois casos
(ver `services/socket.ts` no app).

| Evento | Direção | Payload |
|---|---|---|
| `session:open` | cliente→servidor (ack) | `{hostId, cols, rows}` → `{sessionId}` |
| `session:attach` | cliente→servidor (ack) | `{sessionId}` — reconecta numa sessão viva/detached |
| `data` | cliente→servidor | `{sessionId, b64}` — tecla digitada, sem ack nem volatile (perder uma não pode acontecer) |
| `resize` | cliente→servidor | `{sessionId, cols, rows}` |
| `hostkey:trust` | cliente→servidor (ack) | `{sessionId, fingerprint}` → `{trusted}` |
| `session:close` | cliente→servidor (ack) | `{sessionId}` |
| `status` | servidor→cliente | `{sessionId?, state, message?, code?}` |
| `hostkey:unknown` | servidor→cliente | `{sessionId, fingerprint, keyType}` |
| `data` | servidor→cliente | `{sessionId, b64}` |
| `replay` | servidor→cliente | `{sessionId, b64}` — buffer dos últimos 256 KB |
| `exit` | servidor→cliente | `{sessionId, code, signal}` |

`main.ts`/`configure-app.ts` ganham `app.useWebSocketAdapter(new IoAdapter(app))` — genérico do
Nest, qualquer `@WebSocketGateway()` futuro (não só o `/ssh`) já sobe em cima disso de graça.

### Testes de backend — de ponta a ponta de verdade, sem Docker

`test/ssh-test-server.ts`: servidor `ssh2.Server` REAL, em processo, escutando em
`127.0.0.1:<porta aleatória>` — mesmo espírito de `test/sample-target-db.ts` (SQLite descartável
pro e2e do cliente de banco): infraestrutura de teste que o próprio repo possui, sem depender de
Docker/imagem externa (mais rápido, determinístico, funciona offline). A chave de HOST desse
servidor de teste é gerada pela mesma `generateEd25519KeyPair()` do app (dogfooding — prova que o
formato serializado à mão funciona tanto como chave de servidor quanto de cliente).

- `ssh-key.util.spec.ts` — geração/fingerprint/parse da linha OpenSSH.
- `ssh-manager.service.spec.ts` — TOFU completo (desconhecida→confia→conhecida; chave que muda é
  recusada), `testConnection`, replay buffer, tudo contra o servidor real.
- `test/ssh.e2e-spec.ts` — REST completo (gerar/importar credencial, CRUD de host, testar
  conexão, snippets) **+** o gateway de ponta a ponta via `socket.io-client` de verdade: abre
  sessão, recebe `hostkey:unknown`, confia, sessão abre, digita e recebe eco pelo evento `data`,
  fecha, reconecta sem TOFU de novo (host já confiado), token inválido é recusado.

### Bug real achado pelo usuário ao vivo: `tags` quebrava criar host contra o Postgres de verdade

Todo o backend foi testado (64 unit + 64 e2e, incluindo o gateway/TOFU contra um `ssh2.Server`
real — seção acima) **contra SQLite**, mesma decisão de portabilidade que o resto do repo já
usa (sem Docker/Postgres disponível pra um agente de IA rodar `prisma migrate`/`db push` neste
ambiente, ver `test/prisma-test-client.ts`). Isso deixou uma lacuna real: a migration do
Postgres de verdade (`20260821120000_ssh/migration.sql`) nunca foi de fato aplicada contra um
Postgres real durante a implementação — só validada por leitura. O usuário tentou criar um host
pelo app e bateu em `Invalid input value: malformed array literal: "[]"`.

**Causa**: em algum momento durante a implementação, `SshHost.tags` mudou de `String[]` pra
`Json` no `schema.prisma` (SQLite não suporta lista escalar nativa no Prisma — mesmo motivo já
documentado no comentário de `Permission.fields`), mas a migration do Postgres já escrita à mão
continuou com `"tags" TEXT[] DEFAULT ARRAY[]::TEXT[]` — um array nativo do Postgres, não o tipo
que o Prisma client passa a mandar (`Json`, serializado). O SQLite (usado nos testes) não tem
tipo array nativo, então a mesma incompatibilidade não existia lá — só aparece contra Postgres
de verdade, exatamente o ambiente que os testes automatizados deste repo não conseguem cobrir.

**Correção**: nova migration `20260821135000_ssh_host_tags_jsonb` (nunca se edita uma migration
já aplicada) — `ALTER COLUMN "tags" TYPE JSONB USING to_jsonb("tags")`. Aplicada com `prisma
migrate deploy` (que funciona neste ambiente — só `migrate dev`/`db push` são bloqueados pra um
agente de IA) contra o Postgres real do `docker-compose.yml`, backend recompilado e reiniciado,
confirmado com `POST /ssh/hosts` de verdade (`curl`, HTTP 201, `tags` voltando corretamente) e
depois pelo próprio app no simulador — o host que o usuário tentou criar salvou.

**Lição registrada**: testes contra SQLite pegam bug de lógica, não pegam divergência de DDL
entre o `schema.prisma` e uma migration do Postgres escrita à mão. Qualquer migration nova
escrita à mão daqui pra frente precisa, no mínimo, ser conferida campo a campo contra o
`schema.prisma` (tipo por tipo, não só nome) — e idealmente aplicada contra o Postgres real do
`docker-compose.yml` (via `prisma migrate deploy`, que não é bloqueado) antes de considerar a
etapa pronta, não só validada por leitura.

## Frontend — `editor/src/features/ssh/`

### Tab e rotas

`app/(tabs)/_layout.tsx` ganhou `Tabs.Screen name="ssh"` (ícone `terminal`, lucide `Terminal`).
`app/(tabs)/ssh.tsx` reexporta `ConnectionsScreen`, mesmo padrão de `dbclient.tsx`. Rotas
empilhadas (`app/ssh/host.tsx`, `credentials.tsx`, `snippets.tsx`, `known-hosts.tsx`,
`sessions.tsx`, `terminal/[sessionId].tsx`) entraram explicitamente no `Stack.Protected` de
`app/_layout.tsx`, do jeito que `db/*` já estava.

**Editar host/credencial — tocar na linha abre uma folha de ações, nunca ação direta.** Pedido
explícito do usuário: tocar num host ou credencial abre um `Sheet`+`GroupedList` com as ações
(Entrar/Editar/Apagar pro host; Editar/Apagar pra credencial) — nada dispara só de tocar na
linha, mesmo cuidado que qualquer ação destrutiva do resto do app já tem. Ícone de "Apagar"
vermelho (`left={<Icon name="trash" color="#D70015"/>}`), não texto vermelho — mesmo padrão de
`features/csv/Menus.tsx`. Editar credencial reusa a MESMA folha de "Importar" (`kind` fixo, some
o `Segmented`; campos de segredo em branco = mantém o atual, placeholder
`ssh.credentials.keepCurrent` avisa isso) — backend correspondente: `PATCH /ssh/credentials/:id`,
`CredentialsService.update()` só recifra o que veio preenchido (ver `credentials.service.spec.ts`
pra cada combinação: renomear sozinho não mexe no segredo, trocar só a passphrase mantém a chave,
colar chave nova reseta a passphrase antiga — não se aplica a outro arquivo).

### Terminal — WebView + xterm.js, sem CDN

`features/ssh/terminal/terminal.shell.html` (template versionado) + `scripts/build-ssh-terminal-html.mjs`
(`npm run ssh-terminal`, encadeado em `start`/`android`/`ios`/`web`) embutem `@xterm/xterm` +
`@xterm/addon-fit` + CSS deles no HTML final (`terminal.html`, gitignored) — mesma técnica de
`scripts/build-runtime.mjs` pro canvas Mermaid: precisa funcionar offline (avião ligado), então o
bundle vai dentro do HTML, nunca carregado de CDN. `@xterm/xterm`/`@xterm/addon-fit` são
`devDependencies` (só usados em build-time pelo script, nunca importados por código RN — mesmo
lugar que `mermaid` já ocupa).

`TerminalCanvas.tsx`/`bridge.ts`/`useTerminalHtml.ts` espelham `DiagramCanvas.tsx`/`bridge.ts`/
`useRuntimeHtml.ts` do canvas Mermaid quase linha a linha: RN→WebView via `injectJavaScript`
chamando `window.__handle` (nunca `postMessage`), WebView→RN via `onMessage`.

`KeyBar.tsx` — esc/ctrl (trava de um toque)/tab/`|~/-'"` /setas (repetição em `onPressIn`, 90ms)/
`^C`/`^D`/`^L`/`^R`/snippets — **sem nenhuma tecla de letra** (só pontuação/controle); digitar
texto de verdade (`clear`, um comando) é sempre o teclado nativo do iOS/Android, nunca a KeyBar.
`base64.ts` — encoder à mão pras sequências de controle que a KeyBar manda direto pro socket
(`btoa` não é garantido global no Hermes, mesmo motivo do decodificador em
`features/csv/ImportSheet.tsx`).

**Bug real reportado pelo usuário (2 rodadas): o app fechava e recarregava sozinho ao digitar no
teclado nativo** (não reproduzível com a KeyBar — ela não tem letras, então "digitando `clear`"
só podia ser o teclado de verdade).

*Rodada 1 — hipótese descartada.* A primeira versão prendia a `KeyBar` em `KeyboardStickyView`
(`react-native-keyboard-controller`, escuta o frame nativo do teclado via `reanimated`), suspeita
por ser o único ponto novo do código (o outro uso de `KeyboardStickyView` no app,
`features/code/CodeKeyboardBar.tsx`, é sempre sobre `TextInput` nativo, nunca WebView). Removida
como correção orientada por evidência, sem reprodução direta — e o usuário confirmou, testando de
novo com o mesmo cenário, que **não resolveu**: o reload continuou acontecendo.

*Rodada 2 — causa raiz achada em código-fonte, não por reprodução ao vivo.*
`TerminalCanvas.tsx` passava `hideKeyboardAccessoryView` e `keyboardDisplayRequiresUserAction={false}`
pro `WebView` do react-native-webview. As duas props são implementadas em
`node_modules/react-native-webview/apple/RNCWebViewImpl.m` via **method swizzling de um seletor
PRIVADO do WebKit** — `_elementDidFocus:userIsInteracting:blurPreviousNode:activityStateChanges:userObject:`
(a variante exata do seletor muda por faixa de versão de iOS, hardcoded no arquivo) — chamado
através de um cast bruto de function pointer (`(void (*)(id, SEL, void*, BOOL, BOOL, BOOL, id))original`).
Esse seletor privado dispara toda vez que um elemento focável dentro da WebView ganha foco —
exatamente o que acontece quando o textarea escondido do xterm.js recebe o toque pra abrir o
teclado, ou seja, exatamente o momento em que o usuário começa a digitar. Se a assinatura real do
seletor na versão de iOS rodando (simulador testado: iOS 17.5) não bate com o cast hardcoded, é
undefined behavior — pode derrubar o processo da WebView sem deixar rastro nenhum no Metro, que é
exatamente "o app fecha e recarrega sozinho, sem erro de JS". Diferente da hipótese da rodada 1,
essa dispara em **qualquer foco**, programático ou do usuário, o que explica por que aconteceu em
digitação normal e não só ao injetar snippet.

Corrigido: as duas props foram removidas de `TerminalCanvas.tsx` (cosméticas — só escondiam a
barra de acessório do teclado e permitiam foco programático sem gesto do usuário; perder a
segunda significa que, no iOS, `.focus()` chamado depois de injetar um snippet pode não abrir
mais o teclado sozinho — trade-off aceito). `onContentProcessDidTerminate` foi adicionado no
`WebView` como rede de segurança: se o processo nativo da WebView morrer de novo (por essa causa
ou qualquer outra), a WebView recarrega sozinha em vez do app inteiro reiniciar sem explicação.
**Não confirmado por reprodução direta do crash em si** (mesma limitação da rodada 1: não foi
possível forçar entrada de texto real pelo teclado via automação do simulador —
`cliclick t:`/AppleScript `keystroke` nunca ecoam caractere nenhum nessa WebView, mesmo com o
teclado de hardware do simulador desligado) — mas a causa é de altíssima confiança: é um padrão de
crash documentado do próprio react-native-webview (uso de API privada por seletor, uma categoria
clássica de quebra entre versões de iOS), e o teste ao vivo pós-fix (conectar, focar o terminal,
`keystroke` real via AppleScript) não derrubou o app nem gerou reload, onde a versão anterior
supostamente deveria ter travado. Se o usuário testar de novo e ainda reproduzir, o próximo suspeito
é o `ResizeObserver`/`FitAddon.fit()` em `terminal.shell.html` ou o `KeyboardProvider` global em
`app/_layout.tsx`.

`themes.ts` — 5 paletas portadas do protótipo (Nordeste escuro/Dracula/Solarizado escuro/One
Dark/Padrão do sistema), no formato `ITheme` do xterm.js. Preferência de tema/fonte fica em
`features/ssh/store/useSshSettings.ts` — **local no aparelho** (mesmo padrão hydrate/persist de
`store/useSettings.ts`, via `expo-sqlite/kv-store`), não sincronizada pelo backend nesta v1.

### Socket.io — serviço genérico, não amarrado ao SSH

Pedido explícito do usuário: quer reusar em outras features futuras. `editor/src/services/socket.ts`
(irmão de `api/http.ts`, fora de `features/ssh/`) — `getSocket(namespace)` com singleton por
namespace, `auth` como **função** (não objeto — reavaliada a cada reconexão; com objeto, o socket
reconecta pra sempre com o token velho e expirado). `refreshAndReconnect()` reusa o mesmo
`refreshTokensFor()` que o interceptor do axios já usa — um único jeito de renovar token no app
inteiro. `features/ssh/socket/sshSocket.ts` só faz `getSocket('/ssh')` mais duas funções de
domínio: `openSession()` e `attachSession()`.

**Corrida evitada — `openSession()` só resolve com a sessão DE VERDADE aberta.** Se
`ConnectionsScreen` navegasse pra `TerminalScreen` assim que recebesse o ack de `session:open`,
haveria uma janela real onde `hostkey:unknown`/`status` já teriam disparado antes da tela do
terminal montar e assinar os listeners — evento perdido, TOFU nunca aparece, tela trava em
"conectando". `openSession()` registra os listeners **antes** de emitir `session:open`, resolve o
alerta de TOFU (`onHostKeyPrompt`, mostrado ainda em `ConnectionsScreen`) e só devolve o
`sessionId` quando `status` chega com `state:'open'` — a navegação só acontece depois disso, sem
corrida nenhuma. `TerminalScreen` então só precisa de `session:attach` (replay cobre qualquer
coisa que tenha rolado nesse meio-tempo) — nunca precisa tratar `hostkey:unknown`.

**Bug real achado ao vivo: host que trava no handshake deixava o spinner girando pra sempre.**
Nada no protocolo garante um `status:error` chegando em tempo hábil se a conexão travar no meio
(TCP que nem aceita nem recusa) — `openSession()` não tinha timeout nenhum esperando
`hostkey:unknown`/`status` depois do ack. Corrigido com um timer de 25s que rejeita com mensagem
clara e fecha a sessão (`session:close`) se nada chegar; **pausado** enquanto o usuário decide o
alerta de TOFU (não conta como "travado" — a pessoa pode demorar o quanto quiser pra decidir),
rearmado depois do `hostkey:trust`. Testado com fake timers (`sshSocket.test.ts`): resolve normal,
timeout de verdade fecha a sessão, TOFU não conta pro timeout, `status:error` rejeita.

### Reuso de design system

`NavBar`/`GroupedList`/`Row`/`Fab`/`Sheet`/`Field`/`Segmented`/`RowSwitch`/`AlertDialog`/
`TintedButton` — nenhum componente novo além do necessário. Menus (⋯ do host, aparência do
terminal, escolher credencial) via `Sheet`+`GroupedList`+`Row`, mesmo padrão já usado no resto do
app pra menu contextual sem `ActionSheet` dedicado.

## Documentação e i18n

Namespace `ssh` novo em `pt-BR.json`/`en.json`/`es.json` (mesma estrutura aninhada de
`dbclient`), mais `tabs.ssh` e `common.back` nos três. `library.types`/`domain/types.ts` não
mudam — SSH não é um tipo de `Doc`, é uma tab irmã da Biblioteca, mesmo estatuto que `dbclient`
já tem.

## Roadmap — funcionalidades futuras

Tudo que a spec de referência descreve e **não** entrou nesta v1, por decisão de escopo (seção
acima) — não por esquecimento. **Regra que passa a valer daqui pra frente**: sempre que um destes
itens for construído numa sessão futura, marcar `[x]` aqui no mesmo commit que o implementa —
mesmo mecanismo que o `CHECKLIST.md` do app inteiro já usa pro resto do produto.

- [ ] **SFTP** — navegar/editar arquivo remoto pela mesma sessão SSH (`conn.sftp()`, sem novo
      handshake), `.bak` antes de salvar, upload/download grande via fila.
- [ ] **Encaminhamento de porta / "Abrir serviço"** — local (-L) via proxy autenticado no
      backend + WebView, remoto (-R) via `conn.forwardIn`. Nunca `listen` em `0.0.0.0` por
      padrão.
- [ ] **Jump host** (`SshHost.jumpHostId`) — encadeia `forwardOut` antes de conectar no destino;
      precisa de validação de ciclo (`A→B→A`) no `PATCH /ssh/hosts/:id`.
- [ ] **Gravação de sessão** (`.cast`, asciinema v2) + player + link de compartilhamento
      temporário + **auditoria** (`AuditLog`-like: `session.open`, `credential.read`,
      `hostkey.trust`).
- [ ] **Agentes para rede local** (LAN scan) — binário na rede do cliente, túnel reverso via
      WebSocket, pra alcançar host sem IP público (`192.168.x.x` atrás de NAT).
- [ ] **Importar `~/.ssh/config`** — parseia `Host`/`HostName`/`Port`/`User`/`IdentityFile`/
      `ProxyJump` na criação em lote de hosts.
- [ ] **Instalar chave num host** (`>> authorized_keys`, idempotente) — abre/reusa uma sessão e
      roda o comando.
- [ ] **Conversão de charset** — hosts legados em `latin1` (comum em chão de fábrica
      brasileiro); xterm.js só fala UTF-8, precisa de `iconv-lite` no backend nos dois sentidos.
- [ ] **Encaminhamento de agente SSH (-A)** — usa o `ssh-agent` do próprio backend
      (`SSH_AUTH_SOCK`), só deveria ligar em host confiável (aviso explícito na UI).
- [ ] **MFA / senha-mestra / times e cofres compartilhados** — exige criar toda uma camada de
      multi-tenancy (`Organization`/`Membership`/`Vault`) que não existe hoje no app; é, na
      prática, um produto novo dentro do app, não uma extensão desta feature.
