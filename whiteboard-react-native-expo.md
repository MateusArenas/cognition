# Rabisco — Whiteboard mobile
## Documento de implementação em React Native + Expo

Este documento porta o protótipo HTML (`whiteboard.html`) para React Native. O protótipo é a
referência funcional: mesma modelagem de dados, mesmos gestos, mesmo algoritmo de traço
"à mão livre". O que muda é a camada de render (Canvas 2D → Skia) e a camada de gestos
(Pointer Events → Gesture Handler + Reanimated).

---

## 1. Stack — tudo roda no Expo Go

**Restrição de projeto: o app precisa abrir no Expo Go.** Isso elimina qualquer biblioteca com
código nativo próprio e qualquer config plugin que mexa em `ios/` ou `android/`. A boa notícia é
que a stack inteira cabe: `@shopify/react-native-skia` está **incluído no Expo Go** (é uma das
bibliotecas de terceiros pré-compiladas no cliente), então o renderizador não precisa mudar.

| Camada | Biblioteca | Expo Go | Por quê |
|---|---|---|---|
| Render | `@shopify/react-native-skia` | ✅ incluído | Único caminho com Path, clip, dash e blend a 60fps. |
| Gestos | `react-native-gesture-handler` | ✅ incluído | Pan/Pinch/Tap compostos, `pointerType`, rejeição de palma. |
| Animação/UI thread | `react-native-reanimated` (+ `react-native-worklets`) | ✅ incluído | Câmera e traço ao vivo fora da JS thread. |
| Estado do documento | `zustand` + `immer` | ✅ JS puro | Store fora do React tree, seletores granulares. |
| Persistência | `expo-sqlite/kv-store` | ✅ incluído | **Substitui o MMKV.** Mesma API do AsyncStorage, com `getItemSync`/`setItemSync`. |
| Fonte manuscrita | `expo-font` + `.ttf` embarcado | ✅ incluído | Skia precisa do arquivo; não resolve fonte do sistema por nome. |
| Arquivos / share | `expo-file-system`, `expo-sharing`, `expo-media-library` | ✅ incluídos | PNG, SVG, PDF e `.json` para fora do app. |
| Área de transferência | `expo-clipboard` | ✅ incluído | Copiar/colar o SVG. |
| Material translúcido | `expo-blur` | ✅ incluído | Dock, nav bar e menus. |
| Feedback tátil | `expo-haptics` | ✅ incluído | Seleção, criação, delete. |
| Segmented control | `@react-native-segmented-control/segmented-control` | ✅ incluído | O controle nativo do iOS, em vez de reimplementar. |
| Action sheet | `ActionSheetIOS` (core RN) | ✅ | Menu de exportação. |
| Bottom sheet | `@gorhom/bottom-sheet` | ✅ JS puro | Roda sobre Reanimated + GH, sem nativo próprio. |
| Teclado | `react-native-keyboard-controller` | ✅ incluído | Altura do teclado para deslocar a câmera ao editar rótulo. |
| Captura de tela | `react-native-view-shot` | ✅ incluído | Plano B para PNG, se a captura offscreen do Skia der problema. |
| Assistente | `fetch` + rota própria (Expo Router API route) | ✅ | A chave da Anthropic fica no servidor, nunca no bundle. |

```bash
npx expo install @shopify/react-native-skia react-native-gesture-handler \
  react-native-reanimated react-native-worklets react-native-safe-area-context \
  react-native-keyboard-controller react-native-view-shot \
  @react-native-segmented-control/segmented-control \
  expo-font expo-file-system expo-sharing expo-media-library \
  expo-clipboard expo-blur expo-haptics expo-sqlite
npm i zustand immer @gorhom/bottom-sheet
```

Use **sempre `npx expo install`**, nunca `npm i`, para as bibliotecas nativas: é o comando que
casa a versão com a que está compilada dentro do Expo Go. Versão errada = tela branca ou
`Property 'SkiaViewApi' doesn't exist`. `npx expo install --check` audita o projeto inteiro.

### O que a restrição do Expo Go custa

| Descartado | Motivo | Substituto |
|---|---|---|
| `react-native-mmkv` | nativo próprio, não está no cliente | `expo-sqlite/kv-store`, com API síncrona |
| Config plugins nativos | Expo Go não faz prebuild | nenhum é necessário nesta stack |
| SQLCipher | não suportado no Expo Go | irrelevante aqui |
| Fonte via `assets/fonts` no `app.json` | não aplica | `expo-font` carrega em runtime, funciona |

E três coisas para não interpretar errado:

- **Você fica preso à versão do SDK do cliente.** O Expo Go instalado só executa projetos daquele
  SDK. Ao subir de SDK, atualize o app na loja antes de rodar.
- **Não meça FPS no Expo Go.** O bundle é de desenvolvimento e a JS thread está mais lenta. Os
  worklets do Reanimated ainda rodam na UI thread, então pan e pinch parecem certos, mas o
  `commit` no store parece pior do que será em release. Avalie performance só em dev build.
- **Expo Go não é caminho de produção.** É o loop de desenvolvimento. Para publicar você faz um
  dev build / EAS Build de qualquer forma — e aí, se quiser, pode voltar ao MMKV. Escrevendo o
  acesso a storage atrás de uma interface de 4 métodos, a troca é um arquivo.

```ts
// store/persist.ts — a única superfície que conhece o backend de storage
import Storage from 'expo-sqlite/kv-store';

export const kv = {
  get:  (k: string) => Storage.getItemSync(k),
  set:  (k: string, v: string) => Storage.setItemSync(k, v),
  del:  (k: string) => Storage.removeItemSync(k),
  keys: () => Storage.getAllKeysSync(),
};
```

**babel.config.js** — o plugin do Reanimated tem que ser o último:

```js
module.exports = (api) => {
  api.cache(true);
  return { presets: ['babel-preset-expo'], plugins: ['react-native-reanimated/plugin'] };
};
```

A partir do Reanimated 4 os worklets vivem no pacote `react-native-worklets`; se o build
reclamar de worklet não encontrado, é essa dependência que está faltando.

---

## 2. Estrutura de arquivos

```
src/
├─ model/
│  ├─ element.ts          # tipos + factory + defaults de estilo
│  ├─ bounds.ts           # bounds(el), unionBounds(list)
│  └─ hitTest.ts          # hit(el, point, tolerance), pick(els, point)
├─ render/
│  ├─ rough.ts            # mulberry32 + roughSeg/roughPoly/roughEllipse → path data SVG
│  ├─ buildPath.ts        # elemento → { stroke: string, clip: string, hatch: string }
│  ├─ pathCache.ts        # Map<cacheKey, SkPath> com invalidação por versão
│  ├─ label.ts            # Paragraph do rótulo ancorado + relayout do contêiner
│  ├─ corners.ts          # arredondamento de polígono (rect/diamond/cotovelo)
│  └─ binding.ts          # insideShape, bindPoint, elbowRoute, resolvedPoints
│  └─ paint.ts            # SkPaint por estilo (dash, width, cap, join)
├─ canvas/
│  ├─ Board.tsx           # <Canvas> + camadas + gestos
│  ├─ CommittedLayer.tsx  # Picture com todos os elementos salvos
│  ├─ DraftLayer.tsx      # elemento em construção (UI thread)
│  ├─ SelectionLayer.tsx  # bbox + handles + marquee
│  ├─ GridLayer.tsx       # grade de pontos
│  └─ camera.ts           # shared values + toScene/toScreen (worklets)
├─ gestures/
│  └─ useBoardGestures.ts # composição Pan(1) / Pan(2) / Pinch / Tap / DoubleTap
├─ ai/
│  ├─ dsl.ts              # gramática de linhas: parse da saída + serialização da cena
│  ├─ autoLayout.ts       # camadas, tamanho por texto, colisão com o que já existe
│  ├─ applyOps.ts         # ops → mutações no store
│  └─ AiBar.tsx           # composer, chips de alvo, sugestões
├─ store/
│  ├─ useBoardStore.ts    # elementos, seleção, ferramenta, estilo
│  └─ history.ts          # undo/redo por snapshot
├─ ui/
│  ├─ Dock.tsx            # barra de ferramentas inferior
│  ├─ StylePanel.tsx      # bottom sheet de estilo
│  ├─ TopBar.tsx          # undo/redo/zoom/menu
│  ├─ ContextBar.tsx      # ações da seleção (flutuante)
│  └─ TextOverlay.tsx     # <TextInput> absoluto para editar texto
└─ io/
   ├─ exportPng.ts        # Surface offscreen → base64
   ├─ exportSvg.ts        # path data → documento SVG
   ├─ exportPdf.ts        # path data → content stream + xref
   ├─ scene.ts            # serialize/parse + versionamento
   └─ persist.ts          # autosave via expo-sqlite/kv-store (única superfície de storage)
```

---

## 3. Modelo de dados

Idêntico ao protótipo. **Não mude** — o `.json` exportado no HTML tem que abrir no app.

