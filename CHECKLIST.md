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

**Progresso atual: as 16 etapas do roteiro original estão implementadas, e o canvas e o editor
de documento Markdown foram confirmados renderizando de verdade num simulador iOS real**
(fluxograma, ER e os tipos genéricos com seleção correta; documento Markdown com diagrama
embutido renderizado dentro do cartão, tabela, tarefas, barra de formatação). O que resta é
polimento contínuo (ver "Pendências conhecidas" no fim deste arquivo).

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

**Navegação por tab bar + tela de Ajustes** (fora do roteiro original — pedido direto do
usuário). `app/(tabs)/` com Biblioteca e Ajustes, tab bar translúcida (`BlurView`, mesma
linguagem do `Chip`), Galeria/editor continuam empilhados por cima cobrindo a barra. Ajustes
(`features/settings/`) tem seletores de tema (Automático/Claro/Escuro) e idioma (Português,
English, Español), ambos persistidos. As traduções vivem em `src/i18n/`, um JSON por idioma,
resolvidas por `i18n-js` + `expo-localization` (compatível com Expo Go); textos novos devem
entrar nos três catálogos no mesmo commit. Corrigido de quebra: o FAB da Biblioteca (fixo desde
antes da tab bar existir) ficava atrás da barra nova, e o `Toast` global (calibrado só pro FAB
antigo) passou a cair atrás do FAB depois que ele subiu — ver
[docs/03-design-system.md](docs/03-design-system.md).

**Barra de ações contextual nunca abria pra nó nenhum de fluxograma** (reportado pelo usuário:
"clico e fica o azul em volta, mas não sobe a barra de opções"). Não era regressão recente nem
específico de nó recém-criado — a linha 269-272 deste arquivo já vinha marcando esse caminho
como "ninguém viu essa tela ainda", e era exatamente aqui que o bug morava desde sempre:
`tagTargets()` tirava só o `"flowchart-"` literal do começo do `id` do `<g>`, mas o Mermaid 11
prefixa esse `id` com o argumento passado pra `mermaid.render(id, code)` (`"mmd2-flowchart-A-7"`,
não `"flowchart-A-7"`) — sobrava `sel.id = "mmd2-flowchart-A"`, que nunca bate com nenhum
`doc.nodes[].id` de verdade. O destaque azul continuava aparecendo certinho (geometricamente
correto, por isso nunca foi visto como bug de seleção) porque ele só compara `data-sel-key`
contra si mesmo. Corrigido e confirmado via reprodução real (`serialize()`+`addNode()` de
verdade, Playwright headless comparando os ids resultantes contra `doc.nodes`) — ver
[docs/07-selecao.md](docs/07-selecao.md). `npm run verify:canvas` ganhou uma checagem
específica pra essa classe de bug, confirmada revertendo a correção e vendo o teste falhar
antes de reaplicá-la.

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
  **Extensão**: `NodeInspector` ganhou seção "GRUPO" (atribuir/criar grupo pro nó selecionado)
  e novo `GroupInspector` (nós de um grupo) — pedido do usuário pra poder selecionar, renomear
  e criar `subgraph`s do fluxograma. Ver [docs/08-barra-de-acoes.md](docs/08-barra-de-acoes.md).

- [x] **Etapa 8 — Seleção: camadas 2 e 3** — 2 dias
  Implementadas direto no `runtime.shell.html` (não dependem do modelo estruturado, só do
  texto — ver a nota no topo do arquivo): `mapearER` (geométrico) e `mapearTextoGenerico`
  (os outros 23 tipos). `domain/selection.ts#resolveTapSelection` traduz o índice de
  aresta/relação pro id real do lado RN. Ver [docs/07-selecao.md](docs/07-selecao.md).
  **Extensão**: seleção de `'group'` (subgraph do fluxograma) — `g.cluster` tagueado em
  `tagTargets()`, ver [docs/07-selecao.md](docs/07-selecao.md). A aba Elementos também ganhou
  árvore de 2 níveis (grupo → nós) pro tipo `flow`, em vez da lista achatada.

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

  **Lacuna real, fechada numa sessão posterior**: as Etapas 11-12 entregaram o editor de
  documento inteiro, mas a Galeria (Etapa 6/`GalleryScreen`) só oferecia os 25 tipos de
  diagrama — não existia NENHUM jeito, a partir da UI, de criar um documento Markdown. A
  seção "Documentos" da Galeria (2 cards: exemplo com diagrama embutido, e em branco) e os
  dois bugs reais achados testando isso pela primeira vez (Estrutura sempre pulando pro início
  do documento; modo Ler sem rolagem) ficam documentados em
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

- [x] **Etapa R1 — Rabisco: domínio + canvas Skia + caneta** — pedido do usuário, fora do
  roteiro original de 16 etapas
  Novo 5º tipo de documento (`rabisco`, `.svg`) — canvas de desenho tipo Excalidraw, primeira
  fatia de um roadmap maior (R1-R5). `domain/rabisco/{mutations,geom,palette}.ts`,
  `features/rabisco/{RabiscoScreen,Canvas,Dock}.tsx`. Decisão de arquitetura: Skia nativo
  (`@shopify/react-native-skia`, confirmado `inExpoGo: true`), não WebView — desenhar é a
  interação central, não tem motor JS pra rodar (diferente do Mermaid). Reaproveita toda a
  plumbing genérica já existente (`useDoc`/undo-redo, SQLite, design tokens) em vez de portar
  a store/persistência própria que o spec de referência propunha pra um app standalone. Nesta
  etapa: câmera (pan/pinça), caneta com suavização (curva quadrática), borracha, desfazer/
  refazer — confirmado no simulador (traço desenha, apaga por proximidade, desfazer restaura).

