# Termix — Cliente SSH mobile multiusuário

**Spec de implementação · React Native (Expo Go) + NestJS**
Versão 1.0 — agosto/2026

---

## 1. O problema central (leia isto antes de qualquer coisa)

**SSH não roda dentro do Expo Go.** Isso não é opinião, é limitação de arquitetura:

- O protocolo SSH exige socket TCP cru. O JavaScript do React Native só tem `fetch`, `XMLHttpRequest` e `WebSocket` — nenhum deles abre TCP arbitrário.
- Bibliotecas como `react-native-ssh-sftp` e `react-native-tcp-socket` são módulos nativos. Expo Go é um binário pré-compilado: ele só carrega o que já está dentro dele. Instalar qualquer uma dessas exige *development build* (prebuild + EAS) e você perde o "abre no Expo Go e funciona".
- Mesmo com dev build, o iOS suspende sockets em background em ~30 s. Um SSH client puramente no aparelho perde a sessão toda vez que você troca de app ou o 4G oscila.

**Portanto: o SSH acontece no backend.** O app é um terminal remoto; o NestJS é o cliente SSH de verdade.

Isso não é uma gambiarra por causa do Expo — é exatamente o que o Termius faz com o *Termius Agent* e o que o Shellngn, Teleport e o Cloud Shell da AWS fazem. E traz de graça o que um app puro nunca teria: sessão que sobrevive ao app fechado, jump host, auditoria, cofre de credenciais compartilhado entre a equipe.

```
┌──────────────────────┐        ┌────────────────────────────────┐        ┌──────────────┐
│  App Expo Go (iOS)   │        │      Backend NestJS            │        │  VPS / PC    │
│                      │        │                                │        │  do cliente  │
│  WebView + xterm.js  │◄──WS──►│  SessionGateway (socket.io)    │        │              │
│  Barra de teclas     │  TLS   │        │                       │        │  sshd :22    │
│  SecureStore (JWT)   │        │        ▼                       │        │              │
│                      │◄─HTTP─►│  SshService (ssh2)  ───────────┼──TCP──►│              │
│  REST: hosts, chaves │  TLS   │  VaultService (AES-256-GCM)    │  SSH   │              │
└──────────────────────┘        │  Postgres + Prisma             │        └──────────────┘
                                └────────────────────────────────┘
       teclado/tela                  “agente” persistente              qualquer host alcançável
                                                                        pelo backend
```

O que trafega no WebSocket é **texto do terminal**, não credencial. A chave privada só existe descriptografada dentro da memória do processo NestJS, durante o handshake.

### 1.1 Modos de implantação

| Modo | Quem hospeda o backend | Alcança o quê | Para quem |
|---|---|---|---|
| **Nuvem** | Você (SaaS) | Qualquer host com IP público / VPN | Padrão |
| **Self-hosted** | O cliente, no datacenter dele | Rede interna inteira | Empresas (Invent/Vedamotors) |
| **Agente** (fase 3) | Binário leve na LAN do cliente que abre túnel reverso para a nuvem | Máquinas sem IP público | `192.168.x.x` do armazém |

Para acessar "qualquer computador", inclusive atrás de NAT, o modo **agente** é o que resolve — é assim que o Termius alcança máquinas locais. Detalhado na §12.

---

## 2. Stack

**Backend**
| Peça | Escolha | Motivo |
|---|---|---|
| Framework | NestJS 11 | seu padrão |
| SSH | `ssh2` (v1.16+) | cliente SSH puro em Node, maduro, suporta PTY, SFTP, forwarding, jump |
| WebSocket | `@nestjs/websockets` + **`socket.io`** | reconexão automática, ack, rooms; JS puro, roda no Expo Go |
| DB | PostgreSQL + **Prisma** | tipagem do schema até o controller; migrations versionadas |
| Auth | JWT (access 15 min / refresh 30 d) + Argon2id | — |
| Cripto | `node:crypto` AES-256-GCM + envelope | §5 |
| Fila | BullMQ (Redis) | transferências SFTP grandes, limpeza de sessões |
| Logs de sessão | arquivos `.cast` (asciinema v2) em S3 | auditoria e replay |

**App**
| Peça | Escolha | Compatível com Expo Go? |
|---|---|---|
| Runtime | Expo SDK 53+ | — |
| Terminal | `react-native-webview` + **xterm.js** embutido | ✅ (WebView faz parte do Expo Go) |
| HTTP | **`axios`** + interceptors | ✅ |
| Socket | **`socket.io-client`** (JS puro) | ✅ |
| Navegação | `expo-router` ou React Navigation | ✅ |
| Segredos locais | `expo-secure-store` (Keychain) | ✅ |
| Biometria | `expo-local-authentication` | ✅ |
| Blur da nav/tab bar | `expo-blur` | ✅ |
| Ícones | `@expo/vector-icons` / `expo-symbols` | ✅ |
| Háptico | `expo-haptics` | ✅ |
| Sheets | `@gorhom/bottom-sheet` + `react-native-reanimated` | ✅ |
| Arquivos (SFTP down/upload) | `expo-file-system` + `expo-document-picker` | ✅ |

❌ **Não use:** `react-native-ssh-sftp`, `react-native-tcp-socket`, `react-native-mmkv`, `react-native-keychain`, `node-forge` para crypto pesada no device.

---

## 3. Modelo de dados (Prisma)

```
organizations ──< memberships >── users
      │                              │
      └──< vaults ──< vault_members >┘
             │
             ├──< hosts ──> credentials
             │      │  └──> hosts (jump_host, auto-relação)
             │      └──< sessions
             ├──< snippets
             └──< known_hosts

agents, devices, audit_logs, port_forwards
```

### 3.1 `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------------------------------------------------------------- identidade

model Organization {
  id          String       @id @default(uuid()) @db.Uuid
  name        String
  slug        String       @unique
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")

  memberships Membership[]
  vaults      Vault[]
  knownHosts  KnownHost[]
  sessions    Session[]
  auditLogs   AuditLog[]
  agents      Agent[]

  @@map("organizations")
}

model User {
  id           String       @id @default(uuid()) @db.Uuid
  email        String       @unique
  name         String
  passwordHash String       @map("password_hash")            // Argon2id
  mkSalt       Bytes        @map("mk_salt")                  // salt da senha-mestra (§5)
  wrappedUmk   String       @map("wrapped_umk")              // User Master Key cifrada
  mfaEnabled   Boolean      @default(false) @map("mfa_enabled")
  mfaSecret    String?      @map("mfa_secret")               // TOTP, cifrado
  recoveryHash String?      @map("recovery_hash")            // Argon2id do código de recuperação
  lastLoginAt  DateTime?    @map("last_login_at")
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")

  settings     UserSettings?
  memberships  Membership[]
  vaultMembers VaultMember[]
  ownedVaults  Vault[]       @relation("VaultOwner")
  sessions     Session[]
  devices      Device[]
  forwards     PortForward[]
  trustedKeys  KnownHost[]
  auditLogs    AuditLog[]

  @@map("users")
}

enum Role {
  owner
  admin
  operator
  viewer
}

model Membership {
  id        String       @id @default(uuid()) @db.Uuid
  orgId     String       @map("org_id") @db.Uuid
  userId    String       @map("user_id") @db.Uuid
  role      Role
  createdAt DateTime     @default(now()) @map("created_at")

  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([orgId, userId])
  @@map("memberships")
}

// ------------------------------------------------------------------- cofres

model Vault {
  id        String        @id @default(uuid()) @db.Uuid
  orgId     String        @map("org_id") @db.Uuid
  name      String
  personal  Boolean       @default(false)
  ownerId   String?       @map("owner_id") @db.Uuid
  createdAt DateTime      @default(now()) @map("created_at")
  updatedAt DateTime      @updatedAt @map("updated_at")

  org       Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  owner     User?         @relation("VaultOwner", fields: [ownerId], references: [id])
  members   VaultMember[]
  hosts     Host[]
  credentials Credential[]
  snippets  Snippet[]

  @@index([orgId])
  @@map("vaults")
}

enum VaultPermission {
  read      // vê metadados
  use       // conecta, mas NUNCA lê a chave privada
  manage    // edita e revoga
}

model VaultMember {
  vaultId    String          @map("vault_id") @db.Uuid
  userId     String          @map("user_id") @db.Uuid
  permission VaultPermission
  wrappedVk  String          @map("wrapped_vk")   // Vault Key cifrada com a UMK deste usuário
  createdAt  DateTime        @default(now()) @map("created_at")

  vault      Vault           @relation(fields: [vaultId], references: [id], onDelete: Cascade)
  user       User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([vaultId, userId])
  @@map("vault_members")
}

enum CredentialKind {
  ssh_key
  password
}

enum KeyType {
  ed25519
  ecdsa
  rsa
}

model Credential {
  id                String         @id @default(uuid()) @db.Uuid
  vaultId           String         @map("vault_id") @db.Uuid
  name              String
  kind              CredentialKind
  keyType           KeyType?       @map("key_type")
  bits              Int?
  publicKey         String?        @map("public_key")           // texto puro, não é segredo
  fingerprintSha256 String?        @map("fingerprint_sha256")
  hasPassphrase     Boolean        @default(false) @map("has_passphrase")
  secretCiphertext  String         @map("secret_ciphertext")    // {v,iv,tag,data} cifrado com a VK
  createdAt         DateTime       @default(now()) @map("created_at")
  updatedAt         DateTime       @updatedAt @map("updated_at")

  vault             Vault          @relation(fields: [vaultId], references: [id], onDelete: Cascade)
  hosts             Host[]

  @@index([vaultId])
  @@map("credentials")
}

// -------------------------------------------------------------------- hosts

enum AuthMethod {
  key
  password
  agent
}

model Host {
  id              String        @id @default(uuid()) @db.Uuid
  vaultId         String        @map("vault_id") @db.Uuid
  label           String
  address         String
  port            Int           @default(22)
  username        String
  authMethod      AuthMethod    @map("auth_method")
  credentialId    String?       @map("credential_id") @db.Uuid
  jumpHostId      String?       @map("jump_host_id") @db.Uuid
  agentId         String?       @map("agent_id") @db.Uuid        // §12
  groupName       String?       @map("group_name")
  tags            String[]      @default([])
  osHint          String        @default("generic") @map("os_hint")
  startupCommand  String?       @map("startup_command")
  charset         String        @default("utf-8")
  keepalive       Boolean       @default(true)
  lastConnectedAt DateTime?     @map("last_connected_at")
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  vault           Vault         @relation(fields: [vaultId], references: [id], onDelete: Cascade)
  credential      Credential?   @relation(fields: [credentialId], references: [id], onDelete: SetNull)
  jumpHost        Host?         @relation("JumpChain", fields: [jumpHostId], references: [id], onDelete: SetNull)
  jumpFor         Host[]        @relation("JumpChain")
  agent           Agent?        @relation(fields: [agentId], references: [id], onDelete: SetNull)
  sessions        Session[]
  forwards        PortForward[]

  @@index([vaultId, groupName])
  @@map("hosts")
}