```ts
// model/element.ts
export type ElementType =
  | 'rect' | 'ellipse' | 'diamond'
  | 'line' | 'arrow' | 'draw' | 'text';

export type FillStyle   = 'hachure' | 'cross' | 'solid';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export interface Element {
  id: string;
  type: ElementType;
  x: number;              // origem em coordenadas de cena
  y: number;
  w: number;              // usado por rect/ellipse/diamond/text (pode ser negativo em rascunho)
  h: number;
  points: [number, number][] | null;  // draw/line/arrow — RELATIVOS a (x,y)
  text: string;           // texto livre (type 'text') OU rótulo ancorado (rect/ellipse/diamond)
  labelColor: string;     // cor do rótulo; independente de strokeColor
  edges: 'sharp' | 'round';                 // cantos de rect e diamond
  arrowType: 'straight' | 'curved' | 'elbow';
  startBinding: Binding | null;             // ponta inicial ancorada a uma forma
  endBinding:   Binding | null;
  seed: number;           // determinismo do rabisco
  version: number;        // incrementa a cada mutação → invalida o cache de SkPath

  strokeColor: string;
  bgColor: string;        // 'transparent' | hex
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;      // 0 = reto, 1.4 = à mão, 2.8 = solto
  opacity: number;        // 0..1
  fontSize: number;
}

/** Ponto de encosto CRAVADO na borda da forma, normalizado sobre os semi-eixos
 *  a partir do centro. (1, -0.5) = aresta direita, na metade superior.
 *  Ausente = cena antiga; cai no fallback de mira no centro. */
export interface Binding {
  id: string;
  fx?: number;   // -1..1
  fy?: number;   // -1..1
}

export const DEFAULT_STYLE = {
  strokeColor: '#1B1B1F', bgColor: 'transparent', fillStyle: 'hachure' as FillStyle,
  strokeWidth: 2.6, strokeStyle: 'solid' as StrokeStyle,
  roughness: 1.4, opacity: 1, fontSize: 22,
};

export const STROKES = ['#1B1B1F','#E03131','#2F9E44','#1971C2','#F08C00','#9C36B5'];
export const FILLS   = ['transparent','#FFC9C9','#B2F2BB','#A5D8FF','#FFEC99','#EEBEFA'];
```

Duas regras que evitam a maior parte dos bugs de transformação:

- **`points` são sempre relativos a `(x, y)`.** Mover = alterar `x/y`. Redimensionar = escalar
  `points` (ou `w/h`) e recalcular `x/y`.
- **`w`/`h` negativos só existem no rascunho.** Normalize ao soltar o dedo (seções 8 e 9), senão o
  cálculo de altura do rótulo ancorado tem que lidar com sinal em todo lugar.

O campo `text` serve aos dois usos porque eles nunca coexistem no mesmo elemento: num `text`
ele é o conteúdo; num `rect`/`ellipse`/`diamond` é o rótulo interno.

---

## 4. Câmera

A câmera vive na UI thread. Se ela estiver em `useState`, o pinch treme.

```ts
// canvas/camera.ts
import { useSharedValue, useDerivedValue, SharedValue } from 'react-native-reanimated';
import { Skia } from '@shopify/react-native-skia';

export function useCamera() {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const zoom = useSharedValue(1);

  // matriz aplicada ao <Group> do conteúdo
  const transform = useDerivedValue(() => [
    { translateX: tx.value }, { translateY: ty.value }, { scale: zoom.value },
  ]);

  return { tx, ty, zoom, transform };
}

// worklets — usáveis dentro de gestos
export function toScene(sx: number, sy: number, tx: number, ty: number, z: number) {
  'worklet';
  return { x: (sx - tx) / z, y: (sy - ty) / z };
}
export function toScreen(x: number, y: number, tx: number, ty: number, z: number) {
  'worklet';
  return { x: x * z + tx, y: y * z + ty };
}
```

Para hit-test (JS thread) você precisa de uma cópia da câmera fora do worklet. Mantenha um `ref`
espelhado:

```ts
const camRef = useRef({ tx: 0, ty: 0, zoom: 1 });
useAnimatedReaction(
  () => ({ tx: tx.value, ty: ty.value, z: zoom.value }),
  (cur) => { runOnJS(syncCam)(cur); },
);
```

`syncCam` só escreve no ref — nada de `setState`, senão vira re-render a cada frame.

---

## 5. Traço "à mão livre" em Skia

Porte direto de `rough.ts` do protótipo. Só troca `Path2D` por `SkPath`.

```ts
// render/rough.ts
import { Skia, SkPath } from '@shopify/react-native-skia';

export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Uma passada de caneta entre dois pontos, com desvio pseudo-aleatório. */
export function roughSeg(
  p: SkPath, x1: number, y1: number, x2: number, y2: number,
  r: number, rnd: () => number,
) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const amp = Math.min(r * (0.6 + Math.min(len, 300) / 300 * 0.9), 12);
  const j = () => (rnd() - 0.5) * amp * 2;
  p.moveTo(x1 + j() * 0.5, y1 + j() * 0.5);
  p.cubicTo(
    x1 + (x2 - x1) * 0.3 + j(), y1 + (y2 - y1) * 0.3 + j(),
    x1 + (x2 - x1) * 0.7 + j(), y1 + (y2 - y1) * 0.7 + j(),
    x2 + j() * 0.5, y2 + j() * 0.5,
  );
}

/** Polilinha suave (quadráticas pelos pontos médios) — usada no traço livre. */
export function smooth(p: SkPath, pts: number[][]) {
  if (pts.length < 2) return;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    p.quadTo(pts[i][0], pts[i][1], mx, my);
  }
  const n = pts[pts.length - 1];
  p.lineTo(n[0], n[1]);
}

export function roughPoly(p: SkPath, pts: number[][], r: number, rnd: () => number) {
  if (r === 0) { smooth(p, pts); return; }
  for (let k = 0; k < 2; k++)
    for (let i = 0; i < pts.length - 1; i++)
      roughSeg(p, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r, rnd);
}

export function roughEllipse(
  p: SkPath, cx: number, cy: number, rx: number, ry: number,
  r: number, rnd: () => number,
) {
  const n = clamp(Math.round((rx + ry) / 7), 10, 40);
  const passes = r === 0 ? 1 : 2;
  for (let k = 0; k < passes; k++) {
    const pts: number[][] = [];
    const a0 = r === 0 ? 0 : rnd() * Math.PI * 2;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      const jx = r === 0 ? 0 : (rnd() - 0.5) * r * 2;
      const jy = r === 0 ? 0 : (rnd() - 0.5) * r * 2;
      pts.push([cx + Math.cos(a) * rx + jx, cy + Math.sin(a) * ry + jy]);
    }
    pts.push(pts[1]);
    smooth(p, pts);
  }
}
```

### Cache de path

`SkPath` é objeto nativo. Construir a cada frame mata a performance.

```ts
// render/pathCache.ts
const cache = new Map<string, { stroke: SkPath; fill: SkPath | null }>();
const key = (el: Element) => `${el.id}:${el.version}`;

export function getPaths(el: Element) {
  const k = key(el);
  const hit = cache.get(k);
  if (hit) return hit;
  const built = buildPath(el);
  // remove versões antigas do mesmo elemento
  for (const old of cache.keys()) if (old.startsWith(el.id + ':') && old !== k) cache.delete(old);
  cache.set(k, built);
  return built;
}
```

Toda mutação no store faz `el.version++`. Sem isso, o cache serve path velho.

### Preenchimento (hachura)

No Canvas 2D era `ctx.clip()`. Em Skia:

```ts
// dentro do desenho do elemento
<Group clip={fillClipPath}>
  {fillStyle === 'solid'
    ? <Rect x={g.x} y={g.y} width={g.w} height={g.h} color={bgColor} />
    : <Path path={hachurePath} color={bgColor} style="stroke"
            strokeWidth={Math.max(1.4, strokeWidth * 0.62)} strokeCap="round" />}
</Group>
```

O `hachurePath` é gerado no mesmo `buildPath`: linhas paralelas a 45° com espaçamento 9px,
passadas por `roughSeg` com `r = 1.2`. `cross` = duas direções (`+1` e `-1`).

### Linha tracejada

```ts
const dash = (el: Element) => {
  const u = Math.max(el.strokeWidth, 1.6);
  if (el.strokeStyle === 'dashed') return [u * 4, u * 3.2];
  if (el.strokeStyle === 'dotted') return [0.1, u * 2.6];
  return null;
};
// <Path ...>{dash && <DashPathEffect intervals={dash} />}</Path>
```

---

## 6. Arquitetura de camadas

Quatro camadas dentro de um único `<Canvas>`. O ponto-chave: **a camada commitada só
re-renderiza quando o array de elementos muda**; o traço ao vivo mora numa camada separada
alimentada por shared values.

```tsx
// canvas/Board.tsx
export function Board() {
  const cam = useCamera();
  const elements = useBoardStore(s => s.elements);
  const gesture = useBoardGestures(cam);
  const canvasRef = useCanvasRef();

  return (
    <GestureDetector gesture={gesture}>
      <Canvas style={StyleSheet.absoluteFill} ref={canvasRef}>
        <GridLayer camera={cam} />
        <Group transform={cam.transform}>
          <CommittedLayer elements={elements} />
          <DraftLayer />
        </Group>
        <SelectionLayer camera={cam} />
      </Canvas>
    </GestureDetector>
  );
}
```

### CommittedLayer — Picture

```tsx
const picture = useMemo(() => createPicture((canvas) => {
  for (const el of elements) drawElementImperative(canvas, el);
}, { x: -1e5, y: -1e5, width: 2e5, height: 2e5 }), [elements]);

return <Picture picture={picture} />;
```

Com poucas centenas de elementos, declarativo (`elements.map(el => <ElementNode .../>)`) também
funciona e é mais fácil de debugar. Migre para `Picture` quando o FPS cair. Meça antes.

### DraftLayer — UI thread

O elemento em construção **não passa pelo store**. Ele é um `SharedValue` que os worklets
de gesto escrevem e o `useDerivedValue` transforma em `SkPath`:

```tsx
const draft = useSharedValue<DraftState | null>(null);

const draftPath = useDerivedValue(() => {
  const d = draft.value;
  if (!d) return Skia.Path.Make();
  const p = Skia.Path.Make();
  // durante o gesto usa a versão SEM rabisco (barato); o rough entra no commit
  if (d.type === 'draw') { /* smooth(p, d.points) */ }
  else if (d.type === 'rect') p.addRect({ x: d.x, y: d.y, width: d.w, height: d.h });
  // ...
  return p;
});
```

**Decisão importante:** durante o arrasto, desenhe liso. Aplique o `rough` só no `onEnd`,
quando o elemento entra no store. O usuário não percebe (o traço "assenta" ao soltar, igual ao
Excalidraw) e você economiza ~2× de geometria por frame.

---

## 7. Gestos

Regras de convivência, na ordem de prioridade:

