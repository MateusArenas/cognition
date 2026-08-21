# Autenticação — JWT accessToken/refreshToken, multi-conta, app inteiro logado

## Em uma frase

Login deixou de ser algo só da aba "Banco de Dados" — o app inteiro (Documentos, Rabisco,
Banco de Dados, todas as tabs) fica atrás de um gate de sessão. Telas de Login/Criar conta/
Esqueci minha senha/Redefinir senha vivem fora das tabs, num grupo de rotas próprio
(`app/(auth)/`); uma splash única decide, a cada abertura do app, se mostra essa stack ou a
área logada. O backend é o mesmo NestJS do cliente de banco (`backend/`) — autenticação virou
transversal, mas continua sendo o único backend do monorepo.

## Contexto — por que essa mudança

Antes: `POST /auth/login` devolvia só um `accessToken` sem expiração tratada, guardado em texto
puro dentro do blob de configurações do app (`useSettings`), uma sessão só, gate limitado à aba
de banco de dados. Decisões tomadas com o usuário nesta entrega:

1. **Login trava o app inteiro**, não só a aba Banco de Dados.
2. **`accessToken` curto + `refreshToken` longo**, com rotação a cada refresh.
3. **A senha também é salva** (junto com os tokens, por conta salva no SecureStore) —
   permite re-autenticação silenciosa mesmo depois do `refreshToken` expirar. Trade-off de
   segurança assumido conscientemente: o SecureStore já é backed pelo Keychain (iOS) /
   Keystore (Android), então a senha nunca fica em texto puro em disco fora dessa camada, mas
   ainda é recuperável se o device em si for comprometido — decisão do usuário, não descuido.
4. **Login aceita e-mail OU username** — `User` ganhou um campo `username` novo.
5. **Múltiplas contas salvas simultaneamente**, com troca de conta pela tela de Ajustes.
6. **Sem infraestrutura de e-mail real disponível** — `MailService` plugável, cai pro log no
   console quando não há SMTP configurado (testável de ponta a ponta sem credenciais reais).

## Backend (`backend/src/auth/`, `backend/src/mail/`)

### Schema (`prisma/schema.prisma` + espelho `schema.test.prisma`)

```
User            + username String? @unique (nasce nulo pra usuários antigos/admin-criados;
                  POST /auth/register sempre seta)
Session         id, userId, refreshTokenHash (sha256, NUNCA o token cru), userAgent?,
                createdAt, expiresAt (teto fixo desde o login, NÃO estendido a cada refresh),
                revokedAt?
PasswordResetToken   id, userId, tokenHash (sha256), createdAt, expiresAt (1h), usedAt?
```

**Por que `Session` é um modelo próprio, não um campo em `User`**: um campo único quebraria
multi-conta/multi-dispositivo — um segundo login apagaria o refresh token do primeiro. Uma
linha por sessão também é o que permite revogação granular (logout de UM dispositivo sem
afetar os outros) e detecção de reuso.

**Rotação + detecção de reuso** (`AuthService.refresh`): cada chamada a `POST /auth/refresh`
verifica o JWT, carrega a `Session` pelo `sid` do payload, compara `sha256(token recebido)`
contra `refreshTokenHash` guardado. Bate → gira pra um refresh token novo (mesma `Session`,
hash atualizado, `expiresAt` original preservado). NÃO bate (um token já rotacionado sendo
reapresentado — sinal de roubo) → revoga **todas** as sessões daquele usuário, não só a atual.
Cada refresh token carrega um `jti` (UUID aleatório) no payload — sem isso, dois refreshes da
mesma sessão assinados no mesmo segundo (`sub`+`sid`+`iat`+`exp` idênticos) virariam
literalmente a mesma string JWT, quebrando a comparação de reuso (bug real, pego no e2e rodando
rápido o bastante pra dois refreshes caírem no mesmo segundo).

**`RefreshTokenService`** (`auth/refresh-token.service.ts`) usa um `JwtService` PRÓPRIO —
segredo/expiração nunca compartilhados com o do access token (`JWT_REFRESH_SECRET`/
`JWT_REFRESH_EXPIRES_IN`, default `30d`), lidos preguiçosamente por chamada (mesmo motivo de
testabilidade que já justificava `JwtStrategy` ler `process.env` direto no construtor).