model KnownHost {
  id                String       @id @default(uuid()) @db.Uuid
  orgId             String       @map("org_id") @db.Uuid
  address           String
  port              Int
  keyType           String       @map("key_type")          // ssh-ed25519, ecdsa-sha2-nistp256…
  publicKeyB64      String       @map("public_key_b64")
  fingerprintSha256 String       @map("fingerprint_sha256")
  trustedById       String?      @map("trusted_by") @db.Uuid
  trustedAt         DateTime     @default(now()) @map("trusted_at")

  org               Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  trustedBy         User?        @relation(fields: [trustedById], references: [id])

  @@unique([orgId, address, port, keyType])
  @@map("known_hosts")
}

// ----------------------------------------------------------------- sessões

enum SessionStatus {
  connecting
  open
  detached
  closed
  error
}

model Session {
  id           String        @id @default(uuid()) @db.Uuid
  hostId       String?       @map("host_id") @db.Uuid
  userId       String        @map("user_id") @db.Uuid
  orgId        String        @map("org_id") @db.Uuid
  status       SessionStatus
  nodeId       String?       @map("node_id")        // qual instância segura o socket
  cols         Int           @default(80)
  rows         Int           @default(24)
  recordingUrl String?       @map("recording_url")  // s3://…/sessao.cast
  errorMessage String?       @map("error_message")
  openedAt     DateTime      @default(now()) @map("opened_at")
  closedAt     DateTime?     @map("closed_at")

  host         Host?         @relation(fields: [hostId], references: [id], onDelete: SetNull)
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  org          Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([userId, status])
  @@index([orgId, openedAt])
  @@map("sessions")
}

// ------------------------------------------------------------------- resto

model Snippet {
  id             String   @id @default(uuid()) @db.Uuid
  vaultId        String   @map("vault_id") @db.Uuid
  name           String
  command        String
  tag            String?
  requireConfirm Boolean  @default(true) @map("require_confirm")  // "Pedir confirmação antes de rodar"
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  vault     Vault    @relation(fields: [vaultId], references: [id], onDelete: Cascade)

  @@map("snippets")
}

enum ForwardKind {
  local
  remote
  dynamic
}

model PortForward {
  id          String      @id @default(uuid()) @db.Uuid
  hostId      String      @map("host_id") @db.Uuid
  userId      String      @map("user_id") @db.Uuid
  kind        ForwardKind
  label       String?
  bindAddress String      @default("127.0.0.1") @map("bind_address")
  bindPort    Int         @map("bind_port")
  targetHost  String?     @map("target_host")
  targetPort  Int?        @map("target_port")
  enabled     Boolean     @default(false)
  createdAt   DateTime    @default(now()) @map("created_at")

  host        Host        @relation(fields: [hostId], references: [id], onDelete: Cascade)
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("port_forwards")
}

model Agent {
  id            String       @id @default(uuid()) @db.Uuid
  orgId         String       @map("org_id") @db.Uuid
  name          String
  tokenHash     String       @map("token_hash")
  cidr          String?                                    // faixa padrão sugerida no escaneamento
  lastSeenAt    DateTime?    @map("last_seen_at")          // heartbeat a cada 20 s
  version       String?
  createdAt     DateTime     @default(now()) @map("created_at")

  org           Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  hosts         Host[]

  @@map("agents")
}

/// Tudo que a aba Ajustes e a tela Aparência editam. Fica no servidor
/// porque o usuário troca de aparelho e espera o mesmo terminal.
model UserSettings {
  userId              String   @id @map("user_id") @db.Uuid
  theme               String   @default("nordeste-dark")
  fontFamily          String   @default("SF Mono") @map("font_family")
  fontSize            Float    @default(12.5) @map("font_size")
  ligatures           Boolean  @default(false)
  bellSound           Boolean  @default(false) @map("bell_sound")
  keybarLayout        Json     @default("[]") @map("keybar_layout")   // ordem/teclas personalizadas
  biometricUnlock     Boolean  @default(true) @map("biometric_unlock")
  autolockMinutes     Int      @default(5) @map("autolock_minutes")
  requireBioPerSession Boolean @default(false) @map("require_bio_per_session")
  recordSessions      Boolean  @default(true) @map("record_sessions")
  warnOnHostKeyChange Boolean  @default(true) @map("warn_on_host_key_change")
  blockOnHostKeyChange Boolean @default(true) @map("block_on_host_key_change")
  updatedAt           DateTime @updatedAt @map("updated_at")

  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_settings")
}

/// Link temporário de uma gravação ("Compartilhar" na tela de reprodução)
model RecordingShare {
  id        String   @id @default(uuid()) @db.Uuid
  sessionId String   @map("session_id") @db.Uuid
  token     String   @unique
  expiresAt DateTime @map("expires_at")
  createdBy String   @map("created_by") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")

  @@index([expiresAt])
  @@map("recording_shares")
}

model Device {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  name       String?                                   // "iPhone 15 de Mateus"
  platform   String?
  pushToken  String?   @map("push_token")
  lastSeenAt DateTime? @map("last_seen_at")
  revokedAt  DateTime? @map("revoked_at")           // "Dispositivos conectados" → revogar
  createdAt  DateTime  @default(now()) @map("created_at")

  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("devices")
}

model AuditLog {
  id          BigInt        @id @default(autoincrement())
  orgId       String?       @map("org_id") @db.Uuid
  userId      String?       @map("user_id") @db.Uuid
  action      String                                    // session.open, credential.read…
  subjectType String?       @map("subject_type")
  subjectId   String?       @map("subject_id") @db.Uuid
  metadata    Json          @default("{}")
  ip          String?
  createdAt   DateTime      @default(now()) @map("created_at")

  org         Organization? @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user        User?         @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([orgId, createdAt])
  @@map("audit_logs")
}
```

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 3.2 PrismaService no Nest

```ts
// src/prisma/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: [{ emit: 'event', level: 'query' }, 'warn', 'error'],
    });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}

// src/prisma/prisma.module.ts
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

### 3.3 Cuidados específicos de Prisma neste projeto

**1. Log de query é vazamento de credencial.** O `log: ['query']` do Prisma imprime os parâmetros. `secretCiphertext` é cifrado, mas `passwordHash` e `mfaSecret` não deveriam sair em log nenhum. Filtre antes de emitir:

```ts
this.$on('query', (e) => {
  if (/credentials|users/i.test(e.query)) return;   // nem sequer loga
  logger.debug({ ms: e.duration, query: e.query });
});
```

**2. `omit` global para o segredo nunca escapar por acidente.** Com Prisma 5.16+:

```ts
new PrismaClient({
  omit: {
    credential: { secretCiphertext: true },   // some de TODO findMany/findUnique
    user: { passwordHash: true, wrappedUmk: true, mfaSecret: true },
  },
});
```

E no único lugar que precisa do segredo (`VaultService.openCredential`), pede explicitamente:

```ts
const cred = await this.prisma.credential.findUniqueOrThrow({
  where: { id },
  omit: { secretCiphertext: false },     // opt-in consciente, fácil de auditar no code review
});
```

Isso é a maior vantagem do Prisma aqui: o segredo vira **opt-in por tipagem**, não disciplina de quem escreve o `select`.

**3. Pool de conexão.** O Prisma abre seu próprio pool (`num_cpus * 2 + 1` por padrão). Com várias instâncias do backend + RDS, você estoura `max_connections` rápido — o mesmo problema que já pegou você antes. Fixe na URL e use pgbouncer em `transaction` mode:

```
DATABASE_URL="postgresql://…/termix?schema=public&connection_limit=10&pool_timeout=20&pgbouncer=true"
```

Com pgbouncer em transaction mode, **desligue prepared statements** (`?pgbouncer=true` já faz isso no Prisma) e não use `$transaction` interativo longo.

**4. Reenvelopar cofre é transação.** Trocar a senha-mestra reescreve `wrappedUmk` + todos os `wrappedVk` do usuário. Tudo ou nada:

```ts
await this.prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id }, data: { wrappedUmk: novoUmk, mkSalt: novoSalt } });
  for (const m of membros) {
    await tx.vaultMember.update({
      where: { vaultId_userId: { vaultId: m.vaultId, userId: id } },
      data: { wrappedVk: reenvelopar(m, novaUmk) },
    });
  }
}, { timeout: 15000 });
```

**5. `BigInt` do `AuditLog` quebra `JSON.stringify`.** Coloque isso no bootstrap, senão o endpoint `/audit` retorna 500:

```ts
(BigInt.prototype as any).toJSON = function () { return this.toString(); };
```

**6. Prisma não tem `LISTEN/NOTIFY`.** O fan-out de sessões entre instâncias (§7.3) é Redis pub/sub, não banco.

---

## 4. Autenticação e multiusuário

### 4.1 Camadas de identidade

1. **Conta** — e-mail + senha (Argon2id) + TOTP opcional. Emite JWT.
2. **Organização** — tudo é escopado por `org_id`. Papéis: `owner`, `admin`, `operator`, `viewer`.
3. **Cofre (vault)** — unidade de compartilhamento. Um cofre pessoal por usuário + cofres de equipe.
4. **Permissão por cofre** — `read` (vê metadados), `use` (conecta, **nunca** lê a chave privada), `manage` (edita e revoga).

O papel `use` é a chave do negócio: o estagiário conecta no PROD sem nunca ter a chave privada em mãos. Revogar é remover a linha em `vault_members` — não precisa rotacionar chave em servidor nenhum.

### 4.2 Guard de permissão