| Gesto | Config | Ação |
|---|---|---|
| Pinch | `Gesture.Pinch()` | zoom+pan da câmera; **cancela** o rascunho em andamento |
| Pan 2 dedos | `Gesture.Pan().minPointers(2)` | pan da câmera |
| Pan 1 dedo | `Gesture.Pan().maxPointers(1)` | desenhar / mover / redimensionar / marquee |
| Tap | `Gesture.Tap()` | selecionar / criar texto |
| Double tap | `Gesture.Tap().numberOfTaps(2)` | editar texto |

```ts
// gestures/useBoardGestures.ts
const pinch = Gesture.Pinch()
  .onStart((e) => {
    draft.value = null;               // cancela desenho ao entrar 2º dedo
    start.zoom = zoom.value; start.tx = tx.value; start.ty = ty.value;
    start.fx = e.focalX; start.fy = e.focalY;
  })
  .onUpdate((e) => {
    const z = Math.min(8, Math.max(0.1, start.zoom * e.scale));
    const sx = (start.fx - start.tx) / start.zoom;
    const sy = (start.fy - start.ty) / start.zoom;
    zoom.value = z;
    tx.value = e.focalX - sx * z;
    ty.value = e.focalY - sy * z;
  });

const drawPan = Gesture.Pan()
  .maxPointers(1)
  .minDistance(0)                     // traço tem que começar no toque
  .onBegin((e) => { beginStroke(e.x, e.y); })
  .onUpdate((e) => { extendStroke(e.x, e.y); })
  .onEnd(() => { runOnJS(commitDraft)(); });

export default Gesture.Simultaneous(pinch, panTwoFingers, Gesture.Exclusive(drawPan, tap));
```

Detalhes que só aparecem no device:

- **Apple Pencil / rejeição de palma.** RNGH expõe `e.pointerType` (`'stylus' | 'touch'`).
  Se houver stylus na cena, ignore `touch` para desenho e trate como pan. Guarde a preferência
  (`stylusOnly`) no store.
- **Amostragem.** `onUpdate` entrega ~120 pontos/s no iPhone. Descarte pontos a menos de
  `1.6 / zoom` do anterior (mesma regra do protótipo) — reduz o path pela metade sem perda visível.
- **`minDistance(0)`** é obrigatório para o traço livre; sem isso o primeiro pixel some.
- **Scroll da bottom sheet.** Envolva o app em `<GestureHandlerRootView style={{flex:1}}>`
  e ponha `Gesture.Native()` nos scrolls da UI, senão o pan do canvas rouba o toque.

---

## 8. Texto

Há dois tipos de texto, e eles se comportam de forma diferente:

- **Texto livre** — elemento `text` solto na cena, largura definida pelo conteúdo.
- **Rótulo ancorado** (*bound text*) — texto que vive **dentro** de `rect`, `ellipse` ou
  `diamond`. Quebra na largura da forma, fica centralizado, acompanha mover/redimensionar,
  e faz a forma **crescer em altura** quando não cabe.

No modelo, o rótulo reaproveita os campos que todo elemento já tem: `text`, `fontSize` e
`labelColor`. Não existe um segundo elemento, então mover, duplicar, apagar e serializar
funcionam de graça.

> O Excalidraw faz diferente: cria um elemento `text` separado com `containerId` apontando
> para a forma. Isso permite estilizar o rótulo independentemente (cor, alinhamento, fonte)
> ao custo de manter a ligação consistente em toda operação — apagar a forma tem que apagar o
> filho, duplicar tem que duplicar os dois e reescrever o `containerId`. Para um app mobile o
> campo embutido é a escolha certa; se um dia precisar de rótulos com estilo próprio, migre.

### Caixa inscrita

O texto não pode usar a largura total da forma — num losango ele vazaria pelas diagonais.
Cada tipo tem um fator de caixa inscrita:

```ts
const LABELABLE = ['rect', 'ellipse', 'diamond'] as const;
const INNER: Record<string, [number, number]> = {
  rect:    [1, 1],
  diamond: [0.5, 0.5],              // maior retângulo dentro do losango
  ellipse: [1 / Math.SQRT2, 1 / Math.SQRT2],
};
const LABEL_PAD = 8;                // respiro interno, em unidades de cena
```

### Quebra de linha: use o Paragraph do Skia

No protótipo HTML a quebra é manual (`measureText` palavra a palavra). **Não porte isso.**
O Skia tem a Paragraph API, que faz line breaking de verdade — respeita grafemas, acentos
combinantes, CJK, emoji e ligaduras, coisas que uma quebra por `split(' ')` erra.

```ts
// render/label.ts
import { Skia, TextAlign, useFonts } from '@shopify/react-native-skia';

export function buildLabelParagraph(el: Element, fontMgr: SkFontMgr) {
  const [fx] = INNER[el.type];
  const maxW = Math.max(bounds(el).w * fx - LABEL_PAD * 2, el.fontSize);

  const para = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Center }, fontMgr)
    .pushStyle({
      fontSize: el.fontSize,
      fontFamilies: ['Caveat'],
      color: Skia.Color(el.labelColor ?? INK),
      heightMultiplier: 1.25,
    })
    .addText(el.text)
    .build();

  para.layout(maxW);                // <- a quebra acontece aqui
  return { para, maxW, height: para.getHeight() };
}
```

O `fontMgr` vem de `useFonts({ Caveat: [require('../assets/fonts/Caveat-Regular.ttf')] })`.
Sem ele o Paragraph cai na fonte do sistema e a métrica não bate com o desenho.

Renderizar é um nó só:

```tsx
<Paragraph paragraph={para} x={g.x + g.w / 2 - maxW / 2} y={g.y + g.h / 2 - height / 2} width={maxW} />
```

### Crescimento do contêiner

```ts
export function relayoutLabel(el: Element): Element {
  if (!el.text || !LABELABLE.includes(el.type)) return el;
  const [fx, fy] = INNER[el.type];
  const maxW = Math.max(el.w * fx - LABEL_PAD * 2, el.fontSize);
  const height = measureParagraphHeight(el, maxW);
  const needH = (height + LABEL_PAD * 2) / fy;
  return needH > el.h + 0.5 ? { ...el, h: needH, version: el.version + 1 } : el;
}
```

**A diferença estrutural em relação ao protótipo:** no HTML o canvas é *pull-based*, então dá
para recalcular o layout dentro do render — é idempotente e converge. No React o render tem
que ser puro, então `relayoutLabel` vira uma **ação do store**, chamada explicitamente em:

1. cada `onChangeText` durante a edição;
2. `onEnd` do redimensionamento (a forma ficou mais estreita → mais linhas → mais alta);
3. troca de `fontSize`.

Só cresce, nunca encolhe. Encolher junto faz a forma "pular" enquanto o dedo ainda está no
handle de resize, o que é péssimo no toque.

Normalize `w`/`h` para positivos antes de qualquer layout — a fórmula de altura não lida com
sinal, e um retângulo desenhado da direita para a esquerda nasce com `w` negativo:

```ts
export function normalize(el: Element): Element {
  if (el.points) return el;
  let { x, y, w, h } = el;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { ...el, x, y, w, h };
}
```

### Edição

`<TextInput>` absoluto sobreposto, do mesmo jeito do texto livre, mas com largura fixa e
centralizado:

```tsx
<TextInput
  multiline
  textAlign="center"
  autoFocus
  value={draftText}
  onChangeText={(t) => { setDraftText(t); store.setLabel(el.id, t); }}
  onBlur={commitLabel}
  style={{
    position: 'absolute',
    left: screen.x, top: screen.y,
    width: maxW * zoom,
    fontFamily: 'Caveat',
    fontSize: el.fontSize * zoom,
    lineHeight: el.fontSize * zoom * 1.25,
    color: el.labelColor ?? INK,
    padding: 0, backgroundColor: 'transparent',
    textAlignVertical: 'top',
  }}
/>
```

Enquanto edita, **esconda só o rótulo**, não a forma — o usuário precisa ver a caixa crescendo
sob o texto. Dois campos de estado distintos: `editingId` (texto livre, esconde o elemento
inteiro) e `editingLabelId` (rótulo, esconde apenas o `<Paragraph>`).

**Teclado.** Este é o problema que não existe no protótipo: em telas de iPhone o teclado come
metade da tela e a forma pode ficar embaixo dele. Ouça o teclado e desloque a câmera:

```ts
useEffect(() => {
  const sub = Keyboard.addListener('keyboardDidShow', (e) => {
    const shapeBottom = toScreenY(bounds(el).y + bounds(el).h);
    const kbTop = SCREEN_H - e.endCoordinates.height;
    if (shapeBottom > kbTop - 24) ty.value = withTiming(ty.value - (shapeBottom - kbTop + 24));
  });
  return () => sub.remove();
}, [editingLabelId]);
```

Guarde o `ty` anterior e restaure no `keyboardDidHide`, senão a cena vai subindo a cada edição.

### Abrir o editor

Três caminhos, todos os três valem a pena implementar:

| Entrada | Gesto |
|---|---|
| Duplo toque na forma | `Gesture.Tap().numberOfTaps(2)` |
| Ferramenta Texto tocando numa forma | tap normal + `pick()` retorna forma → ancora em vez de criar texto solto |
| Botão na barra de seleção | só aparece quando há **uma** forma rotulável selecionada |

O duplo toque precisa de `Gesture.Exclusive(doubleTap, singleTap)` — sem isso o RNGH dispara o
tap simples primeiro e a seleção rouba o gesto. O custo é ~250ms de atraso no tap simples
sobre formas; se isso incomodar, restrinja o duplo toque ao caso `tool === 'select'`.

### Hit-test em duas passadas

Uma forma com rótulo é **sólida ao toque**, mesmo sem preenchimento — ninguém espera tocar no
meio de uma caixa com texto e não selecionar nada:

```ts
const filled = el.bgColor !== 'transparent' || !!el.text;
```