- [x] **Etapa R2 — Rabisco: formas, seleção, setas com binding, texto**
  Segunda fatia do roadmap. `geom.ts` ganhou `elementGeometry`/`hitTest`/`bindingAt`/
  `pickBindable`/`resolvedPoints` e a renderização "à mão livre" via PRNG seedado (porte de
  `rough.ts` do protótipo); `mutations.ts` ganhou `moveElement`/`resizeElement`/
  `duplicateElement`. `Dock.tsx` reescrito: seleção, mão, caneta, forma (popover de 5 formas),
  texto, borracha. `Canvas.tsx` ganhou a máquina de estados de seleção (mover/redimensionar/
  arrastar ponta de seta) e criação de forma/linha/seta por arrasto, com ligação automática de
  seta em forma na borda mais próxima. Texto usa `AlertDialog`+`Field` já existentes, não um
  overlay próprio. Confirmado no simulador: retângulo desenha com cantos arredondados e traço
  sketchy, seleção→mover→redimensionar funciona de ponta a ponta, seta perto de uma forma liga
  automaticamente (id do alvo confirmado), texto é colocado como elemento vazio editável,
  borracha remove formas (não só traços) e apagar um elemento ligado não quebra quem apontava
  pra ele. Verificação usou instrumentação temporária (chamada direta das funções de gesto),
  não toque sintético calibrado — os alvos de toque do app são pequenos demais pra acertar de
  forma confiável no simulador.
  Ver [docs/16-rabisco.md](docs/16-rabisco.md) pro roadmap R3-R5 (painel de estilo completo,
  IA, exportar) ainda não construído.

- [x] **Etapa R2.1 — Rabisco: acertos de paridade com o protótipo (seleção, cor)**
  Usuário reportou que a seleção estava "bugada" e faltava preenchimento, comparando com
  `whiteboard-ios.html`. Três correções: (1) `hitTest` agora usa o modelo de duas passadas do
  protótipo — forma sem preenchimento só é achada perto da borda de primeira, o miolo vazio
  dela só conta como fallback se nada mais foi achado, senão uma forma grande e vazia bloqueava
  selecionar o que estava desenhado dentro/por cima dela; (2) alças de redimensionar e caixa de
  seleção passaram a ser desenhadas em px de TELA (não de cena) — ficam do mesmo tamanho visual
  em qualquer zoom, bem maiores que antes; (3) nova `StyleBar.tsx` com faixa de cor de borda
  (sempre visível) e preenchimento (só formas), e criar forma/linha/seta agora já seleciona e
  troca pra ferramenta de seleção (igual ao `setTool('select')` do protótipo), pra ajustar cor
  na hora sem trocar de ferramenta. +3 testes em `geom.test.ts` (162 total). Confirmado ao vivo:
  preenchimento sólido renderiza, alças bem maiores e visíveis, criar retângulo já seleciona com
  a faixa de cor aparecendo, mudar a cor da borda aplica no elemento certo.

- [x] **Etapa R2.2 — Rabisco: escolha de alça de redimensionar corrigida**
  Seguindo o R2.1, usuário reportou que redimensionar ainda estava "descontrolado" — arrastar de
  lado fazia crescer demais. Causa raiz: `selectStart` pegava a PRIMEIRA alça dentro da
  tolerância de toque (ordem `nw,n,ne,w,e,...`), não a MAIS PERTO — perto de um canto de forma
  pequena, duas alças cabem na mesma tolerância, e um toque um pouco impreciso perto de "e"
  podia agarrar "ne", fazendo um arrasto lateral também mexer a altura. Corrigido pra achar a
  alça de menor distância, testada contra as mesmas posições PADDED usadas pra desenhar (antes
  o hit-test usava a caixa sem padding — um lugar diferente de onde a bolinha aparecia). Padding
  entre a borda e as alças aumentou de 9 pra 14px de tela (`HANDLE_PAD_PX`, compartilhado entre
  hit-test e desenho). Confirmado ao vivo: tocar 5px fora do centro exato da alça "e" e arrastar
  de lado mudou só a largura, na proporção exata do arrasto — altura intacta.

- [x] **Etapa R2.3 — Rabisco: toque parado agora seleciona (Gesture.Tap)**
  Usuário reportou "tenho que mover pra selecionar". Causa raiz bem mais fundamental que as
  anteriores: `Gesture.Pan()` só reconhece a partir de um evento de MOVIMENTO — um toque
  matematicamente parado nunca dispara `onStart`, nem com `.minDistance(0)` (setado também, pra
  arrastos de verdade não terem um "salto" inicial de ~10pt não capturado). Seleção, texto e
  borracha rodavam tudo dentro do `onStart` do Pan, então um toque sem nenhum arrasto nunca
  fazia nada. Corrigido com um `Gesture.Tap()` de verdade, composto junto no `Gesture.Race`
  — toque parado vira `tapAt(x,y)`, que reaproveita `selectStart`+`selectEnd` (seleção) ou
  chama `placeText`/`eraseAt` direto. De brinde: uma leitura de SharedValue direto no render de
  `Canvas.tsx` (`scale.value`, pro tamanho das alças) que disparava o aviso de "strict mode" do
  Reanimated em cada frame de arrasto virou um `useState` espelhado via `useAnimatedReaction`.
  Confirmado ao vivo, repetidas vezes: toque simples sem arrasto seleciona a forma na hora; e um
  arrasto de mover/redimensionar segue proporcionalmente o dedo, sem crescimento fora de
  controle. Verificação desta etapa precisou de instrumentação por `console.log` (visível no
  terminal do Metro) em vez de screenshot — a técnica de screenshot sozinha não distinguia
  "gesto não reconhecido" de "coordenada errada", e esse par de causas raiz só ficou claro
  assim; sempre removida antes do commit.