### Rota por rota (`auth/auth.controller.ts`, prefixo `/api/v1/auth`)

| Rota | Guard | O que faz |
|---|---|---|
| `POST /register` | público | email+username+name+password, cria sem NENHUMA role do CASL (autentica, mas só acessa recursos gated depois de um admin atribuir role via `PATCH /users/:id/roles`, já existente), devolve tokens |
| `POST /login` | público | `identifier` (e-mail OU username) + password → tokens |
| `POST /refresh` | público | troca um refresh token válido por um par novo (rotação) |
| `GET /me` | JWT | "estou logado mesmo?" — usado pela splash E por checagem geral |
| `POST /logout` | JWT | revoga a `Session` daquele refresh token |
| `POST /forgot-password` | público | sempre `200 {ok:true}` exista ou não o e-mail (anti-enumeração); se existir, gera token e manda por e-mail |
| `POST /reset-password` | público | troca a senha com um token válido, revoga TODAS as sessões do usuário |

**`JwtAuthGuard`** (`common/guards/jwt-auth.guard.ts`) agora inspeciona o `info` que o
`passport-jwt` já entregava (antes descartado) — token especificamente EXPIRADO vira
`401 {code: 'TOKEN_EXPIRED'}`; qualquer outra falha (ausente/inválido/assinatura errada)
continua `401 {code: 'UNAUTHENTICATED'}`. Checagem por `.name === 'TokenExpiredError'`, não
`instanceof TokenExpiredError` — este é um monorepo com npm workspaces, `jsonwebtoken` acabou
instalado em dois lugares (raiz e `backend/node_modules`) com versões ligeiramente diferentes,
e `passport-jwt` pode resolver uma cópia diferente da que o guard importaria; `instanceof` entre
classes de módulos distintos falha silenciosamente (bug real, pego rodando o e2e), `.name` é só
uma string, sempre igual não importa qual cópia criou o erro.

### `MailService` (`mail/mail.module.ts` + `mail.service.ts`)

Interface única (`send({to, subject, text, html?})`). Sem `SMTP_HOST` configurado no `.env` →
loga a mensagem inteira via `Logger` em vez de enviar (dev-safe, testável sem credenciais
reais — é o estado padrão deste ambiente, sem infraestrutura de e-mail nenhuma disponível). Com
`SMTP_HOST` configurado → `nodemailer` de verdade. `backend/test/bootstrap-app.ts` sobrescreve
`MailService` por um fake em memória (`mail.sent: MailMessage[]`) pros e2e conseguirem
inspecionar o token de reset sem SMTP nenhum.

### Testes

`backend/test/auth.e2e-spec.ts` (19 casos, segue o padrão `bootstrapTestApp()`+`seed-auth.ts` já
estabelecido): registro (+ e-mail/username duplicado), login por e-mail E por username, `/me`
(token válido, expirado → `TOKEN_EXPIRED`, ausente → `UNAUTHENTICATED`), refresh (par novo,
token antigo rotacionado falha, **multi-dispositivo**: reuso de um token rotacionado revoga a
sessão de OUTRO dispositivo também, refresh token vencido), logout (idempotente), esqueci/
redefinir senha (e-mail existe vs. não existe — anti-enumeração verificada, token
inválido/expirado/reutilizado, sessões antigas morrem depois do reset). Unitários novos:
`refresh-token.service.spec.ts`, `mail.service.spec.ts`, `jwt-auth.guard.spec.ts`.

**Validado ao vivo** contra o Postgres real do `docker-compose.yml` (não só SQLite de teste): a
migration escrita à mão (`prisma/migrations/20260820160000_auth_rework/`, `prisma migrate
deploy` não roda `migrate dev`/`db push` neste ambiente sandbox — ver comentário em
`test/prisma-test-client.ts`) foi aplicada de verdade, schema conferido via `psql \d`, e um
roteiro completo (registro → `/me` → login por username → refresh → refresh reutilizado
rejeitado → esqueci senha com token logado no console) rodou via `curl` contra o backend de
verdade antes de qualquer teste automatizado ser escrito.

## App (`editor/src/`)

### Armazenamento — `store/useAuthStore.ts`