Falta o caso da forma **vazia**. O Excalidraw exige clicar na borda, o que funciona com mouse e
é péssimo no dedo: a borda tem 2px e o alvo mínimo confortável é 44pt. Mas transformar todo
retângulo vazio em bloco sólido quebra o oposto — você não conseguiria mais selecionar o que
está atrás nem laçar dentro dele.

A saída é ordenar por precisão, não por profundidade:

```ts
export function pick(elements: Element[], p: Pt): Element | null {
  // 1ª passada: alvo preciso — traço, forma preenchida, rótulo
  for (let i = elements.length - 1; i >= 0; i--)
    if (hit(elements[i], p)) return elements[i];

  // 2ª passada: só agora o interior vazio conta
  for (let i = elements.length - 1; i >= 0; i--)
    if (hitLoose(elements[i], p)) return elements[i];

  return null;
}

function hitLoose(el: Element, p: Pt): boolean {
  if (!LABELABLE.includes(el.type)) return false;
  const g = bounds(el);
  // forma maior que a tela age como moldura: continua vazada,
  // senão fica impossível laçar uma seleção dentro dela
  if (g.w * zoom > SCREEN_W * 0.9 && g.h * zoom > SCREEN_H * 0.9) return false;
  return insideShape(el, p);
}
```

O resultado é o que a pessoa espera sem pensar: uma caixinha preenchida por cima do vazio de uma
maior ganha; um rabisco atravessando o interior ganha; e se não há nada ali, o interior arrasta a
própria forma.

**A borracha continua usando só `hit()`.** Se ela usasse `pick()`, passar o dedo pelo meio vazio
de um retângulo apagaria o retângulo — e o gesto da borracha é "apago o que eu encosto", não "o
que eu sobrevoo".


## 9. Setas ancoradas, roteamento e cantos

Três recursos que compartilham a mesma ideia: **a geometria final é derivada, não armazenada.**
O que fica no `Element` é a intenção (ancorado em quem, que tipo de rota, canto vivo ou
arredondado); as coordenadas visíveis saem de `resolvedPoints(el)` na hora de desenhar.

Isso é o que faz a seta seguir a forma sem nenhum código de sincronização: mover a caixa não
toca na seta, só muda o que `resolvedPoints` calcula no próximo frame.

### Cantos arredondados

```ts
export function cornerRadius(el: Element): number {
  if (el.edges !== 'round' || !['rect','diamond'].includes(el.type)) return 0;
  return Math.min(Math.min(el.w, el.h) * 0.25, 32);   // proporcional, com teto
}
```

O teto de 32 é o que evita a caixa grande virar um estádio. O fator 0.25 mantém a proporção em
formas pequenas. Mesmos números do Excalidraw.

Para desenhar, cada vértice do polígono vira três pontos — entrada, controle, saída:

```ts
export function corners(pts: Pt[], r: number) {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
    const d1 = dist(p, prev) || 1, d2 = dist(next, p) || 1;
    const r1 = Math.min(r, d1 / 2), r2 = Math.min(r, d2 / 2);   // não deixa os raios se cruzarem
    return {
      in:  lerp(p, prev, r1 / d1),
      c:   p,
      out: lerp(p, next, r2 / d2),
    };
  });
}
```

O `Math.min(r, d/2)` é o detalhe que não pode faltar: sem ele, um retângulo achatado com raio
grande produz pontos de tangência invertidos e o path se dobra sobre si mesmo.

O traço de cada lado usa uma cúbica levemente abaulada em vez de `lineTo`, senão o contorno
arredondado perde o aspecto de rabisco. E o mesmo `corners()` serve para o `clipPath` do
preenchimento — só que sem jitter.

### Ancoragem: o ponto tem que ser cravado

Duas tentativas erradas antes de acertar, e vale registrar as duas porque são armadilhas
naturais:

1. **Mirar o centro da forma.** Duas setas entre as mesmas caixas se sobrepõem, e arrastar a
   ponta ancorada não move nada — o ponto bruto que o dedo move não entra na conta.
2. **Mirar um foco, partindo do ponto vizinho.** Melhor, mas o encosto ainda **desliza sozinho**:
   como a direção sai do outro extremo da seta, mexer na outra ponta arrasta este encosto pela
   borda. O usuário fixa a seta na quina da caixa, mexe no outro lado, e a seta escorrega.

O modelo certo é **ponto cravado**: a âncora guarda a posição do encosto *na borda*, normalizada
sobre os semi-eixos. Nada além da própria forma o desloca.

```ts
export function bindingAt(shape: Element, p: Pt): Binding {
  const g = bounds(shape);
  const a = boundaryPoint(shape, p);        // ponto da borda mais próximo do dedo
  return {
    id: shape.id,
    fx: (a.x - (g.x + g.w / 2)) / (g.w / 2 || 1),
    fy: (a.y - (g.y + g.h / 2)) / (g.h / 2 || 1),
  };
}
```

A resolução vira aritmética direta — sem bissecção, sem depender do outro extremo:

```ts
export function bindPoint(shape: Element, b: Binding): Pt {
  const g = bounds(shape);
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  const ax = cx + b.fx! * g.w / 2, ay = cy + b.fy! * g.h / 2;
  const dx = ax - cx, dy = ay - cy, L = Math.hypot(dx, dy) || 1;
  return [ax + (dx / L) * GAP, ay + (dy / L) * GAP];   // folga pela normal aproximada
}
```

Como `fx`/`fy` são normalizados, **mover e redimensionar a forma levam o ponto junto,
proporcionalmente** — e de graça, porque `bounds()` já mudou.

### `boundaryPoint`: ponto da borda mais próximo

```ts
export function boundaryPoint(shape: Element, p: Pt): Pt {
  const g = bounds(shape);
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;

  if (shape.type === 'ellipse') {                     // projeção radial
    let dx = p.x - cx, dy = p.y - cy;
    if (!dx && !dy) dy = -1;
    const k = 1 / Math.hypot(dx / (g.w / 2 || 1), dy / (g.h / 2 || 1));
    return { x: cx + dx * k, y: cy + dy * k };
  }

  const poly = shape.type === 'diamond'
    ? [[cx, g.y], [g.x + g.w, cy], [cx, g.y + g.h], [g.x, cy]]
    : [[g.x, g.y], [g.x + g.w, g.y], [g.x + g.w, g.y + g.h], [g.x, g.y + g.h]];

  return poly
    .map((a, i) => projectOnSegment(p, a, poly[(i + 1) % poly.length]))
    .reduce((best, q) => (dist(p, q) < dist(p, best) ? q : best));
}
```

Para a elipse a projeção radial não é o ponto rigorosamente mais próximo, mas é estável, barata
e visualmente indistinguível. O ponto exato exigiria Newton sobre uma quártica — não vale.

**Teste de aceite do passo:** crave a ponta, mexa na outra extremidade da seta para os dois
extremos da tela e confira que o encosto não muda **nenhum pixel**. Se mudar, o cálculo ainda
depende do vizinho.

Uma imprecisão conhecida: com `edges: 'round'`, `boundaryPoint` usa a caixa sem arredondamento,
então uma ponta cravada exatamente na quina fica alguns pixels fora do contorno visível. Corrigir
exigiria projetar sobre o path arredondado; a folga de 6px já disfarça.

### Resolução dos pontos

```ts
export function resolvedPoints(el: Element): Pt[] {
  let pts = el.points!.map(q => [el.x + q[0], el.y + q[1]] as Pt);
  if (!LINEAR.includes(el.type) || pts.length < 2) return pts;

  const sb = bindTarget(el.startBinding), eb = bindTarget(el.endBinding);
  if (sb) pts[0] = bindPoint(sb, pts[1]);
  if (eb) pts[pts.length - 1] = bindPoint(eb, pts[pts.length - 2]);

  if (el.arrowType === 'elbow') {
    const a = pts[0], b = pts[pts.length - 1];
    return elbowRoute(a, b, headingAt(sb, a), headingAt(eb, b));
  }
  return pts;
}
```

**Cuidado com recursão.** `resolvedPoints` chama `bounds(shape)`, e `bounds` de um elemento
linear chama `resolvedPoints`. Só não entra em loop porque `BINDABLE` exclui `line` e `arrow`.
Deixe essa restrição explícita no tipo, não só na constante — se um dia permitir seta ancorada
em seta, precisa de detecção de ciclo.

**Índices divergem no cotovelo.** `el.points` tem 2 pontos, `resolvedPoints` devolve 4. Toda
alça de ponta tem que carregar o índice **bruto**, não a posição no array resolvido:

```ts
type Handle = { kind: 'pt' | 'mid'; i: number; x: number; y: number };
//                                  ^ índice em el.points
```

### Roteamento em cotovelo

```ts
export function elbowRoute(a: Pt, b: Pt, ha: Axis | null, hb: Axis | null): Pt[] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return [a, b];      // já está alinhado
  const startH = ha ? ha === 'h' : hb ? hb !== 'h' : Math.abs(dx) >= Math.abs(dy);
  const pts = startH
    ? [a, [a[0] + dx / 2, a[1]], [a[0] + dx / 2, b[1]], b]
    : [a, [a[0], a[1] + dy / 2], [b[0], a[1] + dy / 2], b];
  return dedupe(pts);
}
```

`ha`/`hb` vêm da forma ancorada: o eixo é o do lado mais próximo da ponta. Sem ancoragem, o
eixo dominante do deslocamento decide. Uma rota em Z com desvio no meio resolve o caso comum;
não é um roteador que desvia de obstáculos, e para um app de diagrama à mão isso basta.

Os cantos do cotovelo usam o mesmo arredondamento das formas, com raio fixo de 14.

### Gestos: ancorar e desprender são o mesmo arrasto

```ts
const dragEndpoint = Gesture.Pan()
  .maxPointers(1)
  .onUpdate((e) => {
    'worklet';
    runOnJS(movePoint)(toScene(e.x, e.y), handleIndex);
  });
```