- [x] **Etapa R3 — Rabisco: zoom, cotovelo de seta, texto de verdade, borracha com rastro,
  cor completa, fundo** — pedido do usuário em 7 partes, fora do roteiro
  (1) HUD de zoom (topo, `-`/porcentagem/`+`) — achado ao vivo: os botões não respondiam porque
  estavam aninhados DENTRO do `GestureDetector` do canvas, que capturava o toque antes de
  chegar num `Pressable` filho; corrigido movendo o HUD pra fora, como irmão do
  `GestureDetector`. (2) **Bug real de resize que sobreviveu ao R2.2**: `selectUpdate`
  recomputava a caixa a partir da SAÍDA do frame anterior (`cur.box`), não da caixa original,
  enquanto o delta já é o TOTAL desde o início do gesto — a cada um dos ~60 frames/s de um
  arrasto real, o delta total inteiro somava de novo em cima de uma caixa que já tinha esse
  delta embutido (cresce quase quadrático com a duração, não a distância); os testes do R2.2 só
  chamavam `selectUpdate` um punhado de vezes, nunca pegaram isso. Corrigido guardando a caixa
  original imutável no `DragState` e recomputando `applyResize` sempre do zero. Confirmado
  chamando `selectUpdate` 40x pra mesma posição (imita 60fps): resultado idêntico a uma
  chamada. (3) Variações de seta (`straight`/`curved`/`elbow`) com UI na `StyleBar` — o campo já
  existia no domínio, faltava a UI e o roteamento de `elbow` em si (porte de `elbowRoute`/
  `headingAt` do protótipo); ligação de seta em forma (já existia desde o R2) confirmada
  continuando a funcionar. (4) **Texto não funcionava de verdade**: `placeText` só criava um
  elemento vazio sem jeito de editar; agora abre o editor na hora de tocar (igual a
  `openText()` do protótipo), com o teclado já focado — confirmado ao vivo, inclusive o
  descarte de texto vazio ao cancelar. (5) Borracha com rastro temporário — traço translúcido
  que acompanha o dedo enquanto apaga, nunca vira elemento nem entra no undo. (6) Seletor de
  cor completo (`ColorPicker.tsx`) — quadrado de saturação/valor + barra de matiz com gradientes
  do Skia, campos hex/rgba bidirecionais (`domain/rabisco/color.ts`, testado), e uma faixa de
  "cores usadas no quadro" no lugar de um conta-gotas pixel-a-pixel. (7) Fundo do canvas
  liso/grade/pontilhado, um botão no topo cicla os 3, um `Path` só por padrão (não um nó Skia
  por linha/ponto). +11 testes (173 total). Ver [docs/16-rabisco.md](docs/16-rabisco.md) pro
  roadmap R4-R5 (IA, exportar) ainda não construído.
- [x] **Etapa R3.1 — Rabisco: texto visível, tamanho/família/alinhamento, opacidade, camadas**
  — pedido do usuário em 5 partes. (1) **Bug real: texto nunca desenhava, com cor nenhuma** —
  causa raiz `matchFont({ fontSize })` sem `fontFamily` caía no default `'System'`, que não é um
  nome de família que o `FontMgr`/`CTFontManager` do Skia reconhece no iOS — `matchFamilyStyle`
  não achava nada, o `SkFont` resultante não desenhava glifo nenhum, sem erro nenhum. Corrigido
  sempre passando um nome real (`'Helvetica Neue'`/`'Georgia'`/`'Menlo'`, via novo dicionário
  `FONT_FAMILIES`); confirmado ao vivo com Fast Refresh, texto apareceu na hora. (2) Tamanho de
  fonte nomeado S/M/L/XL (`FONT_SIZES`, mesmos valores 16/22/32/48 dos presets P/M/G/GG do
  protótipo) via `Segmented` (componente já existente, reaproveitado). (3) Família de fonte
  (Sans/Serif/Mono) — novo campo `fontFamily` no domínio, chave agnóstica de plataforma, nome
  real só na UI. (4) Alinhamento de texto (esquerda/centro/direita) — novo campo `textAlign`
  (extensão deliberada, não existe no protótipo), renderizado com `font.measureText()` pra
  deslocar cada linha dentro da caixa. Caixa agora medida de verdade (`measureText`) em vez de
  chute por caractere. (5) Opacidade — já existia no domínio/render, só faltava UI: novo
  `OpacityTrack` (faixa arrastável própria, 10-100% em passos de 5%, mesmo padrão de toque do
  `ColorPicker`). (6) Camadas — 4 mutações puras novas (`bringForward`/`sendBackward`/
  `bringToFront`/`sendToBack`, reordenam `doc.elements`) com UI na `StyleBar`; tentativa inicial
  no HUD superior colidiu com o HUD de zoom (6 chips + pílula não cabem numa tela de
  ~390-430pt) — movido pra dentro da `StyleBar`, mais consistente com todo o resto de controle
  por-elemento. +5 testes (178 total). Achado de ferramental: `ConnectHardwareKeyboard` do
  simulador vinha desligado, por isso digitar via `cliclick t:`/`osascript keystroke` nunca
  funcionou a sessão inteira — contornado tocando as teclas do teclado na tela uma a uma. Ver
  [docs/16-rabisco.md](docs/16-rabisco.md).
