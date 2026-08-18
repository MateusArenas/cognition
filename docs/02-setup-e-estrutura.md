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
npm i zustand @gorhom/bottom-sheet react-native-keyboard-controller
npm i -D mermaid vitest @testing-library/react-native jest-expo jest react-test-renderer
```

## Estrutura de pastas

Organização por feature, com o domínio isolado no centro. **A regra que mantém o projeto
escalável: `domain/` não importa nada de `features/`, `design/` ou `store/`.** É TypeScript
puro, testável sem renderizar nada — ver o diagrama de camadas em
[15-diagramas.md](15-diagramas.md).

```
editor/src/
  app/          rotas (expo-router): _layout.tsx, index.tsx (biblioteca), doc/[id].tsx (editor)
  design/       sistema de design iOS — ver 03-design-system.md
  domain/       TypeScript puro, zero dependência de UI — ver 04-dominio.md
  features/     diagram/ code/ document/ gallery/ ai/ library/
  store/        useDoc.ts useLibrary.ts useSettings.ts history.ts — ver 05-estado.md
  services/     storage.ts export.ts share.ts haptics.ts ai.ts
  i18n/         pt-BR.ts en.ts index.ts
```

**Por que isso escala.** Cada feature é uma pasta que se pode ler sozinha. O domínio é puro,
então testar a serialização de um fluxograma não exige montar componente nenhum. Os serviços
são fachadas finas: trocar SQLite por outra coisa mexe em um arquivo. E `design/` impede que
cada tela invente o próprio botão.

## Estado atual (ver CHECKLIST.md para detalhe)

`domain/` está implementado (Etapa 1). Todo o resto existe como arquivo stub com um
`// TODO(Etapa N)` apontando para o doc relevante — o projeto compila e o roteiro de pastas já
existe, mas a lógica chega etapa por etapa.