```ts
// src/auth/vault-permission.guard.ts
@Injectable()
export class VaultPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<Permission>('permission', ctx.getHandler()) ?? 'read';
    const req = ctx.switchToHttp().getRequest();
    const vaultId = req.params.vaultId ?? req.body?.vaultId ?? req.vaultId;
    if (!vaultId) throw new BadRequestException('vaultId ausente');

    const row = await this.prisma.vaultMember.findFirst({
      where: {
        vaultId,
        userId: req.user.sub,
        vault: { orgId: req.user.orgId },   // impede acesso cruzado entre organizações
      },
      select: { permission: true },
    });

    if (!row) throw new ForbiddenException('Sem acesso a este cofre');
    const ordem = { read: 0, use: 1, manage: 2 };
    return ordem[row.permission] >= ordem[required];
  }
}

export const RequirePermission = (p: Permission) => SetMetadata('permission', p);
```

Toda operação sensível grava em `audit_logs` — isso é requisito, não enfeite. Um cliente SSH corporativo sem trilha de auditoria não passa em nenhuma revisão de segurança.

---

## 5. Cofre: como as chaves privadas são guardadas

### 5.1 Envelope de 3 níveis

```
Senha-mestra ──Argon2id(salt, m=64MB, t=3, p=4)──► KEK (nunca sai do RAM do servidor)
                                                     │
                                     descriptografa  ▼
                                              UMK (User Master Key, 32 bytes)
                                                     │
                                     descriptografa  ▼
                                    VK (Vault Key, uma por cofre)
                                                     │
                                     descriptografa  ▼
                                    chave privada SSH / senha do host
```

- `users.wrapped_umk` = `AES-256-GCM(UMK, key = KEK)`
- `vault_members.wrapped_vk` = `AES-256-GCM(VK, key = UMK-do-usuário)` — a mesma VK reenvelopada para cada membro. É isso que permite compartilhar sem duplicar segredo.
- `credentials.secret_ciphertext` = `AES-256-GCM(chave privada, key = VK)`

Trocar a senha-mestra reenvolve só a UMK. Remover alguém do cofre apaga o `wrapped_vk` dele. Nada mais precisa mudar.

### 5.2 Onde a KEK vive

O SSH é feito no servidor, então **o servidor precisa da chave privada em texto claro no momento do handshake**. Não existe E2EE puro aqui — quem prometer isso e mesmo assim conectar por você está mentindo. Seja honesto no marketing e escolha:

| Estratégia | Como | Trade-off |
|---|---|---|
| **A — Sessão em memória** (recomendado) | A senha-mestra é enviada no login, deriva a KEK, que fica só em RAM (Redis com TTL curto, chave por sessão). Ao expirar, o usuário reautentica. | Segredo nunca em disco; reinício do pod exige reautenticar. |
| **B — KMS** | A KEK vem do AWS KMS / Vault. | Operacionalmente simples, mas quem controla o KMS lê tudo. |
| **C — Certificados SSH efêmeros** (alvo final) | Uma CA SSH assina certificados de 60 s por conexão. Não existe chave privada persistida por host. | Melhor postura de segurança do mercado; exige configurar `TrustedUserCAKeys` nos servidores. |

Comece com A. Deixe C no roadmap — para PROD da Invent, é o caminho certo.

```ts
// src/vault/crypto.util.ts
import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

export async function deriveKek(masterPassword: string, salt: Buffer): Promise<Buffer> {
  return argon2.hash(masterPassword, {
    type: argon2.argon2id, salt, raw: true, hashLength: 32,
    memoryCost: 65536, timeCost: 3, parallelism: 4,
  }) as unknown as Buffer;
}

export function seal(plaintext: Buffer, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(plaintext), c.final()]);
  return JSON.stringify({
    v: 1, iv: iv.toString('base64'),
    tag: c.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  });
}

export function open(envelope: string, key: Buffer): Buffer {
  const { iv, tag, data } = JSON.parse(envelope);
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]);
}
```

**Regras invioláveis**
- A chave privada **nunca** entra numa resposta HTTP. Nenhum endpoint retorna `secret_ciphertext` decifrado.
- Zere o buffer (`buf.fill(0)`) assim que o handshake terminar.
- `LOG_LEVEL=debug` não pode imprimir credencial: crie um interceptor que redija `secret`, `password`, `passphrase`, `privateKey`.
- Sem `console.log(config)` no `SshService`. Nunca.

---

## 6. API REST (NestJS)

```
POST   /auth/register                     { email, name, password, orgName }
POST   /auth/login                        { email, password, totp? } → { access, refresh, user, orgs }
POST   /auth/refresh                      { refresh }
POST   /auth/unlock                       { masterPassword } → destrava o cofre na sessão (§5.2-A)
POST   /auth/logout
GET    /auth/me
POST   /auth/mfa/setup                    → { otpauthUrl, qr }
POST   /auth/mfa/verify                   { code } → ativa TOTP
DELETE /auth/mfa                          { password }
POST   /auth/master-password              { atual, nova } → reenvelopa UMK + todos os wrappedVk
POST   /auth/recovery-code                → gera código novo (mostrado UMA vez)
POST   /auth/recover                      { email, recoveryCode, novaSenha }

GET    /settings                          → preferências de terminal/segurança do usuário
PATCH  /settings                          { theme, fontSize, keybarLayout, autolockMinutes, … }

GET    /devices                           → "Dispositivos conectados"
DELETE /devices/:id                       → revoga o refresh token daquele aparelho
DELETE /devices                           → "Encerrar em todos os outros" (mantém o atual)
GET    /auth/recovery-code/pdf            → PDF do código, gerado sob demanda, nunca armazenado

GET    /orgs/:orgId/members
POST   /orgs/:orgId/invites               { email, role }
PATCH  /orgs/:orgId/members/:userId       { role }
DELETE /orgs/:orgId/members/:userId

GET    /vaults
POST   /vaults                            { name }
POST   /vaults/:vaultId/members           { userId, permission }
DELETE /vaults/:vaultId/members/:userId

GET    /hosts?vaultId=&q=&group=&tag=
POST   /hosts
GET    /hosts/:id
PATCH  /hosts/:id
DELETE /hosts/:id
POST   /hosts/:id/test                    → testa TCP + host key, sem abrir shell
POST   /hosts/import/ssh-config           { content } → parseia ~/.ssh/config
POST   /hosts/:id/duplicate
GET    /hosts/:id/ssh-command             → string `ssh user@host -p 2222` para copiar
POST   /hosts/scan                        { agentId, cidr, ports } → varre a LAN pelo agente (§12)
POST   /hosts/bulk                        { vaultId, hosts[] } → "Adicionar selecionados" do escaneamento
PATCH  /hosts/:id/vault                   { vaultId } → move o host entre cofres ("Compartilhar com")
GET    /groups?vaultId=                   → nomes distintos de grupo, para o seletor

GET    /agents                            → agentes instalados, status, versão
POST   /agents                            { name } → { installCommand, token }
POST   /agents/:id/token                  → renova o token de registro
DELETE /agents/:id

GET    /credentials?vaultId=
POST   /credentials/generate              { vaultId, name, type:'ed25519', passphrase? }
POST   /credentials/import                { vaultId, name, privateKey, passphrase? }
GET    /credentials/:id/public            → texto da chave pública (não é segredo)
POST   /credentials/:id/deploy            { hostId } → ssh-copy-id via sessão existente
DELETE /credentials/:id

GET    /known-hosts
DELETE /known-hosts/:id                   → "esquecer" a chave do host

GET    /sessions                          → sessões ativas/detached do usuário
POST   /sessions                          { hostId, cols, rows } → { sessionId }
DELETE /sessions/:id
GET    /sessions/:id/recording            → .cast assinado (S3 presigned)
POST   /sessions/:id/recording/share      { ttlHours } → link público temporário (RecordingShare)

GET    /snippets?vaultId=
POST   /snippets
PATCH  /snippets/:id
DELETE /snippets/:id
POST   /snippets/:id/run                  { sessionId } → injeta o comando no stream

GET    /port-forwards
POST   /port-forwards
PATCH  /port-forwards/:id                 { enabled }

GET    /sftp/:sessionId/list?path=/home/deploy
GET    /sftp/:sessionId/read?path=        → conteúdo de texto (editor no app, limite 1 MB)
PUT    /sftp/:sessionId/write             { path, content }
POST   /sftp/:sessionId/download          { path } → presigned URL
POST   /sftp/:sessionId/upload            multipart
POST   /sftp/:sessionId/mkdir | /rename | /delete | /chmod

GET    /audit?from=&to=&action=&userId=&category=conexoes|cofre|alertas
GET    /audit.csv?…                       → mesma consulta, exportada (stream, sem carregar em memória)
```

---

## 7. O gateway WebSocket (coração do sistema)

### 7.1 Protocolo

Namespace `/terminal`, autenticado por JWT no handshake.

**Cliente → servidor**
| Evento | Payload | Observação |
|---|---|---|
| `session:attach` | `{ sessionId }` | reconecta numa sessão viva |
| `session:open` | `{ hostId, cols, rows }` | cria e conecta |
| `data` | `{ sessionId, b64 }` | teclas digitadas, base64 (preserva bytes de controle) |
| `resize` | `{ sessionId, cols, rows }` | dispara `SIGWINCH` |
| `hostkey:trust` | `{ sessionId, fingerprint }` | resposta ao TOFU |
| `session:close` | `{ sessionId }` | |

**Servidor → cliente**
| Evento | Payload |
|---|---|
| `status` | `{ sessionId, state:'connecting'\|'open'\|'closed'\|'error', message? }` |
| `hostkey:unknown` | `{ sessionId, fingerprint, keyType, address }` → app mostra o alerta de confiança |
| `data` | `{ sessionId, b64 }` |
| `replay` | `{ sessionId, b64 }` — buffer dos últimos 256 KB ao reconectar |
| `exit` | `{ sessionId, code, signal }` |

Sempre **base64**. `JSON.stringify` de bytes brutos corrompe sequências ANSI e UTF-8 partido no meio de um chunk.

### 7.2 Gateway