```ts
function movePoint(p: Pt, i: number) {
  const el = store.get(id);
  el.points[i] = [p.x - el.x, p.y - el.y];      // sempre segue o dedo: garante saída sem salto

  if (i === 0 || i === el.points.length - 1) {
    const cur = i === 0 ? el.startBinding : el.endBinding;
    let target = pickBindable(p, el.id);        // prender: insideShape com tolerância de 10px

    // histerese: soltar exige sair de 22px. Sem isso a âncora pisca no limiar
    // e o desprender vira acidente.
    if (!target && cur) {
      const prev = bindTarget(cur);
      if (prev && insideShape(prev, p, 22 / zoom)) target = prev;
    }

    setBindHint(target?.id ?? null);            // realce azul na forma candidata
    const binding = target ? bindingAt(target, p) : null;
    i === 0 ? (el.startBinding = binding) : (el.endBinding = binding);
  }
}
```

Não existe gesto separado para desprender: arrastar a ponta para longe de qualquer forma
zera o binding. Isso é o que o usuário espera e é o que o Excalidraw faz.

Três detalhes que só aparecem testando:

- **Realce da candidata.** Enquanto a ponta é arrastada, desenhe o contorno azul da forma que
  vai receber a âncora. Sem esse feedback o usuário não sabe se prendeu.
- **Tolerância de ancoragem maior que a de toque.** `pickBindable` usa ~10px *para fora* da
  forma. Exigir precisão de pixel no dedo é frustrante.
- **Seta ancorada pode nascer minúscula.** A regra que descarta rascunhos pequenos tem que
  abrir exceção quando há binding — ancorar duas caixas coladas gera uma seta de 4px que é
  legítima.

### Alças

Elemento linear selecionado **substitui** a caixa de 8 alças por alças de ponto:

| Alça | Visual | Ação |
|---|---|---|
| Ponta (início/fim) | círculo de 13pt, preenchido de azul quando ancorado | move o ponto e (re)ancora |
| Ponto médio | círculo de 9pt, azul a 45% | insere um ponto novo naquela posição |

Ponto médio não aparece no cotovelo — a rota é calculada, não editável.

**Hitbox de 30pt nas pontas e 20pt nos médios**, contra 13pt e 9pt de visual, e a ponta ganha
prioridade no desempate. Errar a ponta por 2pt cai no `pick()` genérico e passa a arrastar o
**corpo inteiro** da seta — o usuário puxa a ponta e o que se move é a seta toda. Ordene os
candidatos por tipo antes de distância:

```ts
const hit = linearHandles(el)
  .map(h => ({ h, d: dist(h, touch) }))
  .filter(o => o.d < (o.h.kind === 'pt' ? 30 : 20))
  .sort((a, b) => (a.h.kind === b.h.kind ? a.d - b.d : a.h.kind === 'pt' ? -1 : 1))[0]?.h;
```

### Ciclo de vida do binding

Apagar uma forma deixa setas apontando para um id que não existe. Limpe na hora:

```ts
export function dropBindings(elements: Element[], removedIds: Set<string>) {
  for (const el of elements) {
    if (el.startBinding && removedIds.has(el.startBinding.id)) el.startBinding = null;
    if (el.endBinding   && removedIds.has(el.endBinding.id))   el.endBinding = null;
  }
}
```

Chame em todo caminho de remoção: botão apagar, tecla, borracha e "Apagar tudo". `bindTarget`
já devolve `undefined` para id órfão, então nada quebra visualmente, mas o lixo se acumula no
`.json` e reaparece se alguém recriar um elemento com o mesmo id.

**Duplicar** deve remapear: se a cópia inclui a seta *e* as duas formas, os bindings da cópia
apontam para as cópias; se inclui só a seta, o binding aponta para os originais.

### Compatibilidade

Cenas salvas antes destes campos precisam abrir. Aplique defaults na desserialização, não no
render:

```ts
const migrate = (el: any): Element => ({
  edges: 'sharp', arrowType: 'straight', startBinding: null, endBinding: null, ...el,
});
```

`edges: 'sharp'` como default de migração preserva a aparência de cenas antigas, mesmo que o
default de elementos novos seja `'round'`.

## 10. Área de transferência: o SVG é o formato

Copiar e colar não usam um formato interno. O que vai para a área de transferência é **o SVG
do que está selecionado**, com a cena embutida num comentário:

```
<svg ...><!-- rabisco:scene eyJ0eXBlIjoicmFiaXNjby9zY2VuZSIsInZlcnNpb24iOjEsImVsZW1l... -->
```

Isso dá três coisas de uma vez:

- Colar em Figma, Illustrator, Keynote ou num e-mail entrega **vetor de verdade**, não um bitmap.
- Colar de volta no app recupera os elementos **exatos** — rabisco, seed, âncoras, rótulos.
- O arquivo `.svg` exportado é a mesma coisa, então "Abrir quadro" aceita `.svg` além de `.json`.

O payload é o mesmo `serialize()` do arquivo de cena, em base64 (`btoa(unescape(encodeURIComponent(json)))`
para sobreviver a acentos). O comentário é ignorado por qualquer renderizador de SVG.

### Copiar

```ts
export async function copySelection(elements: Element[]) {
  const svg = buildSVG(elements);          // buildSVG recebe o subconjunto, não a cena toda
  await Clipboard.setStringAsync(svg);     // expo-clipboard
}
```

`buildSVG` precisa ser parametrizável por lista — se ele lê o store direto, copiar seleção é
impossível sem gambiarra.

### Colar: o remapeamento é o ponto delicado

```ts
export function cloneGroup(els: Element[], all: Element[], dx: number, dy: number): Element[] {
  const map = new Map<string, string>();
  const copies = els.map(e => {
    const c = { ...structuredClone(e), id: uid(), seed: randSeed() };
    map.set(e.id, c.id);
    return c;
  });

  for (const c of copies) {
    c.x += dx; c.y += dy;
    for (const k of ['startBinding', 'endBinding'] as const) {
      const b = c[k];
      if (!b) continue;
      const inner = map.get(b.id);
      if (inner) c[k] = { ...b, id: inner };            // alvo veio junto → aponta pra cópia
      else if (!all.some(e => e.id === b.id)) c[k] = null;  // alvo não existe → solta
      // alvo existe fora da seleção → mantém, ancora no original
    }
  }
  return copies;
}
```

Os três casos importam e é fácil implementar só o primeiro:

| Situação | Comportamento |
|---|---|
| Copiou a seta **e** as duas caixas | bindings apontam para as cópias |
| Copiou **só** a seta, as caixas seguem na cena | bindings mantêm as caixas originais |
| Colou num quadro onde os alvos não existem | bindings zerados, seta vira solta |

`fx`/`fy` viajam junto, então a cópia nasce com o encosto no mesmo ponto relativo da borda.

### Onde colar

Deslocar 24px resolve o caso comum. Mas se a origem foi copiada de outra parte do canvas e o
usuário rolou para longe, o colado nasce fora da tela e parece que nada aconteceu:

```ts
let dx = 24 / zoom, dy = 24 / zoom;
const box = contentBox(els);
if (offscreen(box, dx, dy)) {            // nada do bbox cai na viewport
  const c = toScene(W / 2, (H - 120) / 2);
  dx = c.x - centerX(box); dy = c.y - centerY(box);
}
```

Depois de colar: selecione as cópias e troque para a ferramenta de seleção. Colar sem selecionar
o resultado obriga o usuário a caçar o que apareceu.

### No React Native

`expo-clipboard` cobre texto (`setStringAsync`/`getStringAsync`), que é tudo o que o formato
SVG precisa. Não há `Ctrl+C`, então as entradas são:

- **Barra de seleção**: botões Copiar e Duplicar.
- **Menu ⋯**: Colar (precisa existir fora da seleção, senão não há como colar num quadro vazio).
- **Teclado externo** (iPad, Magic Keyboard): `Gesture` não cobre isso — use
  `KeyboardEvents` do `react-native-keyboard-controller` ou um `<TextInput>` invisível
  capturando `onKeyPress`. Vale o esforço se o iPad for alvo.
- **Menu de contexto nativo** no toque longo, via `expo-context-menu` ou `ContextMenuView`.

Duplicar é `cloneGroup` com deslocamento fixo de 18px, sem passar pela área de transferência —
mais rápido e não suja o clipboard do sistema.

## 11. Assistente: gerar operações, não texto

O botão de IA abre um campo de texto. O alvo é **a seleção quando há algo selecionado, o quadro
inteiro quando não há** — trocável em dois chips. O modelo não conversa: ele devolve **operações
sobre a cena**, que passam pelo mesmo caminho de mutação de qualquer edição manual e entram numa
única entrada de histórico.

### Por que não JSON

A primeira versão usava JSON. Trocar por uma **DSL de uma operação por linha** rendeu três coisas
ao mesmo tempo:

```
+a rect "Chegada do caminhão"
+b diamond "Nota confere?" fill=sand
+c rect "Endereçar no WMS" fill=mint
+d rect "Abrir divergência" fill=pink
a>b
b>c elbow
b>d elbow
!Fluxo de recebimento criado
```

1. **Menos tokens.** Medido numa cena de 7 elementos: 322 caracteres em DSL contra 730 em JSON —
   **56% menor**. Some as aspas de chave, as vírgulas e as chaves aninhadas que somem.
2. **Degrada bem.** Se a resposta for cortada no `max_tokens`, as linhas completas ainda se
   aplicam. Com JSON, uma chave faltando invalida o objeto inteiro e você perde tudo.
3. **Menos superfície de erro.** Não há balanceamento de delimitadores para o modelo acertar.

O parser é um laço sobre linhas, e uma linha malformada é descartada sozinha:

