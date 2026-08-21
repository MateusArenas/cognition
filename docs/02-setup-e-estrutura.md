# Setup e estrutura de pastas

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §3-4.

O app vive em [`editor/`](../editor/) — projeto Expo + TypeScript com expo-router.

## Estado real (pode divergir da spec original conforme o SDK do Expo evolui)

O scaffold original usou **Expo SDK 57** (o `create-expo-app` mais recente no momento), mas o
projeto foi rebaixado para **Expo SDK 54** — `react-native@0.81.5`, `react@19.1.0` — porque o
Expo Go instalado no celular físico usado para testar não passa da SDK 54 e não há como
atualizá-lo além disso pela App Store. Ver a nota "Downgrade para SDK 54" no
[CHECKLIST.md](../CHECKLIST.md) para o porquê completo. Diferenças que importam em relação à
spec original (a maioria delas continua valendo com SDK 54, só a numeração da versão mudou):

- `expo-router` já vem no template por padrão, com `app.json` já configurando o plugin.
- `react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`
  e `react-native-screens` já vêm instalados pelo template.
- `assetBundlePatterns` não existe mais em `app.json` (bundling de assets é automático); o que
  continua necessário é `config.resolver.assetExts.push('html')` no `metro.config.js`, porque o
  runtime do Mermaid é um asset `.html` (ver [06-canvas.md](06-canvas.md)).
- `babel.config.js` ainda inclui `react-native-reanimated/plugin` por último — continua válido.
- **`react-native-svg` e `expo-blur` foram adicionados na Etapa 2**, fora da lista original do
  spec §3. O spec descreve `Icon.tsx` como "SF-Symbols-like em SVG" e os componentes `Chip`,
  `Fab`, `AlertDialog` como "material desfocado"/"backdrop-filter equivalente (BlurView)"
  (§5.2), mas não lista os pacotes que isso exige — foi uma omissão real do documento
  original, não uma escolha aberta.
- **`expo-sharing` saiu da lista `plugins` do `app.json`** no downgrade pra SDK 54 — nessa
  versão o pacote não exporta um config plugin de verdade, e deixá-lo listado quebra
  `npx expo config`/`expo start` com `PluginError`. `expo-sharing` continua instalado e
  funcionando normalmente em runtime (`services/share.ts`); só não entra em `plugins`.

**Regra de manutenção:** se o setup real mudar de novo (nova versão do Expo, dependência
trocada), atualize este arquivo no mesmo commit — ver a regra no topo do
[CLAUDE.md](../CLAUDE.md).

## Comandos de instalação (como foram rodados)

```bash
npx create-expo-app@latest editor --template default
cd editor
npx expo install react-native-webview expo-asset expo-file-system expo-sharing \
  expo-clipboard expo-document-picker expo-haptics expo-sqlite expo-localization
npm i zustand @gorhom/bottom-sheet react-native-keyboard-controller i18n-js
npm i -D mermaid vitest @testing-library/react-native jest-expo jest react-test-renderer
```

**Monorepo (Etapa DB1, docs/17-db-client.md).** `cognition/` virou workspace do npm
(`package.json` na raiz, `"workspaces": ["editor", "backend"]`) quando o `backend/` (API do
cliente de banco) entrou. `editor/` não mudou de lugar, comando nem comportamento — só o
lockfile consolidou: `npm install` a partir da raiz gerencia um `package-lock.json` só (raiz),
o `editor/package-lock.json` antigo foi removido por ficar órfão/desatualizado. Rodar
`npm install -w editor` (ou `-w backend`) instala só as deps daquele workspace; `npm install`
sem `-w` na raiz instala os dois.

## Hazard real de hoisting: `babel-preset-expo` precisa estar dentro de `editor/node_modules`

Dependências órfãs na raiz deste monorepo (`@radix-ui/*`/`@visx/*`, nem declaradas em
`editor/package.json` nem `backend/package.json`, presentes desde antes de qualquer trabalho
recente — ver a memória do agente `project_monorepo_dependency_hoisting_hazards`) puxam sua
própria versão de `react`, o que empurra `babel-preset-expo` pra `node_modules` da RAIZ em vez
de aninhado em `editor/node_modules`. De lá, o preset não consegue `require.resolve('expo-
router')` (só existe em `editor/node_modules` — a resolução do Node só anda pra CIMA a partir
de onde o pacote que fez o `require` mora, nunca pro lado, pro `node_modules` de outro
workspace) — o plugin de rotas do Expo Router nunca registra, `process.env.EXPO_ROUTER_APP_ROOT`
nunca vira string de verdade, e o Metro quebra com "First argument of `require.context` should
be a string". **Já aconteceu duas vezes na mesma sessão** — a segunda vez depois de um
`npx expo install` comum (qualquer install pode reembaralhar o hoisting de novo).