```ts
// src/terminal/terminal.gateway.ts
@WebSocketGateway({ namespace: '/terminal', cors: { origin: '*' } })
export class TerminalGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(TerminalGateway.name);

  constructor(
    private readonly ssh: SshService,
    private readonly sessions: SessionService,
    private readonly jwt: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      client.data.user = await this.jwt.verifyAsync(token);
    } catch {
      client.emit('status', { state: 'error', message: 'Token inválido' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    // NÃO mata a sessão SSH: entra em modo "detached" com carência.
    for (const sessionId of client.data.attached ?? []) {
      this.ssh.detach(sessionId);
    }
  }

  @SubscribeMessage('session:open')
  async open(@ConnectedSocket() client: Socket, @MessageBody() dto: OpenSessionDto) {
    const { sub: userId, orgId } = client.data.user;
    const session = await this.sessions.create({ userId, orgId, hostId: dto.hostId, ...dto });

    client.join(session.id);
    (client.data.attached ??= new Set()).add(session.id);
    client.emit('status', { sessionId: session.id, state: 'connecting' });

    await this.ssh.connect(session.id, {
      userId,
      cols: dto.cols,
      rows: dto.rows,
      onData: (chunk) =>
        client.nsp.to(session.id).emit('data', { sessionId: session.id, b64: chunk.toString('base64') }),
      onStatus: (state, message) =>
        client.nsp.to(session.id).emit('status', { sessionId: session.id, state, message }),
      onHostKeyUnknown: (info) =>
        client.emit('hostkey:unknown', { sessionId: session.id, ...info }),
      onExit: (code, signal) =>
        client.nsp.to(session.id).emit('exit', { sessionId: session.id, code, signal }),
    });
  }

  @SubscribeMessage('session:attach')
  async attach(@ConnectedSocket() client: Socket, @MessageBody() { sessionId }: { sessionId: string }) {
    await this.sessions.assertOwner(sessionId, client.data.user.sub);
    client.join(sessionId);
    (client.data.attached ??= new Set()).add(sessionId);
    const buffer = this.ssh.replayBuffer(sessionId);
    client.emit('replay', { sessionId, b64: buffer.toString('base64') });
    client.emit('status', { sessionId, state: 'open' });
  }

  @SubscribeMessage('data')
  data(@MessageBody() { sessionId, b64 }: { sessionId: string; b64: string }) {
    this.ssh.write(sessionId, Buffer.from(b64, 'base64'));
  }

  @SubscribeMessage('resize')
  resize(@MessageBody() { sessionId, cols, rows }: ResizeDto) {
    this.ssh.resize(sessionId, cols, rows);
  }

  @SubscribeMessage('hostkey:trust')
  trust(@MessageBody() { sessionId, fingerprint }: TrustDto, @ConnectedSocket() client: Socket) {
    return this.ssh.trustHostKey(sessionId, fingerprint, client.data.user);
  }
}
```

### 7.3 SshService — a ponta que fala SSH de verdade

```ts
// src/terminal/ssh.service.ts
import { Client, ClientChannel } from 'ssh2';
import { createHash } from 'node:crypto';

interface Live {
  conn: Client;
  stream?: ClientChannel;
  jump?: Client;
  buffer: Buffer[];       // ring buffer p/ replay
  bufferBytes: number;
  detachTimer?: NodeJS.Timeout;
  recorder?: CastRecorder;
}

@Injectable()
export class SshService {
  private readonly live = new Map<string, Live>();
  private static readonly MAX_BUFFER = 256 * 1024;
  private static readonly DETACH_GRACE_MS = 10 * 60 * 1000;

  constructor(
    private readonly hosts: HostsService,
    private readonly vault: VaultService,
    private readonly knownHosts: KnownHostsService,
    private readonly audit: AuditService,
  ) {}

  async connect(sessionId: string, opts: ConnectOpts) {
    const session = await this.hosts.loadSessionContext(sessionId);
    const host = session.host;

    // 1) credencial descriptografada só agora, só aqui
    const cred = host.auth_method === 'key'
      ? await this.vault.openCredential(host.credential_id, opts.userId)
      : null;

    const conn = new Client();
    const entry: Live = { conn, buffer: [], bufferBytes: 0 };
    this.live.set(sessionId, entry);

    const config: any = {
      host: host.address,
      port: host.port,
      username: host.username,
      keepaliveInterval: host.keepalive ? 15000 : 0,
      keepaliveCountMax: 3,
      readyTimeout: 20000,
      algorithms: {
        // sem ssh-rsa/sha1, sem diffie-hellman-group1
        serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256'],
      },
      hostVerifier: (key: Buffer, cb: (ok: boolean) => void) => {
        const fp = 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
        this.knownHosts.verify(session.org_id, host, fp, key).then((veredito) => {
          if (veredito === 'known') return cb(true);
          if (veredito === 'changed') {
            opts.onStatus('error', 'A chave do host MUDOU. Possível ataque man-in-the-middle.');
            return cb(false);
          }
          // desconhecido: pergunta ao usuário (TOFU) e segura o handshake
          entry.pendingHostKey = { fp, key, resolve: cb };
          opts.onHostKeyUnknown({ fingerprint: fp, keyType: keyTypeOf(key), address: host.address });
        });
      },
    };

    if (host.auth_method === 'agent') {
      // usa o ssh-agent do próprio backend (chaves já carregadas) e permite
      // encaminhá-lo para o host — é o toggle "Encaminhar agente (-A)".
      config.agent = process.env.SSH_AUTH_SOCK;
      config.agentForward = true;                      // só ligue em host confiável
    } else if (cred) {
      config.privateKey = cred.privateKey;             // Buffer
      if (cred.passphrase) config.passphrase = cred.passphrase;
    } else if (host.auth_method === 'password') {
      config.password = (await this.vault.openCredential(host.credential_id, opts.userId)).password;
    }

    conn
      .on('ready', () => {
        cred?.privateKey?.fill(0);                     // zera o segredo do RAM
        conn.shell(
          { term: 'xterm-256color', cols: opts.cols, rows: opts.rows },
          (err, stream) => {
            if (err) return opts.onStatus('error', err.message);
            entry.stream = stream;
            entry.recorder = new CastRecorder(sessionId, opts.cols, opts.rows);
            opts.onStatus('open');
            if (host.startup_command) stream.write(host.startup_command + '\n');

            stream.on('data', (chunk: Buffer) => {
              this.pushBuffer(entry, chunk);
              entry.recorder!.write(chunk);
              opts.onData(chunk);
            });
            stream.stderr.on('data', (c: Buffer) => opts.onData(c));
            stream.on('close', (code, signal) => {
              entry.recorder?.finish();
              opts.onExit(code, signal);
              this.destroy(sessionId);
            });
          },
        );
      })
      .on('error', (e) => opts.onStatus('error', traduzErro(e)))
      .on('close', () => this.destroy(sessionId));

    // 2) jump host: encadeia forwardOut antes de conectar no destino
    if (host.jump_host_id) {
      const jump = await this.openJump(host.jump_host_id, opts.userId);
      entry.jump = jump;
      jump.forwardOut('127.0.0.1', 0, host.address, host.port, (err, sock) => {
        if (err) return opts.onStatus('error', 'Falha no jump host: ' + err.message);
        conn.connect({ ...config, sock });
      });
    } else {
      conn.connect(config);
    }

    await this.audit.log({ action: 'session.open', userId: opts.userId, subjectId: host.id });
  }

  write(sessionId: string, data: Buffer) {
    this.live.get(sessionId)?.stream?.write(data);
  }

  resize(sessionId: string, cols: number, rows: number) {
    this.live.get(sessionId)?.stream?.setWindow(rows, cols, 0, 0);
  }

  /** app foi para background: mantém o SSH vivo por um tempo */
  detach(sessionId: string) {
    const e = this.live.get(sessionId);
    if (!e) return;
    e.detachTimer = setTimeout(() => this.destroy(sessionId), SshService.DETACH_GRACE_MS);
  }

  replayBuffer(sessionId: string): Buffer {
    const e = this.live.get(sessionId);
    if (!e) return Buffer.alloc(0);
    clearTimeout(e.detachTimer);
    return Buffer.concat(e.buffer);
  }

  private pushBuffer(e: Live, chunk: Buffer) {
    e.buffer.push(chunk);
    e.bufferBytes += chunk.length;
    while (e.bufferBytes > SshService.MAX_BUFFER) {
      e.bufferBytes -= e.buffer.shift()!.length;
    }
  }

  private destroy(sessionId: string) {
    const e = this.live.get(sessionId);
    e?.stream?.end();
    e?.conn.end();
    e?.jump?.end();
    this.live.delete(sessionId);
  }
}
```

**Detalhes que só aparecem em produção**

- `keepaliveInterval: 15000` — sem isso, firewall/NAT derruba a conexão em silêncio.
- `setWindow(rows, cols, 0, 0)` — a ordem é **linhas antes de colunas**. Trocar faz o `vim` desenhar torto e é um bug difícil de achar.
- `stream.stderr` é separado; se esquecer, mensagens de erro somem.
- `hostVerifier` bloqueia o handshake até responder — é onde o TOFU acontece.
- Nunca use `algorithms` default sem podar SHA-1.
- Um `Map` em memória só funciona com **uma instância**. Com várias, use sticky sessions no load balancer ou guarde `sessions.node_id` e roteie por ele (Redis pub/sub para o fan-out).

### 7.4 Gravação de sessão (asciinema v2)

```ts
class CastRecorder {
  private readonly t0 = Date.now();
  private readonly chunks: string[] = [];
  constructor(private id: string, cols: number, rows: number) {
    this.chunks.push(JSON.stringify({ version: 2, width: cols, height: rows, timestamp: Math.floor(this.t0 / 1000) }));
  }
  write(buf: Buffer) {
    const t = (Date.now() - this.t0) / 1000;
    this.chunks.push(JSON.stringify([t, 'o', buf.toString('utf8')]));
  }
  async finish() { /* junta com \n e sobe pro S3 → sessions.recording_url */ }
}
```

Formato aberto: qualquer player asciinema reproduz. Auditoria de graça.

### 7.5 Encaminhamento de portas — o que muda no celular

Aqui existe uma mentira confortável que precisa ser dita em voz alta: **no iPhone não dá para "abrir a porta 5432 local"**. Nenhum app de App Store bind uma porta e serve para outros apps do aparelho; em Expo Go, muito menos.

O que acontece de verdade, e como apresentar isso na interface:

| Tipo | Onde o `bind` realmente acontece | Serve para quê |
|---|---|---|
| **Local (-L)** | No **backend**, não no telefone | O backend expõe `https://termix.app/t/<id>/` fazendo proxy do serviço remoto. O app abre isso numa WebView. É como você vê o Grafana pelo bastion. |
| **Remoto (-R)** | No host remoto (`conn.forwardIn`) | Expor um serviço do backend para dentro da rede do cliente |
| **Dinâmico (-D)** | Backend vira SOCKS5 | Útil só para outro cliente configurado, não para o telefone |

