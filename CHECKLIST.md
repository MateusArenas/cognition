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
- [x] **Etapa R6 — Splash com checagem de atualização OTA (EAS Update) + início do vínculo com
  expo.dev** — pedido do usuário, fora do roteiro original: conta em expo.dev (`arenas_math`,
  organização `wasit`), publicar via `eas update` (ou o comando atual equivalente na versão do
  Expo do projeto). `expo-updates` instalado; `features/update/UpdateGate.tsx` segura a splash
  nativa (plugin `expo-splash-screen` já configurado) na raiz de `app/_layout.tsx` — antes de
  todo o resto — até checar (`checkForUpdateAsync`, timeout 4s), baixar (`fetchUpdateAsync`,
  timeout 8s) e recarregar (`reloadAsync`) se houver uma atualização; se não houver, se a rede
  falhar, ou se o timeout estourar, libera a tela com a versão já embarcada (nunca trava o
  app). Expo Go e build de dev não suportam `expo-updates` — detectado via
  `Constants.executionEnvironment === ExecutionEnvironment.StoreClient` e `__DEV__`, pulando
  a checagem sem tentar (a API lançaria erro do jeito errado). `tsc --noEmit` limpo, 197 testes
  (sem teste novo — não há lógica de domínio pura aqui, é só orquestração de API nativa).
  **Concluído nesta etapa**: usuário rodou `eas login` localmente (pra não passar credencial
  pelo chat); com a sessão logada, `expo.owner` setado pra `"wasit"` em `app.json`, `eas init
  --force` criou e ligou o projeto `@wasit/editor` (https://expo.dev/accounts/wasit/projects/
  editor, `extra.eas.projectId`), e `eas update:configure` preencheu `updates.url` e
  `runtimeVersion: {policy: "appVersion"}` em `app.json`. `tsc --noEmit` limpo depois de cada
  passo.
  **Rebranding pra "Wasit" (pedido logo em seguida, "troque em tudo para esse nome")**:
  `expo.name` → `"Wasit"`, `expo.slug`/`expo.scheme` → `"wasit"`, `package.json#name` →
  `"wasit"`, `settings.appName`/`library.subtitle` nos três catálogos de i18n → `"Wasit"`. Como
  o slug mudou e o CLI desta versão não tem comando de renomear projeto, `eas init --force` de
  novo criou um projeto NOVO — `@wasit/wasit` (https://expo.dev/accounts/wasit/projects/wasit,
  novo `projectId`) — e `eas update:configure` rodou de novo pra apontar `updates.url`/
  `runtimeVersion` pro projeto novo. `@wasit/editor` (o projeto criado no passo anterior, sem
  nenhum build/update publicado) ficou órfão no dashboard, sem custo — pode ser apagado
  manualmente pelo usuário. Não mexido de propósito: `ios.bundleIdentifier`
  (`com.arenas-math.editor`) — identificador técnico de loja, não visível ao usuário, trocar
  sem necessidade vira "outro app" uma vez publicado; como nada foi publicado ainda dá pra
  trocar sem custo se o usuário confirmar querer isso também. `tsc --noEmit` limpo, 197 testes
  passando.
  **Ainda pendente**: pelo menos um `eas build` (Android e/ou iOS) — só um build fora do Expo Go
  recebe OTA de verdade; `eas build:configure` (gera `eas.json` com os profiles de build) ainda
  não rodou, é o próximo passo natural antes do primeiro build. Build iOS exige conta Apple
  Developer paga; Android não. Até o primeiro build existir, o `UpdateGate` continua um no-op
  seguro em qualquer teste via Expo Go — ver docs/02-setup-e-estrutura.md §"Atualizações OTA e
  publicação (EAS)". Verificação: só `tsc`/testes — não dá pra testar o fluxo de update de
  verdade sem um build instalado fora do Expo Go, que ainda não existe.
- [x] **Etapa R6.1 — Primeiro canal/branch de atualização (`hml`) e primeira publicação via
  `eas update`** — pedido do usuário ("gere um update pra lá... quero que suba lá") mais
  "crie um channel hml" no meio da mesma tarefa. `eas channel:create hml` criou o canal e a
  branch `hml` (par 1:1, mesmo nome) em `@wasit/wasit`. `eas update --branch hml --platform
  android` e depois `--platform ios` publicaram o JS atual como o primeiro grupo de update em
  cada plataforma (ver links no EAS Dashboard nos logs desta etapa). Como esperado (nenhum
  `eas build` existe ainda), o CLI avisou "No compatible builds found for the following
  fingerprints" nas duas — a publicação fica arquivada no branch/canal, pronta pra ser
  consumida assim que existir um build com `expo-updates` embutido apontando pro canal `hml`
  (via `eas.json`, campo `channel`, que ainda não existe — `eas build:configure` não rodou).
  **Achado real no processo**: `eas update --platform all` (o padrão) falha — `expo export`
  tenta empacotar TAMBÉM pra web (porque `app.json` tem `web.output: "static"`) e a build web
  quebra: `expo-sqlite/web/worker.ts` importa `./wa-sqlite/wa-sqlite.wasm`, que o bundler não
  resolve (`Unable to resolve module`). Não é regressão desta sessão — é um problema
  pré-existente de bundling pra web com `expo-sqlite`, e o app nunca teve alvo web de verdade
  (só Expo Go/iOS/Android, ver topo do CHECKLIST). Contornado publicando `--platform android` e
  `--platform ios` separados em vez de `all`; o bug em si não foi investigado/corrigido —
  documentado aqui como limitação conhecida caso `web` volte a ser um alvo real algum dia.
  Verificação: publicação real, confirmada pelos IDs/links de update retornados pelo CLI; sem
  teste automatizado novo (orquestração de CLI, não lógica de domínio).
- [x] **Etapa R7 (Rabisco) — exportar e compartilhar (PNG, PDF, SVG, copiar) + PDF pros
  diagramas Mermaid** — nota de numeração: este "R7" é o roadmap PRÓPRIO do Rabisco em
  [docs/16-rabisco.md](docs/16-rabisco.md) (R1-R7, escopo só do Rabisco) — diferente da
  sequência "R6"/"R6.1" logo acima, que é sobre EAS/splash (app inteiro). Os dois "R" não são a
  mesma numeração; ver a nota lá.
  Pedido do usuário em duas partes: (1) Rabisco não tinha NENHUMA saída (nem PNG) — menu
  "Compartilhar" novo (`features/rabisco/ShareSheet.tsx`) com copiar SVG, arquivo SVG, PNG e
  PDF; (2) diagramas Mermaid ganham PDF no `ShareSheet` que já existia
  (`features/diagram/ShareSheet.tsx`), ao lado de PNG/código-fonte/copiar. `domain/rabisco/
  svg.ts` (novo) — `docToSvg(doc)` espelha `Canvas.tsx#ElementView` elemento por elemento,
  reaproveitando a MESMA geometria de `domain/rabisco/geom.ts` que já alimenta o Skia
  (`elementGeometry`/`bounds`/`dashPattern`), só emitindo markup SVG em vez de `<Path>`/
  `<Group>` — é a fonte única por trás das quatro saídas do Rabisco. PDF é a MESMA função
  (`exportarPdf(svg, nome)`, `services/export.ts`) pras duas telas — usa `expo-print`
  (`Print.printToFileAsync`, HTML→PDF, funciona no Expo Go sem build nem conta de loja) — só
  muda de onde vem o SVG: um `exportSvg` novo no bridge RN↔WebView do diagrama (mesma limpeza
  de `.hitlayer`/`.sellayer` que já existia pro PNG, extraída pra `cleanSvgString()` em
  `runtime.shell.html`/`runtime.html` — **lembrar de rodar `npm run runtime` de novo depois de
  editar o `.shell.html`, ele é gerado**) ou `docToSvg(doc)` direto pro Rabisco. PNG do Rabisco
  (`exportarRabiscoPng`) não tem WebView pra rasterizar — usa `Skia.SVG.MakeFromString` +
  `Skia.Surface.MakeOffscreen` + `canvas.drawSvg` + `encodeToBase64`, síncrono, fora da árvore
  React. `expo-print` instalado. 204 testes (era 197; +7 novos em `domain/rabisco/svg.test.ts`
  — fill/hachura, rótulo preso em forma, rotação, escapamento de XML, viewBox). `tsc --noEmit`
  limpo. Verificação: só automatizada — nenhuma das quatro saídas do Rabisco nem o PDF do
  diagrama passa por gesto/gesture handler, então não precisou do simulador. **Pendente, fora
  do pedido desta sessão**: importar `.svg` de fora pra virar Rabisco editável (resto da Etapa
  R7 do roadmap original).