```ts
for (let line of text.split('\n')) {
  line = line.trim();
  if (!line || line.startsWith('```')) continue;
  if (line[0] === '!') { notes.push(line.slice(1)); continue; }   // nota
  if (line[0] === '-') { ops.push({ op: 'del', id: line.slice(1).trim() }); continue; }
  if (line[0] === '~') { /* update */ continue; }
  if (line[0] === '+') { /* add  */ continue; }
  const e = line.match(/^([\w-]+)\s*>\s*([\w-]+)\s*(.*)$/);       // aresta
  if (e) ops.push({ op: 'edge', from: e[1], to: e[2], attrs: parseAttrs(e[3]) });
}
```

Uma guarda importante no `add`: se a linha tem número **ímpar** de aspas, ela foi cortada no meio
— descarte, senão você cria uma caixa vazia sem texto.

### Nomes curtos em vez de hex

`#FF3B30` custa 4–6 tokens e o modelo pode errar um dígito. `red` custa 1 e não tem como errar:

```ts
const C_STROKE = { ink: '#1B1B1F', red: '#FF3B30', green: '#34C759',
                   blue: '#007AFF', orange: '#FF9500', purple: '#AF52DE' };
const C_FILL   = { none: 'transparent', pink: '#FFD8D6', mint: '#C9F0D4',
                   sky: '#CFE6FF', sand: '#FFEBC2', lilac: '#EBD9FF' };
```

Mesma lógica nos modificadores: **flags valem menos que `chave=valor`**. `bold`, `dash`, `sharp`,
`elbow`, `hatch` são um token cada; `strokeWidth: 4.6` são cinco. A lista fechada de nomes também
**é** a validação — token desconhecido é ignorado, e não existe caminho para o modelo escrever um
valor inválido no elemento.

### O modelo não calcula coordenadas

Esta é a mudança que mais melhorou o acerto. Modelo é bom em estrutura e ruim em geometria:
pedir `x`, `y`, `w`, `h` produz caixas sobrepostas, textos que vazam e espaçamento irregular.

A regra passou a ser: **o modelo diz quem liga em quem, o app calcula onde**. Quem tem
`measureText`, `bounds` e detecção de colisão é o app.

```ts
export function autoLayout(nodes: Element[], edges: Edge[], viewport: Rect) {
  // 1. tamanho a partir do texto medido
  for (const n of nodes) sizeNode(n);

  // 2. camada = maior caminho a partir de uma raiz (com guarda de ciclo)
  const layer = longestPathDepth(nodes, edges);

  // 3. eixo pela proporção da viewport — retrato vira fluxo de cima para baixo
  const vertical = viewport.h >= viewport.w;

  // 4. empilha por camada, centralizando cada uma no eixo transversal
  // 5. leva o bloco para perto de quem ele liga, ou para a área visível
  // 6. empurra até não colidir com nada que já existia
}
```

Os passos 5 e 6 são o que faz "adicione uma etapa de conferência" funcionar num diagrama que já
existe: a etapa nova nasce **abaixo do nó ao qual ela se liga**, e se cair em cima de algo, o
bloco é empurrado no eixo transversal até encontrar espaço.

O eixo derivado da viewport é de graça e resolve o principal problema de diagrama em celular:
em retrato, fluxo horizontal força zoom-out imediato.

**`@x,y` e `WxH` saíram da gramática.** Enquanto existiam, o modelo os usava mesmo com o prompt
pedindo o contrário, e o resultado era caixa sobre caixa e texto vazando. O parser hoje descarta
esses tokens se aparecerem. Tamanho vem de `measureText`, posição vem do `autoLayout`, sem
exceção.

### Ligar duas formas: escolher o lado, não o ponto mais próximo

Reaproveitar `bindingAt()` — que projeta o ponto da borda mais próximo do alvo — funciona quando
é o dedo do usuário arrastando, e falha quando é o app criando arestas em lote. Dois motivos:

1. **Setas irmãs colapsam.** Um losango com dois filhos abaixo projeta os dois encostos no
   **vértice de baixo**: as duas setas saem exatamente do mesmo pixel.
2. **Encosto na quina.** O ponto mais próximo costuma ser um canto, e a seta chega enviesada.

A correção tem três partes.

**Lado pela direção relativa**, normalizada pelas semi-dimensões — sem isso, uma caixa achatada
escolhe o lado errado:

```ts
function sideOf(A: Element, B: Element) {
  const ga = bounds(A), gb = bounds(B);
  const dx = centerX(gb) - centerX(ga), dy = centerY(gb) - centerY(ga);
  return Math.abs(dx) / (ga.w / 2) >= Math.abs(dy) / (ga.h / 2)
    ? { axis: 'x' as const, s: dx >= 0 ? 1 : -1 }
    : { axis: 'y' as const, s: dy >= 0 ? 1 : -1 };
}
```

**Distribuição ao longo do lado.** Agrupe as arestas por `(nó, lado)` **antes** de criar
qualquer seta — a posição de cada uma depende de quantas dividem aquele lado:

```ts
const spread = arr.length < 2 ? 0 : ((arr.indexOf(p) + 1) / (arr.length + 1) - 0.5) * 1.1;
```

**Âncora por raio a partir do centro, não por projeção.** Esta é a parte que eu errei primeiro:

```ts
function anchorOn(shape: Element, side: Side, spread: number): Binding {
  const g = bounds(shape);
  const c = { x: centerX(g), y: centerY(g) };
  const d = side.axis === 'x' ? { x: side.s, y: spread } : { x: spread, y: side.s };
  const far = { x: c.x + d.x * g.w * 2, y: c.y + d.y * g.h * 2 };

  let lo = 0, hi = 1;                       // bissecção centro → fora
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    insideShape(shape, lerpPt(c, far, t)) ? (lo = t) : (hi = t);
  }
  const b = lerpPt(c, far, lo);
  return { id: shape.id, fx: (b.x - c.x) / (g.w / 2), fy: (b.y - c.y) / (g.h / 2) };
}
```

Projetar o ponto mais próximo de um alvo externo **não** resolve o caso do losango: dois alvos
abaixo do centro projetam ambos no mesmo vértice. O raio respeita o deslocamento lateral e cruza
a aresta real. Medido: as duas saídas passaram de `236,449 / 236,449` para `236,449 / 279,449`.

**Desvio no cotovelo.** Setas irmãs com rota em Z compartilham o mesmo trecho transversal e se
sobrepõem. Um campo `bend` desloca esse trecho:

```ts
const pts = startH
  ? [a, [a[0] + dx / 2 + bend, a[1]], [a[0] + dx / 2 + bend, b[1]], b]
  : [a, [a[0], a[1] + dy / 2 + bend], [b[0], a[1] + dy / 2 + bend], b];
```

`bend = (índice − (n−1)/2) × 30` distribui as irmãs em faixas paralelas.

**Tipo automático.** Se o modelo não pedir um tipo, decida pela geometria: centros alinhados no
eixo do lado (folga < 24) → `straight`; desalinhados → `elbow`. Reta entre nós desalinhados fica
torta; cotovelo entre nós alinhados fica com uma dobra inútil.

### Cor do rótulo sobre preenchimento

Bug que só aparece no modo escuro: `INK` é uma cor semântica que inverte para claro, e o rótulo
de uma caixa com fundo pastel virava **texto branco sobre verde-claro**. Os preenchimentos são
sempre claros, então sobre eles a tinta não inverte:

```ts
const labelColor = el.bgColor !== 'transparent' ? ink : resolveSemantic(ink);
```

### O que vai na mensagem

A cena também vai em linhas, no mesmo dialeto da saída — o modelo aprende o formato uma vez:

```
visivel @-40,120 390x620
quadro:
fviofklr rect @175,135 190x90 "Chegada do caminhão"
4urqqazt diamond @125,310 290x140 "Nota confere?" fill=sand
r3b30kc8 fviofklr>4urqqazt

adicione uma etapa de conferência cega antes de endereçar
```

Regras de economia que valem seguir:

- **Coordenadas arredondadas para múltiplos de 5.** Dígitos custam tokens e ninguém precisa de
  precisão de sub-pixel num prompt.
- **Só o que difere do padrão.** `stroke=ink`, `fill=none`, `arrowType=straight` nunca aparecem.
- **Nada de `points`, `seed`, `version`, `opacity`.** Não influenciam a decisão e ocupam espaço.
- **Teto de 40 elementos**, priorizando os visíveis.
- **`visivel @x,y wxh`** em vez de um objeto JSON de viewport.
- Quando o alvo é a seleção, mande a seleção **mais as setas ancoradas nela** — sem elas o modelo
  não enxerga as ligações e recria arestas que já existem.

O system prompt terminou em ~1000 caracteres, contra ~1900 da versão em JSON, e inclui um
exemplo de 8 linhas. **O exemplo paga o próprio custo**: com ele o modelo acerta o dialeto de
primeira; sem ele, mistura JSON e DSL.

### A chave da API **não** pode ir no app

Qualquer chave no bundle é extraível — não existe `EXPO_PUBLIC_` seguro para isso. O app fala com
um endpoint seu, e o endpoint fala com a Anthropic:

```
app  ──POST /api/board-ai──▶  sua rota  ──x-api-key──▶  api.anthropic.com
```

Com Expo Router é uma API route no mesmo projeto, publicada em EAS Hosting:

```ts
// app/api/board-ai+api.ts
export async function POST(req: Request) {
  const { prompt, scene, viewport, target } = await req.json();
  if (scene.length > 4000) return Response.json({ error: 'cena grande demais' }, { status: 400 });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,       // só existe no servidor
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, system: SYS,
      messages: [{ role: 'user', content: `visivel ${viewport}\n${target}:\n${scene}\n\n${prompt}` }] }),
  });
  return Response.json(await r.json());
}
```

O rate limit por dispositivo vai aí. É o único lugar onde dá.

**O `system` fica no servidor, não no app.** Além de não trafegar a cada requisição, você ajusta
o prompt sem publicar uma nova versão na loja — e com `cache_control` no bloco do sistema, ele
deixa de ser cobrado como entrada nova a cada chamada.

### Depois de aplicar

```ts
const added = applyOps(ops.slice(0, 24), store);   // teto no cliente também
store.select(added);
commit();                                          // UMA entrada de histórico
if (isOffscreen(added)) fitTo(added);
toast(note);
```

