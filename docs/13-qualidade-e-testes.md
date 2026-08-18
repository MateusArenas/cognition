# Acessibilidade e testes

> Fonte da parte de acessibilidade: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §17-18.
> A estratégia de testes de interface (as duas camadas abaixo) foi decidida nesta sessão, não
> vem da spec original — mantenha este arquivo atualizado se a estratégia mudar (ver a regra
> de manutenção no topo do [CLAUDE.md](../CLAUDE.md)).

## Acessibilidade

`accessibilityLabel` em todo botão só de ícone (os da barra contextual e da barra de
formatação são os mais críticos). `accessibilityRole="button"` + estados
(`selected`/`disabled`). Alvos de 44pt. Contraste AA nos pares de token — conferir se criar
cor nova. **Dynamic Type**: `allowFontScaling` ligado em toda a interface, **desligado apenas**
nas duas camadas sobrepostas do editor de código (escala diferente quebra o alinhamento — ver
[09-editor-de-codigo.md](09-editor-de-codigo.md)). `AccessibilityInfo.isReduceMotionEnabled`
corta animações de sheet/barra. O canvas é um WebView — a lista de elementos é o caminho
alternativo de navegação, essencial para VoiceOver.

## Uma armadilha real: `services/*.ts` não pode ser importado pelo vitest

`expo-sqlite` (e qualquer outro pacote nativo — `expo-file-system`, `expo-sharing`, etc.) puxa
`react-native` no import, que usa sintaxe Flow que o vitest não consegue nem parsear —
`RolldownError: Parse failed... Flow is not supported`. Isso quebra o arquivo de teste inteiro,
mesmo testando só uma função pura dele.

**A solução, não o contorno**: qualquer lógica pura dentro de um `services/*.ts` (montar a
string de busca, decidir um nome de arquivo, formatar um payload) mora em `domain/` — que por
definição não depende de nada nativo — e o service importa de lá. `services/storage.ts` faz
exatamente isso com `domain/searchText.ts`. Nunca escreva um `.test.ts` que importe
`services/*.ts` direta ou indiretamente.

## Telas que usam hooks do expo-router não são alvo da Camada 1

`useFocusEffect` (e qualquer outro hook de navegação do expo-router) exige um
`NavigationContainer` de verdade por baixo — `render()` puro do RNTL não basta, dá
"Couldn't find a navigation object". Dá pra contornar com `expo-router/testing-library`, mas
isso é esforço real por pouco ganho quando a tela em si (como `LibraryScreen`) é composição e
navegação, não lógica de decisão — a regra da Camada 1 já diz pra pular esse caso. Prefira
testar a lógica pura por trás (aqui, `useLibrary` e `extractSearchText`) e deixar a tela sem
teste dedicado.

## Testes de domínio (já implementado)

`vitest`, rodando só sobre `editor/src/domain/**` — TypeScript puro, sem depender de RN/Expo.
`npm test` dentro de `editor/`. Ver a lista completa esperada na spec §18
(`serialize.test.ts`, `parse.test.ts`, `catalog.test.ts`, mais `markdown/render.test.ts` e
`format.test.ts`, `highlight.test.ts`, `history.test.ts` conforme cada parte é implementada).

## Testes de interface — duas camadas

Interface é testada, mas com orçamento: cobertura de lógica fica nos testes de domínio e na
Camada 1; a Camada 2 cobre só os caminhos ponta-a-ponta que definem a experiência do produto.

### Camada 1 — componente (`@testing-library/react-native`)

Preset `jest-expo`, roda com `npm run test:rn` dentro de `editor/` (script separado de
`npm test`, que é só vitest/domínio). Só componente com **lógica de decisão** ganha teste —
barra de ações mostrando ações diferentes por tipo de seleção, compositor encadeado
(cria+liga+reabre), checkbox de tarefa alternando a ocorrência certa no markdown. Visual puro
(`Chip`, `Row`) não ganha teste. 1 a 3 testes por feature, focados no que pode quebrar
silenciosamente — não combinatória de props.

Setup: `editor/jest.config.js` (preset `jest-expo`) + `editor/src/features/library/LibraryScreen.test.tsx`
como teste de fumaça (só prova que o runner funciona).

**Nunca ponha um arquivo de teste dentro de `src/app/`.** O expo-router trata tudo ali como
rota via `require.context` e importa o arquivo de qualquer forma, mesmo que ele não vire uma
rota válida — e `@testing-library/react-native` importa o módulo `console` do Node, que não
existe no runtime React Native, quebrando o bundle inteiro (`iOS Bundling failed`). Por isso as
telas de rota (`src/app/*.tsx`) são só re-exports finos de um componente em `features/`, e o
teste mora ao lado do componente real, fora de `app/`.

