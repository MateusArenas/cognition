# Checklist de build — Editor de Diagramas (Expo/RN)

Checklist vivo. Cada etapa entrega algo usável — ajuda a decidir onde gastar o resto do
tempo. Ordem original em
[ESPECIFICACAO-APP-RN-EXPO.md §21](ESPECIFICACAO-APP-RN-EXPO.md#21-ordem-de-construção),
adaptada aqui com Etapa 0 (scaffold) na frente e testes de interface embutidos em cada etapa
que tem lógica de UI, em vez de etapa própria no fim — ver
[docs/13-qualidade-e-testes.md](docs/13-qualidade-e-testes.md).

**Como usar:** marque `[x]` quando a etapa fechar, e edite a legenda "Progresso" se a etapa
corrente mudar. Isso é o ponto de retomada entre sessões — não precisa reler a spec inteira
para saber onde parou. Ver a regra de manutenção no topo do [CLAUDE.md](CLAUDE.md): qualquer
mudança de escopo aqui também atualiza o doc correspondente em `docs/`.

**Progresso atual: as 16 etapas do roteiro original estão implementadas, e o canvas foi
confirmado renderizando de verdade num simulador iOS real** (fluxograma e ER, com screenshot —
formas, cores de classe, subgrafos, cardinalidade, tudo certo). O que resta é polimento
contínuo (ver "Pendências conhecidas" no fim deste arquivo).

**Bug real encontrado e corrigido nesta rodada:** `import * as FileSystem from
'expo-file-system'` (SDK 54+) parece funcionar — `tsc` não reclama, `expo export` builda —
mas cada chamada lança em runtime, porque o import default virou a API nova
(`File`/`Directory`/`Paths`) e as funções antigas só existem como stub de tipo. Import certo:
`expo-file-system/legacy`. Achado revisando `useRuntimeHtml.ts` (Etapa 3) ao escrever
`services/export.ts` — nenhuma das verificações automatizadas deste projeto teria pego isso
sozinha, porque nenhuma delas roda o app de verdade. Ver
[docs/14-nativo-e-armadilhas.md](docs/14-nativo-e-armadilhas.md).

**O bug mais sério do projeto, achado testando num simulador real:** o canvas abria com a UI
toda normal (barra, chips, FABs) mas o diagrama nunca aparecia — tudo preto, em qualquer
documento. `tsc`, os testes e `expo export` sempre passaram limpos porque nenhum roda o
WebView de verdade. Duas tentativas de correção não resolveram (timing do `fit()` contra um
viewport zerado; cache do Metro/Expo Go) até achar a causa raiz de verdade: em
`scripts/build-runtime.mjs`, `shell.replace('/*__MERMAID__*/', mermaid)` passa uma **string**
como substituto — e `String.replace` trata `$&`/`` $` ``/`$'` como tokens especiais dentro
dela mesmo com busca em string simples. O `mermaid.min.js` tem `$&` por todo lado (idioma
padrão de escape de regex), corrompendo o bundle embutido sem gerar erro de sintaxe nenhum —
só deixando `window.mermaid` indefinido, em silêncio absoluto. Um segundo bug empilhado no
mesmo lugar (o comentário de doc no topo do arquivo citava o placeholder por extenso, e sendo
a primeira ocorrência, "roubava" a substituição da tag `<script>` real) piorava ainda mais.
Corrigido usando função como substituto (`() => mermaid`) e tirando a menção literal do
comentário — confirmado com screenshot real, fluxograma e ER renderizando perfeitos. Ver
[docs/06-canvas.md](docs/06-canvas.md).

**Verificação disponível neste ambiente:** `npx tsc --noEmit`, `npm test` (vitest, domínio),
`npm run test:rn` (jest, componente), `npx expo export` (as duas plataformas) — e, quando um
simulador iOS está disponível na máquina (havia um Xcode 15.4 com iPhone 15 Pro Max booted
nesta sessão), dá pra confirmar visualmente de verdade via `xcrun simctl` (screenshot,
`openurl` com deep link do expo-router pra abrir uma tela específica). **Build nativo
(`expo run:ios`) não funcionou aqui** — Xcode 15.4 é velho demais pro Expo SDK 57 ("Please
upgrade Xcode"); a verificação visual que rolou foi via Expo Go, que não depende de build
nativo. Os flows do Maestro continuam pendentes — precisam de dev build de verdade.

**Downgrade de Expo SDK 57 → SDK 54.** O celular físico usado para testar tem o Expo Go
travado na SDK 54 (a App Store não oferece uma versão mais nova pra atualizar), e o Xcode
15.4 desta máquina não reconhece o device (iOS 26.6) nem tem espaço em disco (14GB livres) pra
uma atualização de Xcode que resolvesse isso de outra forma — então rebaixar o projeto pra
SDK 54 foi o caminho mais rápido e sem custo (as outras opções, atualizar Xcode ou usar EAS
Build com conta Apple Developer paga, ficaram documentadas mas não escolhidas). Mudança real:
`react-native` `0.86.2` → `0.81.5`, `react`/`react-dom` `19.2.3` → `19.1.0`, `expo-router`
`57.x` → `6.x`, `typescript` `~6.0.3` → `~5.9.2`, e o resto dos pacotes `expo-*`/`react-native-*`
realinhados via `npx expo install --fix`. Duas armadilhas no processo: (1) `node_modules`
antigo tinha que ser apagado por completo antes do `npm install` — reaproveitar o lockfile
antigo gerava conflito de peer dependency com o `expo-router`/`react-server-dom-webpack` da
SDK 57 ainda resolvido; (2) `babel-preset-expo` sumiu do `node_modules` depois do install (o
`expo` declara como dependência mas o npm não instalou sozinho) — precisou `npm install
babel-preset-expo@~54.0.12` explícito. Depois do downgrade: `tsc`, os 109 testes vitest e os 8
testes jest continuam todos passando. Ver a nota de versões em
[docs/13-qualidade-e-testes.md](docs/13-qualidade-e-testes.md) e o estado atualizado em
[docs/02-setup-e-estrutura.md](docs/02-setup-e-estrutura.md).

---

- [x] **Etapa 0 — Scaffold do projeto** (pré-requisito, fora da lista original do spec)
  Projeto Expo criado em [`editor/`](editor/), dependências instaladas, `babel.config.js` /
  `metro.config.js` / `app.json` configurados, estrutura de pastas completa com stubs,
  `.maestro/config.yaml` + `editor/e2e/` prontos (sem flows ainda). Ver
  [docs/02-setup-e-estrutura.md](docs/02-setup-e-estrutura.md).

- [x] **Etapa 1 — Domínio** — 1,5 dias
  `types.ts`, `serialize`, `parse`, catálogo dos 25 tipos, mutações puras, testes de
  round-trip (vitest, 37 testes passando). Sem UI. Ver
  [docs/04-dominio.md](docs/04-dominio.md).

- [x] **Etapa 2 — Design system** — 2 dias
  Tokens, `ThemeProvider`/`useTheme` (segue o sistema até o usuário escolher), `Icon` (SVG),
  os componentes base (`NavBar`, `Row`, `GroupedList`, `Segmented`, `Chip`, `Fab`, `Field`,
  `KeyCaps`, `ActionBar`, `AlertDialog`, `Sheet`, `Toast`) + o efeito de a tela encolher atrás
  de uma sheet aberta. Testes de componente nos que têm lógica de decisão. Dependências novas
  não previstas no spec original: `react-native-svg`, `expo-blur` — ver
  [docs/02-setup-e-estrutura.md](docs/02-setup-e-estrutura.md). Ver
  [docs/03-design-system.md](docs/03-design-system.md).

- [x] **Etapa 3 — Canvas renderiza um template fixo** — 0,5 dia
  `runtime.shell.html` completo (config do Mermaid, render, fallback sem themeCSS) +
  `scripts/build-runtime.mjs` + `DiagramCanvas` + `useRuntimeHtml`. Ver
  [docs/06-canvas.md](docs/06-canvas.md).

- [x] **Etapa 4 — Ponte de toque** — 0,5 dia
  `bridge.ts` (ToWeb/FromWeb, `injectJavaScript`/`postMessage`), tap chega em `DiagramScreen`
  e mostra o elemento selecionado. Ver [docs/06-canvas.md](docs/06-canvas.md).

- [x] **Etapa 5 — Store + editor de código com realce** — 1,5 dias
  `store/useDoc.ts` (zustand, `apply`/`applyLive`/`commitLive`/undo/redo via
  `store/history.ts`), `CodeEditor` com o tokenizador (`features/code/highlight.ts`, porte
  exato do protótipo). Testes: `useDoc.test.ts`, `history.test.ts`, `highlight.test.ts`
  (identidade byte a byte). Ver [docs/05-estado.md](docs/05-estado.md) e
  [docs/09-editor-de-codigo.md](docs/09-editor-de-codigo.md).

- [x] **Etapa 6 — Barra contextual + alertas + compositor encadeado** — 2 dias
  `ActionBarController` com as 6 tabelas de ação da spec §11, `NodeComposer` (criação
  encadeada). Testes de componente em `ActionBar.test.tsx`/`AlertDialog.test.tsx` (Camada 1).
  **Sem flow Maestro ainda** — precisa de simulador/dev build, que não existe neste ambiente;
  ver docs/13-qualidade-e-testes.md. Ver [docs/08-barra-de-acoes.md](docs/08-barra-de-acoes.md).

- [x] **Etapa 7 — Inspetores de nó e aresta** — 1,5 dias
  `NodeInspector` (forma/cor), `EdgeInspector` (traço). Ver
  [docs/08-barra-de-acoes.md](docs/08-barra-de-acoes.md).

- [x] **Etapa 8 — Seleção: camadas 2 e 3** — 2 dias
  Implementadas direto no `runtime.shell.html` (não dependem do modelo estruturado, só do
  texto — ver a nota no topo do arquivo): `mapearER` (geométrico) e `mapearTextoGenerico`
  (os outros 23 tipos). `domain/selection.ts#resolveTapSelection` traduz o índice de
  aresta/relação pro id real do lado RN. Ver [docs/07-selecao.md](docs/07-selecao.md).

- [x] **Etapa 9 — Inspetores de tabela, coluna e relação** — 1,5 dias
  `TableInspector` (lista de colunas editável), `ColumnInspector`, `RelationInspector`
  (cardinalidade), `TableComposer`. Ver [docs/08-barra-de-acoes.md](docs/08-barra-de-acoes.md).

- [x] **Etapa 10 — Galeria dos 25 tipos com explicação** — 1 dia
  `GalleryScreen` + `TypeInfoSheet`, agrupada por `GRUPOS`. Ver [docs/04-dominio.md](docs/04-dominio.md).

- [x] **Etapa 11 — Documentos Markdown** — 3 dias
  Renderizador próprio (`domain/markdown/render.ts`, árvore `MdNode`, offsets de bloco),
  `blocks.ts` (localizar/substituir/inserir), `format.ts` (12 ações, idempotentes),
  `MarkdownEditor`/`MarkdownPreview`/`FormatBar`/`Outline`/`DocumentScreen`. Testes:
  `render.test.ts` (offsets, byte a byte), `blocks.test.ts`, `format.test.ts` (idempotência).
  Ver [docs/10-markdown.md](docs/10-markdown.md).

- [x] **Etapa 12 — Diagramas embutidos e a ida e volta** — 1,5 dias
  `MermaidBlock` (canvas somente-leitura embutido), `retornoMd` no store, `DiagramScreen#voltar`
  recorta `serialize()` de volta no offset exato, chip persistente "Voltar ao documento".
  **Sem o segundo flow Maestro ainda** — precisa de simulador/dev build. Ver
  [docs/10-markdown.md](docs/10-markdown.md).

- [x] **Etapa 13 — Biblioteca com SQLite e busca** — 2 dias
  `services/storage.ts` (schema exato do spec, `INSERT ... ON CONFLICT DO UPDATE`),
  `domain/searchText.ts` (índice de busca, pura — testável sem SQLite),
  `store/useLibrary.ts`, `store/useAutosave.ts` (debounce 600ms + `AppState` background),
  `LibraryScreen`/`DocCard` reais. **Sem miniatura visual ainda** — renderizar o SVG e
  guardar como arquivo fica pra depois, é polimento, não bloqueia o resto. Ver
  [docs/12-persistencia-e-export.md](docs/12-persistencia-e-export.md).

- [x] **Etapa 14 — Exportar, compartilhar, importar** — 1 dia
  `services/export.ts` + `share.ts` (texto e PNG via `DiagramCanvas#exportPng`),
  `services/import.ts` (`expo-document-picker`), `services/haptics.ts` (ligado nas seleções,
  criações e exclusões). `domain/exportMeta.ts` pura (extensão/mime/slug), testável. Ver
  [docs/12-persistencia-e-export.md](docs/12-persistencia-e-export.md).

- [x] **Etapa 15 — IA com backend próprio** — 1,5 dias
  `src/app/api/diagrama+api.ts` (rota do Expo Router, roda no servidor — a chave nunca entra
  no bundle), `services/ai.ts` (cliente), `features/ai/prompt.ts` (monta o pedido, testável
  sem rede), `useAi.ts` (loop de validação — 2ª tentativa automática com o erro, só aplica se
  compilar), `AiSheet.tsx`. **Validação real**: estendi a ponte RN↔WebView com um message type
  `validate`/`validated` que usa o `mermaid.parse` de verdade já carregado no canvas, em vez
  de reimplementar um validador — ver `runtime.shell.html` e `DiagramCanvas#validate`. Rate
  limit por dispositivo é em memória (reseta a cada restart do servidor) — documentado como
  ponto de partida, não solução de produção. Ver [docs/11-assistente-ia.md](docs/11-assistente-ia.md).

- [x] **Etapa 16 — Acessibilidade, Dynamic Type, reduced motion, polimento** — 2 dias
  `accessibilityLabel`/`accessibilityRole` nos botões só de ícone (auditado — faltava o botão
  de fechar da `Sheet`, adicionado). `allowFontScaling` já vinha certo (só desligado nas duas
  camadas do `CodeEditor`, conferido). `useReducedMotion` corta a animação do Toast e do
  encolher-atrás-da-sheet quando o sistema pede menos movimento. Rotação reajusta o
  enquadramento (`useWindowDimensions` + `canvasRef.fit()` em `DiagramScreen`). Ver
  "Pendências conhecidas" abaixo pro que ainda falta de polimento real (teclado cobrindo
  alerta em telas pequenas, mais cobertura de haptics). Ver
  [docs/13-qualidade-e-testes.md](docs/13-qualidade-e-testes.md).

---

## Checklist de entrega (final, da spec §22)

- [x] `serialize -> parse -> serialize` idêntico nos templates visuais (teste automatizado)
- [x] Identidade preservada nos 23 tipos em modo `raw`
- [x] Offsets dos blocos Mermaid batem com o recorte do markdown
- [x] Tokenizador do realce devolve o texto byte a byte (testado, `highlight.test.ts`)
- [ ] Renderiza sem rede (avião ligado) — precisa de device pra testar de verdade
- [x] Undo/redo não empilha por tecla digitada (testado, `useDoc.test.ts`)
- [ ] Elemento selecionado fica visível acima da sheet — visual, precisa de device
- [ ] Teclado não cobre o campo em foco, iOS e Android — visual, precisa de device
- [x] Erro de sintaxe mostra a mensagem e mantém o último diagrama válido
- [x] PNG exportado contém o texto dos nós (`htmlLabels:false` já garantido — ver §20; não
  verificado visualmente num device de verdade)
- [ ] Tema segue o sistema até o usuário escolher, e aí persiste — segue o sistema já funciona
  (`ThemeProvider`); persistir a escolha do usuário depende de `store/useSettings.ts`, que não
  existe ainda (não estava em nenhuma etapa do roteiro original — é uma lacuna real)
- [ ] Faixas de atributo do ER legíveis nos dois temas, inclusive no arquivo exportado — visual
- [ ] Toque em aresta funciona com o dedo, não só com mouse — visual, precisa de device
- [ ] Toque em qualquer coluna do ER seleciona aquela coluna — visual, precisa de device
- [ ] Toque em elemento funciona nos 25 tipos — visual; camadas 1 e 2 têm lógica dedicada,
  camada 3 (genérica) cobre os outros 23 mas não foi testada tipo a tipo num device
- [x] Diagrama editado a partir de um documento volta para o bloco certo
- [x] Nenhuma chave de API no bundle (`ANTHROPIC_API_KEY` só existe em `process.env` do lado
  servidor, dentro da rota `+api.ts` — nunca importada por código que roda no app)
- [ ] VoiceOver navega o app inteiro, canvas incluso — precisa de device com VoiceOver
- [x] Documento sobrevive a fechar e reabrir
- [x] Rotação reajusta o enquadramento (`useWindowDimensions` + `fit()` em `DiagramScreen`)

---

## Pendências conhecidas

Nada aqui bloqueia o app de funcionar — são lacunas reais, documentadas pra não serem
redescobertas do zero:

- **Rótulo de relação ER diagonal/curva, num caso raro, não seleciona ao tocar no texto.**
  Achado escrevendo `npm run verify:canvas` (ver docs/13-qualidade-e-testes.md): se o rótulo
  cai exatamente na borda do hit de 26px da linha (a curva Bezier pode não passar perto do
  texto), tocar nele não pega a relação — precisa tocar na linha em si. É sobre onde a curva
  passa, não sobre conversão de coordenadas (nada a ver com os bugs de escala corrigidos em
  docs/06-canvas.md/docs/07-selecao.md), e não foi mexido de propósito pra não arriscar o que
  já está 100% no ER. Documentado como limitação conhecida no próprio script de verificação.
- **Persistir a escolha de tema do usuário.** `store/useSettings.ts` não existe — o app segue
  o tema do sistema, mas não guarda uma escolha manual. Não estava em nenhuma etapa do
  roteiro original; é um buraco real no spec, não só neste build.
- **Miniatura visual da biblioteca.** `LibraryScreen`/`DocCard` mostram tipo + data, não uma
  imagem do diagrama. Renderizar o SVG ao salvar e guardar como arquivo (§15) ainda não foi
  feito.
- **Flows do Maestro (Camada 2 de testes).** `.maestro/config.yaml` e a pasta `e2e/` existem
  e estão documentados (`docs/13-qualidade-e-testes.md`), mas nenhum flow foi escrito nem
  rodado — precisa de dev build de verdade (`expo run:ios`/`run:android`), e o build nativo
  não funcionou nesta sessão por causa da versão do Xcode (ver abaixo). Roda via Expo Go, que
  o Maestro não consegue mirar do mesmo jeito que um app instalado de verdade.
- **Build nativo (`expo run:ios`) não funciona com Xcode 15.4.** O Expo SDK 57 pede uma
  versão mais nova de Xcode ("Please upgrade Xcode" no `pod install`). Rodar
  `xcode-select -p` pra achar a versão atual e atualizar pela App Store/developer.apple.com
  antes de tentar dev build ou Maestro. Enquanto isso, `npm run ios`/`npm run android` (via
  Expo Go) continuam funcionando normalmente pra testar tudo que não exige dev build.
- **O que já foi verificado visualmente, de verdade, num simulador iOS real** (iPhone 15 Pro
  Max, iOS 17.5, via Expo Go — screenshots tiradas com `xcrun simctl io booted screenshot`):
  canvas renderizando fluxograma e ER com formas/cores/subgrafos/cardinalidade corretos,
  seleção reagindo a toque (`__handle recebeu: select` no log de debug usado durante o
  diagnóstico), navegação entre Biblioteca → documento. **O que ainda não foi verificado
  visualmente**: barra de ações completa, inspetores, compositor, markdown, galeria,
  assistente de IA, exportar/compartilhar/importar — a lógica foi implementada com cuidado e
  passa nos testes automatizados, mas ninguém viu essas telas na tela ainda.
- **`EXPO_PUBLIC_API_ORIGIN` para o assistente de IA.** Em dev, `services/ai.ts` tenta
  adivinhar a origem da rota `/api/diagrama` a partir do host do Metro — funciona no caminho
  comum, mas veja `docs/11-assistente-ia.md` antes de um deploy de verdade.