```ts
// local: backend abre um listener e cada conexão vira um canal SSH
const server = net.createServer((sock) => {
  conn.forwardOut('127.0.0.1', 0, rule.targetHost, rule.targetPort, (err, stream) => {
    if (err) return sock.destroy();
    sock.pipe(stream).pipe(sock);
  });
});
server.listen(rule.bindPort, '127.0.0.1');

// remoto: o host remoto passa a escutar e nos entrega as conexões
conn.forwardIn('0.0.0.0', rule.bindPort, (err) => { /* … */ });
conn.on('tcp connection', (info, accept) => { const s = accept(); /* pipe */ });
```

**Regra de segurança:** nunca faça `listen` em `0.0.0.0` no backend por padrão. Um túnel para o Postgres de produção escutando na interface pública do seu servidor é um incidente esperando acontecer. Bind em `127.0.0.1` + proxy autenticado por JWT.

Na interface, chame de **"Abrir serviço"**, não de "porta local" — o usuário quer ver o Grafana, não configurar `-L`.

---

## 8. O app: terminal dentro do Expo Go

### 8.1 Por que WebView + xterm.js

Renderizar terminal em RN puro significa reimplementar parser ANSI, seleção de texto, scrollback, largura de caracteres CJK e emoji. O xterm.js já faz isso há dez anos e é o que o VS Code usa. Dentro de uma `WebView` ele roda liso, e a `WebView` é parte do Expo Go.

O HTML fica **embutido como string** no bundle JS (nada de servidor local, nada de asset externo). O xterm vem de CDN na primeira carga e é cacheado — ou, melhor, você inclui o UMD minificado como string base64 no app para funcionar offline.

```
RN (JS)  ──postMessage({type:'write', b64})──►  WebView (xterm.js)
RN (JS)  ◄─postMessage({type:'input', b64})──   WebView (onData do xterm)
RN (JS)  ◄─postMessage({type:'resize', c, r})─  WebView (FitAddon)
```

### 8.2 O HTML do terminal

```ts
// src/terminal/terminalHtml.ts
export const terminalHtml = (theme: Theme, fontSize: number) => `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css">
<style>
  html,body,#t{margin:0;padding:0;height:100%;background:${theme.background};overflow:hidden}
  .xterm-viewport::-webkit-scrollbar{width:0}