**Nota de versões:** `jest-expo` (SDK 54: `~54.0.18`) espera `jest@~29` internamente (não
`jest@30`), e `react-test-renderer` precisa bater com a versão exata de `react` instalada
(`19.1.0` no SDK 54). Se o `npx expo install`/`npm i` puxar uma dessas para a versão mais nova
por padrão, o `test:rn` quebra com erros de peer dependency ou de API interna — fixe a versão
exata em vez de aceitar a mais recente. **Não** fixe `@react-native/jest-preset` manualmente a
menos que precise: no SDK 54 o pacote nem tem versão publicada para `react-native@0.81.x` (só
existe a partir de `0.85.0` no npm) — `jest-expo` resolve a versão certa sozinho sem essa
dependência explícita. Isso era diferente no SDK 57, onde `@react-native/jest-preset@0.86.2`
precisava ser fixado à mão para bater com `react-native@0.86.2` — se este projeto voltar a
subir de SDK no futuro, reavalie se esse pin volta a ser necessário.

### Camada 1.5 — verificação de geometria do canvas (Playwright headless)

Nem vitest nem jest conseguem testar a lógica de seleção do runtime
(`runtime.shell.html`): ela depende de `getBoundingClientRect()`, `viewBox` e `transform` de
verdade, que só existem com um motor de renderização real — nenhum dos dois roda um DOM/SVG de
verdade. Essa lacuna foi exatamente o que deixou passar dois bugs reais (Camada 2/3 mapeando o
elemento errado; a conversão tela↔SVG saindo com tamanho errado — ver docs/06-canvas.md e
docs/07-selecao.md) até alguém testar num device de verdade.

`npm run verify:canvas` (`editor/scripts/verify-canvas-selection.mjs`) fecha essa lacuna sem
precisar de simulador: sobe `runtime.html` num Chromium headless via Playwright, renderiza um
diagrama de cada tipo relevante (ER, flowchart, state, class, sequence), toca em cada elemento
selecionável de verdade (clique do mouse, não injeção direta de mensagem) e confere duas coisas
por elemento: (1) o toque selecionou o elemento certo, não outro; (2) o destaque azul cobre
exatamente o elemento que `data-sel-key` mirou, com o centro batendo. Roda separado do
`npm test` normal — precisa baixar o Chromium do Playwright (`npx playwright install
chromium`, uma vez só), pesado demais pro dia a dia — mas é o jeito mais rápido de confirmar
uma mudança em `runtime.shell.html` sem precisar de simulador/device.

Uma limitação pré-existente e sem relação com os bugs corrigidos fica documentada e pulada de
propósito no script (`LIMITACOES_CONHECIDAS`): o rótulo de uma relação ER diagonal/curva pode
cair exatamente na borda do hit de 26px da linha, e tocar o texto nesse caso raro não seleciona
a relação — é sobre onde a curva Bezier passa, não sobre conversão de coordenadas, e não foi
mexido de propósito pra não arriscar o que já está funcionando no ER.

### Camada 2 — E2E com Maestro, contra o app mobile de verdade

Decisão tomada nesta sessão: **Maestro**, não Playwright (automação de navegador, não dirige
app mobile nativo), não Detox (setup pesado de dev client/config nativa nas duas plataformas),
não o adaptador experimental Playwright-for-RN (imaturo).

Maestro dirige o app rodando num simulador/emulador via accessibility tree, sem tocar em
código nativo. Precisa de **dev build**, não Expo Go puro — libs nativas como
`react-native-webview`/`expo-sqlite` exigem isso:

```bash
npx expo prebuild
npx expo run:ios      # ou: npx expo run:android
```

CLI do Maestro (instalar uma vez, fora deste repo): `curl -Ls "https://get.maestro.mobile.dev" | bash`.

Flows em YAML, em `editor/e2e/*.yaml`, rodados com `npm run e2e` (chama `maestro test e2e`).
Config mínima em `editor/.maestro/config.yaml` — **ajustar o `appId` para o
bundleIdentifier/package real assim que `app.json` os definir**, antes do primeiro
`expo prebuild`.

Poucos flows (4-6 no total, não por tela) — os mesmos caminhos que a spec cita como "o que os
usuários vão citar quando falarem bem do app" (§21): criar diagrama → tocar num nó → editar
pela barra de ações → desfazer; abrir um `.md` → inserir bloco mermaid → editar → voltar.

**Quando escrever cada teste:** junto com a feature, na etapa que a implementa — nunca numa
etapa de "testes" separada no fim. Um flow Maestro só entra quando a etapa fecha um caminho
ponta-a-ponta de verdade (ex.: a Etapa 6, barra de ações, fecha "criar e editar nó" e ganha 1
flow; a Etapa 12, ida-e-volta documento↔diagrama, ganha outro).