- [x] **Etapa R7.1 — Compartilhar em documento Markdown (copiar, .md, PDF)** — pedido do
  usuário, mesmo padrão nas três telas agora. `DocumentScreen` ganha `features/document/
  ShareSheet.tsx` no lugar do antigo botão "Exportar" direto: Copiar texto, Arquivo Markdown
  (já existia via `exportarTexto`) e Arquivo PDF (novo). `domain/markdown/toHtml.ts`
  (`mdToHtml`) converte a MESMA árvore `MdNode[]` de `renderMarkdown()` que já alimenta o modo
  Ler em RN — mesmo "geometria uma vez, N saídas" de `domain/rabisco/svg.ts`.
  `exportarMdPdf(doc)` reaproveita `printHtmlToPdfFile()`, extraído da função `exportarPdf`
  original pra separar a parte específica de SVG (diagrama/Rabisco) da parte genérica
  HTML→arquivo→share (agora usada também pelo documento, sem largura/altura fixa — pagina
  sozinho no Letter padrão). Bloco ` ```mermaid ` embutido sai como código-fonte rotulado, não
  como diagrama renderizado (rodaria o mermaid.js de ~3.4MB dentro do HTML do PDF — não
  pedido). **Sem PNG, deliberadamente**: diferente de diagrama/Rabisco (que JÁ são SVG,
  rasterizável), um documento Markdown vira RN puro ou HTML — nenhum dos dois é SVG. A forma
  padrão de rasterizar RN (`react-native-view-shot`) tem código nativo e não funciona no Expo
  Go, que é uma restrição dura do projeto — não instalado; ver docs/12-persistencia-e-export.md
  pras alternativas (aceitar a lib nativa, ou escrever um layout de texto próprio em SVG pra
  reaproveitar `svgParaPngBase64()` sem sair do Expo Go). 210 testes (era 204; +6 em
  `domain/markdown/toHtml.test.ts` — título, negrito/itálico/code, escapamento de XML, tarefa
  marcada, tabela com alinhamento, bloco mermaid rotulado). `tsc --noEmit` limpo. Verificação:
  só automatizada, mesmo motivo das etapas de export anteriores.
- [x] **Etapa DB1 — Cliente de banco de dados: nova tab no app + backend NestJS/Knex/Prisma/
  CASL, monorepo** — pedido grande do usuário, guiado por dois documentos que ele escreveu:
  `DB-MOBILE.md` (spec funcional completa, ~1950 linhas) e `prototipo.html` (protótipo
  navegável/inspetor de rotas). Detalhe completo em
  [docs/17-db-client.md](docs/17-db-client.md) — aqui só o resumo do que foi construído e
  testado.
  - **Monorepo**: `package.json` novo na raiz (workspaces `["editor","backend"]`). `editor/`
    não mudou de lugar nem de comportamento — só passou a compartilhar `node_modules` hoisted.
  - **Decisão de arquitetura**: duas ferramentas de dado, de propósito — Knex pros bancos-ALVO
    (schema desconhecido até conectar, dialeto escolhido em runtime) e Prisma pros dados
    PRÓPRIOS do backend (usuários/roles/permissões CASL/conexões salvas, schema fixo, roda
    sobre Postgres via `docker-compose.yml` novo na raiz).
  - **Backend novo (`backend/`)**: NestJS. `auth/` (login JWT), `users/` (CRUD), `permissions/`
    (`CaslAbilityFactory` monta a Ability por usuário a partir de Role→Permission do Prisma,
    sem cache — revogar uma role vale na hora; `PermissionsGuard` + `@CheckAbility()`),
    `connections/` (CRUD + senha cifrada AES-256-GCM + `KnexPoolService`, uma instância knex
    por conexão em memória, + `GET /drivers`), `catalog/` (schemas/tables/ddl/rows — controller
    nunca sabe dialeto, pede pro `DialectRegistry`; `dialects/` tem `pg`/`mysql`/`sqlite`/
    `mssql`/`oracle` .strategy.ts na MESMA interface), `erd/` (Mermaid `erDiagram` a partir do
    catálogo), `mutations/` (insert/update/delete numa transação, trava otimista via `was`,
    `NO_PK`/`NULL_PK`/`CONFLICT`/`READ_ONLY`). Swagger em `/api/docs` desde o primeiro boot.
    `prisma/seed.ts` novo (`npm run db:seed`) cria a primeira role admin — sem isso ninguém
    conseguiria nem criar o segundo usuário.
  - **App (`editor/src/features/dbclient/`)**: nova tab "Banco de Dados" (`app/(tabs)/
    dbclient.tsx`), telas empilhadas em `app/db/` (mesmo padrão de `app/doc/[id].tsx`) — Login,
    Conexões (lista com bolinha colorida), Formulário de conexão (campos gerados por
    `drivers.ts`, Testar conexão), Banco (Tabelas + Diagrama), Tabela (Dados/Estrutura/DDL/
    Diagrama). **Reaproveita o design system existente inteiro** — `GroupedList`/`Row`/`Field`/
    `Segmented`/`Sheet`/`Chip`/`NavBar`/`AlertDialog`/`Fab` — em vez de recriar um do zero
    (o `DB-MOBILE.md` original desenhava um `theme.ts`/`ui/index.tsx` próprios, redundantes com
    o que já existe). ERD reaproveita o MESMO runtime WebView dos diagramas Mermaid do resto do
    app. i18n: seção `"dbclient"` nova nos três catálogos.
  - **Testes**: backend com Jest — 3 arquivos unitários (`crypto.util.spec.ts`,
    `filters.service.spec.ts` — inclui um teste que tenta injetar `DROP TABLE` num nome de
    coluna e confirma que é rejeitado antes de tocar no query builder —, `casl-ability.factory.
    spec.ts`) + 2 e2e completos com supertest contra o app Nest real (`dbclient.e2e-spec.ts`:
    login → CRUD de conexão → conectar → tabelas → estrutura → DDL → rows com filtro/paginação/
    busca → coluna inexistente rejeitada → ERD → preview/aplicar mutation → conflito otimista
    com rollback confirmado → NULL_PK → READ_ONLY → senha nunca exposta; `permissions.e2e-spec.
    ts`: CASL de verdade, usuário só-leitura não passa de 403). 46 testes de backend, todos
    passando. App: `drivers.test.ts` novo (7 testes, `getPath`/`setPath`/`baseConfigFor`) — 217
    testes no total do app (era 210). `tsc --noEmit` limpo nos dois lados.
  - **Banco de teste**: SQLite, não Postgres — decisão de teste (mais rápido, sem depender de
    infra externa), não limitação de ambiente: o Postgres real do `docker-compose.yml` já foi
    subido e validado ao vivo nesta mesma sessão (migrations, seed, boot do backend, chamadas
    HTTP reais). `schema.test.prisma` (mesmos modelos de `schema.prisma`, provider sqlite) gera um
    client à parte, injetado no lugar do `PrismaService` real via `overrideProvider()` do Nest.
    O schema é aplicado com DDL escrito à mão (`test/prisma-test-client.ts`), **não** `prisma db
    push`/`migrate` — essas ferramentas alteram um banco de verdade, e tanto o CLI do Prisma 7
    quanto o harness deste agente bloqueiam por padrão um agente de IA rodando esse tipo de
    comando, mesmo mirando um arquivo temporário. Pedimos consentimento explícito do usuário
    antes de qualquer tentativa, e a solução final (SQL de mão) nem precisa mais do bypass.
    `sqlite.strategy.ts` é o único dialeto testado de ponta a ponta (dos dois lados: metadados
    do backend via Prisma E banco-alvo de exemplo via Knex). `pg`/`mysql`/`mssql`/`oracle.
    strategy.ts` têm código completo (consultas de catálogo padrão documentadas —
    `pg_catalog`/`information_schema`/`sys.*`/`ALL_*`) mas SEM teste de integração ao vivo —
    fica pro usuário validar com `docker-compose up` + um servidor de verdade.
  - **Deliberadamente fora desta entrega** (documentado, não escondido — ver
    docs/17-db-client.md): construtor de consultas solto (a mesma grade da aba Dados já cobre a
    maior parte do valor), edição em lote com revisão antes de salvar (a edição é uma mutação
    por toque agora, ainda passa pela mesma rota com trava otimista), dialeto Oracle na lista
    do app (driver `oracledb` pesado, não instalado), filtros salvos/exportar CSV/túnel SSH/
    múltiplas abas (já eram "fora" no `DB-MOBILE.md` original).
  - Verificação: `npm run test` + `npm run test:e2e` no `backend/`, `tsc --noEmit` + `vitest
    run` no `editor/` — tudo verde. Sem verificação visual num simulador de verdade (mesma
    limitação de sempre deste ambiente).
- [x] **Etapa DB2 — retoques pós-uso real: grade com ações, filtros, novo registro, cartões de
  DDL/Diagrama, console SQL livre** — depois de usar o app de verdade num simulador e comparar
  com `prototipo.html`, o usuário listou o que faltava na Etapa DB1; esta etapa cobre esse lote
  inteiro. Detalhe em [docs/17-db-client.md](docs/17-db-client.md).
  - **`DataGrid` compartilhada** (`editor/src/features/dbclient/screens/DataGrid.tsx`), usada
    tanto na aba Dados de `TableScreen` quanto no resultado da aba Consulta: número da linha
    tocável abre folha (copiar/duplicar/excluir/editar registro inteiro); tocar numa célula
    NUNCA edita direto — abre folha de opções (editar valor **ou** definir NULL, filtrar por
    esse valor, excluir esse valor = filtro `neq` que tira as linhas com aquele valor da grade
    sem apagar nada, copiar); rodapé mostra total de registros, página atual/total de páginas e
    tamanho de página (cicla 25/50/100); borda laranja quando o resultado não é editável (view,
    tabela sem PK, ou SELECT com JOIN no console).
  - **`FiltersSheet`**: construtor de filtro por toque — coluna e operador sempre de uma lista
    fechada (nunca texto livre viraria SQL, mesma regra de ouro do resto do app), lista os
    filtros ativos com botão de remover.
  - **`RecordFormSheet`**: um só componente pra "Nova linha" e "Editar registro inteiro" —
    mostra tipo e obrigatoriedade (NOT NULL sem default → obrigatório) por coluna, toggle NULL
    por campo que aceita nulo, colunas autoincrement ficam travadas/ocultas na criação.
  - **DDL** (aba de `TableScreen`) agora é um cartão com borda, scroll interno e botão "Copiar
    DDL" — antes era um `<Text>` solto sem moldura.
  - **`DiagramCard`** (`screens/DiagramCard.tsx`), compartilhado entre o Diagrama de
    `DatabaseScreen` (schema inteiro) e de `TableScreen` (vizinhança de uma tabela): cartão com
    borda e scroll interno; alternâncias "Mostrar colunas"/"Só chaves" nos dois níveis, mais
    "Profundidade" (1-3, só na vizinhança de tabela — o backend já suportava esse parâmetro,
    só não tinha UI); "Ver código Mermaid" mostra o texto num cartão próprio com "Copiar";
    exportar reaproveita o MESMO `ShareSheet`/`services/export.ts` da tela de Diagrama de
    documentos (PNG, PDF, arquivo `.mmd`, copiar) — `MermaidView` virou `forwardRef` pro handle
    `exportPng`/`exportSvg` do `DiagramCanvas` pra isso funcionar sem duplicar nada.
  - **Console SQL livre — aba "Consulta"** (`QueryTab.tsx`, entre Tabelas e Diagrama em
    `DatabaseScreen`): pedido explícito do usuário, e por escolha própria dele diverge de
    `prototipo.html` (que reservava "console SQL" pra outra coisa). Única rota do app inteiro
    em que o texto digitado vira SQL de verdade — exceção controlada à "REGRA DE PROJETO",
    documentada, não escondida. Backend: `POST /connections/:id/query` →
    `IntrospectService#rawQuery` → `sql-safety.ts#checkReadOnlySql()` (só um `SELECT`/`WITH`,
    sem `;` no meio, varre a string inteira atrás de palavra de escrita — pega até CTE
    gravável; heurística por regex que erra pro lado de rejeitar, não de deixar passar). Editável
    célula a célula só quando vem de uma tabela só sem JOIN (`edicao.table`, campo novo que
    `rows()` e `rawQuery()` agora devolvem os dois); com JOIN a `DataGrid` mostra os resultados
    com borda laranja e sem ação de escrita nenhuma. App: `CodeEditor` (o mesmo do editor
    Mermaid) ganhou props opcionais `tokenizer`/`palette` — reaproveita toda a técnica de
    sobreposição texto colorido + `TextInput` transparente e o trabalho de teclado/scroll já
    resolvido lá, plugando só um tokenizador novo (`lib/sql-highlight.ts`) em vez de duplicar o
    componente; erro de SQL real do driver aparece embaixo do editor, não um alerta genérico.
  - **i18n**: todas as chaves novas nos três catálogos (`pt-BR`/`en`/`es`), incluindo
    `filterOp.*` (11 operadores) e `tabs.dbclient`/`common.save`.
  - **Testes**: backend ganha `sql-safety.spec.ts` (9 testes unitários) e 4 casos novos em
    `dbclient.e2e-spec.ts` (SELECT numa tabela só = editável com `table` certo, JOIN = não
    editável, escrita rejeitada, múltiplas instruções rejeitadas) — 32 unitários / 27 e2e no
    backend, todos verdes. App: `tsc --noEmit` limpo e as 217 suítes de `vitest` continuam
    verdes (a `DataGrid`/`FiltersSheet`/`RecordFormSheet`/`DiagramCard`/`QueryTab` novos não têm
    teste próprio de simulador — mesma limitação de sempre deste ambiente; cobertos por tipo e
    pela suíte e2e do backend que exercita toda rota que eles chamam).
  - **Fora desta entrega, por escolha, não por esquecimento**: edição em lote com buffer/revisão
    antes de salvar (o usuário pediu ações — duplicar, excluir, editar — não um buffer
    multi-seleção; cada ação já aplica na hora, passando pela mesma rota `mutations` com trava
    otimista por trás) e construtor de consultas visual (o console SQL livre cobre esse caso de
    uso de outro jeito, por pedido explícito do usuário).
  - **Bug real achado e corrigido testando ao vivo, depois que o Docker do usuário voltou ao
    ar**: `pg.strategy.ts#indexes()`/`#foreignKeys()` devolviam nomes de coluna como a string
    literal `"{email}"` em vez de `["email"]` — o driver `pg` não desserializa `array_agg` de
    colunas do tipo `name` (OID 1003) em array por padrão. Só aparece contra um Postgres de
    verdade com FK/índice (SQLite não tem esse tipo, então a suíte automatizada nunca passava
    por ali); sintoma era `500` em `GET .../ddl` e quebraria o ERD de qualquer schema com FK.
    Corrigido com `::text` dentro dos três `array_agg` do arquivo. Validado de novo ao vivo:
    DDL, estrutura (índices/FKs) e ERD do schema inteiro do próprio Postgres do backend, usado
    como banco-ALVO de teste pra essa passada. Detalhe em
    [docs/17-db-client.md](docs/17-db-client.md), seção "Bug achado testando ao vivo".
  - **Segunda passada de retoque visual, depois que o usuário testou Consulta/Diagrama no
    simulador**: causa raiz do "ficou feio" era `Chip` (cápsula translúcida com blur, pensada
    pra HUD flutuante SOBRE canvas — zoom/desfazer na tela de Diagrama de documentos) sendo
    usado como botão comum em telas sem canvas por trás. Três componentes novos promovidos pro
    design system geral (`docs/03-design-system.md`): `RowSwitch` (`Switch` nativo encolhido
    0.8× pra caber numa `Row`), `TintedButton` (botão de largura cheia, fundo azul translúcido —
    Executar consulta, Compartilhar diagrama, Copiar DDL) e `Banner` (erro/aviso com fundo
    tingido na cor do tom). `DiagramCard`: alternâncias viraram `Row`+`RowSwitch` num grupo
    "Modelo relacional" em vez de `Chip`s soltos; "Ver código Mermaid" agora troca o conteúdo
    (canvas ↔ texto) em vez de empilhar os dois; bug real corrigido — `MermaidView` nunca
    repassava o `onError` do `DiagramCanvas` pro React, então um erro de render do mermaid.js
    (schema vazio, por exemplo) deixava a tela em branco pra sempre sem spinner nem mensagem;
    ganhou também uma checagem de "sem entidades" com estado vazio decente em vez de tentar
    desenhar um `erDiagram` impossível. `QueryTab`: cartão do SQL com borda esquerda colorida
    (vermelha em erro, como o protótipo), `TintedButton` no lugar do Chip, e a consulta abre
    pré-preenchida com um SELECT nas tabelas do catálogo (varia por dialeto — `sqlite_master` no
    SQLite, `information_schema.tables` nos demais) em vez de uma caixa vazia. `TableScreen`: DDL
    ganhou realce de sintaxe de verdade (`sql-highlight.ts` ganhou vocabulário DDL — `CREATE
    TABLE`, tipos de coluna — além do DML que já tinha pro console). `tsc --noEmit` limpo, 217
    testes verdes; sem verificação visual de novo no simulador (a sessão do Metro era do
    usuário, sem `idb` no ambiente pra automatizar toque de forma confiável).