O `commit()` único é o que torna o recurso seguro: um `Ctrl+Z` desfaz a intervenção inteira. Se
cada operação virasse uma entrada, desfazer um fluxograma de 7 elementos exigiria sete undos.

### Falhas previsíveis

| Falha | Tratamento |
|---|---|
| Resposta em bloco markdown | pule linhas que começam com ``` |
| Resposta cortada no meio | linhas completas se aplicam; aspas ímpares descartam a linha |
| Nenhuma linha válida | trate como erro, não aplique nada |
| Aresta com ref inexistente | descarte a aresta — seta sem os dois lados não entra |
| Modelo insiste em `@x,y` | o parser descarta o token; o layout é sempre do app |
| Atributo desconhecido | ignore; a lista fechada é a validação |
| Modelo devolve 40 linhas | teto no prompt **e** corte no cliente |
| Sem rede / rota fora do ar | toast curto; nunca deixe a barra travada em "pensando" |

## 12. Undo / redo

Snapshot de JSON, igual ao protótipo. Simples, previsível, e a cena inteira raramente passa de
algumas centenas de KB.

```ts
// store/history.ts
const past: string[] = [];
const future: string[] = [];
let last = '[]';

export function commit(elements: Element[]) {
  const now = JSON.stringify(elements);
  if (now === last) return;
  past.push(last);
  if (past.length > 60) past.shift();
  future.length = 0;
  last = now;
}
```

Chame `commit()` **no fim do gesto**, nunca no `onUpdate`. Se a cena crescer muito (>2k
elementos), migre para patches do `immer` (`produceWithPatches`) — mesma API pública.

---

## 13. Exportação e persistência

O protótipo exporta **PNG, SVG e PDF**. Isso só é viável por causa de uma decisão de
arquitetura que vale replicar no app: a geometria produz **path data no formato SVG** como
representação única, e cada formato é um consumidor diferente da mesma string.

```
geom(el) ──> "M12 8Q18 4 24 9L30 14Z"
                    │
      ┌─────────────┼──────────────┐
      ▼             ▼              ▼
 Skia.Path       atributo d     operadores
 .MakeFromSVG    do <path>      m/l/c/h
   (tela)          (SVG)          (PDF)
```

`Skia.Path.MakeFromSVGString(d)` existe e é a ponte — construa o `d` uma vez, guarde no
`pathCache`, e derive o `SkPath` a partir dele. Sem isso você teria três geradores de
geometria e eles divergiriam na primeira mudança do algoritmo de rabisco.

Duas regras que fazem os três formatos coincidirem:

- **Elipse como 4 cúbicas de Bézier** (kappa = 0.5522847), nunca `addOval` ou arco SVG.
  PDF não tem primitiva de arco; com Bézier os três renderizadores desenham a mesma curva.
- **Só emita `M`, `L`, `Q`, `C`, `Z`.** Esse subconjunto é trivial de converter e cobre tudo.

### PNG

```ts
const surface = Skia.Surface.MakeOffscreen(w * 3, h * 3)!;
const canvas = surface.getCanvas();
canvas.clear(Skia.Color('#FFFFFF'));
canvas.scale(3, 3);
canvas.translate(PAD - minX, PAD - minY);
elements.forEach(el => drawElementImperative(canvas, el));
const base64 = surface.makeImageSnapshot().encodeToBase64(ImageFormat.PNG, 100);
```

### SVG

Montagem de string pura — nenhuma dependência. Preenchimento em hachura precisa de
`<clipPath>`; o rótulo ancorado vira um `<text>` por linha com `text-anchor="middle"`.

```ts
`<path d="${G.stroke}" fill="none" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}"
   stroke-linecap="round"${ds.length ? ` stroke-dasharray="${ds.join(' ')}"` : ''}/>`
```

Para as linhas do rótulo, a Paragraph API entrega as métricas prontas via
`paragraph.getLineMetrics()` — use `startIndex`/`endIndex` para fatiar o texto e `baseline`
para o `y` de cada `<text>`. Não refaça a quebra manualmente na exportação, ou o SVG sai
diferente da tela.

### PDF

Sem biblioteca. O content stream do PDF é quase um dialeto de path: `m`, `l`, `c`, `h`,
`S` (traço), `f` (preenchimento), `W n` (recorte). Escreva um conversor do `d` para esses
operadores. Pontos de atenção:

- **`Q` não existe no PDF.** Converta quadrática → cúbica:
  `c1 = p0 + ⅔(ctrl − p0)`, `c2 = p1 + ⅔(ctrl − p1)`.
- **Eixo Y invertido.** Faça a inversão **por ponto** no emissor (`Y = alturaPágina − y`), não
  com uma matriz `cm` global — a matriz global espelha o texto e obriga a compensar com `Tm`.
- **Opacidade** vai em `ExtGState` (`/CA` e `/ca`), um dicionário por valor de alpha usado.
- **Escreva os bytes em Latin-1.** Os offsets da tabela `xref` são posições em bytes; gravar
  em UTF-8 desloca tudo no primeiro acento e o arquivo quebra.
- **Fonte.** Helvetica com `/WinAnsiEncoding` cobre português sem embarcar nada, mas o texto
  perde o traço manuscrito. Para fidelidade total é preciso embarcar o `.ttf` (subset +
  objetos `FontFile2`/`CIDFontType2`) ou converter o texto em contornos. O PDF também não
  centraliza sozinho: calcule a largura de cada linha e desloque o `x`.

```ts
// em RN, escrever bytes: Uint8Array -> base64 -> FileSystem
const bytes = buildPDF(elements);
await FileSystem.writeAsStringAsync(uri, Buffer.from(bytes).toString('base64'), { encoding: 'base64' });
await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
```

`buildPDF` é código puro de string — copie do protótipo sem alteração.

### Menu de exportação

Uma `ActionSheetIOS` nativa (ou `@expo/react-native-action-sheet` para paridade no Android)
com PNG / SVG / PDF / Cancelar, entregando o resultado ao share sheet do sistema via
`expo-sharing`. Não invente uma tela de exportação: o share sheet já resolve salvar em
Arquivos, mandar por AirDrop e enviar para outro app.

### Cena (.json)

```ts
export const serialize = (elements: Element[]) =>
  JSON.stringify({ type: 'rabisco/scene', version: 1, elements });
```

Mesmo formato do protótipo — arquivo salvo no navegador abre no app e vice-versa.

### Autosave

```ts
import { kv } from '../store/persist';

