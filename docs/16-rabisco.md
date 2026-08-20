# Rabisco — canvas de desenho livre (.svg)

> Status: **implementado** (Etapas R1-R2) em `editor/src/domain/rabisco/` e
> `editor/src/features/rabisco/`. Referências: `whiteboard-ios.html` (protótipo funcional, a
> mesma função que `editor-mermaid.html` tem pro resto do app) e
> `whiteboard-react-native-expo.md` (spec de porte pra RN/Expo — escrita pra um app standalone,
> ver "Desvio do spec de referência" abaixo).

Quinto tipo de documento (`rabisco`, junto de `flow`/`er`/`raw`/`md`) — um canvas tipo
Excalidraw: caneta, formas, texto, setas com binding, seleção, estilos. Pedido do usuário:
"quero poder desenhar livre e também usar IA".

## Decisão de arquitetura: Skia nativo, não WebView

`docs/01-decisao-arquitetura.md` escolheu WebView pro resto do app porque "Mermaid não tem
porta nativa" — é um pacote JS que só roda num motor JS. Essa razão **não vale pro Rabisco**:
não tem motor nenhum pra rodar, e desenhar É a interação central — exatamente o caso que aquele
doc já nomeia como gatilho pra ir nativo ("vá pro nativo se arrastar/manipular geometria
livremente for requisito"). `@shopify/react-native-skia` foi confirmado `inExpoGo: true` na
doc oficial do Expo 54 antes de decidir — o app tem que continuar abrindo no Expo Go, mesma
restrição de sempre (`editor/AGENTS.md`).

## Desvio deliberado do spec de referência

`whiteboard-react-native-expo.md` foi escrito pra um app standalone — inventa store própria
(zustand+immer), persistência própria (`expo-sqlite/kv-store`) e rota de IA própria do zero.
Nada disso foi portado — o app já tem tudo isso de forma genérica sobre `Doc`:

- `store/useDoc.ts` (`apply`/`applyLive`/`commitLive`/undo/redo, docs/05-estado.md) já
  funciona pra `RabiscoDoc` sem mudar uma linha.
- `services/storage.ts` (SQLite, `json TEXT` = `JSON.stringify(doc)`, docs/12-persistencia-e-
  export.md) já aceita `tipo: 'rabisco'` sem mudança de schema.
- `src/app/api/diagrama+api.ts` + `services/ai.ts` (docs/11-assistente-ia.md) são o padrão de
  backend-proxy a seguir quando a IA do Rabisco chegar (R6) — nunca um fetch direto pro
  provedor, como o protótipo HTML faz.
- `src/design/tokens.ts` + os 9 componentes base (`NavBar`, `Chip`, etc.) são o "parece nativo"
  do app — os tokens CSS do protótipo HTML foram só referência de valores (cores, raios), não
  portados como sistema à parte.

Isso reduziu o escopo real: só faltava a camada de domínio, o canvas Skia+gestos, e a UI de
ferramentas.

## Domínio — `editor/src/domain/rabisco/`

`RabiscoElement` (em `types.ts`) é **idêntico ao protótipo de propósito** — um `.json`/`.svg`
exportado de lá tem que continuar abrindo aqui sem tradução: `id,type,x,y,w,h,points,text,
labelColor,edges,arrowType,startBinding,endBinding,seed,version,strokeColor,bgColor,fillStyle,
strokeWidth,strokeStyle,roughness,opacity,fontSize`. `RabiscoDoc.elements: RabiscoElement[]`.

- `mutations.ts` — `addElement`/`updateElement`/`removeElement`/`moveElement`/`resizeElement`/
  `duplicateElement`, mesmo estilo de `mutations/flow.ts` (`structuredClone`, nunca muta o
  original — a regra de ouro do domínio vale igual aqui, só que não existe texto Mermaid nenhum
  pra derivar; `serialize()` devolve um comentário Mermaid vazio pro tipo `rabisco`, só pra
  manter o switch exaustivo). `removeElement` também limpa qualquer `startBinding`/`endBinding`
  de outro elemento que apontava pro id removido.
- `geom.ts` — porte completo do protótipo: `pathBuilder`/`smooth`/`ellipseD` (traço livre),
  `elementGeometry` (path SVG único por elemento — stroke, clip de preenchimento, hachura,
  farpas de seta — consumido pelo Skia via `<Path path={d}>`, que aceita string SVG direto),
  renderização "à mão livre" via PRNG seedado (`mulberry32`/`roughSeg`/`roughPoly`/
  `roughEllipse`/`roughRoundPoly`/`roughCurve`), `bounds`/`normalizeElement`/
  `boundsOfSelection`/`cornerRadius`/`dashPattern` (seleção/redimensionar), `insideShape`/
  `pickBindable`/`bindingAt`/`resolvedPoints` (ligação de seta em forma — `fx/fy` normalizados
  na borda mais próxima, resolvidos a cada render para a seta seguir a forma se ela mover),
  `hitTest` (acha o elemento sob um ponto — forma por caixa, linha/seta por proximidade ao
  segmento, traço/texto por caixa).
- `palette.ts` — paleta e estilo padrão de um elemento novo, porte de `STROKES`/`FILLS`/
  `S.style` do protótipo, e `newElement(type,x,y,strokeColor)` (nasce com `w=h=0` pra formas,
  já com `points` pra traço/linha/seta). A cor de tinta padrão (`INK` no protótipo) não é fixa
  aqui — quem decide é a UI via `useTheme()` (`colors.label`), porque domínio não pode depender
  de aparência.

## Canvas — `editor/src/features/rabisco/`

- `RabiscoScreen.tsx` — mesmo esqueleto de `DiagramScreen.tsx` (NavBar + canvas + HUD de
  desfazer/refazer com `Chip`).
- `Canvas.tsx` — `<Canvas>` do Skia com um `<Path>` por elemento. Câmera (pan/zoom) vive em
  `useSharedValue`, nunca `useState` — se vivesse em state, o pinch trepidaria. `<Group
  transform={...}>` (via `useDerivedValue`) observa os SharedValue direto, sem re-render React
  durante o gesto.
- `useCanvasGestures` (inline em `Canvas.tsx`) — `Gesture.Race(Gesture.Simultaneous(pinch,
  panDoisDedos), panUmDedo)`, com `panUmDedo` ramificando por ferramenta ativa (caneta/mão/
  borracha) via `useSharedValue<Tool>` sincronizado por `useEffect`. **Cuidado**: os eventos de
  Pan/Pinch desta versão de `react-native-gesture-handler` chegam ACUMULADOS desde o início do
  gesto (`translationX`/`scale`), não como delta por frame — cada gesto guarda um snapshot
  "base" no `onStart` e sempre calcula o valor absoluto no `onUpdate`, nunca `+=`.
- Traço/forma em progresso (`draft`/`shapeDraft`) é estado **local** do componente, fora do
  `useDoc` — só vira `RabiscoElement` de verdade (via `apply(addElement)`, undo-ável) quando o
  dedo levanta. Empilhar cada `pointermove` no histórico de undo (que faz snapshot JSON a cada
  `apply()`) explodiria o histórico — o protótipo já resolve isso com `S.draft` separado de
  `S.els`, mesma separação aqui. Mover/redimensionar/arrastar ponta de seta seguem o mesmo
  padrão: uma prévia local (`drag`/`withPreview`) durante o gesto, e só um `apply(moveElement |
  resizeElement | updateElement)` no fim (`onEnd`), undo-ável como uma única ação.
- Seleção/mover/redimensionar/ligar seta — `selectStart`/`selectUpdate`/`selectEnd` formam uma
  pequena máquina de estados (`DragState`: `move`/`resize`/`endpoint`) acionada pelo mesmo
  `panOne`. Toque perto de uma ponta de linha/seta já selecionada arrasta o endpoint (recalculado
  sempre a partir do ponto ORIGINAL do doc + delta acumulado do gesto, nunca incremental, pra
  não acumular deriva); toque perto de uma alça (`nw/n/ne/w/e/sw/s/se`, tolerância
  `HANDLE_TOL_PX` ajustada pelo zoom) redimensiona; caso contrário, `hitTest` decide se seleciona
  e move. Soltar o dedo sobre um endpoint tenta uma nova ligação via `pickBindable`+`bindingAt`.
- `Dock.tsx` — barra de ferramentas flutuante (cápsula com blur, mesma linguagem do
  `Chip`/`ActionBar`): seleção, mão, caneta, forma (com popover de 5 formas — retângulo/losango/
  elipse/linha/seta —, ícone mostrando a forma atual escolhida), texto, borracha. Texto usa
  `AlertDialog`+`Field` (componentes já existentes) pra editar, em vez de um overlay flutuante
  próprio. HUD de Duplicar/Excluir aparece só com um elemento selecionado.
- `StyleBar.tsx` — faixa de cor de borda (sempre visível com um elemento selecionado, qualquer
  tipo) e de preenchimento (só com retângulo/losango/elipse selecionado — `fillValue`/
  `onFillChange` ausentes escondem a linha), porte compacto de `syncSheetRows()`/`strokes`/
  `fills` do protótipo numa cápsula com blur só, não a sheet cheia de lá.
- Criar forma/linha/seta já seleciona e troca pra ferramenta de seleção — porte de
  `S.sel=[d.id]; setTool('select')` (`whiteboard-ios.html:1510`). `Canvas.tsx` gera o id da
  forma (`uid('el')`, mesmo formato de `mutations.ts`) ANTES de mandar pro `onCommitElement`,
  já que precisa dele pra chamar `onShapeCreated(id)` — commitar e só depois descobrir o id
  (que `addElement` geraria) não dava pra selecionar de volta sem uma volta a mais de estado.
- Seleção corrigida pra bater com o protótipo (`hit()`/`hitLoose()`/`pick()`,
  `whiteboard-ios.html:1324-1369`): uma forma SEM preenchimento só é achada de primeira perto da
  borda (`nearShapeBorder` em `geom.ts`); o miolo vazio dela só conta como alvo numa segunda
  passada, e só se nada mais (traço, forma preenchida, outra forma por cima) foi achado na
  primeira — senão uma forma grande e vazia bloqueava selecionar qualquer coisa desenhada
  dentro/por cima dela. Alças de redimensionar e a caixa de seleção agora são desenhadas em
  px de TELA (divididas por `zoom`), não de cena — ficam do mesmo tamanho visual em qualquer
  nível de zoom, igual ao `HR=11` do protótipo, em vez de encolher/crescer com o zoom.
- Escolha de alça de redimensionar corrigida: usuário reportou que arrastar de lado fazia o
  elemento "crescer muito" — causa raiz era pegar a PRIMEIRA alça dentro da tolerância de toque
  (`nw,n,ne,w,e,...`, nessa ordem), não a MAIS PERTO; perto de um canto de uma forma pequena,
  "n" e "ne" cabem os dois na tolerância, e um toque perto de "e" mas um pouco impreciso podia
  agarrar "ne" — arrastar de lado então também mexia a altura (componente "n" da alça errada),
  parecendo descontrolado. `selectStart` agora acha a alça de MENOR distância dentre as que
  cabem na tolerância, testadas contra as posições PADDED (mesmas usadas pra desenhar — antes o
  hit-test usava a caixa sem padding, um lugar diferente de onde a bolinha aparecia). O padding
  entre a borda do elemento e as alças também aumentou (`HANDLE_PAD_PX`, 9→14 px de tela),
  compartilhado entre `selectStart` e `SelectionOverlay` — alças mais espaçadas entre si, menos
  ambiguidade. Confirmado ao vivo: tocar 5px acima do centro real da alça "e" e arrastar de lado
  só mudou a largura (na proporção exata do arrasto), a altura ficou intacta.
- Toque parado (tocar e soltar sem arrastar nadinha) agora seleciona: usuário reportou "tenho
  que mover pra selecionar". Causa raiz, bem mais fundamental que as anteriores: um
  `Gesture.Pan()` só reconhece a partir de um evento de MOVIMENTO — um toque matematicamente
  parado nunca dispara `onStart`, nem com `.minDistance(0)` (que também foi setado, útil pra
  arrastos de verdade começarem sem "salto" inicial de ~10pt). A ferramenta de seleção
  (`select`), texto e borracha rodavam tudo dentro do `panOne.onStart`, então tocar sem arrastar
  nunca fazia nada. Correção: um `Gesture.Tap()` de verdade, à parte, composto no
  `Gesture.Race(...)` junto com o Pan — toque parado vira `tapAt(x,y)` (que reaproveita
  `selectStart`+`selectEnd` pra seleção, ou `placeText`/`eraseAt` direto pros outros dois).
  Confirmado ao vivo repetidas vezes: um toque simples, sem nenhum arrasto, seleciona a forma na
  hora. De brinde, uma leitura de `scale.value` (SharedValue) direto no render de `Canvas.tsx`
  — que disparava o aviso de "strict mode" do Reanimated em CADA frame de arrasto — virou um
  espelho em `useState` atualizado via `useAnimatedReaction`, só quando o zoom muda de verdade.

## Etapa R3 — zoom, cotovelo de seta, texto de verdade, borracha com rastro, cor completa, fundo

- **Bug real de resize (composição a cada frame)**: usuário reportou "movimento bem pouco e dá
  um resize enorme" mesmo depois do R2.2. Causa raiz: `selectUpdate` recomputava
  `applyResize(cur.box, ...)` usando `cur.box` — que a cada frame já era a SAÍDA do frame
  anterior, não a caixa original — enquanto `dx`/`dy` já são o delta TOTAL desde o início do
  gesto (não incremental). Resultado: a cada um dos ~60 frames/segundo de um arrasto real, o
  delta total inteiro era somado de novo em cima de uma caixa que já tinha esse delta embutido
  — cresce quase quadrático com a duração do arrasto, não com a distância. Os testes anteriores
  (R2.2) não pegaram isso porque só chamavam `selectUpdate` um punhado de vezes via
  invocação direta, nunca um stream contínuo. Corrigido guardando a caixa ORIGINAL imutável no
  `DragState` (`box`) e computando o preview sempre fresco via `applyResize(box, handle, dx,
  dy)` — nunca mais escrevendo de volta em `box`. Confirmado chamando `selectUpdate` 40x pra a
  MESMA posição final (imita 60fps): resultado idêntico a UMA chamada, sem amplificação.
- **Texto não abria editor nenhum**: `placeText` só criava um elemento vazio e invisível — não
  tinha jeito de digitar nele, exatamente o "não funciona" reportado. Corrigido: gera o id na
  hora (`uid('el')`, mesmo padrão de `endShape`), seleciona e já chama `onRequestTextEdit` —
  igual ao `openText()` do protótipo (abre o editor na hora de tocar, não em dois toques
  depois). Texto vazio ao cancelar ou confirmar sem digitar nada é descartado (igual ao
  protótipo: solto sem conteúdo não faz sentido no quadro).
- **Zoom com porcentagem e botões +/-**: `RabiscoCanvas` ganhou um HUD (topo, centralizado,
  fora do `Gesture.Detector`) com `-`, a porcentagem atual, `+`. Mesma matemática do pinch (zoom
  em torno de um ponto focal), só que o focal é o centro da área visível
  (`onLayout`) em vez de onde os dedos estão. **Achado ao vivo**: os botões inicialmente não
  respondiam a NENHUM toque — causa raiz, o HUD estava aninhado DENTRO do `GestureDetector`, e
  os gestos do canvas (pan/tap/pinch) capturam o toque antes de alcançar um `Pressable`
  aninhado. Corrigido posicionando o HUD como irmão do `GestureDetector`, fora dele.
- **Variações de seta + roteamento em cotovelo**: `arrowType` (`straight`/`curved`/`elbow`) já
  existia no domínio; só faltava a UI (nova linha na `StyleBar`, ícones `moveUpRight`/`spline`/
  `route`) e o roteamento de `elbow` em si — porte de `elbowRoute`/`headingAt`
  (`whiteboard-ios.html:887-903`, sem o parâmetro `bend` de separar setas irmãs, refinamento
  visual não essencial): dois segmentos retos em ângulo reto entre início e fim, decidindo se
  sai na horizontal ou vertical pelo lado da forma ancorada mais perto. A ancoragem em si
  (`bindingAt`/`pickBindable`/`resolvedPoints`) já funcionava desde o R2.
- **Borracha com rastro temporário**: `eraseAt` acumula os pontos por onde passou num estado
  local (`eraseTrail`, nunca vira elemento, nunca entra no histórico de undo); desenhado como um
  traço translúcido por cima do que foi apagado, some quando o gesto termina
  (`endErase`, chamado no `onEnd` do Pan e, com um `setTimeout` curto, num toque parado).
- **Seletor de cor completo**: novo `ColorPicker.tsx` — quadrado de saturação/valor + barra de
  matiz desenhados com gradientes do Skia (já é dependência do canvas, sem lib nova só pro
  gradiente) e arrastados com toque nativo (`onResponderMove`, sem gesture-handler — mais simples
  pra um componente isolado), campos de hex e rgba bidirecionais (digitar ou colar um deles
  atualiza o outro e o picker — `domain/rabisco/color.ts`, conversões puras e testadas), e uma
  faixa "cores usadas no quadro" no lugar de um conta-gotas pixel-a-pixel: pega qualquer cor já
  presente em algum elemento do desenho, sem precisar acertar um pixel exato — mais simples de
  implementar e, na prática, cobre o mesmo caso de uso ("copiar uma cor que já está no canvas").
  Aberto por um botão "mais cores" (ícone paleta) no fim de cada faixa da `StyleBar`.
- **Fundo do canvas — liso / grade / pontilhado**: botão no topo (`hudRight`, ícone muda com o
  estado) cicla entre os 3; o padrão em si é UM `Path` só (não uma linha/ponto por elemento Skia
  — manteria centenas de nós), cobrindo uma área fixa de ±1400 em torno da origem (não infinita —
  um quadro de rabisco não costuma andar tão longe assim; simplificação deliberada).

## Etapa R3.1 — texto de verdade renderizando, tamanho/família/alinhamento, opacidade, camadas

- **Bug real: texto nunca aparecia, com cor nenhuma** — usuário reportou "o texto não aparece
  mesmo trocando de cor dele". Causa raiz: `matchFont({ fontSize })` sem `fontFamily` cai no
  default `'System'` do `react-native-skia` — que é um alias que só o RN puro entende, NÃO um
  nome de família que o `FontMgr` do Skia (`CTFontManager` no iOS) reconhece. `matchFamilyStyle`
  não achava nada, o `SkFont` resultante não desenhava glifo nenhum — sem erro, sem crash, só
  nada na tela, exatamente o sintoma reportado (trocar a cor não muda nada porque não tem o que
  colorir). Corrigido passando um nome de família de verdade sempre — nunca mais depender do
  default. Achado ao vivo: criar um elemento de texto novo, confirmar pelas alças de seleção que
  ele existe (caixa com conteúdo), e ver que nada desenha dentro; trocar `fontFamily` pra
  `'Helvetica Neue'` fez o texto aparecer na hora, mesmo sem reiniciar o app (Fast Refresh).
- **Tamanho de fonte com nome (S/M/L/XL)**: `FONT_SIZES` em `domain/rabisco/palette.ts` — mesmos
  valores dos presets P/M/G/GG do protótipo (`whiteboard-ios.html:1910`: 16/22/32/48), só
  renomeados. Segmented control na `StyleBar` (reaproveita `design/components/Segmented.tsx`,
  já usado em Escrever/Ler — nenhum componente novo), visível só com um elemento de texto
  selecionado.
- **Família de fonte (3 tipos)**: novo campo `fontFamily: 'sans'|'serif'|'mono'` no
  `RabiscoElement` — a CHAVE fica no domínio (serializável, agnóstica de plataforma), o NOME real
  que o Skia precisa (`'Helvetica Neue'`/`'Georgia'`/`'Menlo'`, todas fontes do sistema no iOS,
  reconhecidas pelo `CTFontManager`) fica em `FONT_FAMILIES` (`palette.ts`), consumido só na
  camada de UI/render — o mesmo bug do item acima, resolvido de vez ao nunca deixar o valor de
  `fontFamily` sair de um dicionário de nomes conhecidos. Segmented control (Sans/Serif/Mono).
- **Alinhamento de texto (esquerda/centro/direita)**: novo campo `textAlign` no `RabiscoElement`
  — o protótipo não tem esse campo (label de forma sempre centraliza, texto solto sempre alinha
  à esquerda, fixo no código), então esta é uma extensão deliberada, não um porte. Renderizado
  medindo cada linha com `font.measureText(line).width` (API do Skia) e deslocando o `x` da linha
  dentro da largura da caixa (`el.w`) conforme o alinhamento — ícones `alignLeft`/`alignCenter`/
  `alignRight` (lucide `text-align-start/center/end`) na `StyleBar`.
- **Caixa do texto medida de verdade**: `saveText`/`setFontSize`/`setFontFamily` em
  `RabiscoScreen.tsx` agora chamam `matchFont(...).measureText(linha)` pra calcular `w`/`h` da
  caixa — antes era um chute (`comprimento_da_linha * 11px`, fixo, não escalava com o tamanho da
  fonte); importa agora que tamanho/família variam, e é a largura que o alinhamento usa como
  referência.
- **Opacidade (texto e formas)**: já existia no domínio e no render (`Group opacity={el.opacity}`
  em `ElementView`) desde o início — só faltava a UI. Como o design system ainda não tem um
  Slider genérico, `StyleBar` ganhou um `OpacityTrack` próprio, faixa 10-100% em passos de 5%,
  mesmo range do `<input type=range>` do protótipo (`whiteboard-ios.html:481`). Aparece sempre
  que algum elemento está selecionado, qualquer tipo. (A implementação por toque bruto —
  `onResponderMove` — foi trocada por `Gesture.Pan` na Etapa R3.2 abaixo, por um bug real que
  ela causava.)
- **Camadas (ordem de empilhamento)**: 4 mutações novas e puras em `domain/rabisco/mutations.ts`
  — `bringForward`/`sendBackward` (troca de posição com o vizinho, um passo) e
  `bringToFront`/`sendToBack` (tira do array e reinsere na ponta) — a ordem de renderização É a
  ordem do array `doc.elements` (índice maior desenha por cima), então reordenar o array já é
  toda a mudança que precisa. UI: 4 ícones na `StyleBar` (`sendToBack`/`chevronDown`/`chevronUp`/
  `bringToFront`, lucide). **Decisão de layout**: a primeira tentativa colocou os 4 botões no HUD
  superior esquerdo (junto de Duplicar/Excluir) — colidiu visualmente com a pílula de zoom
  centralizada (6 chips + pílula não cabem lado a lado numa tela de ~390-430pt). Movido pra dentro
  da `StyleBar`, que já só aparece com algo selecionado e já é o lugar de todo controle
  por-elemento — mais consistente, e resolve a colisão de graça.
- **Verificado ao vivo, mutação por mutação**: criado um elemento de texto novo, confirmado que
  `Sans`/`M`/alinhamento-esquerda são os defaults; trocar pra `L` e `Serif` mudou o desenho na
  hora (fonte maior, com serifas, visível no glifo); trocar alinhamento pra centro destacou o
  ícone certo; arrastar a faixa de opacidade pra 60% deixou o texto visivelmente translúcido
  (contra outro elemento ao lado, em 100%, pra comparação direta); tocar "recuar uma camada"
  trouxe o elemento de trás pra cima do que estava recém-criado — z-order mudou no canvas na
  hora, sem precisar recarregar.

## Etapa R3.2 — duplo toque pra editar texto, picker arrastável e destravado, opacidade sem
travar cor, feedback de camada, ferramenta padrão

- **Editar texto só com 2 toques, ou pelo botão explícito**: um toque parado (sem arrastar) num
  elemento de texto SEMPRE abria o editor, mesmo só pra selecionar — não dava pra, por exemplo,
  selecionar um texto só pra trocar a cor sem cair direto editando. Corrigido: `selectEnd` não
  abre mais editor nenhum, só seleciona; um `Gesture.Tap().numberOfTaps(2)` novo
  (`doubleTapOne`), com o toque único (`tapOne`) chamando
  `.requireExternalGestureToFail(doubleTapOne)` — o padrão padrão do
  `react-native-gesture-handler` pra distinguir toque único de duplo — abre o editor no duplo
  toque. Segunda via, pro caso de já estar selecionado: chip "Editar" (ícone `pencil`) no HUD
  superior esquerdo, só quando o tipo selecionado é `text`.
- **Bug real: opacidade "bugava" o input de cor logo depois** — usuário reportou que trocar
  opacidade deixava a faixa de cor de preenchimento inconsistente. Causa raiz: o `OpacityTrack`
  usava o sistema de responder puro do RN (`onStartShouldSetResponder`/`onResponderMove`),
  aninhado ao lado de vários `Pressable` (as faixas de cor) dentro do mesmo `BlurView` — a
  negociação de responder do RN nessa combinação (vários toques concorrentes numa árvore rasa
  cheia de `Pressable`) não é confiável, e o mesmo padrão causava o item seguinte. Trocado por
  `Gesture.Pan` (`react-native-gesture-handler`) com `onBegin` (dispara já no toque inicial, sem
  precisar de arrasto — diferente de `onStart`, que só dispara depois de movimento) — o mesmo
  reconhecedor nativo já usado com sucesso em `Canvas.tsx` a sessão inteira. Confirmado ao vivo:
  arrastar a opacidade pra 35% e, na sequência imediata, tocar a cor vermelha — os dois
  aplicaram corretamente, opacidade continuou em 35%.
- **Bug real: "o picker de cor está travado, não consigo selecionar as cores"** — mesma causa
  raiz do item acima, só que no quadrado de saturação/matiz e na barra de matiz do
  `ColorPicker`: `onStartShouldSetResponder` isolado, dentro de dois `Pressable` encadeados (o
  scrim do modal e a caixa) mais um `SkiaCanvas` por cima. Trocado por `Gesture.Pan` (mesmo
  padrão do item acima) em cada superfície. Confirmado ao vivo: tocar em qualquer ponto do
  quadrado move a bolinha pra lá na hora e atualiza hex/rgba/preview.
- **Picker de cor arrastável, sem sair da tela**: pedido do usuário — poder mover o picker pra
  enxergar o que está atrás, mas sem conseguir jogar fora da tela. Só o título (mais uma barrinha
  "grabber" decorativa acima, convenção de sheet arrastável do iOS) é a alça —
  `Gesture.Pan` com `onBegin` guardando a posição atual e `onUpdate` somando o arrasto, sempre
  passando por `clampTranslate` (`Math.min`/`Math.max` contra `(largura da janela − largura da
  caixa)/2`, medida com `useWindowDimensions()` + `onLayout` da caixa) antes de aplicar —
  nunca deixa sair da área visível. O botão fechar (X) fica FORA do `GestureDetector` do
  título, como um irmão — um `Pressable` aninhado dentro de um `GestureDetector` não recebe
  toque (achado real da Etapa R3, no HUD de zoom do `Canvas`; o mesmo cuidado se aplica aqui).
  Posição reseta pro centro toda vez que o picker abre de novo. Confirmado ao vivo: arrastar
  pelo título move a caixa inteira; achar a posição exata do botão "mais cores" e do cabeçalho
  precisou instrumentar com `measureInWindow()` (temporário, removido depois) porque o palpite
  visual por coordenada de tela errou tanto nesta etapa quanto em achados anteriores — a lição
  registrada: quando o toque parece "não bater em nada" repetidamente, medir a posição real do
  elemento é mais confiável que recalibrar a transformação de coordenada por tentativa.
- **Feedback visual de camada**: os 4 botões de reordenar (Etapa R3.1) não diziam nada sobre o
  que mudou. Agora cada um calcula a posição ANTES (`doc.elements.findIndex`, ainda o valor
  deste render) e DEPOIS (`useDoc.getState().doc` logo após o `apply()`, já que a variável local
  `doc` só atualiza no PRÓXIMO render) e mostra um toast (`useToast()`, já existente no app) tipo
  "Camada 2 → 3 de 6".
- **Ferramenta padrão ao abrir**: `tool` começava em `'draw'` (caneta) — trocado pra `'select'`
  (a seta, do lado da mãozinha no Dock), pedido direto do usuário.

## Etapa R3.3 — destaque de ligação de seta, histerese de soltar, conta-gotas de verdade

- **Feedback visual ao ancorar seta numa forma**: pedido do usuário — arrastar a ponta de uma
  seta perto de uma forma bindável não mostrava nada, o gesto era "às cegas". Porte de
  `S.bindHint` (`whiteboard-ios.html:1239-1251`): um contorno azul arredondado (2.5px, 55%
  alfa, 4px de folga da borda real) ao redor da forma candidata, redesenhado a cada frame do
  arrasto a partir de um novo estado `bindHint` (`Canvas.tsx`) — setado tanto ao criar uma seta
  nova (`extendShape`) quanto ao arrastar a ponta de uma já existente (`selectUpdate`), limpo em
  `endShape`/`selectEnd`. Novo componente `BindHintOverlay`, e `roundedRectPath()` (SVG path
  manual — Skia não tem primitivo de retângulo arredondado com raio parametrizável pronto pra
  isso).
- **Soltar a ligação "trava"**: reportado como sensação de trava — causa raiz, `pickBindable`
  usava o MESMO raio (10px) pra prender e pra soltar, sem histerese nenhuma; o alvo troca de
  estado bem em cima do limiar, o que parece "grudento"/instável em vez de fluido. Porte de
  `movePoint()` (`whiteboard-ios.html:1573-1594`, com o comentário original: "sem isso a âncora
  pisca no limiar e o desprender vira acidente"): `pickBindable` ganhou um parâmetro opcional
  `currentId` — sem ele, comportamento de sempre (10px pra achar um alvo); com ele (uma ponta
  que JÁ estava ligada), o alvo atual continua valendo até o toque sair de 22px, não 10 — uma
  faixa "morta" de 12px onde nada muda, é isso que dá a sensação fluida em vez de travada. 4
  testes novos em `geom.test.ts` fixando os dois raios exatos (180 total).
- **Conta-gotas de verdade**: o ícone `pipette` já existia mas era só decorativo — tocar não
  fazia nada ("não ocorre nada"). Pedido em 4 partes: (1) o botão precisa ficar "selecionado"
  (estado ativo visível), (2) arrastar o dedo mostra uma lupa ampliada ao lado com o pixel
  mirado, (3) o fundo do picker não pode escurecer o que está atrás — senão a cor lida sai mais
  escura que a real, (4) "faça algo legal com o picker".
  - **De onde vem o pixel**: `RabiscoCanvas` ganhou um handle imperativo
    (`RabiscoCanvasHandle`, via `ref` — React 19 aceita `ref` como prop normal, sem
    `forwardRef`) com `beginColorSample()`/`sampleColorAt()`/`endColorSample()`. Usa
    `makeImageSnapshot()` do `CanvasRef` do Skia (síncrono) pra tirar UM snapshot congelado no
    toque inicial — escolher uma cor não precisa acompanhar o desenho mudando — e
    `SkImage.readPixels(px, py, {colorType: RGBA_8888, alphaType: Unpremul})` pra ler 1 pixel
    por coordenada. Coordenada de tela → pixel da imagem passa por `measureInWindow()` (posição
    da view, cacheada) + `PixelRatio.get()` (pontos → pixels do device).
  - **Por que o Modal precisa saber ler o Canvas**: o `ColorPicker` vive num `Modal` (janela
    nativa separada, por cima de tudo) — só quem pode tirar snapshot de si mesmo é o
    `RabiscoCanvas`, então `RabiscoScreen` guarda um `canvasRef` e passa pro `ColorPicker` como
    prop; o picker chama os métodos do handle, não duplica lógica de leitura de pixel nenhuma.
  - **Fundo transparente**: `scrim` do `ColorPicker` (antes `rgba(0,0,0,0.38)`) virou
    `'transparent'` — sem isso o quadro por trás aparecia escurecido e o conta-gotas leria uma
    versão errada da cor. Efeito colateral bom: o picker inteiro ficou mais "flutuante", menos
    pesado visualmente.
  - **A lupa**: círculo (`View` com `borderRadius` = metade da largura, clipando um `Canvas`
    Skia pequeno por dentro), desenhando o MESMO `SkImage` do snapshot com um `transform`
    (translada o pixel mirado pro centro, escala 6x, translada pro centro do círculo — sem
    precisar recortar/recodificar a imagem, Skia deixa renderizar a mesma imagem em canvases
    diferentes) mais uma mirinha (cruz branca + ponto preto) marcando o pixel exato e um anel
    colorido com a própria cor lida. Posicionada acima do dedo (offset fixo), clampada nas
    bordas da tela.
  - **Superfície de toque como irmã, não filha**: a área de arrasto do conta-gotas
    (`GestureDetector` cobrindo a tela inteira) é renderizada como IRMÃ do scrim, só enquanto
    ativo — não filha dele — pelo mesmo motivo do botão fechar do picker (Etapa R3.2): um
    `GestureDetector` "engole" o toque de tudo que está aninhado dentro, e aqui o objetivo é
    exatamente esse (suspender a interação normal do picker enquanto o modo conta-gotas está
    ativo), mas só funciona corretamente ficando FORA da árvore do scrim/card.
  - **Achado ao vivo, confirmado**: tocar o ícone acende um destaque azul nele (estado ativo);
    arrastar sobre uma área do canvas atualiza o hex/rgba/preview do picker em tempo real e
    mostra a lupa; soltar aplica a cor no elemento selecionado de verdade (confirmado: um
    retângulo com borda vermelha, depois de uma amostra em área preta do canvas, ficou com
    borda preta — a cor comprometida foi mesmo aplicada, não só mostrada no picker).

## Etapa R3.4 — o `ColorPicker` pesava: `applyLive`/`commitLive` em vez de `apply()` por frame

- **Bug real de performance**: usuário reportou "está pesando muito a seleção no picker de cor
  e o conta-gota deve estar dando rerender". Causa raiz: arrastar no quadrado de
  saturação/matiz, na barra de matiz ou com o conta-gotas chamava `onChange(hex)` a cada frame
  do gesto (~60x/segundo) — e esse `onChange`, do lado do `RabiscoScreen`, ia direto pro `apply()`
  normal do `useDoc` (`store/useDoc.ts`), que faz `structuredClone(doc)` **e**
  `JSON.stringify(doc)` **e** empilha uma entrada nova no histórico de undo
  (`[...h.past, snapshot].slice(-80)`, uma cópia do array inteiro) — tudo isso, a cada pixel de
  arrasto. Nada disso é novo nesta sessão: é a mesma armadilha que o app já resolve há tempo pra
  digitação contínua (`useLiveField`/`applyLive`+`commitLive`, usado no editor de Markdown — ver
  comentário em `store/useDoc.ts:88-89`: "empilhar undo por tecla torna o botão inútil"), só que
  o `ColorPicker` do Rabisco (novo, desta sessão) nunca tinha adotado o mesmo padrão.
- **Fix — mesmo padrão de `useLiveField`, agora também pra gesto de arrasto (não só digitação)**:
  `ColorPicker` ganhou 3 props novas — `onBeginLive` (chamado uma vez no início do gesto/foco do
  campo, equivalente ao `onFocus` do `useLiveField`), `onChangeLive` (chamado a cada
  frame/tecla, sem empilhar undo), `onEndLive` (equivalente ao `onBlur`, fecha a sessão inteira
  num ÚNICO passo de undo). `RabiscoScreen` implementa o lado do `useDoc`: `beginColorLive()`
  tira o snapshot (`JSON.stringify(useDoc.getState().doc)`, guardado numa `ref`, não React
  state — sobrevive à sessão inteira sem re-render), `setStrokeLive`/`setFillLive` mutam o
  elemento via `applyLive` (clona o doc mas NÃO stringifica nem empilha undo), `endColorLive()`
  chama `commitLive(snapshot)` uma vez só. `onChange` (o antigo, discreto) continua existindo e
  sendo usado só onde é mesmo um toque único — a faixa de "cores usadas no quadro".
  `svPan`/`huePan`/`eyedropperPan` ganharam `onBegin`→`onBeginLive` e `onEnd`→`onEndLive`; os
  campos de hex/rgba ganharam `onFocus`/`onBlur` fazendo o mesmo.
- **Fix extra, só pro conta-gotas — throttle no `readPixels()`**: além do `apply()` caro, o
  conta-gotas tinha um segundo custo específico: `SkImage.readPixels()` num snapshot vindo de
  `makeImageSnapshot()` normalmente é GPU-backed, e ler de volta um pixel dessa imagem é um
  readback síncrono da GPU — caro o bastante pra pesar sozinho, mesmo já sem o `apply()`
  pesado. Adicionado um throttle (não debounce: debounce só dispara no FIM do gesto, e a lupa
  precisa acompanhar o dedo enquanto arrasta, não só no final) — no máximo uma leitura a cada 32ms
  (~30fps, `SAMPLE_THROTTLE_MS`), com uma leitura sempre forçada (`force=true`, ignora o
  throttle) no toque inicial e no toque final, pra não perder a cor exata de onde o dedo tocou
  ou soltou.
- **Verificado ao vivo**: arrastar no quadrado de saturação/matiz continua respondendo liso;
  fechando o picker e apertando "desfazer" UMA vez, a cor do elemento voltou de uma vez só pro
  valor de ANTES do arrasto inteiro (não um micro-passo do meio do gesto) — confirma que a
  sessão de arrasto virou um ÚNICO passo de undo, não dezenas. O botão "refazer" acendeu depois
  do desfazer, undo/redo continuam consistentes. Conta-gotas testado de novo depois da mudança:
  continua sampleando e aplicando a cor corretamente.

## Etapa R4 — popover de forma fechando errado, seleção múltipla, seta em cotovelo apontando
errado, rotação

Pedido do usuário em 4 partes, respondidas nesta ordem.

- **Popover de forma não fechava sozinho**: `Dock.tsx` guardava `shapePopOpen` como estado só
  seu, nunca resincronizado quando `tool`/seleção mudavam por FORA dele — desenhar uma forma
  troca `tool` pra `'select'` direto em `RabiscoScreen.shapeCreated()`, sem passar pelo
  `pressTool` do Dock, então o popover ficava aberto pra sempre. Fix: dois `useEffect` (em
  `tool` e em `selectedId`, agora recebido como prop) fecham o popover sempre que `tool` deixa
  de ser `'shape'` ou a seleção muda — os dois casos que o usuário descreveu ("selecionar um
  elemento... ou clico fora").
- **Seleção múltipla — laço + botão aditivo**: apertar e segurar no fundo vazio, em modo
  seleção, agora abre um retângulo de laço (`Canvas.tsx`, `DragState` novo `'marquee'`); soltar
  seleciona todo elemento cuja `bounds()` SOBREPÕE o retângulo (não precisa estar inteiro
  dentro — mesmo critério do Excalidraw, `rectsOverlap()`). Um chip novo no HUD
  (`multiSelect`, ícone `SquareDashedMousePointer`) liga um modo "aditivo": com ele ativo,
  tocar elemento por elemento alterna cada um dentro/fora da seleção (`selectedIds`) em vez de
  trocar — sem ele, um toque continua substituindo a seleção como sempre. Tocar um elemento que
  já faz parte de um grupo selecionado arrasta o grupo inteiro (`DragState` novo
  `'move-multi'`), usando a nova mutação pura `moveElements(doc, ids, dx, dy)`
  (`domain/rabisco/mutations.ts`) — um `structuredClone`/um passo de undo pro grupo inteiro, não
  um por elemento (chamar `moveElement` num loop empilharia um passo de undo por elemento).
  `duplicateSelected`/`deleteSelected` também passaram a iterar `selectedIds`. Com mais de um
  elemento selecionado, as alças de resize/rotação e a `StyleBar` somem — só fazem sentido pra
  UM elemento por vez — e cada elemento do grupo ganha um contorno simples
  (`MultiSelectOutline`, sem alças, rotation-aware via o mesmo `rotateTransform`). `Chip`
  (`design/components/Chip.tsx`) ganhou uma prop `active` nova (preenchimento azul translúcido
  igual ao já usado pra ferramenta/forma ativa no Dock) — reaproveitável em qualquer cápsula de
  HUD que precise de alternância, não só neste toggle. +2 testes de mutação (`moveElements`:
  move só os ids do grupo, lista vazia é no-op).
- **Seta em cotovelo ligada podia apontar pro lado errado**: usuário relatou que uma seta
  ancorada no topo de uma forma "fica[va] pro lado direito... não fica apontando". Causa raiz
  — achada por um teste temporário de diagnóstico matemático (`_debug_arrow.test.ts`, depois
  apagado), não ao vivo, já que testar ao vivo não reproduzia o caso simples de seta reta (que
  nunca teve o bug): o ponto de dobra do `elbowRoute` é o meio-termo aritmético entre
  início/fim, sem noção nenhuma de onde as formas realmente estão. Pra certas posições relativas
  (origem abaixo, alvo acima, ligado na borda de CIMA do alvo), a rota calculada se aproxima do
  alvo PELO LADO ERRADO — atravessando a forma por dentro — arrastando a direção da ponta da
  seta junto. Fix cirúrgico: `arrowHeadAngle(el, all, abs)` nova em `domain/rabisco/geom.ts`
  ignora a direção do último segmento SÓ pra seta em cotovelo E ligada, apontando pro CENTRO da
  forma-alvo em vez disso (funciona pra qualquer borda, sem precisar saber qual é); seta
  reta/curva não muda — elas sempre seguem a direção real do último segmento (confirmado por
  teste que é a única linha visível, então nunca aponta "errado" por definição). +2 testes
  (`arrowHeadAngle`: reta ignora binding, cotovelo aponta pro centro do alvo).
- **Rotação — "faça igual o Excalidraw"**: alça nova (bola acima da seleção, ligada por uma
  haste fina) com offset generoso da caixa (`ROTATE_HANDLE_OFFSET_PX=48`) e raio de toque maior
  que os das alças de resize (`ROTATE_HANDLE_TOL_PX=36` vs. `HANDLE_TOL_PX=32` dividido entre 8
  alças coladas) — "área generosa pra não confundir com a seleção", pedido explícito do usuário.
  Arrastar gira em torno do centro da forma, com imã suave pros múltiplos de 15° (gruda a até 4°
  de distância, `snapRotation()`) e um rótulo de graus (`123°`) aparecendo do lado da alça
  enquanto o gesto está ativo. Campo novo `rotation: number` em `RabiscoElement`
  (`domain/types.ts`) — radianos, não graus: bate direto com `transform:[{rotate}]` do Skia sem
  converter a cada render, só vira grau na hora de mostrar o rótulo; extensão deliberada, sem
  equivalente no protótipo de referência (`whiteboard-ios.html` não tem rotação nenhuma). Só
  formas com caixa própria giram (`ROTATABLE = {rect, diamond, ellipse, text}`) — linha/seta/
  traço ficam de fora: rotacionar uma sequência de pontos não tem um significado "natural", e
  precisaria reescrever a lógica de binding pra acompanhar. Resize inicialmente só funcionava com
  rotação exatamente 0° (corte de escopo deliberado nesta etapa) — revertido na Etapa R5.1, mesma
  sessão, depois do usuário pedir de volta ("não é pra tirar o resize do tipo texto"); ver lá como
  ficou. Hit-test ganhou `toElementLocal(el, p, all)`: rotaciona
  o PONTO DE TOQUE pro referencial local da forma (inverso da rotação, em volta do centro) em
  vez de rotacionar a geometria da forma — assim toda checagem existente (`bounds`,
  `insideShape`, distância até alça) continua funcionando sem mudar, só recebe um ponto
  pré-rotacionado. Binding de seta/linha continua olhando pra caixa NÃO rotacionada mesmo numa
  forma girada — limitação conhecida, não endereçada nesta etapa (a matemática de âncora fx/fy
  usa `bounds()` puro). +2 testes (`toElementLocal` desfaz 90° corretamente; `hitTest` acha uma
  forma girada na posição visual, fora da caixa não-rotacionada).

**Verificado ao vivo** (depois de restart limpo do Metro, `-c`, bundle completo confirmado): a
sequência inteira — desenhar um retângulo e um losango, laço selecionando os dois, alça de
rotação girando o retângulo sozinho com o rótulo de grau aparecendo e a caixa de seleção
girando junto, duplicar/mover/excluir o grupo, ligar o modo aditivo e mesclar seleção tocando
elemento por elemento, desligar e confirmar que um toque fora volta a desselecionar — tudo
confirmado por screenshot em cada passo. `npx tsc --noEmit` limpo e `npx vitest run` — 186
testes (184 de antes + 2 de `moveElements`).

## Etapa R5 — rótulo preso numa forma, rotação em grupo, botão de juntar

Pedido do usuário em 4 partes; a 1ª já estava pronta desde a Etapa R4, só faltava confirmar.

- **"Rotacionar texto também" — já funcionava**: `text` já fazia parte de `ROTATABLE`
  (`domain/rabisco/geom.ts`) desde a Etapa R4, então a alça de rotação, o hit-test rotacionado
  (`toElementLocal`) e o `rotateTransform` no render já cobriam texto solto igual a
  retângulo/losango/elipse. Confirmado ao vivo sem mudar uma linha de código — criar um texto,
  arrastar a alça de rotação, a letra gira e trava em 45° (imã de 15°).
- **Rótulo preso numa forma (duplo toque)**: `RabiscoElement` já tinha `text`/`labelColor` desde
  a Etapa R1 (porte 1:1 do protótipo) e `hitTest` já tratava uma forma `LABELABLE`
  (retângulo/losango/elipse) com `el.text` truthy como "preenchida" — miolo inteiro clicável, não
  só a borda — mas nada desenhava esse texto nem dava jeito de editá-lo: os campos existiam,
  órfãos. Fix: `doubleTapAt` (`Canvas.tsx`) agora abre o mesmo editor de texto pra `LABELABLE`,
  não só pra `type: 'text'`; `ElementView` ganhou `ShapeLabel`, que desenha `el.text` CENTRALIZADO
  na caixa da forma (`bounds()`), usando `el.labelColor` (não `strokeColor` — cor própria do
  rótulo, independente do contorno) — dentro do mesmo `<Group transform={rotate}>` da forma, então
  acompanha a rotação dela automaticamente, sem matemática extra. Diferença crucial de
  `RabiscoScreen.saveText`/`cancelTextEdit` em relação a texto solto: a caixa da FORMA nunca é
  remedida pelo tamanho do texto (ela é dona do próprio tamanho), e ficar vazio só limpa o rótulo
  (`text: ''`) em vez de apagar a forma — só um texto solto some quando esvaziado. Sem quebra de
  linha automática (mesma simplicidade do texto solto, só respeita `\n` que o usuário digitar).
  Diálogo mostra título "Rótulo" pra uma forma, "Texto" pra um elemento de texto solto — mesmo
  componente `AlertDialog`, só o título muda conforme o tipo do elemento sendo editado.
- **Rotação em GRUPO**: com mais de um elemento selecionado (laço, aditivo ou grupo "juntado"),
  uma alça de rotação nova (`GroupRotateHandle`) aparece acima da caixa da SELEÇÃO INTEIRA — gira
  tudo junto em torno do centro dessa caixa, não do centro de cada elemento (pedido do usuário:
  "seguem a orientação do pai que é o quadrado de seleção"). Matemática nova e pura,
  `rotateElementAround(el, center, delta)` (`domain/rabisco/geom.ts`, reaproveitada tanto no
  preview local do `Canvas.tsx` quanto na mutação `rotateGroup`): forma com caixa própria
  (`ROTATABLE`) órbita o centro do GRUPO e soma `delta` na própria `rotation` (o mesmo giro que a
  rotação individual já fazia, só que a posição também muda); linha/seta/traço — sem uso de
  `rotation` no render — giram cada PONTO ABSOLUTO diretamente em volta do centro do grupo
  (`rotatePoint`), resultado visual equivalente (a forma inteira gira, não só translada), só
  guardado de um jeito diferente. Render do handle: a caixa da seleção e o handle giram como um
  retângulo RÍGIDO (`transform` do Skia em volta do centro), recalculado a partir de `elements`
  (a base imutável do doc, parada durante todo o gesto) — nunca eixo-alinhado a cada frame, senão
  a caixa "respiraria" de tamanho em vez de girar de verdade. Mesmo imã de 15° e rótulo de graus
  da rotação individual (Etapa R4), reaproveitados.
- **Botão "Juntar" (agrupar)**: aparece no HUD com mais de um elemento selecionado (ícone
  `group`, lucide `Group`). Aperta e todos os `selectedIds` ganham o MESMO `groupId` novo
  (`groupElements`, mutação pura) — campo estrutural novo em `RabiscoElement.groupId: string |
  null`. A partir daí, tocar em QUALQUER membro do grupo (`groupMembers()`, novo em `Canvas.tsx`)
  seleciona/move/rotaciona/duplica/exclui o GRUPO INTEIRO como se fosse um elemento só — "os
  elementos viram um só", como pedido. Sem botão de "desjuntar" nesta etapa (não foi pedido;
  desfazer cobre voltar atrás). `duplicateElement` (um id por vez, um `apply()`/passo de undo por
  chamada) virou `duplicateElements` (lote — um `structuredClone`, um passo de undo pro grupo
  inteiro, mesmo padrão de `moveElements`): necessário porque duplicar um grupo juntado precisa
  de um `groupId` NOVO consistente entre as cópias (senão elas "vazariam" pro grupo original, ou
  cada cópia ficaria solta sem grupo nenhum) — o remapeamento de `groupId` antigo→novo é feito
  com um `Map` durante o loop de clonagem, então todo o lote sai coerente de uma vez, sem depender
  de chamadas separadas coordenarem entre si.
- **+5 testes** (191 total): `duplicateElements` com grupo (cópias ligadas entre si, `groupId`
  novo, não vazam pro original) e lista vazia; `groupElements` (mesmo `groupId`, no-op com menos
  de 2 ids); `rotateGroup` (forma órbita+gira, traço gira os pontos; delta zero é no-op).

**Confirmado ao vivo** (mesmo doc de teste da Etapa R4, com 2 retângulos + 2 losangos): laço
selecionando os 4, botão "Juntar" aparecendo e sendo apertado, desselecionar e tocar em SÓ UM
deles reselecionando os 4 juntos (confirma o grupo virou atômico), arrastar um membro movendo o
grupo inteiro, alça de rotação de grupo girando as 4 formas junto (cada uma girando no próprio
eixo E orbitando o centro comum — visível como as formas se afastando/aproximando entre si
enquanto giram, não só uma rotação rígida de bloco), duplo toque numa forma abrindo "Rótulo",
digitar "Oi" e confirmar mostrando o texto centralizado dentro da forma (já rotacionada da etapa
anterior — o rótulo acompanhou a inclinação certinho), e um texto solto girando pela própria
alça sem nenhuma mudança de código. `npx tsc --noEmit` limpo.

## Etapa R5.1 — resize voltou a funcionar com a forma girada

Usuário corrigiu o corte de escopo da Etapa R4: "não é pra tirar o resize do tipo texto". Girar
um texto (ou qualquer `ROTATABLE`) escondia as alças de resize até desgirar de novo — justamente
incômodo pro caso mais comum (girar e depois ajustar o tamanho).

Reversão, não invenção nova — a conversão pro referencial LOCAL da forma (`toElementLocal`, ver
Etapa R4) já existia pro hit-test e pra alça de rotação; só faltava usar a mesma conversão nas
alças de resize:

- **`selectStart`**: o ponto de toque (`lp = toElementLocal(el, p, elements)`) agora é calculado
  uma vez e comparado com as 8 posições de alça (que continuam em espaço NÃO rotacionado) pra
  achar qual alça foi tocada — igual já acontecia pra alça de rotação, só reaproveitado aqui.
- **`selectUpdate`**: o delta do arrasto de resize deixou de ser o delta bruto de TELA
  (`p.x - moveStart.x`) e virou o delta convertido pro LOCAL — início e fim do gesto passam os
  dois por `toElementLocal` antes de subtrair. Sem essa conversão, arrastar "pra direita" na tela
  distorceria uma forma girada numa direção que não é a dela.
- **`applyResize`/`withPreview`/commit**: nenhuma mudança — sempre trabalharam em espaço local
  mesmo (a caixa vem de `bounds()`, que já é não-rotacionada); só precisavam receber o delta
  certo.
- **Render (`SelectionOverlay`)**: as alças passaram a aparecer SEMPRE, não só sem rotação — elas
  já viviam dentro do mesmo `<Group transform={rotateTransform(el, all)}>` da forma (mesmo truque
  da alça de rotação, que já girava "de graça"), então bastou tirar a condição que escondia elas.

Trade-off aceito, não resolvido: como a rotação gira em torno do CENTRO da caixa e `applyResize`
pode mover esse centro (crescer só um lado desloca o meio), o pivô de rotação anda um pouco
durante o arrasto — a forma não fica pixel-travada num canto fixo enquanto cresce, ela desliza
suavemente junto. Comportamento comum em implementações simples de resize+rotação combinados;
resolver de verdade (ancorar um canto fixo na tela durante o resize) é escopo bem maior, fora
desta correção pontual.

Sem teste novo — reaproveita a cobertura de `toElementLocal` já existente (Etapa R4); o resto é
fiação de gesto (`selectStart`/`selectUpdate`), verificado ao vivo, não testável em isolamento
sem simular o `GestureDetector` inteiro. Confirmado ao vivo: texto girado 45° mostra as 8 alças
na posição visual rotacionada certa; arrastar uma alça estica a caixa ao longo do eixo PRÓPRIO do
texto (a diagonal girada), não do eixo da tela. `npx tsc --noEmit` limpo, `npx vitest run` — 191
testes (sem mudança de contagem).

## Etapa R5.2 — âncora de seta/linha troca de lado quando o elemento ligado vai pra posição
oposta

Pedido do usuário: "se eu coloco em uma posição contra tem que trocar a ancora no elemento".

**Causa raiz**: `bindPoint()` (`domain/rabisco/geom.ts`) usava o `fx`/`fy` guardado no binding
como um ponto FIXO na caixa da forma — calculado uma vez, na hora de ligar a seta/linha
(`bindingAt()`), e nunca reavaliado depois. Se o elemento na outra ponta da linha se movia pro
lado OPOSTO da forma depois de já ligado (ex.: um texto que estava embaixo passa a ficar em
cima), a âncora continuava presa no lado antigo — a linha passava a atravessar a forma por
dentro pra alcançar um ponto que já não fazia sentido geométrico nenhum pra aquela posição.

**Fix**: antes de usar a âncora guardada, `bindPoint` agora compara — produto escalar dos vetores
centro→âncora e centro→`from` — se o outro extremo (`from`) ainda está do MESMO lado dela em
relação ao centro da forma. Produto negativo (foram pra lados opostos) cai pro cálculo DINÂMICO
que já existia como fallback pra quando não há `fx`/`fy` salvo: busca binária ao longo do
segmento até a forma, sempre encontrando o ponto de borda voltado de verdade pra `from`. Quando o
lado NÃO mudou (produto positivo), o comportamento é idêntico ao de antes — a âncora exata que o
usuário escolheu continua valendo, não veio pra recalcular à toa. Não é um recálculo contínuo tipo
"a âncora sempre acompanha" (isso perderia a intenção de quando alguém liga deliberadamente perto
de um canto específico) — só troca quando a posição ficou geometricamente impossível de outro
jeito.

**Efeito colateral no teste antigo**: um teste (`arrowHeadAngle` cotovelo ancorado, Etapa R4)
testava essa mesma CLASSE de bug numa camada diferente — a DIREÇÃO da ponta da seta, não o LADO
da âncora — mas passava pela integração completa (`resolvedPoints`). Como este fix corrige o
problema numa camada ANTES daquela (a âncora deixa de estar "no lado errado" antes mesmo de
`arrowHeadAngle` entrar em ação), a geometria resolvida do teste mudou de sentido — a ponta passou
a apontar pro lado OPOSTO do que o teste esperava, CORRETAMENTE (a âncora já não está mais errada
pra corrigir). Reescrito pra construir o array `abs` à mão em vez de passar por `resolvedPoints`,
isolando só o bug de roteamento em cotovelo que `arrowHeadAngle` resolve, sem acoplar no lado que
`bindPoint` escolhe — os dois fixes continuam necessários e independentes (um escolhe a borda
certa, o outro corrige a direção final quando o roteamento em ângulo reto ainda assim aproxima
pelo lado errado).

**+2 testes** (193 total, direto em `resolvedPoints`): âncora troca de lado quando o outro
extremo passa pro lado oposto; âncora mantida quando o outro extremo NÃO muda de lado.

**Verificação**: só por teste automatizado desta vez — o popover de formas do Dock (onde se
escolhe "seta" antes de desenhar) não respondeu a toque sintético nesta sessão, mesma categoria
de flakiness de simulador já documentada em etapas anteriores (alvos de toque específicos falham
silenciosamente sem padrão óbvio — outros alvos no mesmo HUD, tocados nos mesmos minutos,
funcionaram normalmente). Não foi possível desenhar uma seta nova ao vivo pra confirmar
visualmente. A cobertura de teste, porém, exercita a EXATA geometria relatada pelo usuário (âncora
presa de um lado, outro extremo movido pro lado oposto) de forma determinística — mais precisa
que uma inspeção visual de screenshot pra esse tipo de bug geométrico.

## Etapa R5.3 — pinça pulando de lugar, desagrupar, cotovelo com eixos conflitantes

Pedido do usuário em 4 partes; as duas últimas eram o MESMO bug visto de dois ângulos: "a seta
ainda buga, ficou com uma aresta errada" (com uma captura de tela) + "a âncora que NÃO tem a
seta [a ponta de trás, não a cabeça] também tem que se adaptar... não só a seta em si".

- **Zoom de pinça "bugando, indo pra outro lugar"**: causa raiz DUPLA em `Canvas.tsx`.
  1. Um `panTwo` (`Gesture.Pan().minPointers(2).maxPointers(2)`) rodava dentro de
     `Gesture.Simultaneous(pinch, panTwo)` — qualquer toque de 2 dedos disparava o `onUpdate`
     dos DOIS simultaneamente, e cada um escrevia em `offsetX.value`/`offsetY.value` com uma
     fórmula totalmente incompatível com a do outro, um sobrescrevendo o outro a cada frame.
     Removido — a pinça corrigida (item 2 abaixo) já cobre pan de 2 dedos sozinha, não precisa
     de um handler à parte.
  2. A fórmula da pinça tinha um bug de verdade, independente do conflito acima: ela recalculava
     "qual ponto de CENA está sob o dedo agora" usando o focal ATUAL (`e.focalX/Y`) a cada frame,
     comparado contra a transform BASE (capturada uma vez no início) — em vez de FIXAR esse
     ponto uma única vez, no início do gesto, e só usar o focal atual depois pra REPOSICIONAR
     esse ponto já identificado. Na prática, isso só dava o resultado certo quando os dedos
     ficavam perfeitamente parados no mesmo lugar enquanto beliscavam — o caso comum de verdade
     (pinçar E arrastar ao mesmo tempo, dedos deslizando) fazia o ponto que devia ficar grudado
     ao dedo derivar pro lado CONTRÁRIO ao movimento a cada frame, "pulando" visualmente. Fix:
     `pinchBaseFocalX`/`pinchBaseFocalY` novos, capturados uma vez em `onStart` — usados só pra
     descobrir QUAL ponto de cena é o alvo (fixo pro resto do gesto); o focal ATUAL (`e.focalX/Y`)
     entra só na hora de posicionar esse ponto de novo a cada frame, papéis que a versão antiga
     confundia ao usar a mesma variável (`e.focalX`) pros dois.
- **Botão "Desagrupar"**: contraparte de "Juntar" (Etapa R5). `ungroupElements(doc, ids)`
  (mutação pura, `domain/rabisco/mutations.ts`) limpa `groupId` de quem tinha, no-op silencioso
  pros que já estavam soltos. No HUD (`RabiscoScreen.tsx`), o mesmo espaço do botão agora troca
  de ícone/ação conforme a seleção atual seja ou não um grupo "de verdade": `isGroup` checa que
  TODOS os `selectedIds` compartilham o MESMO `groupId` não-nulo — não só
  `selectedIds.length > 1` (que também é verdade pra uma seleção solta por laço/aditiva, onde o
  botão certo continua sendo "Juntar"). +2 testes.
- **Cotovelo com as duas pontas ancoradas em EIXOS DIFERENTES** — a camada que faltava dos dois
  bugs de seta reportados juntos: `elbowRoute` (`domain/rabisco/geom.ts`) só olhava pro
  `ha` (heading do lado de PARTIDA) pra decidir o FORMATO do caminho inteiro — a linha
  `const startH = ha ? ha === 'h' : ...` nunca considerava `hb` (heading do lado de CHEGADA)
  quando `ha` já estava definido. Se as duas pontas estavam ancoradas em formas que pedem eixos
  DIFERENTES (ex.: sai pela borda de BAIXO — vertical — de uma forma, entra pela borda ESQUERDA —
  horizontal — de outra), o caminho de 3 segmentos que só respeita `ha` faz a ÚLTIMA perna bater
  no eixo ERRADO em relação à borda onde a ponta de chegada está ancorada — mesmo com o PONTO de
  ancoragem certinho (isso é uma camada diferente do bug da Etapa R5.2, que resolve qual LADO da
  forma vira âncora, não o FORMATO do caminho que liga as duas âncoras já escolhidas). Fix:
  quando `ha` e `hb` são os dois conhecidos e DIFERENTES, usa um cotovelo de UMA perna só (não o
  desvio de 3 segmentos de sempre) — a esquina que fica exatamente no cruzamento das duas retas
  (`a.x,b.y` ou `b.x,a.y`, dependendo de qual eixo é qual) satisfaz os dois lados ao mesmo tempo,
  sem precisar de curva nenhuma a mais. Nenhuma mudança pro caso de mesmo eixo nos dois lados
  (ainda usa o desvio de 3 segmentos) nem pro caso de só um lado (ou nenhum) ancorado — os
  testes antigos desses casos continuam passando sem alteração. +1 teste.
- **+3 testes no total** (196): `ungroupElements` limpa quem tinha grupo / no-op se ninguém
  tinha; `resolvedPoints` com cotovelo e headings diferentes nas duas pontas usa um cotovelo só
  que satisfaz os dois eixos.

**Verificação**: (1) só análise matemática — pinça de verdade exige toque MULTI-TOUCH genuíno
(dois dedos simultâneos com distância variável), que `cliclick` não simula; a correção foi
verificada refazendo a álgebra da fórmula à mão com um exemplo numérico concreto (fingers
drifting durante o gesto), não ao vivo no simulador. (2) confirmado ao vivo: grupo de 4 formas
selecionado, botão "Desagrupar" aparecendo com o ícone certo (diferente de "Juntar"), apertado, e
depois — usando um pequeno ARRASTO em vez de um toque parado pra deselecionar de forma
confiável (toque parado puro se mostrou intermitente nesta sessão) — confirmado que tocar em UM
membro sozinho não volta a selecionar o grupo inteiro; o ícone do HUD volta a mostrar "Juntar",
provando que o `groupId` foi mesmo limpo, não só a seleção momentânea. (3)+(4) só teste
automatizado — a MESMA linha do popover de formas do Dock da Etapa R5.2 (onde se escolhe "seta"
antes de desenhar) de novo não respondeu a toque sintético nesta sessão, mesmo com o botão que
ABRE esse popover, e o resto de toda a UI (incluindo o botão "Desagrupar" acima), respondendo
normalmente nos mesmos minutos — reforça que é um alvo específico com algum problema de
toque sintético no simulador, não um problema geral de toque nem um bug no código do Dock (a
estrutura do `Pressable` ali é idêntica à de outros botões que funcionaram).

## Etapa R5.4 — pinça pulando ao SOLTAR os dedos, âncora de seta virou sempre dinâmica

Pedido do usuário em 2 partes.

- **Pinça pulando bem na hora de soltar os dedos** — bug DIFERENTE do da Etapa R5.3 (aquele
  acontecia DURANTE o gesto, por causa do `panTwo` conflitando com a pinça e por um erro na
  fórmula do ponto focal; este acontece bem no INSTANTE de soltar). Causa raiz: dois dedos quase
  nunca levantam exatamente no mesmo frame — por 1 ou 2 frames sobra só 1 dedo tocando ainda, e
  nesse meio-tempo o `e.focalX`/`e.focalY` do `Gesture.Pinch()` deixa de ser a MÉDIA dos 2
  toques e vira a posição EXATA desse dedo sozinho — um SALTO discreto de coordenada de tela,
  não um movimento contínuo. Como a fórmula do offset usa `e.focalX/Y` diretamente, esse salto ia
  direto pra cena, aparecendo como "buga, vai pra outro lugar" bem no momento de soltar. Fix: uma
  guarda simples no início do `onUpdate` — `if (e.numberOfPointers < 2) return;` — ignora
  qualquer frame onde a contagem de dedos caiu abaixo de 2; o próximo frame de verdade (2 dedos
  de novo, ou o gesto realmente terminando) volta a ficar contínuo.
- **Âncora de seta "ainda não está legal"** — depois de DUAS tentativas de meio-termo (Etapa
  R5.2: só troca de lado quando cruza 180°, produto escalar; Etapa R5.3: corrige o FORMATO do
  cotovelo quando os dois lados pedem eixos diferentes), o usuário confirmou que **guardar
  qualquer estado do passado, mesmo condicionalmente, nunca acompanha direito um reposicionamento
  contínuo**: "a âncora... tem que se adaptar conforme a posição de ambos ligados se encontra...
  não só a seta em si". Essa é uma mudança de FUNDO, não mais um remendo em cima do anterior:
  `bindPoint` (`domain/rabisco/geom.ts`) parou de tentar preservar `fx`/`fy` guardado no
  binding — não tem mais nenhuma condição "se ainda está do mesmo lado, mantém"; SEMPRE
  recalcula do zero onde a linha cruza a borda da forma em direção ao outro extremo, a cada
  resolução (mesma busca binária que já existia como fallback pra quando não havia `fx`/`fy`
  salvo — virou o único caminho, não mais um caso especial). `RabiscoBinding.fx`/`fy` ficam sem
  uso pra POSICIONAR — `bindingAt()` continua calculando os dois (mantidos no tipo/dados só por
  compatibilidade, e ainda testados como valores corretos), só que nada mais os LÊ pra desenhar
  a linha.
  - **Efeito colateral nos testes**: o teste da Etapa R5.3 (cotovelo com eixos conflitantes nas
    duas pontas) dependia de um binding "forçado" via `bindingAt()` num ponto deliberadamente
    diferente de onde a âncora dinâmica naturalmente cairia — com `bindPoint` sempre dinâmico,
    esse forçamento deixou de ter efeito (os dois lados passaram a resolver pra âncoras que
    naturalmente se encaram, quase sempre no MESMO eixo). Reescrito com duas formas de
    proporção bem diferente (uma larga-e-baixa, outra estreita-e-alta) — mesmo com âncora 100%
    dinâmica e mutuamente voltada uma pra outra, `headingAt()` (que compara contra a
    meia-largura/meia-altura de CADA forma, não um valor absoluto) ainda classifica os dois
    lados em eixos diferentes, preservando o cenário de conflito que o fix da R5.3 resolve — sem
    precisar fingir uma âncora artificial. Os 2 testes da Etapa R5.2 (troca de lado / mantém
    quando não muda) foram consolidados num só — não faz mais sentido testar "preserva vs.
    troca" como comportamentos distintos quando é sempre o mesmo cálculo; o teste novo mostra o
    MESMO elemento resolvendo pra bordas diferentes conforme o outro extremo muda de posição, o
    que é agora simplesmente o comportamento normal, não um caso especial.
- **195 testes no total** (a suíte perdeu 1 no total líquido: -2 pela consolidação da R5.2, +1
  pela reescrita da R5.3 que continua existindo, sem teste novo pro `numberOfPointers` — é
  fiação de gesto que depende de multi-touch real).

**Verificação**: (1) só análise matemática — pinça de verdade exige dois toques simultâneos com
contagem de dedos variável no meio do gesto, que `cliclick` (um só ponteiro de mouse) não simula
de jeito nenhum; a correção foi confirmada relendo com cuidado a documentação do
`Gesture.Pinch()` do `react-native-gesture-handler` sobre `numberOfPointers` e o comportamento
conhecido de perda de precisão do foco em transições de contagem de dedos, não por reprodução ao
vivo. (2) só teste automatizado — a MESMA linha do popover de formas do Dock (Etapas R5.2 e
R5.3) não respondeu a toque sintético NESTA sessão pela terceira vez seguida, com o resto de toda
a UI (incluindo o próprio botão que abre esse popover, e o botão "Desagrupar" da etapa anterior)
respondendo normalmente nos mesmos minutos — o padrão reforça que é uma limitação específica de
ambiente/toque sintético nesse alvo, não um problema geral nem um bug no código (a estrutura é
idêntica à de outros `Pressable` que funcionaram a sessão inteira).

## Etapa R5.5 — ponta da seta em cotovelo desalinhada (torta) da própria linha

Usuário confirmou a Etapa R5.4 funcionando bem num aparelho de verdade ("muito bom", com
screenshot mostrando um cotovelo limpo entre duas formas) e reportou um último detalhe visual:
a ponta ("v") de uma seta em cotovelo ligada numa forma aparecia numa diagonal levemente torta —
"não pode se inclinar meio grau... tem que ficar arredondado exemplo 90, 180... se não uma parte
do vezinho fica torta".

**Causa raiz**: `arrowHeadAngle` (`domain/rabisco/geom.ts`) ainda carregava o desvio introduzido
na Etapa R4 — pra seta em cotovelo COM a ponta ligada a uma forma, ignorava a direção do ÚLTIMO
SEGMENTO desenhado e apontava direto pro CENTRO da forma-alvo (`Math.atan2(centro.y - by,
centro.x - bx)`), uma diagonal que quase nunca cai num múltiplo exato de 90°. Isso fazia sentido
NA ÉPOCA: o roteamento em cotovelo (`elbowRoute`) podia produzir uma última perna que se
aproximava do alvo pelo lado ERRADO (bug real da R4), e apontar pro centro "escondia" esse
problema de roteamento fazendo a ponta pelo menos apontar pra dentro da forma, mesmo com o
TRAÇO chegando torto.

Só que as Etapas R5.2, R5.3 e R5.4 resolveram esse problema NA RAIZ, em camadas sucessivas:
- **R5.2**: a âncora em si sempre recalcula pra encarar de verdade quem está puxando a linha
  (nunca mais fica presa numa borda que já não faz sentido geometricamente).
- **R5.3**: o FORMATO do cotovelo (quantos segmentos, em que eixo) sempre respeita o que os DOIS
  lados precisam, não só o de partida.
- **R5.4**: a âncora virou 100% dinâmica — nem o "meio-termo" da R5.2 (só troca de lado ao
  cruzar 180°) sobrou.

Com essas três camadas certas, o segmento FINAL de uma seta em cotovelo agora É sempre
horizontal ou vertical por construção (nunca uma diagonal) — e sempre entra pela borda certa. O
desvio "aponta pro centro" da R4, que existia justamente pra disfarçar um roteamento ainda
errado, virou a ÚNICA fonte de desalinhamento que sobrava: pegava um traço que já chegava
certinho, num ângulo limpo (0°/90°/180°/270°), e desenhava a pontinha numa diagonal torta em
cima dele — a "parte do vezinho torta" que o usuário viu.

**Fix**: removido o caso especial inteiro. `arrowHeadAngle` sempre segue a direção do último
segmento agora — reto, curvo ou cotovelo, ligada ou não — exatamente como reto/curvo sempre
fizeram. A função ficou mais simples também: só precisa de `abs` (os pontos já resolvidos), não
mais de `el`/`all` (que só existiam pra resolver o alvo da ligação, agora sem uso).

**Teste**: o antigo, que checava explicitamente o desvio "aponta pro centro", foi reescrito pra
checar a garantia NOVA — `arrowHeadAngle` de um cotovelo ligado nos dois lados é sempre múltiplo
de 90°, verificado via `sin(2·ângulo) ≈ 0` (zero só acontece em múltiplos de 90°; evita o
problema comum de checar `ângulo % 90` perto da borda, onde `89.999999 % 90` não fica perto de
0 mesmo sendo essencialmente 90°). 195 testes no total, sem mudança de contagem.

**Verificação**: só automatizada — é uma correção de geometria pura (`Math.atan2` sobre pontos já
resolvidos), sem gesto nem interação nenhuma envolvida; não precisou abrir o simulador de novo
pra essa etapa.

## Ícones novos

`hand`, `eraser`, `pointer`, `square`, `circle`, `moveUpRight`, `slash`, `grid`, `dot`,
`pipette`, `spline`, `route`, `alignLeft`, `alignCenter`, `alignRight`, `bringToFront`,
`sendToBack`, `chevronUp`, `chevronDown`, `multiSelect`, `group`, `ungroup` adicionados a `design/Icon.tsx`,
um por vez, seguindo a convenção já documentada lá (escolher o equivalente lucide mais próximo do
protótipo — ou, pra alinhamento/camadas/seleção múltipla/agrupar, que não têm equivalente no
protótipo, o ícone lucide mais direto pro significado — nunca inventar SVG novo).

## Rota de criação

`app/doc/[id].tsx` ganhou o id especial `rabisco-novo` (mesmo padrão de `md-novo`) e a galeria
(`GalleryScreen.tsx`) ganhou uma seção "DESENHO" fora do catálogo de 25 tipos — mesmo padrão da
seção "DOCUMENTOS" já existente.

## Verificação desta etapa

`npx tsc --noEmit` limpo, `npx vitest run` (178 testes — os de R3 são
`domain/rabisco/color.test.ts`, conversões HSV/RGB/hex/rgba, e os dois de roteamento em
cotovelo em `geom.test.ts`; os 5 novos de R3.1 são as mutações de camada em
`mutations.test.ts` — `bringForward`/`sendBackward`/`bringToFront`/`sendToBack` e o no-op pra id
inexistente). Confirmado no simulador iOS, ao vivo: zoom por botão (`+`/`-`)
progride corretamente e a porcentagem reflete o valor real mesmo depois de várias chamadas em
sequência; fundo pontilhado renderiza e acompanha o zoom; texto abre o editor imediatamente ao
tocar com a ferramenta ativa, com o teclado já focado, e descarta um texto vazio ao cancelar; e
o bug de resize (ver acima) está corrigido — 40 chamadas de `selectUpdate` pra mesma posição
final dão o mesmo resultado que uma chamada só (`w=190→250`, nunca mais que isso). As etapas
R1/R2 (traço, formas, seleção, ligação de seta) continuam confirmadas de sessões anteriores.
Ferramentas: os alvos de toque do app são pequenos demais e a janela do simulador difícil de
calibrar por coordenada pra acertar com toque sintético de forma confiável — essa etapa
precisou, mais que as anteriores, de instrumentação por `console.log` (visível no terminal do
Metro) em vez de só screenshot, porque só ela distingue "gesto não reconhecido" de "coordenada
errada" (foi assim que o bug de resize e o bug do zoom dentro do `GestureDetector` foram
achados); sempre removida antes do commit. Um reboot completo do simulador
(`simctl shutdown`+`boot`, não só terminar o app) foi necessário mais de uma vez nessa sessão
pra taps pararem de ser silenciosamente ignorados — não é um problema do código, mas vale saber
se acontecer de novo. Outro achado de ferramental (R3.1): `defaults read
com.apple.iphonesimulator ConnectHardwareKeyboard` veio `0` — teclado físico desconectado do
simulador por padrão, por isso `cliclick t:"texto"`/`osascript keystroke` nunca inseriam nada em
campo nenhum a sessão inteira, mesmo com o campo certinho focado. `defaults write ... -bool YES`
+ reiniciar o Simulator.app ajuda mas não é 100% confiável; o jeito que funcionou de verdade foi
tocar as teclas do teclado na tela uma por uma (`cliclick c:x,y` em cada letra) — mais lento, mas
sempre funciona, e foi assim que o texto "Ola"/"Hi" deste roteiro de verificação foi digitado.

**R3.2**: mesmos 178 testes (nenhuma mutação/tipo novo — só rewiring de gesto e UI). Confirmado
ao vivo: toque único num texto seleciona sem abrir editor; duplo toque abre o editor; o chip
"Editar" (com o texto já selecionado) também abre; arrastar o `OpacityTrack` pra 35% e, na
sequência, tocar a cor vermelha aplicam os dois corretamente (opacidade não voltou, cor mudou —
o bug relatado não reproduziu mais); o `ColorPicker` responde a toque em qualquer ponto do
quadrado de saturação/matiz; arrastar pelo título do `ColorPicker` move a caixa inteira pela
tela; os 4 botões de camada mostram um toast "Camada X → Y de Z" a cada toque; a ferramenta ao
abrir um rabisco novo é a seta (seleção), não mais a caneta. Achado de ferramental novo: depois
de reiniciar o Metro (pra capturar log com `console.log`), um `xcrun simctl openurl` sozinho NÃO
busca um bundle novo se o app já tem um carregado em memória — só um `simctl terminate` seguido
de `openurl` força o fetch; sem isso, o app roda o JS antigo (do processo Metro anterior)
silenciosamente, e qualquer `console.log` novo nunca aparece no log — pareceu, por um instante,
que a instrumentação não tinha funcionado, quando na verdade o código instrumentado nem tinha
chegado no dispositivo ainda. E o achado mais caro da etapa: **quando um toque "não bate em
nada" repetidas vezes num ponto que deveria ser óbvio, o palpite visual de coordenada por
screenshot é o suspeito errado** — a StyleBar tem altura variável (número de linhas muda com o
tipo de elemento selecionado), então uma posição de linha "confirmada" numa tela vira errada
duas linhas depois sem nenhum aviso; `measureInWindow()` (medir a posição real do elemento
nativo, uma vez, temporariamente) resolveu em segundos o que várias tentativas de recalibrar
"a olho" não resolviam.

**R3.3**: `npx vitest run` — 180 testes (2 novos, histerese do `pickBindable`). Confirmado ao
vivo: destaque azul aparece ao redor da forma em tempo real enquanto se arrasta a ponta de uma
seta nova pra dentro dela (screenshot capturado NO MEIO do arrasto, com o toque sintético ainda
sujo, confirmando o desenho por frame); soltar a ponta ancora a seta na forma; conta-gotas
mostra estado ativo ao tocar, a lupa aparece acima do dedo ao arrastar sobre o canvas, o
hex/rgba/preview do picker atualizam em tempo real, e soltar aplica a cor de verdade no elemento
(confirmado trocando a borda de um retângulo de vermelho pra preto via amostra numa área vazia
do canvas). O fundo do `ColorPicker` transparente também foi visível direto no screenshot — o
canvas e o resto da tela atrás do picker aparecem sem nenhum escurecimento. Achado de
ferramental repetido nesta etapa: arrastos sintéticos de vários passos (`dd`+`dm`+`du` via
cliclick) alternam entre funcionar perfeitamente (o arrasto do título do `ColorPicker`, a
sequência de sample do conta-gotas) e falhar silenciosamente no meio de uma sequência mais
longa sem nenhum sinal de erro — não é um bug do app (confirmado via `useAnimatedReaction`/
comportamento consistente quando o gesto de fato é reconhecido), é uma limitação do simulador
com toque sintético; quando um arrasto "não avança" mais depois de alguns passos, a resposta
certa é começar de novo com passos maiores/mais espaçados, não desconfiar do código primeiro.

## Etapa R7 — exportar e compartilhar (PNG, PDF, SVG, copiar)

Pedido do usuário, junto com o mesmo pedido pro lado Mermaid (PDF pros diagramas — ver
[12-persistencia-e-export.md](12-persistencia-e-export.md) §"PDF — Mermaid e Rabisco, mesmo
caminho"). Até aqui o
Rabisco não tinha NENHUMA saída — nem PNG. Botão "Compartilhar" novo na `NavBar`
(`features/rabisco/ShareSheet.tsx`, mesmo padrão do `ShareSheet` de diagrama) com quatro
opções, todas nascendo do mesmo `domain/rabisco/svg.ts` novo (`docToSvg(doc)`):

- **`domain/rabisco/svg.ts`** — serializer novo que espelha `Canvas.tsx#ElementView` elemento
  por elemento, reaproveitando a MESMA geometria de `domain/rabisco/geom.ts` que já alimenta o
  Skia (`elementGeometry`, `bounds`, `dashPattern`) — só emite `<path>`/`<text>`/`<g
  transform="rotate(deg cx cy)">` em vez de `<Path>`/`<Group>` do react-native-skia. Mesmo
  "geometria uma vez, N renderizadores" que o resto do projeto já segue (runtime WebView dos
  diagramas Mermaid, docs/06-canvas.md). Sem fundo (transparente) — quem rasteriza decide.
- **Copiar SVG** — `docToSvg(doc)` direto pro clipboard (`expo-clipboard`), sem passar pelo
  share sheet nativo — mesmo padrão do "Copiar texto" de diagrama.
- **Arquivo SVG** — `exportarTexto(doc)`, já genérica (`domain/exportMeta.ts` já dizia
  `.svg`/`image/svg+xml` pra `tipo: 'rabisco'` desde a Etapa R1, só que `serialize()` devolvia
  um comentário Mermaid vazio pra esse caso — nunca SVG de verdade). `serialize()` continua só
  sobre texto Mermaid por contrato (comentário no próprio arquivo já dizia isso); quem ganhou o
  desvio pra `docToSvg` foi `exportarTexto()`, no `services/export.ts`.
- **Imagem PNG** — sem WebView pra rasterizar (Rabisco é Skia nativo). `exportarRabiscoPng()`
  pega o MESMO `docToSvg()` e usa `Skia.SVG.MakeFromString` + `Skia.Surface.MakeOffscreen` +
  `canvas.drawSvg` + `encodeToBase64(ImageFormat.PNG)` — tudo síncrono, fora da árvore React,
  sem depender de ref de canvas nem do zoom/pan da tela (sempre enquadra o conteúdo inteiro,
  igual ao export SVG). Concretiza o que o roadmap já previa ("PNG via `makeImageSnapshot()` do
  Skia") — só que rasterizando o SVG serializado em vez de tirar snapshot do canvas AO VIVO, pra
  não depender de onde a câmera está apontando no momento do toque.
- **Arquivo PDF** — `exportarPdf(docToSvg(doc), nome)`, a MESMA função usada pelo diagrama
  Mermaid (`services/export.ts`) — embrulha o SVG num HTML mínimo e chama
  `expo-print` (`Print.printToFileAsync`), que funciona no Expo Go sem build nem conta de loja.

**Verificação**: `domain/rabisco/svg.test.ts` (fill/stroke sólido e hachura, rótulo preso em
forma, rotação, escapamento de XML no texto, viewBox com a folga certa) mais `tsc`/`vitest`
limpos nas telas — sem teste de simulador (nenhuma das quatro saídas passa por gesto).

**Ainda pendente da Etapa R7** (não pedido nesta sessão): importar `.svg` de fora pra virar um
doc Rabisco editável.

## Roadmap (R6 em diante — não construído ainda)

- **R6** — assistente de IA (rota irmã de `app/api/diagrama+api.ts`, DSL de operações,
  auto-layout — nunca fetch direto pro provedor, como o protótipo HTML faz).
- **R7** — ~~exportar (PNG, PDF), compartilhar~~ feito (ver Etapa R7 acima); falta só importar
  `.svg` de fora.