`editor/metro.config.js` já resolve o mesmo tipo de problema pra `react`/`react-dom`/
`scheduler` via `resolver.resolveRequest`, mas isso NÃO ajuda aqui: a resolução do preset do
Babel acontece dentro do `@babel/core`, antes do Metro sequer começar a transformar qualquer
arquivo — o resolver do Metro nunca entra em cena.

**Correção automática**: `scripts/ensure-babel-preset-expo.js` (na raiz) copia
`babel-preset-expo` pra dentro de `editor/node_modules` sempre que não estiver lá — registrado
como `postinstall` em `package.json` (raiz), roda sozinho depois de QUALQUER `npm install`.
Rodar à mão se precisar: `npm run fix:babel-preset-expo`. Se um dia o Metro voltar a quebrar com
esse erro exato, é sinal de que o `postinstall` não rodou (ex.: `npm install --ignore-scripts`)
— rode o comando acima e reinicie o Metro com `--clear` (a cache de transform pode ter
persistido o resultado quebrado de antes do fix).

## Hook de pre-push (roda a suíte inteira antes de deixar passar)

`.githooks/pre-push` (versionado, na raiz) roda backend (unitário + e2e) e editor (vitest)
antes de qualquer `git push` — se qualquer suíte falhar, o push é abortado. `.git/hooks/` não
é versionado, então isso não liga sozinho num clone novo; ative uma vez por clone com:

```bash
git config core.hooksPath .githooks
```

O e2e do backend precisa do Postgres do `docker-compose.yml` rodando (`docker compose up -d`)
com a `DATABASE_URL` do `.env` apontando pra ele. `editor: npm run test:rn` (jest-expo/RTL)
fica de fora do hook de propósito — tem uma suíte pré-existente quebrada
(`ActionBar.test.tsx`, motivo não-relacionado, ver [CHECKLIST.md](../CHECKLIST.md)) que
bloquearia todo push; rode esse comando manualmente ao mexer em componente com teste RTL.
Pra pular o hook numa emergência: `git push --no-verify` (evite — é o motivo do hook existir).

## Estrutura de pastas

Organização por feature, com o domínio isolado no centro. **A regra que mantém o projeto
escalável: `domain/` não importa nada de `features/`, `design/` ou `store/`.** É TypeScript
puro, testável sem renderizar nada — ver o diagrama de camadas em
[15-diagramas.md](15-diagramas.md).

```
editor/src/
  app/          rotas (expo-router): _layout.tsx, (tabs)/ (biblioteca + ajustes, tab bar),
                gallery.tsx, doc/[id].tsx — os dois últimos empilham por cima da tab bar
  design/       sistema de design iOS — ver 03-design-system.md
  domain/       TypeScript puro, zero dependência de UI — ver 04-dominio.md
  features/     diagram/ code/ document/ gallery/ ai/ library/ settings/ rabisco/ update/
  store/        useDoc.ts useLibrary.ts useSettings.ts history.ts — ver 05-estado.md
  services/     storage.ts export.ts share.ts haptics.ts ai.ts
  i18n/         pt-BR.json en.json es.json index.ts I18nProvider.tsx
```

**Por que isso escala.** Cada feature é uma pasta que se pode ler sozinha. O domínio é puro,
então testar a serialização de um fluxograma não exige montar componente nenhum. Os serviços
são fachadas finas: trocar SQLite por outra coisa mexe em um arquivo. E `design/` impede que
cada tela invente o próprio botão.

## Idiomas

`expo-localization` (incluído no Expo Go) lê o idioma inicial do aparelho; `i18n-js` resolve as
chaves de interface. Os catálogos são deliberadamente um JSON por idioma em `src/i18n/`:
`pt-BR.json`, `en.json` e `es.json`. `I18nProvider` expõe `useI18n().t()` e observa a preferência
persistida em `useSettings`; trocar em Ajustes atualiza a UI sem reiniciar o app. Português é o
fallback para um idioma ainda não traduzido. Nenhum componente deve introduzir texto visível ou
de acessibilidade sem incluir a chave equivalente nos três JSONs.

## Atualizações OTA e publicação (EAS)