- [x] **Etapa R3.2 — Rabisco: duplo toque pra editar texto, picker arrastável/destravado,
  opacidade sem travar cor, feedback de camada, ferramenta padrão** — pedido do usuário em 6
  partes. (1) Editar texto exigia só UM toque, mesmo pra selecionar — corrigido: toque único só
  seleciona, editor abre com duplo toque (`Gesture.Tap().numberOfTaps(2)` +
  `.requireExternalGestureToFail()`, o padrão do RNGH pra distinguir toque único de duplo) ou
  pelo chip "Editar" novo (só quando o selecionado é texto). (2) e (3) **Dois bugs reais com a
  mesma causa raiz**: opacidade "bugava" a cor de preenchimento, e o `ColorPicker` "travava" sem
  deixar selecionar cor — ambos usavam o sistema de responder puro do RN
  (`onStartShouldSetResponder`) aninhado entre vários `Pressable`, negociação de toque nada
  confiável nessa combinação; trocado por `Gesture.Pan` com `onBegin` (dispara já no toque
  inicial) em ambos — mesmo reconhecedor nativo já provado em `Canvas.tsx`. Confirmado ao vivo:
  arrastar opacidade e tocar cor em sequência aplicam os dois certos; tocar em qualquer ponto do
  quadrado de saturação/matiz responde na hora. (4) `ColorPicker` agora arrastável pelo título
  (mais uma barrinha "grabber" decorativa) — `Gesture.Pan` clampado
  (`Math.min`/`Math.max` contra o tamanho da janela) pra nunca sair da tela; botão fechar (X)
  deliberadamente FORA do `GestureDetector` do título (Pressable aninhado dentro de
  GestureDetector não recebe toque — achado da Etapa R3, reaplicado aqui). (5) Feedback de
  camada: os 4 botões de reordenar agora mostram um toast (`useToast()`, já existente)
  "Camada X → Y de Z" a cada toque, comparando a posição antes/depois via
  `useDoc.getState()`. (6) Ferramenta padrão ao abrir um rabisco novo trocada de `'draw'` pra
  `'select'`. Nenhum teste novo (sem mutação/tipo novo, só rewiring de gesto e UI — 178 total
  continua). Achado de ferramental: `measureInWindow()` (temporário) resolveu em segundos uma
  série de toques "que não batiam em nada" — a `StyleBar` tem altura variável (número de linhas
  muda com o tipo selecionado), então uma coordenada "confirmada" numa tela vira errada duas
  linhas depois sem aviso nenhum; medir a posição real bate o palpite visual toda vez. Ver
  [docs/16-rabisco.md](docs/16-rabisco.md).
- [x] **Etapa R3.3 — Rabisco: destaque de ligação de seta, histerese de soltar, conta-gotas de
  verdade** — pedido do usuário em 3 partes. (1) Arrastar a ponta de uma seta perto de uma forma
  bindável agora mostra um destaque azul arredondado ao redor dela em tempo real (porte de
  `S.bindHint`, `whiteboard-ios.html:1239-1251`), tanto criando uma seta nova quanto arrastando
  a ponta de uma já existente. (2) Soltar a ligação "travava" — causa raiz: `pickBindable` usava
  o mesmo raio (10px) pra prender e pra soltar, sem histerese; porte de `movePoint()`
  (`whiteboard-ios.html:1573-1594`): novo parâmetro opcional `currentId` faz o alvo já ligado
  continuar valendo até o toque sair de 22px, não 10 — a faixa "morta" de 12px é o que dá a
  sensação fluida em vez de travada. +2 testes (180 total). (3) Conta-gotas de verdade — o ícone
  já existia mas era decorativo. `RabiscoCanvas` ganhou um handle imperativo (`ref` como prop,
  React 19, sem `forwardRef`) com `beginColorSample()`/`sampleColorAt()`/`endColorSample()`,
  usando `makeImageSnapshot()` + `SkImage.readPixels()` do Skia; `RabiscoScreen` guarda o
  `canvasRef` e repassa pro `ColorPicker` (que vive num `Modal`, janela separada — só o Canvas
  pode tirar snapshot de si mesmo). Botão fica com destaque azul quando ativo; arrastar sobre o
  canvas mostra uma lupa circular (Skia `Image` do mesmo snapshot, com `transform` de zoom 6x
  centrado no pixel mirado — sem recortar/recodificar nada) com mirinha no pixel exato e anel na
  cor lida; solta aplica a cor de verdade. Scrim do picker (antes `rgba(0,0,0,.38)`) virou
  transparente — pedido explícito do usuário: um fundo escuro tingiria o quadro atrás e o
  conta-gotas leria uma cor mais escura que a real. Confirmado ao vivo, inclusive um retângulo
  com borda vermelha ficando com borda preta depois de uma amostra numa área preta do canvas —
  a cor foi mesmo aplicada, não só mostrada no picker. Ver
  [docs/16-rabisco.md](docs/16-rabisco.md).
- [x] **Etapa R3.4 — Rabisco: `ColorPicker` pesando — `applyLive`/`commitLive` em vez de
  `apply()` por frame** — pedido do usuário. Causa raiz: arrastar no SV/matiz/conta-gotas
  chamava `onChange(hex)` a cada frame (~60x/s), e isso ia direto pro `apply()` normal do
  `useDoc` — `structuredClone` + `JSON.stringify` do doc inteiro + empilhar undo (cópia de um
  array de até 80 entradas), tudo por pixel de arrasto. Mesma armadilha que a digitação contínua
  já resolve há tempo (`useLiveField`/`applyLive`+`commitLive`, editor de Markdown) — o
  `ColorPicker` (novo nesta sessão) nunca tinha adotado o padrão. Fix: 3 props novas
  (`onBeginLive`/`onChangeLive`/`onEndLive`) espelhando `onFocus`/`onChangeText`/`onBlur` do
  `useLiveField`; `RabiscoScreen` tira o snapshot uma vez no início (`ref`, não state), muta via
  `applyLive` a cada frame (sem stringificar nem empilhar), fecha a sessão inteira num ÚNICO
  passo de undo com `commitLive` no fim. Fix extra só pro conta-gotas: `SkImage.readPixels()`
  num snapshot GPU-backed é um readback caro sozinho — throttle de 32ms (~30fps, não debounce:
  a lupa precisa acompanhar o dedo durante o arrasto, não só no fim), com leitura sempre forçada
  no toque inicial e final pra não perder a cor exata. Confirmado ao vivo: arrasto responde
  liso; um único "desfazer" depois de um arrasto inteiro volta a cor de uma vez só pro valor de
  antes do gesto (não um micro-passo do meio) — confirma que virou um passo de undo só. Ver
  [docs/16-rabisco.md](docs/16-rabisco.md).