</style>
</head><body>
<div id="t"></div>
<script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.js"></script>
<script>
  const term = new Terminal({
    fontFamily: 'Menlo, "SF Mono", monospace',
    fontSize: ${fontSize},
    lineHeight: 1.25,
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: true,
    theme: ${JSON.stringify(theme)},
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());
  term.open(document.getElementById('t'));
  fit.fit();

  const post = (msg) => window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  const b64  = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

  term.onData(d => post({ type: 'input', b64: b64(d) }));
  term.onResize(({ cols, rows }) => post({ type: 'resize', cols, rows }));

  // RN → WebView
  document.addEventListener('message', handle);   // Android
  window.addEventListener('message', handle);     // iOS
  function handle(e) {
    const m = JSON.parse(e.data);
    if (m.type === 'write') term.write(Uint8Array.from(atob(m.b64), c => c.charCodeAt(0)));
    if (m.type === 'clear') term.clear();
    if (m.type === 'fit')   { fit.fit(); }
    if (m.type === 'font')  { term.options.fontSize = m.size; fit.fit(); }
    if (m.type === 'theme') { term.options.theme = m.theme; }
    if (m.type === 'focus') term.focus();
  }
  new ResizeObserver(() => fit.fit()).observe(document.body);
  post({ type: 'ready', cols: term.cols, rows: term.rows });
</script>
</body></html>`;
```

> `term.write` com `Uint8Array` faz o xterm decodificar UTF-8 sozinho — é o que evita acento quebrado quando um caractere multibyte é cortado entre dois chunks TCP.

### 8.3 O componente RN

```tsx
// src/terminal/TerminalScreen.tsx
export default function TerminalScreen({ route }) {
  const { hostId, sessionId: existing } = route.params;
  const webRef = useRef<WebView>(null);
  const [state, setState] = useState<'connecting' | 'open' | 'error'>('connecting');
  const [hostKey, setHostKey] = useState<HostKeyPrompt | null>(null);
  const sessionId = useRef<string | null>(existing ?? null);
  const socket = useSocket();               // socket.io singleton com o JWT

  const toTerm = (msg: object) => webRef.current?.postMessage(JSON.stringify(msg));

  useEffect(() => {
    const onData   = (p) => p.sessionId === sessionId.current && toTerm({ type: 'write', b64: p.b64 });
    const onReplay = (p) => { toTerm({ type: 'clear' }); toTerm({ type: 'write', b64: p.b64 }); };
    const onStatus = (p) => { setState(p.state); if (p.state === 'error') Alert.alert('Conexão', p.message); };
    const onKey    = (p) => setHostKey(p);

    socket.on('data', onData);
    socket.on('replay', onReplay);
    socket.on('status', onStatus);
    socket.on('hostkey:unknown', onKey);
    return () => { socket.off('data', onData); socket.off('replay', onReplay);
                   socket.off('status', onStatus); socket.off('hostkey:unknown', onKey); };
  }, []);

  // reanexa quando o app volta do background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && sessionId.current) {
        socket.connect();
        socket.emit('session:attach', { sessionId: sessionId.current });
      }
    });
    return () => sub.remove();
  }, []);

  const onWebMessage = (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data);
    if (m.type === 'ready') {
      if (sessionId.current) socket.emit('session:attach', { sessionId: sessionId.current });
      else socket.emit('session:open', { hostId, cols: m.cols, rows: m.rows },
                       (ack) => { sessionId.current = ack.sessionId; });
    }
    if (m.type === 'input')  socket.emit('data',   { sessionId: sessionId.current, b64: m.b64 });
    if (m.type === 'resize') socket.emit('resize', { sessionId: sessionId.current, cols: m.cols, rows: m.rows });
  };

  const sendKey = (seq: string) =>
    socket.emit('data', { sessionId: sessionId.current, b64: base64.encode(seq) });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <WebView
        ref={webRef}
        source={{ html: terminalHtml(theme, fontSize), baseUrl: 'https://localhost' }}
        onMessage={onWebMessage}
        originWhitelist={['*']}
        javaScriptEnabled
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        scrollEnabled={false}
        style={{ backgroundColor: theme.background }}
      />
      <KeyBar onKey={sendKey} onSnippets={() => sheetRef.current?.present()} />
    </KeyboardAvoidingView>
  );
}
```

### 8.4 Barra de teclas — o item que decide se o app presta

Sem `Esc`, `Tab`, `Ctrl` e setas, nenhum terminal é usável no iPhone. É a peça mais copiada do Termius e a que mais dá retorno.

```tsx
const CTRL = (letra: string) => String.fromCharCode(letra.toUpperCase().charCodeAt(0) - 64); // ^C = \x03

const LINHA_1 = [
  { l: 'esc', seq: '\x1b' }, { l: 'ctrl', toggle: true }, { l: 'alt', toggle: true },
  { l: 'tab', seq: '\t' }, { l: '|', seq: '|' }, { l: '~', seq: '~' },
  { l: '/', seq: '/' }, { l: '-', seq: '-' }, { l: "'", seq: "'" },
];
const LINHA_2 = [
  { l: '↑', seq: '\x1b[A' }, { l: '↓', seq: '\x1b[B' },
  { l: '←', seq: '\x1b[D' }, { l: '→', seq: '\x1b[C' },
  { l: '^C', seq: CTRL('c') }, { l: '^D', seq: CTRL('d') },
  { l: '^L', seq: CTRL('l') }, { l: '^R', seq: CTRL('r') },
];

export function KeyBar({ onKey, onSnippets }) {
  const [ctrl, setCtrl] = useState(false);
  const press = (k) => {
    Haptics.selectionAsync();
    if (k.toggle) return setCtrl((v) => !v);
    if (ctrl && k.seq.length === 1) { onKey(CTRL(k.seq)); return setCtrl(false); }
    onKey(k.seq);
  };
  /* ScrollView horizontal por linha, teclas de 33×33, gap 5 — ver protótipo */
}
```

Detalhes que importam:
- `Ctrl` é **modificador com trava de um toque**: liga, próxima tecla vira control, desliga.
- Segurar as setas repete (`setInterval` de 90 ms em `onPressIn`).
- A barra vive acima do teclado do sistema, não dentro dele. Em iOS use `KeyboardAvoidingView behavior="padding"` + `hideKeyboardAccessoryView` na WebView, ou `react-native-keyboard-controller` (dev build) para colar de verdade.
- `keyboardDisplayRequiresUserAction={false}` permite `term.focus()` abrir o teclado programaticamente no iOS.

### 8.5 Segurança no dispositivo

```ts
// tokens no Keychain, nunca em AsyncStorage
await SecureStore.setItemAsync('refresh', token, {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});

// desbloqueio biométrico do cofre
const r = await LocalAuthentication.authenticateAsync({
  promptMessage: 'Desbloquear cofre',
  disableDeviceFallback: false,
});
```

- A senha-mestra **nunca** é persistida no aparelho. Guarde só um "unlock token" de curta duração, protegido por Face ID.
- Ao entrar em background, borre a tela do terminal (`AppState` + overlay) — evita vazar segredo no screenshot do multitarefas do iOS.
- Auto-lock em 5 min derruba o unlock token, mas **não** a sessão SSH (que vive no servidor).

### 8.6 Regras de mobile (o que separa "responsivo" de "app")

O protótipo já implementa cada item desta lista. Cada linha tem o equivalente em React Native.

| Problema real no telefone | No protótipo (web) | No app (RN/Expo) |
|---|---|---|
| **Teclado virtual cobre o prompt.** A `window.innerHeight` não muda quando o teclado sobe. | `visualViewport.onresize` → ajusta a altura do container e rola o terminal | `KeyboardAvoidingView behavior="padding"` + `useAnimatedKeyboard` (reanimated); em dev build, `react-native-keyboard-controller` cola a barra no teclado |
| **iOS dá zoom automático em input com fonte < 16px.** Fatal num terminal de 11px. | input com `font-size:16px` real + `transform:scale(.72)` | `TextInput` com `fontSize:16` e `transform:[{scale}]`, ou o input dentro da própria WebView (o xterm já resolve) |
| **Barra de status, notch e barra de gestos.** | `env(safe-area-inset-*)` + `viewport-fit=cover` | `useSafeAreaInsets()` do `react-native-safe-area-context` |
| **Altura do navegador muda ao rolar.** | `100dvh` em vez de `100vh` | não se aplica |
| **Voltar sem botão.** Arrastar da borda esquerda é o gesto padrão do iOS. | listener de `touchstart` em `x < 28px` com arraste ao vivo e limiar de 72px | React Navigation dá de graça (`gestureEnabled`); só garanta que a WebView não engula o gesto (`gestureResponseDistance`) |
| **Não existe clique direito nem hover.** | toque longo de 480 ms com háptico em `[data-lp]` | `Pressable onLongPress` + `Haptics.impactAsync` |
| **Mudar o tamanho da fonte no meio de um `tail -f`.** | pinça sobre a saída altera `--term-fs` | `PinchGestureHandler` → `postMessage({type:'font'})` para o xterm |
| **Alvos de toque pequenos.** As teclas de controle são o que mais se usa. | 37×37 px, `touch-action:manipulation` (mata o atraso de 300 ms) | mínimo 44×44 pt segundo o HIG; use `hitSlop` |
| **Paisagem.** Comum ao digitar comando longo. | media query `max-height:520px` reduz nav/tab e a barra | `expo-screen-orientation` liberando paisagem só na tela do terminal |
| **Rolagem elástica derrubando a tela.** | `overscroll-behavior:none` + `overscroll-behavior:contain` nas listas | `bounces={false}` nas listas de chrome |
| **App no multitarefas mostra segredo na miniatura.** | — | `AppState` → overlay com blur + `expo-blur`; obrigatório neste produto |
| **Prompt precisa ficar colado na saída, não no rodapé.** | linha de input dentro do mesmo scroller | o xterm já faz isso nativamente |

**Coisas que não existem no telefone e precisam de substituto explícito:**

- **Copiar/colar** — o gesto de seleção no xterm dentro da WebView é problemático. Solução: menu "Copiar toda a saída" + seleção por toque longo com `term.getSelection()` → `expo-clipboard`.
- **`Ctrl` como modificador contínuo** — vira trava de um toque (liga, próxima tecla, desliga).
- **Setas com repetição** — `onPressIn` com `setInterval(90ms)`, senão navegar no histórico é sofrível.
- **Scroll do terminal vs. scroll da página** — o terminal deve capturar o arraste vertical inteiro; a tela ao redor não rola.

### 8.7 Camada de rede: axios + socket.io

Divisão de trabalho, sem sobreposição: **axios para estado** (hosts, chaves, cofres, auditoria, SFTP) e **socket.io só para o fluxo do terminal**. Um `GET /hosts` por WebSocket ou uma tecla por HTTP são os dois erros clássicos aqui.

#### O cliente axios

```ts
// src/api/client.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../store/auth.store';

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const { accessToken, deviceId } = useAuth.getState();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  config.headers['X-Device-Id'] = deviceId;          // usado por DELETE /devices
  return config;
});

// --- refresh com single-flight: 5 telas carregando juntas geram 1 refresh, não 5
let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status === 401 && !original._retried && !original.url?.includes('/auth/')) {
      original._retried = true;
      try {
        refreshing ??= renovarToken().finally(() => { refreshing = null; });
        const novo = await refreshing;
        original.headers.Authorization = `Bearer ${novo}`;
        return api(original);
      } catch {
        useAuth.getState().logout();                  // refresh morto: volta pro login
        throw error;
      }
    }

    // 423 = cofre trancado (auto-lock): pede Face ID sem deslogar
    if (error.response?.status === 423) useAuth.getState().requireUnlock();

    throw normalizarErro(error);
  },
);

async function renovarToken(): Promise<string> {
  const refresh = await SecureStore.getItemAsync('refresh');
  // instância limpa: sem interceptor, para não entrar em laço de 401
  const { data } = await axios.post(`${process.env.EXPO_PUBLIC_API_URL}/auth/refresh`, { refresh });
  await SecureStore.setItemAsync('refresh', data.refresh);
  useAuth.getState().setTokens(data.access, data.refresh);
  socket.auth = { token: data.access };               // o socket usa o MESMO token
  return data.access;
}

/** Erro de axios vira mensagem que dá para mostrar na tela. */
function normalizarErro(e: AxiosError<any>) {
  if (e.code === 'ECONNABORTED') return new Error('O servidor demorou para responder.');
  if (!e.response) return new Error('Sem conexão. Verifique a internet.');
  return new Error(e.response.data?.message ?? `Erro ${e.response.status}`);
}
```

Módulos por domínio, tipados, sem `any` solto pela tela:

```ts
// src/api/hosts.api.ts
export const hostsApi = {
  listar:   (params?: { vaultId?: string; q?: string }) => api.get<Host[]>('/hosts', { params }).then(r => r.data),
  criar:    (dto: CriarHostDto) => api.post<Host>('/hosts', dto).then(r => r.data),
  atualizar:(id: string, dto: Partial<CriarHostDto>) => api.patch<Host>(`/hosts/${id}`, dto).then(r => r.data),
  apagar:   (id: string) => api.delete(`/hosts/${id}`),
  escanear: (dto: ScanDto) => api.post<HostEncontrado[]>('/hosts/scan', dto, { timeout: 90000 }).then(r => r.data),
};
```

Dois detalhes que evitam bug bobo:

- **Escaneamento de rede precisa de `timeout` próprio.** 15 s não varre uma `/24`; passe `timeout: 90000` só naquela chamada.
- **Upload de SFTP usa `FormData` + progresso**, e o `Content-Type` tem que ser removido para o axios montar o `boundary`:

```ts
export const enviarArquivo = (sessionId: string, arquivo: DocumentPickerAsset, onProgress: (p: number) => void) => {
  const form = new FormData();
  form.append('file', { uri: arquivo.uri, name: arquivo.name, type: arquivo.mimeType } as any);
  return api.post(`/sftp/${sessionId}/upload`, form, {
    headers: { 'Content-Type': undefined },
    timeout: 0,                                   // arquivo grande não tem prazo
    onUploadProgress: (e) => e.total && onProgress(e.loaded / e.total),
  });
};
```

#### O socket.io no app

```ts
// src/socket/useSocket.ts
import { io, Socket } from 'socket.io-client';

export const socket: Socket = io(`${process.env.EXPO_PUBLIC_API_URL}/terminal`, {
  transports: ['websocket'],      // pula o polling: no 4G o upgrade custa 1–2 s e às vezes falha
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,     // backoff com jitter, embutido
  timeout: 10000,
  auth: (cb) => cb({ token: useAuth.getState().accessToken }),  // reavaliado a CADA reconexão
});

socket.on('connect_error', async (err) => {
  if (err.message === 'unauthorized') {
    await renovarToken();
    socket.connect();             // com o token novo, via auth callback
  }
});

// reanexa todas as abas abertas depois de qualquer queda
socket.on('connect', () => {
  for (const id of sessoesAbertas()) socket.emit('session:attach', { sessionId: id });
});
```

O `auth` como **função** (e não objeto) é o detalhe que mais dá dor de cabeça: com objeto, o socket reconecta para sempre com o token velho e expirado.

Abrir sessão usa **ack**, porque o app precisa do `sessionId` de volta:

```ts
const ack = await socket.timeout(10000).emitWithAck('session:open', { hostId, cols, rows });
sessionId.current = ack.sessionId;
```

No Nest, o handler devolve o ack só retornando o valor:

```ts
@SubscribeMessage('session:open')
async open(@ConnectedSocket() client: Socket, @MessageBody() dto: OpenSessionDto) {
  const session = await this.sessions.create({ /* … */ });
  /* … conecta … */
  return { sessionId: session.id };      // vira o ack do cliente
}
```

**Tecla digitada não usa ack e nem `volatile`.** Ack dobra o número de pacotes; `volatile` descarta quando o buffer enche — e perder um `^C` é exatamente o que não pode acontecer.

#### O socket.io no NestJS

```ts
// main.ts
const app = await NestFactory.create(AppModule);
app.useWebSocketAdapter(new IoAdapter(app));

// terminal.gateway.ts
@WebSocketGateway({
  namespace: '/terminal',
  transports: ['websocket'],
  pingInterval: 20000,
  pingTimeout: 25000,        // maior que o pingInterval; celular em background atrasa o pong
  maxHttpBufferSize: 1e6,
  perMessageDeflate: false,  // compressão por frame só atrapalha em pacote de 1 tecla
  cors: { origin: process.env.CORS_ORIGINS?.split(',') ?? false },
})
```

Com mais de uma instância, o `Map` de sessões continua preso ao nó — o adapter Redis resolve só o *fan-out* dos eventos, não a posse do socket SSH:

```ts
const pub = createClient({ url: process.env.REDIS_URL });
const sub = pub.duplicate();
await Promise.all([pub.connect(), sub.connect()]);
app.useWebSocketAdapter(new RedisIoAdapter(app, createAdapter(pub, sub)));
```

Ainda assim: **sticky session no load balancer**, ou roteamento por `Session.nodeId`. O adapter Redis não move uma conexão SSH viva de um pod para outro.

#### Autenticação: um token, duas camadas

```
auth.store (zustand)
   ├── axios      → interceptor de request injeta o Bearer
   └── socket.io  → auth callback lê o mesmo token a cada reconexão
        ↑
   renovarToken() single-flight atualiza os dois
```

O handshake do socket valida o mesmo JWT do REST (§7.2, `handleConnection`). Não invente um segundo esquema de token para o WebSocket — é mais uma superfície de ataque para manter.

---

## 9. Estrutura de pastas

```
backend/
  src/
    auth/           jwt.strategy.ts  auth.service.ts  vault-permission.guard.ts
    orgs/           orgs.controller.ts  memberships.service.ts
    vault/          vault.service.ts  crypto.util.ts  credentials.controller.ts
    hosts/          hosts.controller.ts  hosts.service.ts  ssh-config.parser.ts
    terminal/       terminal.gateway.ts  ssh.service.ts  cast-recorder.ts  session.service.ts
    sftp/           sftp.controller.ts  sftp.service.ts
    forwarding/     forward.service.ts
    known-hosts/    known-hosts.service.ts
    audit/          audit.service.ts  audit.interceptor.ts
    agents/         agent.gateway.ts        (fase 3)
    prisma/         prisma.service.ts  prisma.module.ts
  prisma/           schema.prisma  migrations/  seed.ts
  test/

app/
  app/                      (expo-router)
    (auth)/login.tsx
    (tabs)/index.tsx        hosts
    (tabs)/sessions.tsx
    (tabs)/keys.tsx
    (tabs)/snippets.tsx
    (tabs)/settings.tsx
    host/[id].tsx
    terminal/[sessionId].tsx
    sftp/[sessionId].tsx
  src/
    api/            client.ts  hosts.api.ts  vault.api.ts  sftp.api.ts   (axios)
    socket/         useSocket.ts  events.ts                             (socket.io)
    terminal/       terminalHtml.ts  KeyBar.tsx  themes.ts
    ui/             ListGroup.tsx  Row.tsx  Sheet.tsx  Toast.tsx  Switch.tsx
    store/          auth.store.ts  hosts.store.ts     (zustand)
    theme/          tokens.ts
```

---

## 10. Sequências críticas

### 10.1 Primeira conexão a um host desconhecido (TOFU)

```
App                     Gateway            SshService          Host
 │ session:open ────────►│                    │                  │
 │◄──── status:connecting│                    │                  │
 │                       │─── connect() ─────►│── TCP + KEX ────►│
 │                       │                    │◄── host key ─────│
 │◄─ hostkey:unknown ────│◄─ onHostKeyUnknown │  (handshake preso)│
 │  [alerta com SHA256]  │                    │                  │
 │ hostkey:trust ───────►│─── cb(true) ──────►│── auth ─────────►│
 │◄──── status:open ─────│◄─── ready ─────────│                  │
 │◄──── data (motd) ─────│                    │                  │
```

Se o veredito for `changed`, **recuse a conexão** e mostre alerta vermelho. Chave de host que muda sem aviso é o sintoma clássico de MITM. Só um `manage` pode reconfiar, e isso vira linha de auditoria.

### 10.2 App em background e volta

```
usuário sai do app → socket cai → handleDisconnect → ssh.detach(id)
                                   (SSH continua vivo, timer de 10 min)
usuário volta      → socket reconecta → session:attach
                                   → replay dos últimos 256 KB → tela idêntica
```

Para persistência de verdade (dias), rode `tmux new-session -A -s termix` como `startup_command`: mesmo se o backend reiniciar, o shell continua no host.

---

## 11. Roadmap sugerido

| Fase | Entrega | Semanas |
|---|---|---|
| **1 — MVP conectando** | auth JWT, CRUD de hosts, cofre pessoal, gateway + ssh2, terminal WebView, barra de teclas | 3–4 |
| **2 — Usável no dia a dia** | reconexão/replay, TOFU + known_hosts, snippets, chaves (gerar/importar/deploy), Face ID, temas | 3 |
| **3 — Multiusuário sério** | orgs, cofres compartilhados, papel `use`, auditoria, gravação `.cast`, jump host | 3–4 |
| **4 — Além do shell** | SFTP, port forwarding, agente para LAN, push de alerta | 4 |
| **5 — Endurecimento** | CA SSH com certificado efêmero, MFA obrigatório em PROD, SSO SAML, aprovação em duas pessoas para PROD | — |

---

## 12. Acessar máquina sem IP público (o "qualquer computador")

O backend só alcança o que ele enxerga. Para o PC dentro do armazém, atrás de NAT:

1. Um binário Go/Node pequeno roda na máquina do cliente (`termix-agent`).
2. Ele abre **túnel reverso via WebSocket** para o seu backend e se autentica com um token de registro.
3. Ao conectar em `hosts.agent_id != null`, o `SshService` usa o socket do agente no lugar do TCP direto:

```ts
// em vez de conn.connect({host, port}), quando há agente:
const sock = await this.agents.openTunnel(host.agent_id, host.address, host.port);
conn.connect({ ...config, sock });   // ssh2 aceita qualquer Duplex em `sock`
```

`ssh2` aceitar um `Duplex` arbitrário em `sock` é o que torna isso simples — é a mesma porta de entrada usada pelo jump host. Um agente, N hosts na LAN daquele cliente.

---

## 13. Checklist antes de colocar em produção

**Segurança**
- [ ] Nenhum endpoint retorna chave privada, nem para o dono
- [ ] Interceptor de log redigindo `password`, `passphrase`, `privateKey`, `secret`
- [ ] `omit` global do Prisma cobrindo `secretCiphertext`, `passwordHash`, `wrappedUmk`, `mfaSecret`
- [ ] Log de query do Prisma desligado (ou filtrado) em produção
- [ ] `algorithms.serverHostKey` sem SHA-1; `hostVerifier` obrigatório em todo ambiente
- [ ] Rate limit em `/auth/login` e `session:open` (throttler)
- [ ] TLS obrigatório; `wss://` apenas; HSTS
- [ ] Auditoria gravando `session.open`, `credential.read`, `hostkey.trust`, `member.remove`
- [ ] Backup do banco testado com restore real (o cofre é ponto único de falha)
- [ ] Pentest antes do primeiro cliente externo — este sistema é, por definição, um alvo de alto valor

**Confiabilidade**
- [ ] Sticky session no LB ou roteamento por `sessions.node_id`
- [ ] `connection_limit` fixado na `DATABASE_URL` + pgbouncer em transaction mode
- [ ] Timeout de sessão detached e limpeza de órfãs (job BullMQ)
- [ ] Limite de sessões simultâneas por usuário e por org
- [ ] `readyTimeout` e mensagens de erro traduzidas (`ECONNREFUSED` → "Porta 22 fechada ou host offline")
- [ ] `auth` do socket.io como **função**, não objeto (senão reconecta com token expirado)
- [ ] Refresh de token single-flight no axios (evita 5 refresh simultâneos ao abrir o app)
- [ ] `transports: ['websocket']` nos dois lados; `perMessageDeflate: false`
- [ ] `pingTimeout > pingInterval`, senão o app em background é derrubado por falso negativo

**Produto**
- [ ] Copiar/colar funcionando (seleção no xterm + `expo-clipboard`)
- [ ] Fonte ajustável por pinça
- [ ] Modo paisagem no terminal
- [ ] Teclado físico (iPad/Magic Keyboard) mapeando `Ctrl`/`Esc` nativamente

---

## 14. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Você vira o guardião das credenciais de PROD de todo mundo | Cofre com envelope, papel `use`, auditoria, roadmap para CA efêmera |
| Uma instância do backend segura o `Map` de sessões | Sticky session desde o dia 1; nada de escalar horizontal sem isso |
| Latência do WebSocket em 4G ruim deixa o eco lento | Envie tecla por tecla sem debounce; considere eco local otimista só para caracteres imprimíveis |
| Expo Go some quando você precisar de teclado físico/Bluetooth avançado | Já planeje um dev build (EAS) para a v2; o backend não muda nada |
| xterm.js via CDN falha offline | Embutir o UMD minificado no bundle |

---

**Resumo em uma frase:** o app é um teclado e uma tela; o NestJS é o cliente SSH; o cofre é o produto.

---

## 15. Contrato de tela: cada elemento do protótipo

Tela por tela, elemento por elemento. Se algo aparece na interface e não está aqui, é bug de escopo.

### Login
| Elemento | Contrato |
|---|---|
| E-mail + senha | `POST /auth/login` → `{ access, refresh, user, orgs[] }`. Se `orgs.length > 1`, o app pede a organização antes de seguir. |
| Entrar com Face ID | `expo-local-authentication` libera o refresh token do Keychain; não é login novo, é destravamento local |
| SSO da empresa (SAML) | fase 5. Até lá o botão não existe na build |
| Rodapé "as chaves nunca saem do cofre" | verdade literal: §5. Não é copy de marketing |

### Hosts
| Elemento | Contrato |
|---|---|
| Busca | filtro client-side sobre `GET /hosts`; acima de 200 hosts vira `?q=` no servidor |
| Grupos (Produção / Homologação / Pessoal) | `Host.groupName`, valores livres; `GET /groups?vaultId=` alimenta o seletor |
| Etiquetas coloridas | `Host.tags String[]`; cores são convenção do app (`prod` vermelho, `hml` âmbar, `dev` verde), não vêm do servidor |
| Bolinha verde | existe `Session` com `status IN (open, detached)` para aquele `hostId` |
| `↪ via <host>` | `Host.jumpHostId` preenchido |
| Ícone do SO | `Host.osHint`, preenchido na criação ou deduzido do banner no escaneamento |
| Toque no host | `POST /sessions` → `session:open` (§7.1) |
| Toque longo | menu local; cada item mapeia para os endpoints abaixo |
| "+" → Novo host | formulário abaixo |
| "+" → Importar `~/.ssh/config` | `POST /hosts/import/ssh-config`. Diretivas suportadas: `Host`, `HostName`, `Port`, `User`, `IdentityFile`, `ProxyJump`, `ProxyCommand` (só o formato `ssh -W`). O resto é ignorado com aviso na resposta |
| "+" → Escanear a rede local | `POST /hosts/scan` (§12); só aparece se a org tem agente online |

### Formulário do host
| Elemento | Contrato |
|---|---|
| Nome, Endereço, Porta, Usuário | `Host.label/address/port/username` |
| Chave SSH / Senha / Agente | `Host.authMethod`; com `agent`, o backend usa o próprio `SSH_AUTH_SOCK` (§7.3) |
| Chave | `Host.credentialId`; o seletor lista só credenciais dos cofres onde você tem ao menos `use` |
| Host de salto | `Host.jumpHostId`. **Validar ciclo no servidor** (A→B→A trava o `SshService` em recursão) |
| Manter conexão viva | `Host.keepalive` → `keepaliveInterval: 15000` |
| Grupo / Etiquetas | `groupName`, `tags` |
| Compartilhar com | `PATCH /hosts/:id/vault` — mover de cofre é o mecanismo de compartilhamento |
| Comando ao conectar | `Host.startupCommand`, escrito no stream logo após o `shell()`. Nunca coloque segredo aqui: vai para a gravação da sessão |
| Codificação | `Host.charset`. O xterm só fala UTF-8; para `latin1` (comum em servidor antigo brasileiro) o **backend** converte com `iconv-lite` nos dois sentidos, antes de emitir no socket |
| Apagar host | `DELETE /hosts/:id`; sessões abertas são encerradas e viram linha de auditoria |

### Alerta de host desconhecido
| Elemento | Contrato |
|---|---|
| Impressão digital SHA256 | calculada no `hostVerifier` (§7.3), formato `SHA256:<base64 sem padding>` — igual ao que o `ssh` do terminal mostra, para o usuário poder comparar |
| Confiar e conectar | `hostkey:trust` → grava `KnownHost` + `audit_logs('hostkey.trust')` |
| Chave que **mudou** | conexão recusada; só `manage` pode reconfiar, e a UI usa vermelho, não âmbar |

### Terminal
| Elemento | Contrato |
|---|---|
| Abas de sessão | uma `Session` por aba; `+ novo` volta para Hosts. Limite por usuário configurável (padrão 10) |
| Cabeçalho "● conectado" | evento `status` (§7.1) |
| Log de conexão (relay, jump, chave, MOTD) | as três primeiras linhas são geradas pelo backend; o MOTD vem do servidor remoto |
| Saída | evento `data`, base64, escrita no xterm como `Uint8Array` |
| Barra de teclas | §8.4; layout vem de `UserSettings.keybarLayout` |
| ⚡ snippets | folha com `GET /snippets`; ao escolher, injeta no input (não executa sozinho) |
| Menu → Arquivos (SFTP) | reusa a **mesma** conexão SSH: `conn.sftp()`, sem novo handshake |
| Menu → Abrir serviço | §7.5 |
| Menu → Buscar na saída | `SearchAddon` do xterm sobre o scrollback local (5000 linhas); não consulta o servidor |
| Menu → Copiar toda a saída | `term.buffer` → `expo-clipboard` |
| Menu → Desconectar | `session:close`; o `.cast` é fechado e enviado |

### Sessões
| Elemento | Contrato |
|---|---|
| Lista com tempo | `GET /sessions` filtrando `status IN (open, detached)` |
| "Persistentes no backend" | §7.3 `detach()` com carência de 10 min; com `tmux` no `startupCommand`, dias |

### Chaves
| Elemento | Contrato |
|---|---|
| Lista com fingerprint | `GET /credentials` — `secretCiphertext` nunca vem junto (`omit` global, §3.3-2) |
| 🔒 com passphrase / ⚠︎ sem | `Credential.hasPassphrase` |
| Gerar Ed25519 / RSA 4096 | `POST /credentials/generate`; a geração é no **servidor** (`crypto.generateKeyPair`), e a privada já nasce cifrada |
| Colar / Importar do Arquivos | `POST /credentials/import`; valida o formato e recusa chave sem passphrase em cofre de equipe |
| Encaminhar agente (-A) | `config.agentForward`; a UI avisa que só deve ser ligado em host confiável |
| Copiar chave pública | `GET /credentials/:id/public` |
| Instalar em um host | `POST /credentials/:id/deploy` — abre (ou reusa) sessão e faz o `>> ~/.ssh/authorized_keys` de forma idempotente |
| Usada em N hosts | relação `Credential.hosts`; apagar credencial em uso exige confirmação e lista os afetados |

### Snippets
| Elemento | Contrato |
|---|---|
| Lista / busca | `GET /snippets?vaultId=` |
| Rodar → escolher host | `POST /snippets/:id/run { sessionId }` ou injeção local no input |
| Pedir confirmação antes de rodar | `Snippet.requireConfirm`; padrão **ligado** — snippet com `rm` ou `restart` não deve disparar por toque acidental |
| Disponível para toda a equipe | o escopo é o cofre: mover para o cofre da equipe |
| `{{host}}`, `{{usuario}}`, `{{data}}` | substituídos no cliente antes de enviar; variável desconhecida bloqueia a execução em vez de virar texto literal |

### Equipe
| Elemento | Contrato |
|---|---|
| Membros e papéis | `Membership.role`; `PATCH /orgs/:orgId/members/:userId` |
| Convidar | `POST /orgs/:orgId/invites` — o convidado cria a própria senha-mestra, e só então recebe `wrappedVk` |
| Cofres compartilhados | `Vault` + `VaultMember.permission` |
| Auditoria / gravações | telas abaixo |

### Auditoria
| Elemento | Contrato |
|---|---|
| Filtros Tudo / Conexões / Cofre / Alertas | `GET /audit?category=` — `alertas` agrega falha de autenticação, chave de host divergente e revogação |
| Linhas com avatar | `AuditLog.userId` → iniciais; ações nunca são apagáveis nem editáveis |
| CSV | `GET /audit.csv` em stream |
| Gravações | `Session.recordingUrl` |

### Reprodução da gravação
| Elemento | Contrato |
|---|---|
| Player com pausa e barra | arquivo `.cast` (asciicast v2, §7.4) tocado no app; nada é reencodado |
| Compartilhar | `POST /sessions/:id/recording/share { ttlHours: 24 }` → `RecordingShare` com token e expiração |

### Ajustes / Aparência
| Elemento | Contrato |
|---|---|
| Tema, família, tamanho, ligaduras | `UserSettings`; aplicados ao vivo via `postMessage({type:'theme'\|'font'})` (§8.2) |
| Som do bell | `UserSettings.bellSound` + `term.onBell()` → `expo-haptics` (som só se o iPhone não estiver no silencioso) |
| Barra de teclas | `UserSettings.keybarLayout Json` |
| Sincronizar cofre | não é botão de verdade: tudo já está no servidor. Ele só refaz os `GET` e mostra o horário |

### Ajustes / Segurança
| Elemento | Contrato |
|---|---|
| Face ID, bloqueio automático | `UserSettings.biometricUnlock`, `autolockMinutes`; o timer roda no app, o servidor não confia nele |
| Exigir Face ID por sessão | `requireBioPerSession` — gate **local**. Para valer no servidor, use duas etapas: `session:open` em host de produção pede `totp` |
| Alterar senha-mestra | `POST /auth/master-password`, transação §3.3-4 |
| Código de recuperação | `POST /auth/recovery-code`; mostrado uma vez, guardado como hash Argon2id. PDF via `GET /auth/recovery-code/pdf`, gerado em memória e nunca persistido |
| Duas etapas | `/auth/mfa/setup` (otpauth + QR) e `/verify` |
| Avisar / bloquear se a chave mudar | `warnOnHostKeyChange`, `blockOnHostKeyChange` → lidos no `hostVerifier` |

### Dispositivos
| Elemento | Contrato |
|---|---|
| Lista | `GET /devices` — nome, plataforma, IP e último acesso |
| Revogar (toque longo) | `DELETE /devices/:id`; invalida o refresh token, **não** derruba a sessão SSH |
| Encerrar em todos os outros | `DELETE /devices` preservando o `deviceId` do cabeçalho |

### Serviços e túneis
| Elemento | Contrato |
|---|---|
| Lista com switch | `PortForward.enabled` → `PATCH /port-forwards/:id` |
| Serviço web | proxy autenticado no backend; abre em WebView (§7.5) |
| Serviço TCP | endereço temporário para o cliente do computador; nunca bind em `0.0.0.0` |
| Reverso (-R) | `conn.forwardIn` |

### Agentes
| Elemento | Contrato |
|---|---|
| Status online / offline | `Agent.lastSeenAt`, heartbeat a cada 20 s; offline após 60 s sem sinal |
| Comando de instalação | `POST /agents` devolve `installCommand` com token de registro de uso único |
| Renovar token | `POST /agents/:id/token` — invalida o anterior |
| Escanear esta rede | tela abaixo |

### Escanear rede
| Elemento | Contrato |
|---|---|
| Agente, Faixa, Portas | `POST /hosts/scan { agentId, cidr, ports }`; a varredura roda **dentro** da rede do cliente |
| Banner (`OpenSSH_9.6p1 Ubuntu`) | o agente lê o banner da porta 22 e devolve; é o que preenche `osHint` |
| Seleção + Adicionar | `POST /hosts/bulk`; hosts entram sem credencial, com `known: false` — o TOFU acontece na primeira conexão |

### Arquivos (SFTP) e editor
| Elemento | Contrato |
|---|---|
| Navegar | `GET /sftp/:sessionId/list?path=` |
| Ver / editar | `GET /read` (limite 1 MB, recusa binário) e `PUT /write` |
| `.bak` antes de salvar | o backend renomeia o original para `arquivo.bak` na mesma transação SFTP |
| Baixar | `POST /download` → presigned; transferência grande vai para BullMQ e continua com o app fechado |
| Enviar / nova pasta / renomear | `/upload`, `/mkdir`, `/rename` |
| Compartilhar | folha de compartilhamento do iOS sobre o arquivo baixado |

---

## 16. Achados desta auditoria (entram no backlog)

Cruzar elemento por elemento com a interface fez aparecer nove requisitos que nenhuma tela deixava óbvio. Todos já estão descritos na §15; a lista existe para virar tarefa.

1. **Ciclo de jump host.** `A → B → A` faz o `SshService` recursar até estourar a pilha. Validação obrigatória no `PATCH /hosts/:id`.
2. **Codificação diferente de UTF-8.** O xterm só fala UTF-8. Servidor antigo em `latin1` — comum em chão de fábrica — precisa de `iconv-lite` no backend, nos dois sentidos. Sem isso, o campo "Codificação" é decorativo.
3. **`.bak` antes de salvar pelo SFTP.** Editar `docker-compose.yml` pelo celular, com dedo grande e sem `git`, sem cópia de segurança, é pedir incidente.
4. **`authorized_keys` idempotente.** Instalar a mesma chave duas vezes não pode duplicar a linha.
5. **Variável de snippet desconhecida bloqueia a execução.** Se `{{ambiente}}` não existe, o certo é falhar, não mandar `restart {{ambiente}}` para o shell.
6. **`requireConfirm` ligado por padrão.** Snippet com `rm`, `restart` ou `drop` disparando por toque acidental no ônibus é o pior cenário do produto.
7. **Comando ao conectar vai para a gravação.** Precisa de aviso explícito no formulário: não coloque segredo ali.
8. **Revogar dispositivo ≠ derrubar sessão SSH.** São dois conceitos, e a UI precisa dizer qual faz o quê — senão o usuário revoga achando que matou a sessão em produção.
9. **Escanear e Agentes só aparecem se a org tem agente online.** Botão que sempre falha é pior que botão ausente.

Dois itens continuam fora do escopo da v1, de propósito: **SSO SAML** (fase 5) e **certificado SSH efêmero** (§5.2-C), que é para onde a segurança deve evoluir depois que o produto estabilizar.