- [x] **Etapa DB3 — Consulta ganha toggle de escrita, DDL vira Compartilhar, cartão do DDL
  menor** — três pedidos pequenos e diretos do usuário depois de usar a Etapa DB2. Detalhe em
  [docs/17-db-client.md](docs/17-db-client.md).
  - **Cartão do DDL com altura fixa (~40% da tela)**: era `flex:1`/`minHeight:50%`, crescia até
    quase tomar a tela inteira. Agora `height: alturaJanela * 0.4` (`useWindowDimensions`), com
    rolagem vertical E horizontal por dentro (`TableScreen.tsx`).
  - **"Copiar DDL" virou "Compartilhar"**: abre uma bottom sheet (`Sheet`+`GroupedList`) com
    duas opções — Copiar (mesmo de antes) e Arquivo SQL (`exportarSqlTexto()` novo em
    `services/export.ts`, mesmo caminho de `exportarMermaidTexto` — escreve `.sql` no cache e
    entrega pro share sheet nativo via `expo-sharing`).
  - **Toggle "Permitir alterar dados" na aba Consulta** (só ali, em nenhum outro lugar do app):
    `Row`+`RowSwitch` acima do editor, desligado por padrão a cada abertura da aba (não
    persiste). Libera `INSERT`/`UPDATE`/`DELETE` como instrução única de topo —
    `DROP`/`ALTER`/`TRUNCATE`/`CREATE`/etc. continuam bloqueados SEMPRE, com ou sem o toggle,
    porque alteram schema/servidor, não "os dados de uma tabela". **Verificação nos dois
    lados**: o app faz uma checagem rápida (primeira palavra) só pra feedback instantâneo sem
    round-trip; a fonte de verdade é sempre o backend (`sql-safety.ts#checkReadOnlySql(sql,
    {allowWrite})`) — chamar a rota direto (Swagger/curl) sem passar pelo app cai na mesma
    validação. Conexão marcada `readOnly` continua bloqueando escrita mesmo com o toggle ligado
    no app (código `READ_ONLY`, mesma exceção de `ReadOnlyGuard`). Resposta de escrita ganha
    `affectedRows` (contagem por dialeto: `rowCount` no pg, `changes` no sqlite — os dois
    validados ao vivo; `affectedRows`/`rowsAffected` no mysql/mssql, sem teste ao vivo, mesma
    lacuna já disclosed pros outros dialetos) e o app mostra um banner "N linha(s) afetada(s)"
    em vez de tentar desenhar grade vazia.
  - **Testes**: `sql-safety.spec.ts` ganha 7 casos novos (`allowWrite` aceita INSERT/UPDATE/
    DELETE e extrai tabela, continua rejeitando DDL/múltiplas instruções, SELECT inalterado) —
    39 unitários no backend. `dbclient.e2e-spec.ts` ganha 4 casos novos contra SQLite de verdade
    (INSERT/UPDATE/DELETE com allowWrite rodam e devolvem `affectedRows` certo, sem o toggle
    continuam rejeitados, DROP rejeitado mesmo com o toggle, conexão `readOnly` bloqueia mesmo
    com o toggle) — 31 e2e. Validado ao vivo de novo contra o Postgres real do
    `docker-compose.yml` depois dos testes automatizados (mesmo roteiro, `rowCount` do driver
    `pg` confirmado). App: `tsc --noEmit` limpo, 217 testes `vitest` continuam verdes.
  - **Três retoques de UX pedidos depois de usar as folhas de linha/célula**: (1) folha "Ações
    da linha" não dizia qual linha nem de qual tabela — ganhou `tag` (badge monoespaçado no
    cabeçalho, prop que o `Sheet` já tinha mas ninguém usava) com `tabela · pk=valor`; (2) folha
    de célula mostrava só o nome da coluna, sem deixar claro que É uma coluna — ganhou `tag`
    "COLUNA"; (3) tocar fora de qualquer bottom sheet do app inteiro não fechava nada — o
    `BottomSheetModalProvider` estava configurado mas sem `backdropComponent` nenhum, então a
    área por trás da sheet não escurecia nem reagia ao toque (bug de verdade, não só falta de
    polish — contra o comportamento nativo do iOS que toda sheet deveria ter). Corrigido no
    `Sheet` (`design/components/Sheet.tsx`) com `BottomSheetBackdrop` — vale pro app inteiro,
    não só o cliente de banco, já que é o MESMO componente atrás de toda sheet do app.
  - **"Nova linha" — três problemas reportados usando de verdade**: (1) criar um registro que
    viola UNIQUE mostrava literalmente `[object Object]` — o `catch` de `RecordFormSheet` fazia
    `e instanceof Error ? e.message : String(e)`, mas o erro rejeitado pelo `http.ts` é sempre
    um objeto `ApiErrorBody` (nunca `Error`), então caía direto no `String(e)` ignorando o
    `.message` certinho que o backend já mandava; corrigido com `isApiError(e)` primeiro (mesmo
    helper que `DataGrid` já usava nos outros catches) e o erro agora sai num `Banner`
    vermelho, não texto solto. (2) Criar com sucesso não dava nenhum feedback — sem toast,
    parecia que não tinha acontecido nada; `DataGrid.submitForm` agora chama `show()` com
    "Registro criado."/"Registro atualizado." depois do `onReload()`. (3) Botões "Cancelar"/
    "Salvar" eram dois `Chip` lado a lado — mesmo problema de design já corrigido em Consulta/
    Diagrama (`Chip` é pra HUD sobre canvas, não botão genérico); trocado por `TintedButton`
    "Salvar" cheio como única ação primária (cancelar já é o X do `Sheet`, botão duplicado
    removido). (4) Depois de salvar com sucesso, "Nova linha" reabria com o que tinha sido
    digitado da vez anterior — o `useEffect` que limpa os campos só dispara quando a referência
    de `initial`/`columns` muda, e "Nova linha" sempre manda `initial=null` (mesma referência);
    corrigido resetando os campos direto no sucesso do `submit()` quando `!isEdit` (editar não
    precisa, cada linha já manda um `initial` novo). `tsc --noEmit` limpo, 217 testes `vitest`
    verdes.
  - **`FiltersSheet` redesenhada (pedido "mais Apple, mais UX")** — o formato antigo (uma única
    folha com lista de filtros ativos + coluna/operador/valor construídos ali dentro) ficou
    "não muito agradável" na avaliação do usuário. Reconferindo o `prototipo.html` (`folhaFiltro`
    + a barra `.filtros` da aba Dados) achei que o design de referência do próprio projeto já
    resolvia isso: os filtros ativos são pills inline na barra acima da grade, e a folha é só o
    editor de UMA condição por vez. Redesenho: `DataGrid` ganhou uma barra horizontal rolável com
    pill "+ Filtro" azul, um pill índigo por filtro ativo com rótulo legível ("status é igual a
    ABERTO", não mais "coluna: operador" cru) que reabre o editor já preenchido ao tocar, e um
    pill cinza "limpar tudo" quando há algum filtro — nenhum é `Chip` (pill plana, sem blur; ver
    nota de design abaixo). `FiltersSheet` virou só o editor: coluna (chips), operador (chips,
    filtrado pelo tipo real da coluna — só `contains`/`startsWith`/`endsWith` aparecem em colunas
    de texto), valor (campo, escondido pra `isNull`/`notNull`), `TintedButton` "Aplicar" e um
    link vermelho "Remover filtro" só ao editar um existente. O rascunho (`draft`) agora é
    controlado pelo `DataGrid`, não estado interno do `FiltersSheet` — mesma razão do bug já
    corrigido em "Nova linha": estado que só reseta quando a referência de uma prop muda quebra
    num fluxo onde "+ Filtro" sempre chamaria com o mesmo `index: null`. `tsc --noEmit` limpo,
    217 testes `vitest` verdes.
  - **Bug de layout achado testando ao vivo**: a barra de pills virou uma faixa VAZIA enorme
    empurrando a grade inteira pra baixo — o `ScrollView horizontal` sem `style` explícito herda
    o comportamento padrão da lib de crescer (`flexGrow`) pra preencher o espaço vertical
    restante do pai `flex:1`, em vez de travar na altura do próprio conteúdo (uma linha de
    pills). Corrigido com `flexGrow: 0, flexShrink: 0` no `style` do `ScrollView` (`DataGrid.tsx`,
    `styles.filterBar`) — a barra agora ocupa a tela só horizontalmente, do jeito que uma faixa
    de filtros deveria.
  - **Ajuste seguinte, pedido pontual do usuário ("não ficou do jeito que falei")**: o
    `ScrollView horizontal` continuava escondendo as pills atrás de um gesto de arrastar — uma
    pill solitária num canto, o resto da largura da barra vazio; não era "ocupar a tela
    horizontalmente" (pedido original), era o oposto. Trocado por `View` com `flexDirection:
    'row', flexWrap: 'wrap'` (`styles.filterBar`) — mesmo comportamento do `.filtros` do
    `prototipo.html` (`display:flex;flex-wrap:wrap`): as pills usam a largura inteira da barra e
    quebram linha sozinhas quando não cabem mais, nada escondido atrás de scroll.
  - **Terceiro ajuste, mesmo pedido de fundo**: o pill azul "+ Filtro" saiu de vez — virou um
    botão só-ícone (`sliders`, mesmo desenho do X de fechar do `Sheet`: círculo 36pt subtil,
    `surface3` normal, azul quando algum filtro já está ativo) na MESMA linha do campo de busca,
    canto direito. O campo de busca migrou de `TableScreen.tsx` pra dentro de `DataGrid.tsx`
    (props novas `search`/`onSearchChange`/`onSearchSubmit`) só pra poder ficar na mesma linha
    do botão — os dois são a mesma faixa de UI (busca + filtro), fazia sentido morarem juntos.
    Os pills de filtro ATIVO continuam numa segunda linha (`flexWrap`), só o gatilho "abrir
    editor de filtro novo" que virou ícone. `tsc --noEmit` limpo, 217 testes `vitest` verdes.
- [x] **Etapa Auth — rework completo de autenticação: JWT accessToken/refreshToken, multi-conta,
  app inteiro atrás do login** — pedido grande do usuário, decidido via 4 perguntas diretas
  (login trava o app inteiro, não só a aba Banco de Dados; a senha é salva junto com os tokens
  pra permitir re-login silencioso; sem SMTP disponível, `MailService` cai pro log; login aceita
  e-mail OU username). Detalhe completo em [docs/18-autenticacao.md](docs/18-autenticacao.md).
  - **Backend**: `User` ganha `username`; dois modelos novos, `Session` (refresh token com hash,
    rotação + detecção de reuso — token já rotacionado reapresentado revoga TODAS as sessões do
    usuário) e `PasswordResetToken` (mesmo padrão de hash). Rotas novas em `/auth`: `register`,
    `login` (campo `identifier`, breaking change em 2 e2e specs existentes, atualizados),
    `refresh`, `me`, `logout`, `forgot-password`, `reset-password`. `JwtAuthGuard` distingue
    `TOKEN_EXPIRED` de `UNAUTHENTICATED` (bug real corrigido no caminho: checagem por
    `instanceof TokenExpiredError` falhava silenciosamente por duplicação de `jsonwebtoken` no
    monorepo — trocado por `.name === 'TokenExpiredError'`). `MailService` novo com fallback de
    log. Migration escrita à mão (`prisma migrate dev` não roda neste sandbox) — **aplicada e
    validada ao vivo contra o Postgres real** do `docker-compose.yml`, schema conferido via
    `psql`, roteiro completo (registro → login por username → refresh → reuso rejeitado →
    esqueci senha) rodado via `curl` contra o backend de verdade. `auth.e2e-spec.ts` novo, 19
    casos (multi-dispositivo, anti-enumeração no esqueci-senha, sessões revogadas após reset) +
    3 specs unitárias novas — 51 unitários/50 e2e no backend, tudo verde.
  - **App**: `expo-secure-store` novo; `store/useAuthStore.ts` (multi-conta, uma chave SecureStore
    por conta — não um blob único, evita o teto de ~2KB do Android Keystore); `api/http.ts`
    migrou de `features/dbclient/` pra `editor/src/api/` (deixou de ser só do cliente de banco) e
    ganhou o interceptor de refresh (único refresh em voo mesmo com requisições concorrentes,
    **validado ao vivo** com um backend real de `JWT_EXPIRES_IN=2s`: uma requisição isolada
    refresca e repete sozinha, 3 concorrentes disparam um único refresh); `features/auth/`
    (`AuthContext` com `resolveSession` — token salvo → refresh → re-login silencioso com a
    senha salva, mesmo caminho usado pela splash e por "trocar de conta"; telas Login/Criar
    conta/Esqueci senha/Redefinir senha, `TintedButton`/`Banner`/`Field`/`GroupedList`, nunca
    `Chip`); `app/(auth)/` novo; splash unificada numa `AppGate` só (checagem de update E
    bootstrap de auth em paralelo, sem dois seguradores de splash independentes brigando — bug
    que existia no design anterior, corrigido antes de acontecer); `app/_layout.tsx` ganha
    `Stack.Protected` com as rotas logadas/não-logadas explícitas. Removido:
    `LoginScreen`/`DbClientRoot` do cliente de banco (redundante agora), `dbAuthToken` de
    `useSettings`. Ajustes ganha seção "Conta" (trocar de conta, sair). i18n: namespace `auth`
    novo (30 chaves × 3 idiomas) + teste novo de completude entre catálogos (varre a árvore
    inteira, antes só havia checagem pontual). `tsc --noEmit` limpo (só um erro pré-existente e
    não-relacionado em `Canvas.tsx`, confirmado já quebrado numa instalação limpa do HEAD antes
    de qualquer mudança desta entrega — duplicação de `@types/react` nesta monorepo, fora de
    escopo consertar aqui). 226 testes `vitest` verdes (era 217).
  - **Três bugs reais achados rodando o app de verdade no simulador** (não visíveis em
    `tsc`/`vitest`/`expo export` sozinhos — só apareciam com o Metro servindo pro app de fato).
    Todos vêm da mesma raiz: este é um monorepo com npm workspaces, e há dependências órfãs na
    raiz (`@radix-ui/*`/`@visx/*`, nem declaradas em `editor/package.json` nem `backend/
    package.json`, presentes desde antes desta sessão) que empurram `react`/`babel-preset-expo`
    pra raiz do monorepo em vez de aninhados em `editor/node_modules` — qualquer `npm install`
    pode reproduzir isso de novo (detalhe completo na memória do agente,
    `project_monorepo_dependency_hoisting_hazards`). (1) `babel-preset-expo` na raiz não
    conseguia `require.resolve('expo-router')` (só existe em `editor/node_modules`) — o plugin
    de rotas nunca registrava, `EXPO_ROUTER_APP_ROOT` nunca virava string de verdade, Metro
    quebrava com "First argument of `require.context` should be a string". Corrigido copiando
    `babel-preset-expo` pra dentro de `editor/node_modules` (fix só em `node_modules`, não
    commitável — pode precisar repetir se `npm install` reindexar a raiz de novo). (2)
    `react`/`react-dom`/`scheduler` duplicados (raiz vs. `editor/node_modules`, versões
    diferentes) — Metro empacotava as duas cópias, "Invalid hook call... more than one copy of
    React" TRAVANDO o app de verdade na tela de splash. `resolver.extraNodeModules` não bastou
    (React 19 tem `exports` no `package.json`, o que faz o Metro ignorar
    `extraNodeModules`) — corrigido com `resolver.resolveRequest` em `editor/metro.config.js`,
    forçando essas três libs pra cópia física certa sempre. Mesmo problema derrubava 2 dos 4
    testes `jest-expo`/RTL (`ActionBar.test.tsx`) — confirmado pré-existente (já quebrado num
    `npm ci` limpo do HEAD, antes de qualquer mudança desta sessão); `moduleNameMapper` em
    `editor/jest.config.js` resolveu 3 dos 4 antes-quebrados, `ActionBar.test.tsx` continua
    falhando por outro motivo ainda não identificado (também pré-existente). (3) `(auth)` não
    tinha `_layout.tsx` próprio — `Stack.Protected` com `<Stack.Screen name="(auth)" />` só
    funciona se o grupo tiver seu próprio navigator (como `(tabs)` já tinha via `Tabs`), senão
    vira aviso "No route named "(auth)" exists in nested children". `app/(auth)/_layout.tsx`
    novo resolve. **Validado de ponta a ponta no simulador de verdade** (screenshot da tela de
    Login renderizando certinha, "Wasit" · "Entre para continuar" · campo de URL do backend
    pré-preenchido · contas salvas · links de criar conta/esqueci senha) depois dos três fixes,
    sem warning nenhum no log do Metro.
  - **Ajuste seguinte, pedido do usuário**: campo de endereço do backend saiu da tela de Login —
    `API_BASE_URL` virou constante fixa em `editor/src/api/http.ts` (`http`/`refreshHttp` já
    nascem com `baseURL` fixado, nada mais lido do estado a cada requisição). `useSettings.ts`
    perdeu `dbApiBaseUrl`/`setDbApiBaseUrl` inteiramente — só guarda idioma/tema agora. `tsc
    --noEmit` limpo, 226 testes `vitest` verdes.
  - **Ajuste seguinte, pedido do usuário**: "olhinho" nos campos de senha — `Field` (design
    system) ganhou o prop `secureToggle`, que troca `secureTextEntry` fixo por um ícone
    `eye`/`eyeOff` dentro do campo alternando visibilidade (estado interno, começa oculto).
    Aplicado nos 3 campos de senha do fluxo de auth (Login, Criar conta, Redefinir senha) e no
    campo de senha de conexão de banco (`ConnectionFormScreen`, via `FormField`, que só repassa
    props pro `Field`). Chaves `common.showPassword`/`hidePassword` novas nos 3 catálogos i18n
    (rótulo de acessibilidade do botão). Ver [docs/03-design-system.md](docs/03-design-system.md).
    `tsc --noEmit` limpo (só o erro pré-existente de `@types/react` duplicado em `Canvas.tsx`,
    já documentado, sem relação com esta mudança), 226 testes `vitest` verdes.

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
- **Hook de pre-push, pedido do usuário**: `.githooks/pre-push` (versionado) roda backend
  (unitário + e2e) e editor (vitest) antes de qualquer `git push`, aborta se algo falhar. Não
  liga sozinho (`.git/hooks/` não é versionado) — precisa de `git config core.hooksPath
  .githooks` uma vez por clone. `editor: test:rn` (jest-expo/RTL) fica de fora de propósito, ver
  [docs/02-setup-e-estrutura.md](docs/02-setup-e-estrutura.md). Testado rodando o script à mão:
  51 unitários + 50 e2e no backend, 226 testes `vitest` no editor, tudo verde.
- [x] **Etapa Tabelas — editor de CSV, 6º tipo de documento (`csv`, junto de `flow`/`er`/`raw`/
  `md`/`rabisco`)** — pedido do usuário: "quero um editor de csv... que dá pra importar editar
  ou começar do zero... aceite dois tipos de formatação... vírgula e ponto e vírgula", usando
  `tabelas.html` (protótipo funcional) e `plano-editor-csv-expo.md` (plano técnico, escrito pra
  um app standalone) como guia de comportamento, não de arquitetura — mesmo desvio deliberado já
  registrado quando o Rabisco foi adicionado (`docs/16-rabisco.md`): `store/useDoc.ts` (apply/
  applyLive/commitLive/undo/redo) e `services/storage.ts` (SQLite genérico) já funcionam pra
  `CsvDoc` sem mudar uma linha, só a camada de domínio (parser CSV, motor de fórmulas, mutações)
  e a grade em si são construídos do zero. Detalhe completo em
  [docs/19-tabelas-csv.md](docs/19-tabelas-csv.md).
  - **Decisão confirmada com o usuário via `AskUserQuestion`**: uma tabela por documento (não um
    "caderno" com abas como o protótipo) — mais simples, mapeia 1:1 com o que um `.csv` de
    verdade é.
  - **Domínio** (`domain/csv/`): `csv.ts` (parse/serialize RFC 4180 à mão, `detectDelim`,
    `sheetToText` com fórmulas já calculadas + BOM quando `;`), `formula.ts` (parser recursivo
    descendente sem `eval`, `SOMA`/`MÉDIA`/`MÍN`/`MÁX`/`CONT`/`ARRED`/`ABS`/`INT`/`RAIZ`/`MULT`/
    `SE`, nomes PT+EN, separador de argumento `,` OU `;`, `evaluateSheet` com cache+detecção de
    ciclo, erros como string), `mutations.ts` (puras, nunca deixam a tabela com 0 linhas/
    colunas), `geometry.ts` (offsets/busca binária/hit-test). `blankCsv`/`csvDocFromText` em
    `domain/mermaid/factory.ts` (mesma casa dos outros `blank*`); braço `csv` novo em
    `domain/exportMeta.ts`/`domain/searchText.ts`.
  - **Grade** (`features/csv/`): `Animated.ScrollView` horizontal + `FlashList` vertical
    (`@shopify/flash-list` 2.x, dependência nova, `npx expo install` — `estimatedItemSize` não
    existe mais nessa major, descoberto só ao rodar `tsc`) + header/gutter congelados via
    `translateX` que anula o scroll horizontal só neles (filho flex normal, só a PINTURA se
    desloca — `zIndex`+`elevation`, Android precisa dos dois). Redimensionar coluna via
    `Gesture.Pan`, preview local + commit só no fim do gesto (mesmo princípio do Rabisco).
    **Desvio deliberado do protótipo**: edição acontece na barra de fórmulas (sempre visível,
    ligada à célula-âncora via `useLiveField` já genérico) em vez de um `TextInput` flutuante
    sobre a célula — evita ter que acompanhar scroll duplo (horizontal+vertical virtualizado) de
    uma posição calculada, mesmo padrão que Sheets/Excel mobile já usam. Seleção simplificada
    pra célula única/linha inteira/coluna inteira (sem arraste de alça pra retângulo arbitrário
    do protótipo — alça pequena e frágil num celular real). `KeyboardBar` (operadores + atalhos
    de função): `InputAccessoryView` no iOS, `View` absoluta reagindo ao teclado no Android.
    Menus (célula/linha/coluna/"mais") via `Sheet`+`GroupedList`+`Row` (padrão da casa, sem
    `ActionSheet` dedicado no design system). `ImportSheet`/`ExportSheet`: arquivo ou colar
    texto, detecção de separador sozinha, fallback ISO-8859-1 (decodificador base64 escrito à
    mão, `atob` não é garantido no Hermes), export com `Segmented` `,`/`;` + prévia ao vivo.
    `GalleryScreen.tsx` ganha grupo "Tabelas" (Em branco + Importar CSV…); `app/doc/[id].tsx`
    ganha o braço `csv`.
  - **Testes**: cobertura completa do domínio — `csv.test.ts`/`formula.test.ts`/
    `geometry.test.ts`/`mutations.test.ts` novos + extensão de `exportMeta.test.ts`/
    `searchText.test.ts`/`domain/mermaid/factory.test.ts`. 345 testes `vitest` verdes (era 226).
    `tsc --noEmit` limpo (só o erro pré-existente de `Canvas.tsx`, já documentado).
  - **Confirmado ao vivo no simulador** (iPhone 15 Pro Max, screenshots em cada passo): criar
    tabela em branco, tocar célula selecionando e atualizando a barra de fórmulas, long-press
    abrindo o menu de célula com os itens certos, "Editar" focando a barra de fórmulas com o
    `KeyboardBar` do iOS aparecendo (todos os operadores/funções), **rolar a grade horizontal
    com o gutter permanecendo perfeitamente parado** (o mecanismo mais arriscado da feature,
    nunca usado antes neste código, funcionou de primeira), "Mais" abrindo o menu da tabela com
    os switches refletindo o estado real do documento, "Exportar CSV…" mostrando o seletor de
    separador e a prévia calculada.
- [x] **Correção automática pro hazard de hoisting do `babel-preset-expo`** — pedido do usuário
  depois do bug (Metro quebrando com "First argument of `require.context` should be a string")
  se repetir DUAS vezes na mesma sessão: `scripts/ensure-babel-preset-expo.js` novo, rodado como
  `postinstall` (`package.json` raiz) — reaplica sozinho a cópia de `babel-preset-expo` pra
  dentro de `editor/node_modules` sempre que o hoisting a tirar de lá, depois de QUALQUER `npm
  install`. Também disponível à mão via `npm run fix:babel-preset-expo`. Testado de ponta a
  ponta: removi `editor/node_modules/babel-preset-expo`, rodei `npm install` na raiz, confirmei
  que o `postinstall` restaurou sozinho e que o Metro voltou a bundlar sem erro. Detalhe completo
  em [docs/02-setup-e-estrutura.md](docs/02-setup-e-estrutura.md).
- [x] **Bug real no editor de Tabelas: grade vazando por baixo da Toolbar** — usuário reportou
  com screenshot ("parece bugado... sobrepondo a visão"). Causa: `flex: 1` não propaga altura
  confiável através de um `ScrollView` horizontal contendo `FlashList` vertical por dentro —
  `Grid.tsx` agora mede a altura real com `onLayout` e trava um número fixo no `ScrollView`.
  Aproveitado o pedido de "algo legal, estilo Apple/iPhone": `Toolbar.tsx` virou um painel de
  vidro fosco (`BlurView`, cantos arredondados no topo, sombra sutil — o `.bottom{backdrop-
  filter:blur(20px)}` que o protótipo `tabelas.html` já tinha e não tinha sido portado ainda).
  Confirmado ao vivo: linha 15 agora é a última visível com corte limpo, sem vazamento nenhum.
  Detalhe em [docs/19-tabelas-csv.md](docs/19-tabelas-csv.md). `tsc`/`vitest` (345) verdes.
- [x] **Ajuste seguinte, pedido do usuário: cor da grade estilo Apple** — "cinza claro pra tema
  escuro não ficou bom". `Cell.tsx` preenchia toda célula vazia com `colors.surface`, virando um
  bloco cinza uniforme cobrindo a tela inteira. Trocado por `transparent` (mostra o preto de
  verdade do `Grid.tsx` por trás, só as linhas hairline marcam a grade) — cor fica só pros
  estados que importam (selecionada/intervalo/cabeçalho). `HeaderRow.tsx`/`GridRow.tsx` também
  trocaram `surface2` por `colors.bg` (continuam opacos, só casam com o fundo). Confirmado ao
  vivo. Detalhe em [docs/19-tabelas-csv.md](docs/19-tabelas-csv.md). `tsc`/`vitest` (345) verdes.
- [x] **Etapa SSH — cliente de terminal remoto, 3ª tab** — pedido do usuário: "uma tab nova...
  que é a parte de conectar via ssh em um servidor", usando `SSH-MOBILE.md` (spec técnica) e
  `ssh_mobile_prototipo.html` (protótipo navegável) como guia — as duas descrevem um SaaS
  multiusuário completo (organizações, cofres compartilhados, MFA, senha-mestra em 3 camadas,
  SFTP, encaminhamento de porta, agentes de LAN, gravação de sessão/auditoria — 5 fases, ~14-19
  semanas no roadmap deles). **Decisão confirmada com o usuário**: construir só o essencial
  (hosts/credenciais/terminal) agora, documentar o resto como roadmap tickável — detalhe completo
  em [docs/20-ssh-mobile.md](docs/20-ssh-mobile.md), inclusive a seção "Roadmap — funcionalidades
  futuras" com cada item pendente.
  - **Backend** (`backend/src/ssh/`): 5 modelos Prisma novos (`SshHost`/`SshCredential`/
    `SshKnownHost`/`SshSession`/`SshSnippet`, FK flat `ownerId`, sem organização — mesmo padrão de
    `Connection`), migration escrita à mão (`prisma migrate dev` é bloqueado neste ambiente pra
    um agente de IA). `common/crypto.util.ts` (AES-256-GCM) subiu de `connections/` pra ser
    reusado pelas duas features. `ssh-manager.service.ts` espelha `knex-pool.service.ts` (Map em
    memória por sessão + replay buffer 256 KB + detach com carência de 10 min). Gateway
    `@WebSocketGateway({namespace:'/ssh'})` com `ssh2` de verdade, TOFU completo (desconhecida→
    confia→conhecida; chave que muda é recusada). `Subject` novo `'SshHost'` no CASL.
  - **Bug real achado por um teste de verdade, não mock**: a primeira versão de
    `ssh-key.util.ts` gerava a chave Ed25519 em PKCS8 PEM (`node:crypto` nativo) — um servidor
    `ssh2.Server` real em processo (`ssh-manager.service.spec.ts`) travou com "Cannot parse
    privateKey: Unsupported key format". `ssh2` só entende PEM tradicional (sem Ed25519) ou o
    formato binário `openssh-key-v1` — reescrito à mão (struct do `PROTOCOL.key` do OpenSSH:
    magic + cifra "none" + chave pública wire + bloco privado com checkint duplicado + padding).
    Sem esse teste real, toda chave gerada pelo app seria rejeitada por qualquer servidor SSH de
    verdade em produção.
  - **Testes de backend, de ponta a ponta, sem Docker**: `test/ssh-test-server.ts` sobe um
    `ssh2.Server` real em `127.0.0.1:<porta aleatória>` (mesmo espírito de
    `test/sample-target-db.ts`) — usado tanto no unit (`ssh-manager.service.spec.ts`) quanto no
    e2e (`test/ssh.e2e-spec.ts`, REST completo + gateway via `socket.io-client` real: TOFU, abrir
    sessão, digitar e receber eco, fechar, reconectar sem TOFU de novo, token inválido recusado).
    64 testes unitários + 64 e2e no backend, todos verdes (eram 51+50).
  - **Frontend** (`editor/src/features/ssh/`): tab nova (`app/(tabs)/ssh.tsx`, ícone `terminal`),
    telas de hosts/credenciais/snippets/chaves confiadas/sessões, terminal via WebView+xterm.js
    (`scripts/build-ssh-terminal-html.mjs`/`npm run ssh-terminal`, mesma técnica de
    `build-runtime.mjs` — xterm.js+addon-fit embutidos no HTML, funciona offline, sem CDN).
    `KeyBar.tsx` (esc/ctrl/tab/setas com repetição/`^C^D^L^R`/snippets), `themes.ts` (5 paletas
    portadas do protótipo). Serviço de socket.io **genérico** (`editor/src/services/socket.ts`,
    pedido explícito do usuário pra reusar em features futuras, não só SSH) — `auth` como função
    (reavaliada a cada reconexão), reusa o mesmo `refreshTokensFor()` do axios.
  - **Corrida real evitada por design, antes de acontecer**: `openSession()`
    (`socket/sshSocket.ts`) só resolve com a sessão DE VERDADE aberta — os listeners de
    `hostkey:unknown`/`status` são registrados ANTES de emitir `session:open`, e o alerta de TOFU
    é mostrado ainda em `ConnectionsScreen`, não na tela do terminal. Sem isso, navegar assim que
    o ack chegasse arriscaria perder um evento que já tivesse disparado antes de `TerminalScreen`
    montar e assinar os listeners.
  - **Testes de frontend**: `base64.test.ts` (encoder à mão pra `btoa` não-garantido no Hermes,
    usado pela KeyBar), `themes.test.ts` (as 21 chaves do `ITheme` do xterm.js, cores hex
    válidas). 354 testes `vitest` verdes (eram 345). `tsc --noEmit` limpo (só o erro pré-existente
    de `Canvas.tsx`, já documentado).
  - Nada commitado nesta rodada — pedido explícito do usuário, ele testa e pede o commit depois.
- [x] **Bug real achado pelo usuário testando ao vivo: criar host quebrava contra o Postgres de
  verdade** — usuário tentou criar um host pelo app e bateu em `Invalid input value: malformed
  array literal: "[]"`. Causa: `SshHost.tags` virou `Json` no `schema.prisma` (SQLite, usado nos
  testes automatizados, não suporta lista escalar nativa), mas a migration do Postgres escrita à
  mão ficou com `"tags" TEXT[]` (array nativo) — nunca tinha sido de fato aplicada contra um
  Postgres real durante a implementação, só validada por leitura. 64+64 testes de backend contra
  SQLite não pegam esse tipo de divergência de DDL — só apareceu contra Postgres de verdade.
  Corrigido com uma migration nova (`20260821135000_ssh_host_tags_jsonb`, nunca se edita uma já
  aplicada) via `prisma migrate deploy` (funciona neste ambiente; só `migrate dev`/`db push` são
  bloqueados pra um agente de IA) contra o Postgres real do `docker-compose.yml`. Confirmado de
  ponta a ponta: backend recompilado e reiniciado, `POST /ssh/hosts` via `curl` (HTTP 201, `tags`
  voltando certo), e pelo próprio app no simulador — o host "VPS" que o usuário tentou criar
  salvou (screenshot confirmando a lista com o host, tab bar Library/Database/SSH/Settings).
  Detalhe completo em
  [docs/20-ssh-mobile.md](docs/20-ssh-mobile.md#bug-real-achado-pelo-usuário-ao-vivo-tags-quebrava-criar-host-contra-o-postgres-de-verdade).
- [x] **Ajuste de UX pedido pelo usuário: tocar num host abre folha de ações (Entrar/Editar/
  Apagar)** — antes, tocar conectava direto e segurar apagava; sem jeito de editar um host já
  criado. `ConnectionsScreen.tsx`: toque agora abre um `Sheet`+`GroupedList` com "Entrar" (mesmo
  fluxo de `openSession()` de antes), "Editar" (navega pra `/ssh/host?id=`, tela que já existia
  mas não tinha como chegar nela) e "Apagar" (ícone de lixeira vermelho, mesmo padrão de
  `csv/Menus.tsx` — `left={<Icon name="trash" color="#D70015"/>}`, não texto vermelho). Chave
  `ssh.connect` nova nos 3 catálogos. Confirmado ao vivo no simulador: tocar no host "VPS" abre a
  folha com os 3 itens, "Editar" abre o formulário pré-preenchido com os dados reais do host,
  Cancelar volta sem alterar nada. `tsc`/`vitest` (354) verdes.
- [x] **Pedido do usuário: editar credencial também** — só existia gerar/importar/apagar,
  sem jeito de corrigir nome ou trocar a senha/chave de uma credencial já salva. Backend novo:
  `PATCH /ssh/credentials/:id` + `CredentialsService.update()` — `kind` nunca muda; segredo só é
  recifrado se vier preenchido (em branco = mantém o atual, mesmo princípio de troca de senha);
  colar uma chave privada nova reseta a passphrase antiga (não se aplica a outro arquivo) a menos
  que uma nova venha junto. `credentials.service.spec.ts` novo (7 testes, cada combinação:
  renomear sozinho preserva segredo, só passphrase preserva a chave, chave nova reseta
  passphrase, chave+passphrase juntas aplicam as duas, chave pública recalcula fingerprint, senha
  vazia não muda nada). `test/ssh.e2e-spec.ts` ganhou 2 testes que trocam a senha de verdade e
  confirmam com `POST /ssh/hosts/:id/test` contra o servidor SSH real — senha errada falha,
  senha certa depois volta a autenticar. Frontend: `CredentialsScreen.tsx` ganhou o mesmo padrão
  de folha de ações do host (Editar/Apagar); "Editar" reusa a folha de Importar com o segredo em
  branco (placeholder `ssh.credentials.keepCurrent` avisa) e sem o seletor de tipo (fixo).
  Confirmado ao vivo no simulador: tocar credencial → folha → Editar → formulário com nome
  pré-preenchido e placeholder certo no campo de senha → Save volta pra lista sem erro. 71
  unitários + 66 e2e no backend, 354 `vitest` no editor, `tsc` limpo.
- [x] **Investigação pedida pelo usuário: "quando começo a digitar [no terminal] o Expo fecha
  sozinho e faz reload"** — conectei de verdade num host real do usuário (VPS), digitei via
  KeyBar (tab/`|`/`~`), naveguei o menu, desconectei — sessão inteira de ponta a ponta sem
  nenhum crash, nenhum erro no Metro, nenhum relatório de crash no simulador
  (`~/Library/Logs/DiagnosticReports`). Não consegui reproduzir o teclado NATIVO do iOS abrindo
  via automação do simulador (`cliclick`) pra testar exatamente o gatilho que o usuário descreveu
  (digitar no teclado de verdade, não na KeyBar) — inconclusivo, não descarta o bug.
  **Um bug real e relacionado apareceu no caminho**: `openSession()` (`socket/sshSocket.ts`) não
  tinha timeout nenhum esperando `hostkey:unknown`/`status` depois do ack de `session:open` — um
  host que trava no meio do handshake (nem abre nem dá erro) deixava o spinner de "conectando"
  girando pra sempre, sem nenhum feedback. Corrigido: timer de 25s que rejeita com mensagem clara
  e fecha a sessão no servidor (`session:close`) se nada chegar — pausado enquanto o usuário está
  decidindo o alerta de TOFU (não conta como "travado"), rearmado depois do `hostkey:trust`.
  4 testes novos (`sshSocket.test.ts`, fake timers) cobrindo resolve normal, timeout de verdade,
  TOFU não conta pro timeout, e `status:error`. 358 testes `vitest` verdes (eram 354). Pedido ao
  usuário: se acontecer de novo, checar se o terminal do `npx expo start` dele mostra algum erro
  no momento exato — isso vai apontar a causa direto.
- [x] **Segunda rodada, usuário confirmou que ainda reproduz** ("digitando 'clear', nem deixa
  terminar de digitar") — dado novo e decisivo: a KeyBar não tem NENHUMA tecla de letra (só
  pontuação/controle), então "digitar clear" só pode ser o teclado NATIVO do iOS, nunca a KeyBar
  — toda a investigação anterior (testada só com a KeyBar) estava no código errado.
  **Suspeito principal, removido**: `TerminalScreen.tsx` envolvia a `KeyBar` em
  `KeyboardStickyView` (`react-native-keyboard-controller`, escuta o frame nativo do teclado via
  `reanimated`) — mas quem ganha foco quando o teclado abre aqui é uma **WebView** (o textarea
  escondido do xterm.js), não um `TextInput` nativo. O único outro uso de `KeyboardStickyView`
  no app (`features/code/CodeKeyboardBar.tsx`) é sempre sobre `TextInput` nativo — a combinação
  "KeyboardStickyView + foco vindo de dentro de uma WebView" é nova neste código e é uma categoria
  conhecida de crash nativo em RN (o worklet do reanimated brigando com o próprio gerenciamento de
  teclado da WebView), consistente com "fecha sozinho" sem nenhum erro no Metro (crash nativo, não
  JS). Tirado: a `KeyBar` volta pra posição flex normal (sempre visível no fim da tela, não tenta
  mais acompanhar o teclado). Reconectei no host real de novo, testei a folha de ações
  (Conectar/Aparência/Desconectar) de ponta a ponta — sem crash. Não consegui, de novo, fazer o
  teclado nativo do iOS abrir via automação do simulador pra confirmar a causa raiz 100% — segue
  como correção orientada por evidência (categoria de bug conhecida + único ponto novo/arriscado
  do código), não como causa confirmada por reprodução direta. Detalhe em
  [docs/20-ssh-mobile.md](docs/20-ssh-mobile.md). `tsc`/`vitest` (358) seguem limpos.
- [x] **Terceira rodada, usuário confirmou de novo que reproduz mesmo sem `KeyboardStickyView`**
  ("fiz o mesmo cenário e bugou no reload") — a hipótese da rodada 2 estava descartada, causa raiz
  ainda não encontrada. Fui direto no código-fonte do `react-native-webview` instalado (não por
  reprodução ao vivo) em vez de continuar tentando reproduzir às cegas: `TerminalCanvas.tsx`
  passava `hideKeyboardAccessoryView` e `keyboardDisplayRequiresUserAction={false}` pro `WebView`.
  As duas são implementadas em `RNCWebViewImpl.m` via **method swizzling de um seletor PRIVADO do
  WebKit** (`_elementDidFocus:userIsInteracting:blurPreviousNode:activityStateChanges:userObject:`,
  a variante certa escolhida por faixa de versão de iOS, chamada através de um cast bruto de
  function pointer) — esse seletor dispara toda vez que um elemento focável da WebView ganha foco,
  exatamente quando o textarea escondido do xterm.js recebe o toque pra abrir o teclado. Se a
  assinatura real do seletor no iOS do simulador (17.5) não bate com o cast hardcoded, é undefined
  behavior — derruba o processo da WebView sem rastro no Metro, batendo com "fecha e recarrega
  sozinho, sem erro de JS". Ao contrário da hipótese anterior, dispara em qualquer foco (não só
  programático), explicando por que era digitação normal que crashava. Removidas as duas props;
  `onContentProcessDidTerminate` adicionado no `WebView` como rede de segurança (recarrega só a
  WebView, não o app inteiro, se o processo nativo morrer de novo por essa ou outra causa).
  Reconectei no host real de novo pós-fix, toquei o terminal pra focar (apareceu a barra "Done" —
  confirma que o foco não está mais passando pelo swizzle que a esconderia) e mandei `keystroke`
  real via AppleScript (`cliclick t:` nunca ecoou nada nessa WebView em nenhuma tentativa, mesmo
  com o teclado de hardware do simulador desligado) — sem crash, sem reload. Segue **não
  confirmado por reprodução do crash em si** (mesma limitação de automação das rodadas 1-2), mas é
  a causa de maior confiança até agora — padrão de crash documentado do próprio pacote (API
  privada por seletor), e é o único ponto do código que reage especificamente a foco/teclado numa
  WebView. Detalhe em [docs/20-ssh-mobile.md](docs/20-ssh-mobile.md). `tsc`/`vitest` seguem
  limpos.
- [x] **Quarta rodada, usuário confirmou de novo que reproduz mesmo com a rodada 3 aplicada** —
  desta vez achei crash log DE VERDADE (`~/Library/Logs/DiagnosticReports/Retired/Expo Go-*.ips`
  no Mac que roda o simulador): 3 crashes reais, mesmo stack trace exato — SIGSEGV em
  `ReanimatedModuleProxy::initializeLayoutAnimationsProxy()` -> `installTurboModule` ->
  `UIManager::setAnimationDelegate`. Aponta pro `KeyboardProvider` (`react-native-keyboard-
  controller`) global em `app/_layout.tsx`, que tem uma prop `preload` (default `true`, iOS) que
  pré-aquece o rastreamento nativo do teclado — trabalho nativo adiantado que pode competir com o
  Fabric ainda não estar pronto. Corrigido: `preload={false}`. Descartei no caminho, sem aplicar:
  (1) mismatch de versão Expo Go (`54.0.7`) vs pacote `expo` (`54.0.37`) — não é isso,
  `expo install --check` confirma `54.0.7` correto; (2) atualizar `react-native-keyboard-
  controller` `1.18.5`->`1.22.4` — **quebra o app**: Expo Go não recompila nativo a partir do
  `node_modules` do projeto, ele já vem fixo por SDK, e uma versão JS diferente da esperada
  (`1.18.5` é a certa pro SDK 54) derruba a ponte JS↔nativo inteira (`getConstants is not a
  function`, tela travada) — fica pinado em `1.18.5`. Efeito colateral registrado: uma
  reinstalação do Expo Go no meio do caminho ficou corrompida com o mesmo erro; resolvido
  desinstalando (`xcrun simctl uninstall booted host.exp.Exponent`) e deixando reinstalar do
  zero. Ainda não confirmado por reprodução direta do crash em si (mesma limitação de automação),
  mas é a primeira vez que a causa vem de um crash log real batido 3x, não de inferência por
  código. Detalhe em [docs/20-ssh-mobile.md](docs/20-ssh-mobile.md).
- [x] **Quinta rodada — causa raiz de verdade, e não era bug nenhum no app.** Usuário confirmou
  reprodução de novo mesmo com a rodada 4 aplicada. Adicionei captura de erro fatal persistente
  (`crashLog.ts`/`installFatalErrorLogger.ts`, grava síncrono via `setItemSync` pra sobreviver a
  um contexto JS morrendo) pra ver o erro real no próximo boot — não capturou nada, e nenhum
  crash log novo apareceu. O próprio usuário resolveu: **o "reload" era o atalho de teclado do
  Metro CLI** (`r` = reload), disparado porque o foco do teclado do Mac estava na janela do
  terminal (`expo start --ios`) em vez do Simulator — digitar "clear" mandava c-l-e-a-**r** pro
  Metro, e o "r" sozinho já recarrega o app. Bate 100% com tudo: nunca teve crash log (não tinha
  crash), nunca teve erro JS capturável (não tinha exceção), "clea" travando bem antes do "r" na
  screenshot da rodada 4 é o "r" sendo consumido pelo Metro. Nenhuma correção das rodadas 1-4 era
  a causa raiz, mas duas ficam como melhoria real achada no caminho: `TerminalCanvas.tsx` passava
  `source={{ html, baseUrl: '' }}` como objeto inline pro `WebView` — identidade nova a cada
  render, e react-native-webview recarrega o conteúdo inteiro (perde a sessão do xterm.js) sempre
  que isso muda, mesmo com `html` idêntico; corrigido com `useMemo`/`memo()`. Lição pro futuro:
  bug que só reproduz com o Metro rodando do lado e nunca deixa rastro (sem crash log, sem
  exceção) — suspeitar do ambiente de dev (atalhos de teclado do Metro CLI/Xcode/Simulator
  competindo pelo foco) antes de aprofundar no código. Detalhe em
  [docs/20-ssh-mobile.md](docs/20-ssh-mobile.md). `tsc`/`vitest` (358) seguem limpos.
- [x] **Sexta rodada — KeyBar não subia com o teclado.** Na `TerminalScreen`, a barra de
  atalhos/snippets ficava presa no rodapé quando o teclado abria, porque o `setEnabled(false)`
  deixado pela rodada 4 desligava o rastreamento nativo de teclado da tela inteira (inclusive
  pra qualquer `KeyboardStickyView`). Removido esse efeito; `KeyBar` passou a ficar dentro de
  `KeyboardStickyView` com `offset={{ closed: -insets.bottom, opened: 0 }}`, mesmo padrão já
  usado em `features/code/CodeKeyboardBar.tsx` (iOS e Android, mesma lib). Confirmado ao vivo no
  simulador iOS: abre/fecha o teclado, a barra sobe/desce grudada, sem gap. Detalhe em
  [docs/20-ssh-mobile.md](docs/20-ssh-mobile.md). `tsc`/`vitest` (358) seguem limpos.
- [x] **Backend aponta pro IP `187.77.250.138` + publicação EAS Update ficou consumível pelo
  Expo Go** — pedido do usuário: trocar `API_BASE_URL` (`src/api/http.ts`) de `localhost:3333`
  pro IP dado, mesma porta (era `localhost`, só funcionava no simulador rodando no mesmo Mac do
  backend), e publicar um update no EAS pra testar pelo Expo Go. Publicar como já era feito
  (canal/branch `hml`, `--platform ios`/`--platform android` separados, ver Etapa R6.1) saiu com
  `runtimeVersion: "1.0.0"` (política `appVersion`) — confirmei batendo direto no manifesto
  (`curl -H "expo-runtime-version: exposdk:54.0.0"`) que isso dá 404: o Expo Go só pede update
  pro runtime do seu próprio SDK (`exposdk:54.0.0`), nunca por versão de app. Como o projeto
  ainda roda inteiro dentro do que o Expo Go já embarca nativamente (nenhum build/dev client
  customizado existe), troquei `app.json#runtimeVersion.policy` pra `"sdkVersion"` e publiquei
  de novo — manifesto passou a responder `200` pro Expo Go. **Isso deixa de ser válido no dia em
  que entrar código nativo fora do Expo Go** (ponto natural pro primeiro `eas build`/dev client),
  quando a política precisa voltar pra `appVersion`/`fingerprint`. Detalhe registrado em
  [docs/02-setup-e-estrutura.md](docs/02-setup-e-estrutura.md). Verificação: `tsc --noEmit`
  (mesma exceção pré-existente do Rabisco, não relacionada), publicação real confirmada pelos
  IDs de update e pelo `curl` batendo `200` no manifesto.
- [x] **URL do backend por `.env` (dev/hml/production), sem fallback hardcoded** — pedido do
  usuário: parar de hardcodar `API_BASE_URL` em `src/api/http.ts`, ler de um `.env` por
  ambiente (`.env.development` → `localhost:3333`, `.env.hml` → `187.77.250.138:3333`,
  `.env.production` → **de propósito vazio**, backend ainda não existe), `expo start` local
  puxando `.env.development` sozinho, publicação em `hml`/`production` puxando o `.env`
  correspondente, e se a URL não estiver definida no ambiente que gerou o bundle, alertar em vez
  de cair num valor errado por acidente. `http.ts` passou a ler
  `process.env.EXPO_PUBLIC_API_URL` e dispara `Alert.alert('Configuração ausente', ...)` +
  `console.error` no boot se estiver vazia — sem fallback silencioso. **Achado real no
  processo**: `eas update`/`expo export` força `NODE_ENV` pra `'production'` sempre que não é
  `--dev` (lido direto do código do CLI instalado) e não deixa sobrepor — então o mecanismo
  automático `.env.$NODE_ENV` do Expo nunca diferencia `hml` de `production`, os dois caem no
  mesmo `.env.production`. Contornado com `editor/scripts/eas-update.mjs`: lê o `.env.<nome>`
  manualmente e pré-popula o `process.env` do processo que chama `eas update` — `@expo/env` não
  sobrescreve variável já definida (documentado no próprio pacote), então o valor pré-populado
  vence. `npm run update:hml`/`npm run update:production` (novos) publicam `ios`+`android` já
  com esse mecanismo. Verificado com `expo export` direto e `grep` no bundle exportado pros três
  casos (dev, override manual simulando hml, `--dev`) antes de publicar de verdade — republiquei
  `hml` com o mecanismo novo, confirmado que a URL certa chegou no bundle. Detalhe completo em
  [docs/02-setup-e-estrutura.md](docs/02-setup-e-estrutura.md). `tsc --noEmit` limpo (mesma
  exceção do Rabisco).
- [x] **Deploy do backend numa VPS + seed pronta pra produção** — pedido do usuário: confirmei
  que `admin@exemplo.com` (`backend/prisma/seed.ts`) NÃO era criado automaticamente ao rodar o
  backend (é `npm run db:seed`, comando à parte); ele pediu pra deixar isso pronto pra quando
  subir numa VPS de verdade. `backend/Dockerfile` (já existia, nunca tinha sido usado por um
  `docker-compose` de verdade) mudou o estágio de runtime pra reaproveitar o `node_modules`
  COMPLETO do estágio de build (antes rodava `npm install --omit=dev` de novo, cortando
  `prisma`/`ts-node` — devDependencies, mas necessárias pra rodar `prisma migrate deploy`/
  `npm run db:seed` DENTRO do container já em produção via `docker compose exec`; nesta escala,
  uma VPS/um serviço, manter as devDependencies na imagem é mais simples que um estágio à parte
  só pra migração). `docker-compose.yml` (raiz, antes só tinha o Postgres) ganhou o serviço
  `backend` (build a partir de `backend/`, `env_file: backend/.env`, `DATABASE_URL` sobrescrita
  pra apontar pro nome do serviço `db` — dentro da rede do compose não é `localhost` —, porta
  `3333` publicada, `depends_on: db` com `condition: service_healthy`). `backend/.env.example`
  ganhou `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` documentadas (a seed já suportava essas duas
  variáveis, só não estavam no exemplo). `docs/17-db-client.md` ganhou a seção "Deploy em VPS"
  com o roteiro completo (`git clone` → `.env` → `docker compose up -d --build` → `migrate
  deploy` → `db:seed` → conferir `/api/docs`) e a nota de que reverse proxy/HTTPS fica de fora
  desta entrega por falta de domínio configurado (pendência registrada, não esquecida); também
  corrigi uma referência já desatualizada na seção "Como rodar" (`API_BASE_URL` hardcoded em
  `http.ts` — mudou pra `.env`/`EXPO_PUBLIC_API_URL` na etapa anterior desta sessão, ver item
  acima).

  **Testado de ponta a ponta de verdade, não só lido** — rodei `docker compose up -d --build`
  local (Postgres do próprio `docker-compose.yml`) e achei 4 bugs reais que o Dockerfile nunca
  tinha exposto antes (comentário nele mesmo já avisava "nunca foi usado pra publicar de
  verdade"), todos corrigidos:
  1. `npm install` quebrava compilando `better-sqlite3` (binding nativo, usado nos testes e2e) —
     `node:20-slim` não tem Python/compilador; `apt-get install python3 make g++` no estágio de
     build resolveu.
  2. `npx prisma generate` quebrava — `prisma.config.ts` lê `DATABASE_URL` via `env()` e falha
     ao carregar o config (mesmo só pra gerar o client, sem abrir conexão nenhuma) se a variável
     não existe; um `DATABASE_URL` placeholder só nesse passo do build resolveu.
  3. `CMD`/`start:prod` apontavam pra `dist/src/main.js` — `nest build` (via `tsconfig.build.json`
     com `rootDir: "src"`) gera `dist/main.js`, sem o `src/` no meio. Corrigido nos dois lugares
     (`Dockerfile` e `package.json#start:prod` — o segundo nunca tinha sido testado também).
  4. `npm run db:seed` (ts-node) quebrava com "Unknown file extension .ts" — `tsconfig.json`
     não estava copiado pro estágio de runtime, então o ts-node não conseguia se registrar como
     loader de `.ts`. Copiado junto.
  Also achado (warning, não erro fatal, mas corrigido): Prisma avisando "failed to detect the
  libssl/openssl version... Defaulting to openssl-1.1.x" — `openssl` também faltava na imagem
  (`node:20-slim` não vem com ele); instalado nos dois estágios.

  Depois dos 4 fixes: `docker compose up -d --build` subiu Postgres+backend limpo,
  `docker compose exec backend npx prisma migrate deploy` e `docker compose exec backend npm run
  db:seed` rodaram sem erro contra o Postgres real do compose (seed reportou
  `admin@exemplo.com` já existente — idempotência confirmada), e `curl localhost:3333/api/docs`
  respondeu `200`. Container de teste e imagem removidos depois. `tsc --noEmit` do backend
  limpo. Isso é o roteiro EXATO que a seção "Deploy em VPS" pede pro usuário rodar — validado
  aqui antes de mandar pra VPS de verdade, não só documentado de cabeça.