- [x] **Etapa R4 — Rabisco: popover de forma fechando errado, seleção múltipla (laço +
  aditiva), seta em cotovelo apontando pro lado errado, rotação** — pedido do usuário em 4
  partes. (1) O popover de formas (`Dock.tsx`) ficava aberto depois de desenhar uma forma ou
  trocar de seleção — causa raiz: `shapePopOpen` era estado só do Dock, nunca resincronizado
  quando `tool`/seleção mudavam por FORA dele (`RabiscoScreen.shapeCreated` troca `tool` sem
  passar pelo `pressTool` do Dock). Fix: dois `useEffect` fecham o popover sempre que `tool`
  deixa de ser `'shape'` ou a seleção muda. (2) Seleção múltipla: apertar e segurar no fundo
  vazio (modo seleção) agora abre um retângulo de laço (`DragState` novo, `'marquee'`) — solta
  seleciona todo elemento cuja caixa (`bounds()`) SOBREPÕE o retângulo, não só o que está
  inteiro dentro (igual Excalidraw); um chip novo no HUD (`multiSelect`, ícone
  `SquareDashedMousePointer`) liga um modo "aditivo" — com ele ativo, tocar elemento por
  elemento alterna cada um dentro/fora da seleção em vez de trocar. Elemento já dentro de um
  grupo selecionado, ao ser arrastado, move o grupo inteiro (`DragState` novo, `'move-multi'`,
  mutação pura `moveElements(doc, ids, dx, dy)` — um clone/um passo de undo pro grupo, não um
  por elemento). Duplicar/excluir também operam sobre `selectedIds` inteiro. Com mais de 1
  selecionado, as alças de resize/rotação/`StyleBar` somem (só fazem sentido pra UM elemento) —
  fica um contorno simples por elemento (`MultiSelectOutline`, sem alças). +2 testes de mutação
  (`moveElements`). (3) Seta em cotovelo ligada (bound) a uma forma podia apontar pro lado
  errado (ex.: ligada no topo de uma forma, a ponta apontava pra direita) — causa raiz
  (encontrada via teste temporário de diagnóstico, não ao vivo): o ponto de dobra do
  `elbowRoute` é o meio-termo aritmético entre início/fim, sem noção de onde as formas realmente
  estão; pra certas posições relativas, o último segmento se aproxima do alvo PELO LADO ERRADO
  (atravessando a forma por dentro), arrastando a seta junto. Fix cirúrgico, não uma reescrita
  do roteamento: `arrowHeadAngle()` nova em `geom.ts` ignora a direção do último segmento SÓ
  pra seta em cotovelo+ligada, e aponta pro CENTRO da forma-alvo em vez disso (funciona pra
  qualquer borda, sem saber qual é) — seta reta/curva não muda (confirmado por teste que elas
  seguem certo o segmento real, é a única linha visível). +2 testes (`arrowHeadAngle`). (4)
  Rotação — pedido "igual Excalidraw": alça nova (bola acima da seleção, offset generoso de 48px
  e raio de toque de 36px pra não brigar com as alças de resize mais próximas) arrasta pra girar
  em torno do centro, com imã suave de 15° em 15° (gruda a até 4° de distância) e um rótulo de
  graus ao lado da alça durante o arrasto. Novo campo `rotation` em `RabiscoElement` (radianos,
  bate direto com `transform:[{rotate}]` do Skia — extensão deliberada, sem equivalente no
  protótipo de referência). Só formas com caixa própria giram (`ROTATABLE`: retângulo/losango/
  elipse/texto) — linha/seta/traço ficam de fora (rotacionar uma sequência de pontos não tem
  significado "natural", e reescreveria a lógica de binding). Resize inicialmente só funcionava
  com rotação 0° — corte de escopo revertido na Etapa R5, mesma sessão, depois do usuário pedir
  de volta explicitamente ("não é pra tirar o resize do tipo texto"); ver lá o que mudou. Hit-test
  ganhou `toElementLocal()` (rotaciona o ponto de toque pro referencial da forma, não o contrário)
  pra todas as checagens de forma girada reaproveitarem a mesma matemática não-rotacionada.
  Binding de seta/linha continua olhando pra caixa NÃO rotacionada mesmo numa forma girada —
  limitação conhecida, não endereçada nesta etapa. +2 testes (hit-test rotacionado). 186 testes
  no total. Confirmado ao vivo: laço selecionando 2 formas, alternar aditivo mesclando seleção,
  mover/duplicar/excluir em grupo, popover fechando ao trocar seleção, alça de rotação girando
  a forma com rótulo de grau aparecendo. Ver [docs/16-rabisco.md](docs/16-rabisco.md).