Zustand + `expo-secure-store`. **Uma chave por conta**, não um blob único
(`editor.auth.account.<id>`) + uma chave de índice (`editor.auth.index.v1` — só ids + qual está
ativa): o Android Keystore tem um teto de ~2KB por valor, e cada conta carrega dois JWTs + a
senha — um blob único com várias contas estouraria esse limite rápido. `SavedAccount`:
`identifier` (o que foi digitado pra logar — e-mail ou username), `email` (o de verdade, como o
backend devolve, sempre presente independente do que foi digitado), `username`, `name`,
`password`, `accessToken`, `refreshToken`.

### `api/http.ts` — instância axios ÚNICA do app inteiro

Migrou de `features/dbclient/api/http.ts` pra `editor/src/api/http.ts` — deixou de ser "só do
cliente de banco" (é o mesmo backend, agora servindo autenticação transversal também).
Interceptor de resposta: em `401` + `code: 'TOKEN_EXPIRED'`, chama `POST /auth/refresh` com o
refresh token da conta ativa (`refreshTokensFor`, uma instância `refreshHttp` SEM interceptors
própria, pra não recursar), atualiza os tokens salvos e repete a requisição original
automaticamente. **Um único refresh em voo por vez** (`refreshPromise ??= ...`) — se N
requisições falharem ao mesmo tempo, todas esperam a MESMA promise em vez de disparar N
refreshes (que rotacionaria o refresh token N vezes, derrubando as próprias requisições
concorrentes por reuso). Se o refresh falhar (refresh token também morto), limpa a conta ativa
— o `Stack.Protected` reage sozinho, sem navegação imperativa aqui dentro.

**Validado ao vivo**: um teste temporário (não commitado — descartado depois de confirmar)
registrou um usuário contra um backend real com `JWT_EXPIRES_IN=2s`, esperou o token vencer de
verdade, e confirmou que (a) uma requisição isolada refresca sozinha e repete com sucesso, e (b)
3 requisições concorrentes com token vencido resultam em UM SÓ refresh (nenhuma cai por reuso
de token).

### `features/auth/` — contexto e telas

- `AuthContext.tsx` — `status: 'loading' | 'authenticated' | 'unauthenticated'`, deriva de
  `useAuthStore`. `resolveSession(id)` é o coração: tenta o accessToken salvo (`GET /auth/me`,
  com refresh automático já embutido no interceptor de `http.ts`) → se AINDA falhar (refresh
  token também morto), tenta re-login silencioso com a senha salva → se isso também falhar,
  desativa a conta (continua salva, só não ativa). Usado tanto por `bootstrap()` (rodado uma vez
  pela `AppGate` no cold start) quanto por `switchAccount()` (Ajustes) — mesmo caminho, sem
  duplicar lógica.
- `screens/{Login,Register,ForgotPassword,ResetPassword}Screen.tsx` — `Field`+`TintedButton`+
  `Banner`+`GroupedList`+`NavBar`, nunca `Chip` (regra de design já estabelecida: `Chip` é HUD
  translúcido sobre canvas, não botão genérico). `LoginScreen` mostra as contas salvas como
  atalho de um toque acima do formulário manual. Endereço do backend NÃO é mais configurável
  pela tela (pedido explícito do usuário — um único backend, sem campo pra digitar/lembrar
  endereço) — `API_BASE_URL` é uma constante fixa em `@/api/http.ts`, não mais lida de
  `useSettings`/SQLite; `useSettings.ts` perdeu `dbApiBaseUrl`/`setDbApiBaseUrl` inteiramente.

### Splash — `features/app-gate/AppGate.tsx`

Único dono da splash nativa do app inteiro agora. `features/update/UpdateGate.tsx` perdeu a
parte de segurar/soltar a splash (virou só `checkAndApplyUpdate()`, função pura) — antes, dois
"seguradores" de splash independentes (update + um futuro gate de auth) rodando em paralelo
significava que o primeiro a terminar já escondia a splash antes do outro acabar, uma tela em
branco piscando por um instante. `AppGate` roda `Promise.allSettled([checkAndApplyUpdate(),
bootstrap()])` e só libera a splash quando as DUAS terminam.

### Roteamento — `app/_layout.tsx`