Conta em expo.dev: usuário `arenas_math`, organização `wasit` — o projeto fica registrado sob a
organização. `features/update/UpdateGate.tsx` segura a splash nativa (já configurada pelo
plugin `expo-splash-screen` em `app.json`) logo na raiz de `app/_layout.tsx` (o primeiro
provider de todos) até checar se há atualização OTA via `expo-updates`
(`checkForUpdateAsync`/`fetchUpdateAsync`/`reloadAsync`); se houver, baixa e recarrega antes de
liberar a tela — se não, ou se checar falhar/estourar o timeout (4s pra checagem, 8s pro
download), libera com a versão já embarcada. Expo Go e build de dev não suportam
`expo-updates` (a API lança erro) — detectado via `Constants.executionEnvironment ===
ExecutionEnvironment.StoreClient` e `__DEV__`, pulando a checagem direto para não travar quem
ainda testa pelo Expo Go (restrição do projeto, ver topo deste doc).

**Projeto ligado ao EAS: `@wasit/wasit`.** Usuário logou localmente com `eas login` (pra não
passar credencial pelo chat); com `expo.owner: "wasit"` e `expo.slug: "wasit"` em `app.json`,
`eas init --force` criou e ligou `@wasit/wasit` (https://expo.dev/accounts/wasit/projects/wasit,
id em `extra.eas.projectId`), e `eas update:configure` preencheu `updates.url`
(`https://u.expo.dev/<projectId>`) e `runtimeVersion: {policy: "appVersion"}` em `app.json`.
**Nome trocado em tudo** de "editor"/"Editor de Diagramas" para "Wasit": `expo.name` (nome
exibido no aparelho — splash, ícone, listagem do Expo Go), `expo.slug` (identificador do
projeto no EAS, agora `wasit`), `expo.scheme` (esquema de deep link, agora `wasit://`),
`package.json#name`, e as chaves `settings.appName`/`library.subtitle` dos três catálogos de
i18n (título em Ajustes › Sobre e o subtítulo abaixo de "Biblioteca" na tela inicial). O
projeto antigo `@wasit/editor` (criado antes da troca de slug, sem nenhum build/update
publicado) ficou órfão no dashboard — sem custo, mas pode ser apagado manualmente pelo usuário
se quiser, já que o CLI desta versão não tem comando de exclusão.

**Não mexido, de propósito:** `ios.bundleIdentifier` continua `"com.arenas-math.editor"` — é o
identificador técnico da loja (Apple/Google), não é exibido a usuário, e uma vez publicado
trocá-lo vira literalmente outro app pra fins de atualização/loja. Como isso ainda não foi
publicado em lugar nenhum, dá pra trocar sem custo se o usuário confirmar querer isso também
(ex.: `com.wasit.editor`/`com.wasit.app`) — só não foi assumido automaticamente.

**Canal `hml` e primeira publicação.** `eas channel:create hml` criou o canal e a branch `hml`
(par 1:1) em `@wasit/wasit`. `eas update --branch hml --platform android` e `--platform ios`
publicaram o primeiro grupo de update em cada plataforma — sem build nenhum ainda pra
consumi-los, então ficam arquivados esperando (o CLI avisa "No compatible builds found", que é
o esperado). **`eas update --platform all` (o padrão) não funciona neste projeto**: `expo
export` tenta empacotar pra web também (`app.json` tem `web.output: "static"`), e a build web
quebra em `expo-sqlite/web/worker.ts` (`Unable to resolve module ./wa-sqlite/wa-sqlite.wasm`)
— bug pré-existente do bundling pra web do `expo-sqlite`, não relacionado a nada desta sessão;
o app nunca teve alvo web de verdade. Contornado publicando `android` e `ios` em comandos
separados; publicações futuras devem fazer o mesmo até esse bug (se importar) ser investigado.

**Ainda pendente:** o gate continua sem efeito real fora do Expo Go até existir pelo menos um
build instalado com `expo-updates` embutido, configurado pra escutar o canal `hml` (ou outro) —
`eas build:configure` (gera `eas.json` com os profiles, incluindo o campo `channel`) não rodou
ainda, é o passo antes do primeiro `eas build`. Só builds fora do Expo Go recebem OTA de
verdade; iOS exige conta Apple Developer paga, Android não. Até lá o gate é um no-op seguro
(cai no `catch` e libera a tela normalmente).

## Estado atual (ver CHECKLIST.md para detalhe)

`domain/` está implementado (Etapa 1). Todo o resto existe como arquivo stub com um
`// TODO(Etapa N)` apontando para o doc relevante — o projeto compila e o roteiro de pastas já
existe, mas a lógica chega etapa por etapa.