const save = debounce((els: Element[]) => kv.set('scene', serialize(els)), 400);
useBoardStore.subscribe(s => s.elements, save);
```

`expo-sqlite/kv-store` tem API síncrona (`setItemSync`), então o autosave não precisa de
`await` no caminho crítico — o mesmo motivo pelo qual eu tinha escolhido MMKV. A diferença é
que ele roda dentro do Expo Go.

Restaure no boot com `kv.get('scene')` e chame `fit()` para enquadrar.


## 14. UI

O protótipo já define o layout: dock inferior, bottom sheet de estilo, barra superior flutuante,
barra contextual sobre a seleção. Na porta para RN:

- **Glass:** `expo-blur` → `<BlurView intensity={80} tint="light">` com
  `borderCurve: 'continuous'` e `borderRadius: 22` (o "squircle" do iOS).
- **Safe area:** `useSafeAreaInsets()` para o `bottom` do dock e o `top` da barra.
- **Barra contextual:** posicione com `useAnimatedStyle` a partir do bbox da seleção convertido
  para tela — assim ela acompanha o pan sem re-render.
- **Bottom sheet:** `@gorhom/bottom-sheet` se quiser arrasto e snap points; ou um `Animated.View`
  simples com `withSpring`, que é o que o protótipo faz. Ambos rodam no Expo Go.
- **Segmented control:** `@react-native-segmented-control/segmented-control` entrega o controle
  nativo do iOS (o pill deslizante, a sombra, o haptic) de graça. O protótipo reimplementa em
  CSS porque não tem escolha; no app, não reimplemente.
- **Haptics:** `Haptics.selectionAsync()` ao trocar de ferramenta e ao pegar um handle;
  `impactAsync(Light)` ao criar um elemento.

Alvos de toque: nada abaixo de **44×44pt**. Os handles de resize são desenhados com 13pt mas a
área de toque testa contra **20pt de raio** — separe o visual da hitbox.

---

## 15. Performance — o que medir

| Sintoma | Causa provável | Correção |
|---|---|---|
| Traço com lag no início | `commit()` sendo chamado no `onUpdate` | commit só no `onEnd` |
| FPS cai com muitos elementos | rebuild de `SkPath` por frame | `pathCache` por `id:version` |
| Pinch treme | câmera em `useState` | shared values + `useDerivedValue` |
| Traço "engrossa" ao ampliar | `strokeWidth` escalando com o `Group` | ou aceite (Excalidraw aceita), ou divida por `zoom` |
| Memória crescendo | paths antigos no cache | limpar chaves do mesmo `id` ao inserir nova versão |
| Grade cara em zoom baixo | milhares de `<Circle>` | `DashPathEffect` numa grade de linhas, ou pular render abaixo de `zoom < 0.45` |

Culling: com câmera muito afastada, filtre elementos fora da viewport antes de montar o
`Picture` (`bounds(el)` × retângulo visível em coordenadas de cena).

---

## 16. Plano de construção (26 passos)

Cada passo é entregável e testável isoladamente.

1. **Setup.** Projeto rodando **no Expo Go** com Skia + Reanimated + GH. Tela com um `<Circle>`. Rode `npx expo install --check` antes de seguir: versão fora de sincronia com o cliente é a causa nº 1 de tela branca.
2. **Câmera.** Shared values + `<Group transform>`. Pan de 2 dedos e pinch sobre um retângulo fixo.
3. **Store.** `useBoardStore` com `elements`, `tool`, `selectedIds`, `style`. Sem UI ainda.
4. **Traço livre.** `drawPan` → `draft` shared value → `DraftLayer` liso. `onEnd` empurra pro store.
5. **Rough.** Porte `rough.ts` gerando **path data SVG**, não `SkPath` direto. Compare com o HTML lado a lado.
6. **Formas.** `rect`, `ellipse`, `diamond`, `line`, `arrow` (com ponta). Elipse em 4 cúbicas. Normalize `w/h` ao soltar.
7. **Cantos arredondados.** `corners()` + `cornerRadius()`. Aplique no traço e no `clipPath`. Teste com retângulo achatado — é onde o `min(r, d/2)` prova que serve.
8. **Estilos.** Cor de traço, cor de fundo, espessura, tipo de linha, opacidade, bordas.
9. **Preenchimento.** Hachura, malha, sólido com `clip`. É o passo mais chato — isole.
10. **Dock + StylePanel.** UI de verdade, blur, safe area, haptics, popover de formas.
11. **Seleção.** `hitTest.ts` com `pick()` em duas passadas (preciso, depois interior vazio), tap para selecionar, bbox desenhado, barra de seleção flutuante.
12. **Mover.** Pan de 1 dedo sobre elemento selecionado, com snapshot no `onBegin`.
13. **Redimensionar.** 8 handles, escala de `points`/`w,h`, hitbox de 22pt contra 11pt de visual.
14. **Texto livre.** `TextOverlay` + `useFonts` + Paragraph. Duplo toque para editar.
15. **Rótulo ancorado — layout.** `INNER`, `LABEL_PAD`, `buildLabelParagraph`, `relayoutLabel`. Sem UI: teste com dados fixos e confira que a forma cresce.
16. **Rótulo ancorado — edição.** `TextInput` centralizado, `editingLabelId`, relayout a cada tecla, deslocamento da câmera pelo teclado.
17. **Rótulo ancorado — entradas.** Duplo toque, ferramenta Texto sobre forma, botão na barra de seleção. `filled = bg !== transparent || !!text` no hit-test.
18. **Alças de elemento linear.** `linearHandles()` substituindo a caixa de 8 alças. Ponto médio inserindo vértice. Índice **bruto**, não resolvido.
19. **Ancoragem.** `insideShape`, `focusFrom`/`focusTarget`, `bindPoint` por bissecção, `resolvedPoints`. Ancorar ao desenhar e ao arrastar a ponta; desprender pelo mesmo arrasto com histerese; realce da forma candidata. **Teste explícito:** arrastar uma ponta já ancorada tem que deslizar o encosto pela borda — se ela ficar parada, o foco não está entrando no cálculo.
20. **Tipos de seta.** `curved` (Paragraph do `smooth` com jitter por passada) e `elbow` (`elbowRoute` + cantos de raio 14). Segmented control no painel.
21. **Ciclo de vida do binding.** `dropBindings` em todos os caminhos de remoção; remapeamento ao duplicar; migração de cenas antigas.
22. **Copiar/colar/duplicar.** `buildSVG` parametrizável por lista, payload no comentário, `cloneGroup` com os três casos de remapeamento, posicionamento do colado. Abrir `.svg` além de `.json`.
23. **Assistente.** Rota de API com a chave no servidor, DSL de linhas, `autoLayout`, `applyOps`, chips de alvo, `commit()` único. **Testes de aceite:** (a) gerar um fluxograma de 4 caixas e desfazer com um único undo; (b) cortar a resposta na metade e conferir que as linhas completas ainda se aplicam; (c) pedir "adicione uma etapa" num diagrama existente e conferir que o novo nó não sobrepõe nada; (d) gerar um fluxo com dois losangos de decisão e conferir que cada par de setas irmãs sai de **pontos distintos** da borda e não compartilha o trecho do cotovelo.
24. **Undo/redo.** `history.ts` + botões. Teste: 30 ações, 30 undos, 30 redos.
25. **Borracha + marquee.** Borracha por arrasto; marquee de seleção múltipla no espaço vazio.
26. **Exportar + IO.** PNG, SVG, PDF (valide com `qpdf --check` antes de confiar no visual). Autosave MMKV, salvar/abrir `.json`, share sheet. Teste round-trip HTML ↔ app.

Sugestão de corte para um MVP em uma sprint: passos 1–10 + 22 + PNG. Seleção, redimensionamento,
rótulo ancorado e binding são onde mora a complexidade real.

Dois passos concentram o risco:

- **15** é onde o layout deixa de ser derivável no render e vira estado. É fácil criar loop
  infinito (relayout → muda `h` → dispara efeito → relayout). Faça `relayoutLabel` devolver o
  mesmo objeto quando nada mudou, e compare por referência.
- **19** introduz a dependência `arrow → shape` no cálculo de `bounds`. Se a memoização do
  `pathCache` usar só `el.version` da seta, a seta **não redesenha** quando a forma ancorada
  se move. A chave tem que incluir a versão dos alvos:
  `${el.id}:${el.version}:${startTarget?.version}:${endTarget?.version}`.

## 17. Diferenças em relação ao protótipo

| Protótipo (HTML) | React Native |
|---|---|
| path data SVG (string) | path data SVG (string) — **igual**, é a fonte única |
| `new Path2D(d)` | `Skia.Path.MakeFromSVGString(d)` |
| quebra de linha manual com `measureText` | `ParagraphBuilder` + `para.layout(maxW)` |
| layout do rótulo calculado no render | `relayoutLabel` como ação do store |
| `resolvedPoints` chamado a cada frame | memoizado por versão da seta **e dos alvos ancorados** |
| `ctx.clip(path)` | `<Group clip={path}>` |
| `ctx.setLineDash` | `<DashPathEffect intervals={[...]}/>` |
| `requestAnimationFrame` + flag `dirty` | React reconciliation + shared values |
| Pointer Events + `Map` de ponteiros | `Gesture.Simultaneous/Exclusive` |
| `<textarea>` absoluto | `<TextInput>` absoluto |
| `canvas.toDataURL()` | `makeImageSnapshot().encodeToBase64()` |
| `Blob` + `<a download>` | `FileSystem.writeAsStringAsync` + `Sharing.shareAsync` |
| menu `<div>` de exportação | `ActionSheetIOS` nativo |
| `Ctrl+C` / evento `copy` | botão na barra de seleção + `expo-clipboard` |
| `navigator.clipboard.writeText` | `Clipboard.setStringAsync` |
| Fonte do sistema por nome | `.ttf` embarcado via `useTypeface` |
| Estado em objeto `S` global | zustand (documento) + shared values (câmera/rascunho) |

Quatro coisas que **não** mudam e por isso o porte é viável: o formato do `Element`, o
algoritmo `mulberry32 + roughSeg`, a regra de que `points` são relativos a `(x, y)`, e o path
data SVG como representação intermediária. Os geradores de SVG e PDF são código puro de
string — copie do protótipo sem tocar.

---

## 18. Pontos em aberto

Decisões que valem definir antes do passo 10, porque afetam o modelo:

- **Rotação de elementos.** Não está no protótipo. Se for entrar, adicione `angle: number` ao
  `Element` agora e aplique `canvas.rotate` no desenho — retrofitar depois obriga a migrar cenas.
  Cuidado: rótulo ancorado + rotação exige rotacionar o `<Paragraph>` junto e ajustar o hit-test.
- **Rótulo encolher o contêiner.** Hoje a forma só cresce. Se quiser que ela encolha ao apagar
  texto, guarde a altura definida manualmente pelo usuário (`userH`) e use
  `h = max(userH, needH)` — sem isso, encolher desfaz um redimensionamento intencional.
- **Rótulo em setas e linhas.** O Excalidraw ancora texto no meio de uma seta. Requer um ponto
  de ancoragem paramétrico (t ao longo do path) em vez do centro do bbox.
- **Foco preservado ao redimensionar.** `fx`/`fy` são normalizados sobre os semi-eixos, então
  esticar a forma move o encosto proporcionalmente. Se você quiser que ele grude numa distância
  fixa da quina (comportamento de ferramenta de diagrama), o foco teria que ser em pixels a
  partir do lado mais próximo.
- **Ponta de seta configurável.** Só existe a ponta triangular. Se for entrar `dot`, `bar`,
  `triangle` cheio ou ponta no início, coloque `startArrowhead`/`endArrowhead` no modelo agora —
  são dois campos que não custam nada e evitam migração.
- **Cotovelo que desvia de obstáculos.** A rota em Z atravessa formas no meio do caminho. Um
  roteador A* em grade resolve, mas é caro no toque e precisa recalcular ao mover qualquer
  forma. Meça se incomoda antes de investir.
- **Quando sair do Expo Go.** Nada na stack obriga a sair, mas três coisas ficam melhores num
  dev build: MMKV no lugar do kv-store (marginal), medição real de performance, e liberdade para
  config plugins caso entre algo como `expo-dev-menu` customizado ou uma fonte via plugin. Faça
  o dev build quando a performance passar a ser pauta, não antes.
- **Seta ancorada em seta.** `BINDABLE` exclui elementos lineares justamente para evitar
  recursão em `bounds`. Permitir exige detecção de ciclo.
- **Fonte embarcada no PDF.** Hoje o texto sai em Helvetica. Embutir a manuscrita exige subset
  do `.ttf` e objetos `FontFile2`/`CIDFontType2`, ou converter texto em contornos com
  `opentype.js`. Decida se a fidelidade tipográfica do PDF é requisito antes do passo 19.
- **Setas ancoradas.** Excalidraw liga seta a shape (`startBinding`/`endBinding`) e reposiciona
  ao mover. Custa caro; decida se entra no v1.
- **Agrupamento.** `groupIds: string[]` no elemento. Se não entrar agora, o campo pode ser
  adicionado depois sem quebrar o schema (ausente = sem grupo).
- **Colaboração.** Se houver chance de multi-usuário, o snapshot de undo não escala — o modelo
  teria que virar CRDT (Yjs). Vale saber antes de escrever o `history.ts`.
- **Zoom de traço.** Definir se `strokeWidth` é em unidades de cena (engrossa ao ampliar, como
  no protótipo) ou em pontos de tela (constante). Muda a percepção de "caneta".