`Stack.Protected` (expo-router 6.0.24/Expo SDK 54, confirmado disponível em
`node_modules/expo-router/build/views/Protected.js`) com dois blocos, por enumeração explícita
das rotas hoje existentes (não um grupo `(app)` novo — mesmo resultado, diff bem menor):

```tsx
<Stack.Protected guard={status === 'authenticated'}>
  <Stack.Screen name="(tabs)" /><Stack.Screen name="gallery" /><Stack.Screen name="doc/[id]" />
  <Stack.Screen name="db/connection" /><Stack.Screen name="db/[id]/index" />
  <Stack.Screen name="db/[id]/[table]" />
</Stack.Protected>
<Stack.Protected guard={status !== 'authenticated'}>
  <Stack.Screen name="(auth)" />
</Stack.Protected>
```

`app/(auth)/index.tsx` é a tela de Login — route groups não aparecem na URL, então `(auth)/
index` e `(tabs)/index` disputam o MESMO caminho `/`; o `Stack.Protected` decide qual dos dois
grupos fica visível, padrão documentado do próprio expo-router pra fluxos de autenticação.

### Ajustes — `features/settings/SettingsScreen.tsx`

Seção "Conta" nova, acima de Aparência: conta ativa (nome+e-mail), "Trocar de conta" (só
aparece se há outras contas salvas — abre uma `Sheet` listando-as, cada uma reusa
`resolveSession`), "Sair" (`AlertDialog` de confirmação, destrutivo). **"Sair" ≠ "trocar de
conta"**: Sair chama `POST /auth/logout` (revoga a `Session`) e APAGA a conta do SecureStore,
senha inclusa; trocar de conta / recuperação passiva de sessão morta mantêm a senha salva —
é o motivo de guardá-la.

### O que foi removido

`features/dbclient/screens/LoginScreen.tsx` e `DbClientRoot.tsx` (o gate da aba morreu — já é
redundante com o gate app-inteiro; `app/(tabs)/dbclient.tsx` agora renderiza `ConnectionsScreen`
direto). Ação de "Sair" que existia no `NavBar` de `ConnectionsScreen` (agora só em Ajustes).
`dbAuthToken`/`setDbAuthToken` em `useSettings.ts` (token não mora mais lá desde o começo desta
etapa). `dbApiBaseUrl`/`setDbApiBaseUrl` também saíram depois, junto do campo de endereço do
backend na tela de Login (pedido seguinte do usuário) — `useSettings.ts` agora só guarda
idioma/tema; o endereço é `API_BASE_URL`, constante fixa em `@/api/http.ts`.

### i18n

Namespace `auth` novo (pt-BR/en/es, 30 chaves) + `settings.account`/`switchAccount`/`logout`/
`logoutConfirmTitle`/`switchAccountError`. Chaves mortas removidas de `dbclient` (`subtitle`,
`loginError`, `fieldBackendUrl`, `fieldEmail`, `loginAction`, `logout`) — `dbclient.title`
(NavBar da aba) e `dbclient.fieldPassword` (rótulo do campo senha de uma CONEXÃO salva, contexto
diferente) continuam em uso, não removidos. Teste novo em `src/i18n/index.test.ts` varre a
árvore inteira dos três catálogos e falha se qualquer chave existir num só — antes só havia
checagem pontual de algumas chaves à mão.

### Testes

`store/useAuthStore.test.ts` (8 casos — hidratação, múltiplas contas por chave separada,
`updateTokens` preserva senha/identifier, `removeAccount` só limpa a conta ativa se era ela).
`i18n/index.test.ts` ganhou o teste de completude entre catálogos. Vitest total: 226 (era 217).

## Como rodar

```bash
cd backend
cp .env.example .env   # JWT_REFRESH_SECRET obrigatório; SMTP_* opcional (cai pro log sem ele)
npx prisma migrate deploy   # aplica a migration nova (Session/PasswordResetToken/username)
npm run start:dev
```

App: `npx expo install expo-secure-store` já é dependência declarada (`editor/package.json`);
sem simulador neste ambiente de build — a verificação visual das telas novas (Login/Criar
conta/Esqueci senha/Redefinir senha/seção Conta em Ajustes) fica por conta de rodar num device/
simulador de verdade.