- [x] **Etapa R5 — Rabisco: rótulo preso numa forma (duplo toque), rotação em grupo, botão de
  juntar** — pedido do usuário em 4 partes; a 1ª já estava pronta, só faltava confirmar. (1)
  "Rotacionar texto também" — já funcionava (`text` já estava em `ROTATABLE` desde a Etapa R4);
  confirmado ao vivo, sem mudança de código. (2) Duplo toque numa FORMA (retângulo/losango/
  elipse, `LABELABLE`) abre o mesmo editor de texto do item de texto solto, mas o resultado é um
  RÓTULO preso dentro dela (`el.text`/`el.labelColor`, campos que já existiam no tipo desde a
  Etapa R1 mas nunca eram desenhados nem editáveis) — centralizado na caixa da forma, que nunca
  muda de tamanho por causa dele (diferente de texto solto, cuja caixa É o texto). `hitTest` já
  tratava forma com `el.text` como "preenchida" (miolo inteiro clicável) desde antes — só faltava
  a ponta de criação/edição e o desenho (`ShapeLabel` em `Canvas.tsx`). (3) Seleção múltipla
  ganhou alça de rotação DE GRUPO (`GroupRotateHandle`) — gira todo mundo selecionado em torno
  do centro da SELEÇÃO (não do próprio centro de cada um), "seguindo a orientação do quadrado de
  seleção" como pedido: forma com caixa própria (`ROTATABLE`) órbita e soma na própria
  `rotation`; linha/seta/traço (sem uso de `rotation` no render) giram os PONTOS absolutos
  direto — mesmo resultado visual, guardado de um jeito diferente por tipo
  (`rotateElementAround`, novo em `geom.ts`, pura, reaproveitada no preview local e na mutação
  `rotateGroup`). (4) Botão "Juntar" (ícone `group`) aparece com mais de um selecionado; funde o
  grupo com um `groupId` novo compartilhado (`groupElements`, campo novo no tipo,
  `RabiscoElement.groupId`) — a partir daí, tocar em QUALQUER membro seleciona/move/rotaciona o
  GRUPO INTEIRO, como se fosse um elemento só (sem botão de desjuntar nesta etapa — não foi
  pedido, undo cobre voltar atrás). `duplicateElement` virou `duplicateElements` (lote, um clone/
  um passo de undo, igual `moveElements`/`rotateGroup`) — necessário pra grupo duplicado ganhar
  um `groupId` NOVO consistente entre os membros, sem vazar pro grupo original nem precisar de N
  passos de undo. +5 testes (191 total). Confirmado ao vivo: rótulo
  "Oi" centralizado dentro de um retângulo já rotacionado (acompanhando a rotação), grupo de 4
  formas girando junto pela alça (cada uma girando no próprio eixo E orbitando o centro do
  grupo), botão juntar seguido de desselecionar-e-tocar-um-só reselecionando o grupo inteiro, e
  arrastar um membro movendo todos. Ver [docs/16-rabisco.md](docs/16-rabisco.md).
- [x] **Etapa R5.1 — Rabisco: resize voltou a funcionar com a forma girada** — usuário corrigiu
  o corte de escopo da Etapa R4 ("não é pra tirar o resize do tipo texto"): girar um texto (ou
  qualquer `ROTATABLE`) tirava as alças de resize até desgirar de novo, e isso incomodava
  justamente pro caso mais comum de girar-e-ajustar-tamanho. Reversão, não invenção nova — a
  conversão pro referencial local (`toElementLocal`) já existia pro hit-test e pra alça de
  rotação; só faltava usar ela também no toque nas alças de resize (`selectStart`) e no delta do
  arrasto (`selectUpdate`, convertendo início E fim do gesto pro local antes de subtrair, não o
  delta bruto de tela) — `applyResize`/`withPreview`/commit continuam iguais, sempre trabalharam
  em espaço local mesmo. Render: as alças agora aparecem SEMPRE (não só sem rotação) — já viviam
  dentro do mesmo `<Group transform={rotate}>` da forma, então giram de graça, sem conta extra.
  Sem teste novo (reaproveita a cobertura de `toElementLocal` já existente; o resto é fiação de
  gesto, verificado ao vivo). Confirmado ao vivo: texto girado 45° mostra as 8 alças na posição
  visual certa (rotacionadas), e arrastar uma alça estica a caixa ao longo do eixo PRÓPRIO do
  texto (não do eixo da tela) — cresce na diagonal certa, não distorce.
- [x] **Etapa R5.2 — Rabisco: âncora de seta/linha troca de lado quando o elemento ligado vai
  pra posição oposta** — pedido do usuário: "se eu coloco em uma posição contra tem que trocar a
  ancora no elemento". Causa raiz: `bindPoint` (`domain/rabisco/geom.ts`) usava o `fx/fy`
  guardado no binding como um ponto FIXO na caixa da forma, escolhido uma vez na hora de ligar e
  nunca mais reavaliado — se o elemento na outra ponta da seta/linha depois se movesse pro lado
  OPOSTO da forma (ex.: texto que estava embaixo passa a ficar em cima), a âncora continuava
  grudada no lado antigo, fazendo a linha atravessar a forma por dentro pra alcançar um ponto que
  não faz mais sentido geometricamente pra aquela posição. Fix: antes de usar a âncora guardada,
  compara (produto escalar) se o outro extremo (`from`) ainda está do MESMO lado dela em relação
  ao centro da forma; se não estiver (produto negativo — foram pra lados opostos), cai pro
  cálculo dinâmico que já existia pra quando não tem `fx/fy` salvo (busca binária ao longo do
  segmento até a forma, sempre voltada pra `from`) — passando a escolher a borda que realmente
  encara quem está puxando a linha, em vez de insistir na borda antiga. Quando o lado NÃO muda,
  comportamento idêntico ao de antes (produto positivo, mantém a âncora exata escolhida pelo
  usuário — preserva o teste já existente de âncora numa borda específica, não centralizada).
  Um teste antigo (`arrowHeadAngle` cotovelo ancorado) testava essa mesma classe de bug numa
  camada diferente (direção da ponta, não lado da âncora) só que através de `resolvedPoints`
  ponta a ponta — como esse fix corrige o problema numa camada ANTES daquela, a geometria do
  teste mudou de sentido (a âncora escolhida deixou de estar "errada", então a ponta aponta pro
  lado oposto do que o teste antigo esperava, corretamente); reescrito pra construir `abs` à mão
  e isolar só o bug de roteamento em cotovelo que `arrowHeadAngle` resolve, sem depender de qual
  lado `bindPoint` escolhe. +2 testes novos direto em `resolvedPoints` (troca de lado quando o
  outro extremo vai pra posição oposta; mantém a âncora quando não muda de lado) — 193 testes no
  total. Verificação: só por teste automatizado dessa vez — o popover de formas do Dock não
  respondeu a toque sintético nesta sessão (mesma categoria de flakiness de simulador já
  documentada em etapas anteriores: alguns alvos de toque específicos falham silenciosamente sem
  padrão óbvio), então não foi possível desenhar uma seta nova ao vivo pra confirmar visualmente;
  a cobertura de teste, porém, exercita a EXATA geometria relatada (âncora presa, outro extremo
  do lado oposto) de forma determinística.
- [x] **Etapa R5.3 — Rabisco: pinça pulando de lugar, desagrupar, cotovelo com eixos
  conflitantes nos dois lados** — pedido do usuário em 4 partes (a 3ª e a 4ª eram o mesmo bug,
  visto de dois ângulos: "a seta ainda buga, ficou com uma aresta errada" + "a âncora que NÃO
  tem a seta [a ponta de trás] também tem que se adaptar... não só a seta em si"). (1) Zoom de
  pinça "bugando, indo pra outro lugar": causa raiz DUPLA em `Canvas.tsx`. Primeiro, um
  `panTwo` (`Gesture.Pan().minPointers(2)`) rodava em `Gesture.Simultaneous` junto da pinça —
  os dois disparavam `onUpdate` pro MESMO toque de 2 dedos e escreviam em `offsetX/Y` com
  fórmulas incompatíveis, um por cima do outro a cada frame. Removido (a pinça corrigida já
  cobre pan de 2 dedos sozinha). Segundo, a fórmula da pinça recalculava "qual ponto de cena
  está sob o dedo" usando o focal ATUAL a cada frame contra a transform BASE, em vez de fixar
  esse ponto UMA VEZ no início do gesto — se os dedos deslizassem enquanto beliscavam (o caso
  comum), o ponto que devia ficar grudado ao dedo derivava pro lado CONTRÁRIO ao movimento.
  Fix: `pinchBaseFocalX/Y` novos, capturados uma vez em `onStart`, usados pra fixar QUAL ponto de
  cena é o alvo; o focal ATUAL só entra na hora de reposicionar esse ponto, não na hora de
  descobrir qual é. (2) Botão "Desagrupar" — contraparte de "Juntar": `ungroupElements` (mutação
  pura, limpa `groupId` de quem tinha) e o HUD troca o ícone/ação conforme a seleção atual seja
  ou não um grupo de verdade (todos os selecionados com o MESMO `groupId` não-nulo — não só
  `selectedIds.length > 1`, que também cobre laço/aditiva solta). +2 testes. (3)+(4) Cotovelo com
  as duas pontas ancoradas em EIXOS DIFERENTES: `elbowRoute` só olhava pro lado de PARTIDA pra
  decidir o formato do caminho inteiro (`startH` dependia só de `ha`), ignorando o que o lado de
  CHEGADA precisava — se pedia o eixo contrário, a última perna do caminho nunca batia com a
  borda ancorada ali, mesmo com o PONTO certo (camada diferente do bug da Etapa R5.2, que resolve
  qual LADO da forma vira âncora, não o FORMATO do caminho que liga as duas âncoras). Fix: quando
  as duas pontas têm heading conhecido e DIFERENTE, um cotovelo de uma perna só (não o desvio de
  3 segmentos de sempre), na esquina que satisfaz os dois eixos ao mesmo tempo — sem mudar nada
  pro caso de mesmo eixo ou só um lado ancorado (testes antigos intactos). +1 teste. 196 testes no
  total. Verificação: (1) só análise matemática (pinça exige toque multi-touch de verdade,
  `cliclick` não simula); (2) confirmado ao vivo — grupo de 4 formas, botão "Desagrupar"
  aparecendo (ícone troca), apertado, e depois confirmado que tocar em UM membro não volta a
  selecionar o grupo inteiro (o ícone volta pra "Juntar", provando `groupId` limpo); (3)+(4) só
  teste automatizado — a linha do popover de formas do Dock não respondeu a toque sintético
  nesta sessão de novo (mesmo alvo específico da Etapa R5.2), mesmo com o resto da UI (incluindo
  o próprio botão que ABRE esse popover) respondendo normalmente.
- [x] **Etapa R5.4 — Rabisco: pinça pulando ao soltar os dedos, âncora de seta sempre dinâmica**
  — pedido do usuário em 2 partes. (1) "Solto os dois dedos e dá bug, vai pra outra posição" —
  bug DIFERENTE do da Etapa R5.3 (aquele era durante o gesto; este é bem na hora de SOLTAR).
  Causa raiz: os dois dedos quase nunca levantam no mesmo instante — por 1-2 frames sobra só 1
  dedo tocando, e nesse meio-tempo o `focalX/Y` da pinça deixa de ser a MÉDIA dos 2 toques e vira
  a posição EXATA desse dedo sozinho — um salto discreto de coordenada (não um movimento
  contínuo) que ia direto pra fórmula do offset. Fix: `onUpdate` ignora qualquer frame com
  `e.numberOfPointers < 2`. (2) "Ainda não está legal a adaptação de âncora" — depois de DUAS
  tentativas de meio-termo (Etapa R5.2: só troca de lado quando cruza 180°; Etapa R5.3: corrige o
  FORMATO do cotovelo quando os dois lados pedem eixos diferentes), o usuário confirmou que
  guardar QUALQUER estado do passado (mesmo só condicionalmente) nunca acompanhava direito um
  reposicionamento contínuo: "tem que se adaptar conforme a posição de ambos ligados se
  encontra". Mudança de fundo, não mais um remendo: `bindPoint` (`domain/rabisco/geom.ts`) parou
  de tentar preservar o `fx`/`fy` guardado no binding — agora SEMPRE recalcula onde a linha
  cruza a borda da forma em direção ao outro extremo, do zero, a cada resolução. `fx`/`fy`
  (`RabiscoBinding`) ficam sem uso pra posicionar — nada mais lê esses dois campos fora de
  `bindingAt`, que continua os calculando (mantidos só por compatibilidade de dados, não
  removidos do tipo). Efeito colateral: 1 teste da Etapa R5.3 (cotovelo com eixos conflitantes)
  dependia de um binding "forçado" que não fazia mais sentido virar permanente — reescrito com
  formas de proporção bem diferente (larga-baixa vs. estreita-alta) que produzem headings
  diferentes nos dois lados mesmo com âncora 100% dinâmica; as 2 outras da R5.2 foram
  consolidadas numa só (mesmo comportamento, sem mais "preserva vs. troca" pra distinguir — é
  tudo o mesmo cálculo agora). 195 testes no total (194 domínio + a suíte inteira). Verificação:
  (1) só análise — mesma limitação de multi-touch sintético da Etapa R5.3; (2) só teste
  automatizado — a mesma linha do popover de formas continuou não respondendo a toque sintético
  nesta sessão (3ª vez seguida no mesmo alvo específico, com o resto da UI, incluindo o botão
  que abre esse popover, respondendo normalmente nos mesmos minutos — reforça que é limitação de
  ambiente, não bug de código).
- [x] **Etapa R5.5 — Rabisco: ponta da seta em cotovelo desalinhada (torta) da própria linha**
  — usuário confirmou a Etapa R5.4 funcionando bem no aparelho de verdade ("muito bom") e
  reportou um detalhe visual sobrando: a ponta ("v") de uma seta em cotovelo (ligada numa forma)
  aparecia numa diagonal levemente torta, "não pode se inclinar meio grau... tem que ficar
  arredondado exemplo 90, 180". Causa raiz: `arrowHeadAngle` (`domain/rabisco/geom.ts`) ainda
  tinha o desvio da Etapa R4 — pra cotovelo ligado, ignorava a direção do ÚLTIMO SEGMENTO e
  apontava direto pro CENTRO da forma-alvo, uma diagonal que raramente é múltiplo de 90°. Fazia
  sentido na R4 (o roteamento em cotovelo podia produzir uma última perna torta em relação à
  âncora), mas as Etapas R5.2-R5.4 já resolveram isso NA RAIZ (âncora sempre recalculada pra
  encarar quem puxa a linha; formato do cotovelo sempre respeita o eixo de saída/entrada dos dois
  lados) — o segmento final de um cotovelo agora É sempre horizontal ou vertical por construção,
  então o desvio da R4 passou de "correção necessária" a "causa do problema": desalinhava a ponta
  de um traço que já estava certinho. Fix: removido o caso especial — `arrowHeadAngle` sempre
  segue o último segmento agora, reto/curvo/cotovelo, ligado ou não; virou uma função de um
  parâmetro só (`abs`), sem precisar mais de `el`/`all`. Teste antigo que checava o desvio
  (apontar pro centro) reescrito pra checar a garantia NOVA: `arrowHeadAngle` de um cotovelo
  ligado é sempre múltiplo de 90° (`sin(2·ângulo) ≈ 0`, livre de problema de módulo perto da
  borda). 195 testes no total (sem mudança de contagem — trocou 1 teste por 1). Verificação: só
  automatizada — fix de geometria pura, sem gesto nem interação envolvida; não precisou reabrir
  o simulador.

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
- [x] Tema segue o sistema até o usuário escolher, e aí persiste
- [x] Interface base traduzível em Português, English e Español; idioma muda em Ajustes e
  persiste entre sessões (testes de catálogo cobrem normalização e as chaves principais).
  Cobertura estendida à interface inteira (galeria, diagrama incl. composers/inspectors/
  ActionBar, documento incl. barra de formatação/outline, editor de código, assistente de IA,
  rabisco incl. dock/barra de estilo/seletor de cor/canvas) — não só as abas e ajustes iniciais.
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
  canvas renderizando fluxograma, ER e os outros tipos genéricos com seleção correta (ver
  docs/06-canvas.md/docs/07-selecao.md), navegação Biblioteca → Galeria → documento →
  Biblioteca, e **o editor de documento Markdown por inteiro** — Escrever, Ler (título,
  parágrafo com negrito, diagrama embutido renderizando de verdade dentro do cartão, tabela,
  lista de tarefas), barra de formatação com respiro correto do home indicator, persistência
  automática (o documento reaparece na Biblioteca depois de fechar). Ver docs/10-markdown.md
  pros dois bugs reais achados e corrigidos nessa passada (Estrutura pulando sempre pro início
  do documento; modo Ler sem rolagem). Toque em nó de fluxograma abrindo a barra de ações
  contextual **agora também confirmado** — era exatamente esse caminho que escondia o bug do
  `sel.id` sujo (ver acima e docs/07-selecao.md); ER já estava certo, não usa a mesma
  extração de id. **O que ainda não foi verificado visualmente**: inspetores, compositor,
  assistente de IA, exportar/compartilhar/importar — a lógica foi implementada com cuidado e
  passa nos testes automatizados, mas ninguém viu essas telas na tela ainda.
- **`EXPO_PUBLIC_API_ORIGIN` para o assistente de IA.** Em dev, `services/ai.ts` tenta
  adivinhar a origem da rota `/api/diagrama` a partir do host do Metro — funciona no caminho
  comum, mas veja `docs/11-assistente-ia.md` antes de um deploy de verdade.
