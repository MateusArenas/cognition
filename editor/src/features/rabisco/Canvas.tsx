import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, Pressable, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import {
  AlphaType, Canvas as SkiaCanvas, ColorType, DashPathEffect, Group, Path, Text as SkiaText, matchFont,
  type CanvasRef, type SkImage,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedReaction, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import {
  bindingAt, bounds, boundsOfSelection, dashPattern, elementGeometry, hitTest, normalizeElement,
  pickBindable, resolvedPoints, rotateElementAround, toElementLocal, LABELABLE, LINEAR, ROTATABLE,
} from '@/domain/rabisco/geom';
import { newElement, FONT_FAMILIES } from '@/domain/rabisco/palette';
import { uid } from '@/domain/id';
import type { RabiscoBinding, RabiscoElement } from '@/domain/types';
import type { ShapeKind, Tool } from './Dock';

export type Background = 'none' | 'grid' | 'dots';

// Conta-gotas do ColorPicker: como ele vive num Modal (janela nativa separada, por cima de
// tudo), a superfície de toque que amostra pixel fica no ColorPicker mesmo, não aqui — mas SÓ
// o Canvas sabe tirar um snapshot de si mesmo e ler pixel dele. Esse handle imperativo é a
// ponte: `beginColorSample` tira UM snapshot (congelado — não precisa acompanhar o desenho
// mudando, é só pra escolher uma cor) e guarda a posição da janela; `sampleColorAt` lê um
// pixel dele por coordenada de TELA (janela); `endColorSample` libera o snapshot.
export interface RabiscoCanvasHandle {
  beginColorSample: () => void;
  sampleColorAt: (pageX: number, pageY: number) => { hex: string; localX: number; localY: number } | null;
  endColorSample: () => void;
  getSampleImage: () => SkImage | null;
  getSize: () => { w: number; h: number };
}

interface Props {
  ref?: React.Ref<RabiscoCanvasHandle>;
  elements: RabiscoElement[];
  tool: Tool;
  shapeKind: ShapeKind;
  strokeColor: string;
  strokeWidth: number;
  selectedIds: string[];
  additive: boolean;
  background: Background;
  onSelect: (id: string | null) => void;
  onSelectMany: (ids: string[]) => void;
  onCommitElement: (element: Omit<RabiscoElement, 'id'> & { id?: string }) => void;
  onShapeCreated: (id: string) => void;
  onMoveElement: (id: string, dx: number, dy: number) => void;
  onMoveMultiple: (ids: string[], dx: number, dy: number) => void;
  onResizeElement: (id: string, box: { x: number; y: number; w: number; h: number }) => void;
  onRotateElement: (id: string, rotation: number) => void;
  onRotateGroup: (ids: string[], center: { x: number; y: number }, delta: number) => void;
  onSetBinding: (id: string, which: 'start' | 'end', binding: RabiscoBinding | null, point: [number, number]) => void;
  onErase: (id: string) => void;
  onRequestTextEdit: (id: string) => void;
}

// Área fixa do fundo (grade/pontos) em torno da origem — pano de fundo, não conteúdo real, não
// precisa cobrir um scene infinito; um quadro comum de rabisco não anda tão longe assim. Um
// `Path` só (não um por linha/ponto) mantém o custo de desenho baixo mesmo com centenas deles.
const BG_AREA = 1400;
const BG_STEP = 40;
function backgroundPathFor(kind: Background): string {
  if (kind === 'none') return '';
  const parts: string[] = [];
  for (let v = -BG_AREA; v <= BG_AREA; v += BG_STEP) {
    if (kind === 'grid') {
      parts.push(`M${-BG_AREA} ${v}L${BG_AREA} ${v}`);
      parts.push(`M${v} ${-BG_AREA}L${v} ${BG_AREA}`);
    } else {
      for (let h = -BG_AREA; h <= BG_AREA; h += BG_STEP) {
        parts.push(`M${h - 1} ${v}L${h + 1} ${v}`);
      }
    }
  }
  return parts.join('');
}

type HandleKey = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';
type DragState =
  | { kind: 'move'; id: string; dx: number; dy: number }
  // `box` é a caixa ORIGINAL, capturada uma vez no início do gesto — nunca sobrescrita. O
  // preview/commit sempre recalcula `applyResize(box, handle, dx, dy)` do zero a cada frame; se
  // `box` fosse trocado pelo resultado do frame anterior, `dx` (que já é o delta TOTAL desde o
  // início, não incremental) seria somado de novo em cima de um valor que já tinha esse mesmo
  // delta embutido — cresce a cada frame, não só com o arrasto (bug real, não só de tolerância).
  | { kind: 'resize'; id: string; handle: HandleKey; box: { x: number; y: number; w: number; h: number }; dx: number; dy: number }
  | { kind: 'endpoint'; id: string; index: number; point: [number, number] }
  // `center`/`startAngle` são capturados uma vez no início (mesma lógica de "nunca reescrever
  // a base" do resize) — a cada frame recalcula o ângulo ATUAL do dedo até o centro e soma a
  // DIFERENÇA em cima de `startRotation`, nunca incremental.
  | { kind: 'rotate'; id: string; center: { x: number; y: number }; startAngle: number; startRotation: number; rotation: number }
  // Mover VÁRIOS de uma vez — mesma ideia do `move` único, mas guarda a lista inteira de ids do
  // grupo (capturada uma vez no início, a seleção não muda no meio de um arrasto).
  | { kind: 'move-multi'; ids: string[]; dx: number; dy: number }
  // Girar VÁRIOS de uma vez, em torno do centro da SELEÇÃO (não do próprio centro de cada um) —
  // "seguem a orientação do quadrado de seleção", pedido do usuário. `center`/`startAngle`
  // imutáveis desde o início do gesto (mesma disciplina do `rotate` único); `delta` é sempre a
  // diferença fresca em relação a `startAngle`, nunca incremental.
  | { kind: 'rotate-group'; ids: string[]; center: { x: number; y: number }; startAngle: number; delta: number }
  // Retângulo de seleção (arrastar no fundo, sem tocar em elemento nenhum) — `start` nunca muda
  // durante o gesto, só `current` anda com o dedo; a lista de elementos "dentro" é recalculada
  // do zero a cada frame a partir dos dois (nunca incremental, mesma disciplina dos outros).
  | { kind: 'marquee'; start: { x: number; y: number }; current: { x: number; y: number } }
  | null;

const HANDLE_TOL_PX = 32;
// Distância das alças até a borda real do elemento — px de TELA, igual ao pad usado pra
// desenhar (SelectionOverlay). Mantida igual nos dois lugares de propósito: se o dedo vê a
// bolinha num lugar, o toque tem que ser detectado exatamente ali, não perto da borda do
// elemento (perto demais, as 8 alças ficam coladas umas nas outras e o toque agarra a errada).
const HANDLE_PAD_PX = 14;
// Alça de rotação — "bola acima, numa área generosa" (pedido do usuário, igual Excalidraw):
// bem mais longe da caixa que as alças de resize (48px vs 14px de folga) e com um raio de
// toque maior (28px vs 32px de tolerância dividida entre 8 alças coladas), pra não brigar com
// a seleção nem com as alças de resize mais próximas.
const ROTATE_HANDLE_OFFSET_PX = 48;
const ROTATE_HANDLE_TOL_PX = 36;
// Imã suave pros ângulos "redondos" (0/15/30/45°...) — mesma ideia do Excalidraw: perto de um
// múltiplo de 15°, gruda nele; longe, segue o dedo direto.
function snapRotation(rad: number): number {
  const deg = (rad * 180) / Math.PI;
  const nearest = Math.round(deg / 15) * 15;
  return Math.abs(deg - nearest) < 4 ? (nearest * Math.PI) / 180 : rad;
}

function paddedBox(g: { x: number; y: number; w: number; h: number }, pad: number) {
  return { x: g.x - pad, y: g.y - pad, w: g.w + pad * 2, h: g.h + pad * 2 };
}

function handlePoints(g: { x: number; y: number; w: number; h: number }): { k: HandleKey; x: number; y: number }[] {
  const mx = g.x + g.w / 2, my = g.y + g.h / 2;
  return [
    { k: 'nw', x: g.x, y: g.y }, { k: 'n', x: mx, y: g.y }, { k: 'ne', x: g.x + g.w, y: g.y },
    { k: 'w', x: g.x, y: my }, { k: 'e', x: g.x + g.w, y: my },
    { k: 'sw', x: g.x, y: g.y + g.h }, { k: 's', x: mx, y: g.y + g.h }, { k: 'se', x: g.x + g.w, y: g.y + g.h },
  ];
}
function applyResize(box: { x: number; y: number; w: number; h: number }, handle: HandleKey, dx: number, dy: number) {
  let { x, y, w, h } = box;
  if (handle.includes('n')) { y += dy; h -= dy; }
  if (handle.includes('s')) h += dy;
  if (handle.includes('w')) { x += dx; w -= dx; }
  if (handle.includes('e')) w += dx;
  return { x, y, w, h };
}

// Câmera vive em useSharedValue, nunca useState — se ela estivesse em state, o pinch trepidaria
// (lição direta do spec de referência). O <Group transform> do Skia observa SharedValue direto,
// sem re-render React durante o gesto. O RESTO da interação (criar forma, selecionar, mover,
// redimensionar, ligar seta) roda em estado React local mesmo — cada `onUpdate` chama
// `runOnJS` pra atualizar esse estado; não é o caminho mais performático possível, mas é o mais
// simples de manter correto, e o volume de elementos aqui é pequeno.
// Ids de todo mundo "juntado" (mesmo `groupId`) com `id` — ou só `[id]` se ele não faz parte de
// grupo nenhum. Elemento agrupado é tratado como um bloco único no toque: selecionar/mover/
// duplicar um membro afeta o grupo inteiro (ver `selectStart`).
function groupMembers(id: string, elements: RabiscoElement[]): string[] {
  const el = elements.find((e) => e.id === id);
  if (!el || !el.groupId) return [id];
  return elements.filter((e) => e.groupId === el.groupId).map((e) => e.id);
}

export function RabiscoCanvas({
  ref, elements, tool, shapeKind, strokeColor, strokeWidth, selectedIds, additive, background,
  onSelect, onSelectMany, onCommitElement, onShapeCreated, onMoveElement, onMoveMultiple, onResizeElement, onRotateElement, onRotateGroup, onSetBinding, onErase, onRequestTextEdit,
}: Props) {
  // Só as alças de resize/rotação/endpoint precisam de UM alvo — com seleção múltipla elas
  // somem (ver render), então tudo que já existia aqui embaixo continua olhando pra este
  // `selectedId` derivado, sem precisar saber que a seleção agora pode ter mais de um id.
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const { colors, radius, scheme } = useTheme();
  const backgroundPath = useMemo(() => backgroundPathFor(background), [background]);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const outerViewRef = useRef<View>(null);
  const winPos = useRef({ x: 0, y: 0 });
  const skCanvasRef = useRef<CanvasRef>(null);
  const sampleImageRef = useRef<SkImage | null>(null);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const scale = useSharedValue(1);
  const toolRef = useSharedValue<Tool>(tool);
  useEffect(() => { toolRef.value = tool; }, [tool, toolRef]);

  // Conta-gotas (ColorPicker) — ver comentário do `RabiscoCanvasHandle` acima.
  useImperativeHandle(ref, () => ({
    beginColorSample() {
      sampleImageRef.current = skCanvasRef.current?.makeImageSnapshot() ?? null;
      outerViewRef.current?.measureInWindow((x, y) => { winPos.current = { x, y }; });
    },
    sampleColorAt(pageX, pageY) {
      const img = sampleImageRef.current;
      if (!img) return null;
      const localX = pageX - winPos.current.x;
      const localY = pageY - winPos.current.y;
      if (localX < 0 || localY < 0 || localX > viewSize.w || localY > viewSize.h) return null;
      const ratio = PixelRatio.get();
      const px = Math.min(img.width() - 1, Math.max(0, Math.round(localX * ratio)));
      const py = Math.min(img.height() - 1, Math.max(0, Math.round(localY * ratio)));
      const data = img.readPixels(px, py, { width: 1, height: 1, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }) as Uint8Array | null;
      if (!data || data.length < 3) return null;
      const hex = `#${[data[0], data[1], data[2]].map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0')).join('')}`;
      return { hex, localX, localY };
    },
    endColorSample() {
      sampleImageRef.current = null;
    },
    getSampleImage: () => sampleImageRef.current,
    getSize: () => viewSize,
  }));

  // Espelho em estado React do zoom, só pro tamanho das alças/padding de SelectionOverlay —
  // ler `scale.value` direto durante o render (fora de worklet) dispara o aviso de "strict
  // mode" do Reanimated. `useAnimatedReaction` observa a SharedValue no lado UI e só cruza pra
  // JS quando o valor muda de verdade, sem re-render a cada frame de pan/pinça.
  const [zoomState, setZoomState] = useState(1);
  useAnimatedReaction(
    () => scale.value,
    (cur, prev) => { if (cur !== prev) runOnJS(setZoomState)(cur); },
  );

  // Traço livre em progresso — estado local, fora do useDoc (ver Etapa R1 / docs/16-rabisco.md).
  const [draftPoints, setDraftPoints] = useState<[number, number][] | null>(null);
  const draftOrigin = useRef<{ x: number; y: number } | null>(null);
  const lastPoint = useRef<[number, number] | null>(null);

  // Forma/linha/seta em progresso (arrasto de criação) — mesma ideia do traço, mas guarda o
  // elemento inteiro (cresce w/h, ou points[1], a cada frame).
  const [shapeDraft, setShapeDraft] = useState<RabiscoElement | null>(null);
  const shapeDraftRef = useRef<RabiscoElement | null>(null);

  const [drag, setDrag] = useState<DragState>(null);
  const dragRef = useRef<DragState>(null);
  const moveStart = useRef<{ x: number; y: number } | null>(null);
  const gestureMoved = useRef(false);

  // Forma candidata a receber a ponta de seta/linha que está sendo arrastada — desenhado como
  // destaque ao redor dela (SelectionOverlay não, é sobreposição própria, ver render). Porte de
  // `S.bindHint` (whiteboard-ios.html:1239-1251): sem isso, ligar uma seta numa forma era um
  // gesto "às cegas", sem noção de que vai colar até soltar o dedo.
  const [bindHint, setBindHint] = useState<string | null>(null);

  function toScene(x: number, y: number) {
    'worklet';
    return { x: (x - offsetX.value) / scale.value, y: (y - offsetY.value) / scale.value };
  }

  // ---- caneta (traço livre) ----
  function beginStroke(x: number, y: number) {
    const p = toScene(x, y);
    draftOrigin.current = p;
    lastPoint.current = [0, 0];
    setDraftPoints([[0, 0]]);
  }
  function extendStroke(x: number, y: number) {
    if (!draftOrigin.current) return;
    const p = toScene(x, y);
    const rp: [number, number] = [p.x - draftOrigin.current.x, p.y - draftOrigin.current.y];
    const lp = lastPoint.current;
    if (lp && Math.hypot(rp[0] - lp[0], rp[1] - lp[1]) <= 1.6 / scale.value) return;
    lastPoint.current = rp;
    setDraftPoints((pts) => (pts ? [...pts, rp] : [rp]));
  }
  function endStroke() {
    if (draftOrigin.current && draftPoints && draftPoints.length) {
      onCommitElement({ ...newElement('draw', draftOrigin.current.x, draftOrigin.current.y, strokeColor), points: draftPoints, strokeWidth });
    }
    draftOrigin.current = null;
    lastPoint.current = null;
    setDraftPoints(null);
  }

  // ---- borracha ----
  // Rastro puramente visual (não vira elemento, não entra no histórico de undo) — só pra
  // mostrar por onde o dedo passou enquanto apaga; some quando o gesto termina.
  const [eraseTrail, setEraseTrail] = useState<{ x: number; y: number }[] | null>(null);
  function eraseAt(x: number, y: number) {
    const p = toScene(x, y);
    const hit = hitTest(elements, p, scale.value);
    if (hit) onErase(hit.id);
    setEraseTrail((pts) => (pts ? [...pts, p] : [p]));
  }
  function endErase() {
    setEraseTrail(null);
  }

  // ---- forma / linha / seta ----
  function beginShape(x: number, y: number) {
    const p = toScene(x, y);
    const el: RabiscoElement = { id: 'draft', ...newElement(shapeKind, p.x, p.y, strokeColor), strokeWidth };
    shapeDraftRef.current = el;
    setShapeDraft(el);
  }
  function extendShape(x: number, y: number) {
    if (!shapeDraftRef.current) return;
    const p = toScene(x, y);
    const el = shapeDraftRef.current;
    let next: RabiscoElement;
    if (el.points) {
      next = { ...el, points: [el.points[0], [p.x - el.x, p.y - el.y]] };
      const hint = LINEAR.has(el.type) ? pickBindable(p, elements, null, scale.value) : null;
      setBindHint(hint ? hint.id : null);
    } else next = { ...el, w: p.x - el.x, h: p.y - el.y };
    shapeDraftRef.current = next;
    setShapeDraft(next);
  }
  function endShape() {
    const el = shapeDraftRef.current;
    shapeDraftRef.current = null;
    setShapeDraft(null);
    setBindHint(null);
    if (!el) return;
    // Cria e já seleciona a forma/linha/seta, trocando pra ferramenta de seleção — igual ao
    // protótipo (whiteboard-ios.html:1510: "S.sel=[d.id]; setTool('select')"), pra poder ajustar
    // cor/preenchimento/tamanho na hora sem precisar trocar de ferramenta manualmente.
    const id = uid('el');
    if (el.points) {
      // Linha/seta pequena demais (toque parado) não vira elemento — evita setas de 0px.
      const [p0, p1] = el.points;
      if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 4) return;
      let startBinding: RabiscoBinding | null = null, endBinding: RabiscoBinding | null = null;
      const sceneStart = { x: el.x + p0[0], y: el.y + p0[1] };
      const sceneEnd = { x: el.x + p1[0], y: el.y + p1[1] };
      const st = pickBindable(sceneStart, elements, null, scale.value);
      if (st) startBinding = bindingAt(st, sceneStart, elements);
      const en = pickBindable(sceneEnd, elements, st?.id || null, scale.value);
      if (en) endBinding = bindingAt(en, sceneEnd, elements);
      const { id: _drop, ...rest } = el;
      onCommitElement({ ...rest, id, startBinding, endBinding });
    } else {
      if (Math.abs(el.w) < 4 && Math.abs(el.h) < 4) return;
      const { id: _drop, ...rest } = normalizeElement(el);
      onCommitElement({ ...rest, id });
    }
    onShapeCreated(id);
  }

  // ---- texto ----
  // Cria e já abre o editor na hora — sem isso, tocar com a ferramenta de texto só criava um
  // elemento vazio e invisível, sem jeito nenhum de digitar nele (por isso "não funcionava").
  function placeText(x: number, y: number) {
    const p = toScene(x, y);
    const id = uid('el');
    onCommitElement({ ...newElement('text', p.x, p.y, strokeColor), w: 120, h: 28, id });
    onSelect(id);
    onRequestTextEdit(id);
  }

  // ---- seleção: mover / redimensionar / endpoint ----
  function selectStart(x: number, y: number) {
    const p = toScene(x, y);
    const tol = HANDLE_TOL_PX / scale.value;
    moveStart.current = p;
    gestureMoved.current = false;

    // Alça de rotação do GRUPO — só existe com mais de um selecionado, gira todo mundo em
    // volta do centro da SELEÇÃO (não do próprio centro de cada um), ver `DragState.rotate-group`.
    if (selectedIds.length > 1) {
      const gb = boundsOfSelection(elements.filter((e) => selectedIds.includes(e.id)), elements);
      if (gb) {
        const padded = paddedBox(gb, HANDLE_PAD_PX / scale.value);
        const rotHandle = { x: padded.x + padded.w / 2, y: padded.y - ROTATE_HANDLE_OFFSET_PX / scale.value };
        if (Math.hypot(p.x - rotHandle.x, p.y - rotHandle.y) < ROTATE_HANDLE_TOL_PX / scale.value) {
          const center = { x: gb.x + gb.w / 2, y: gb.y + gb.h / 2 };
          const startAngle = Math.atan2(p.y - center.y, p.x - center.x);
          const s: DragState = { kind: 'rotate-group', ids: selectedIds, center, startAngle, delta: 0 };
          dragRef.current = s; setDrag(s); return;
        }
      }
    }

    if (selectedId) {
      const el = elements.find((e) => e.id === selectedId);
      if (el) {
        if (LINEAR.has(el.type) && el.points) {
          const pts = resolvedPoints(el, elements)!;
          const iStart = 0, iEnd = el.points.length - 1;
          const dStart = Math.hypot(p.x - pts[0][0], p.y - pts[0][1]);
          const dEnd = Math.hypot(p.x - pts[pts.length - 1][0], p.y - pts[pts.length - 1][1]);
          if (dStart < tol || dEnd < tol) {
            const index = dStart <= dEnd ? iStart : iEnd;
            const point = dStart <= dEnd ? pts[0] : pts[pts.length - 1];
            const s: DragState = { kind: 'endpoint', id: el.id, index, point };
            dragRef.current = s; setDrag(s); return;
          }
        } else {
          const box = bounds(el, elements);
          // Ponto de toque convertido pro referencial LOCAL da forma — identidade se ela não
          // gira (`toElementLocal` só faz algo pra `ROTATABLE`), então não muda nada pra
          // linha/traço/forma sem rotação; é o que permite as alças de rotação E de resize
          // comparáveis contra posições NÃO rotacionadas mesmo numa forma girada.
          const lp = toElementLocal(el, p, elements);
          // Alça de rotação primeiro — fica LONGE da caixa (fora da faixa dos handles de
          // resize), então checar nela primeiro nunca rouba um toque que era pra ser resize.
          if (ROTATABLE.has(el.type)) {
            const padded = paddedBox(box, HANDLE_PAD_PX / scale.value);
            const rotHandle = { x: padded.x + padded.w / 2, y: padded.y - ROTATE_HANDLE_OFFSET_PX / scale.value };
            if (Math.hypot(lp.x - rotHandle.x, lp.y - rotHandle.y) < ROTATE_HANDLE_TOL_PX / scale.value) {
              const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
              const startAngle = Math.atan2(p.y - center.y, p.x - center.x);
              const s: DragState = { kind: 'rotate', id: el.id, center, startAngle, startRotation: el.rotation, rotation: el.rotation };
              dragRef.current = s; setDrag(s); return;
            }
          }
          // Resize funciona com a forma girada também (texto incluído — bug real reportado: uma
          // forma girada ficava impossível de redimensionar até desgirar). Compara `lp` (já no
          // referencial local) com as alças em espaço NÃO rotacionado; `selectUpdate` faz a
          // mesma conversão pro delta do arrasto, então `applyResize` nunca precisa saber que a
          // forma está girada.
          // Alça mais PERTO do toque, não a primeira que caber na tolerância — perto de um
          // canto, "n" e "nw" podem caber os dois; sem isso o toque agarra a errada e o arrasto
          // redimensiona na direção contrária ao que a pessoa pediu.
          {
            let best: { k: HandleKey; x: number; y: number } | null = null, bestD = Infinity;
            for (const h of handlePoints(paddedBox(box, HANDLE_PAD_PX / scale.value))) {
              const d = Math.hypot(lp.x - h.x, lp.y - h.y);
              if (d < tol && d < bestD) { best = h; bestD = d; }
            }
            if (best) {
              const s: DragState = { kind: 'resize', id: el.id, handle: best.k, box, dx: 0, dy: 0 };
              dragRef.current = s; setDrag(s); return;
            }
          }
        }
      }
    }

    const hit = hitTest(elements, p, scale.value);
    if (hit) {
      const members = groupMembers(hit.id, elements);
      if (members.length > 1) {
        // Elemento "juntado" (botão de agrupar) — tratado como um bloco só: toque normal
        // seleciona/arrasta o grupo inteiro; aditivo alterna o grupo inteiro dentro/fora.
        if (additive) {
          const allIn = members.every((id) => selectedIds.includes(id));
          const next = allIn ? selectedIds.filter((id) => !members.includes(id)) : Array.from(new Set([...selectedIds, ...members]));
          onSelectMany(next);
          dragRef.current = null; setDrag(null);
        } else {
          onSelectMany(members);
          const s: DragState = { kind: 'move-multi', ids: members, dx: 0, dy: 0 };
          dragRef.current = s; setDrag(s);
        }
      } else if (selectedIds.length > 1 && selectedIds.includes(hit.id)) {
        // Tocou em cima de um elemento que já faz parte de um grupo selecionado — arrasta o
        // grupo inteiro, não troca a seleção pra um só (é isso que o Excalidraw faz).
        const s: DragState = { kind: 'move-multi', ids: selectedIds, dx: 0, dy: 0 };
        dragRef.current = s; setDrag(s);
      } else if (additive) {
        // Botão "shift" ligado: alterna esse id dentro/fora da seleção atual, mescla — nunca
        // troca. Só seleciona (não já arrasta) pra não mover o grupo à toa por causa de um toque
        // que era só "adiciona este também".
        const next = selectedIds.includes(hit.id) ? selectedIds.filter((id) => id !== hit.id) : [...selectedIds, hit.id];
        onSelectMany(next);
        dragRef.current = null; setDrag(null);
      } else {
        onSelect(hit.id);
        const s: DragState = { kind: 'move', id: hit.id, dx: 0, dy: 0 };
        dragRef.current = s; setDrag(s);
      }
    } else {
      // Fundo vazio: não decide select/desseleciona ainda — só se o gesto ficar parado
      // (`selectEnd` cuida disso). Se o dedo arrastar a partir daqui, vira seleção por
      // retângulo (marquee), então já guarda o estado de arrasto certo desde já.
      const s: DragState = { kind: 'marquee', start: p, current: p };
      dragRef.current = s; setDrag(s);
    }
  }
  function selectUpdate(x: number, y: number) {
    if (!moveStart.current || !dragRef.current) return;
    gestureMoved.current = true;
    const p = toScene(x, y);
    const dx = p.x - moveStart.current.x, dy = p.y - moveStart.current.y;
    const cur = dragRef.current;
    if (cur.kind === 'move') {
      const s: DragState = { ...cur, dx, dy };
      dragRef.current = s; setDrag(s);
    } else if (cur.kind === 'resize') {
      // Delta convertido pro referencial LOCAL da forma (identidade se ela não gira) — não pro
      // delta bruto de tela, senão arrastar "pra direita" na TELA distorceria uma forma girada
      // numa direção que não é a dela. `applyResize` só entende delta local mesmo.
      const el = elements.find((e) => e.id === cur.id)!;
      const lp = toElementLocal(el, p, elements);
      const lStart = toElementLocal(el, moveStart.current, elements);
      const s: DragState = { ...cur, dx: lp.x - lStart.x, dy: lp.y - lStart.y };
      dragRef.current = s; setDrag(s);
    } else if (cur.kind === 'endpoint') {
      // Sempre recomputado a partir do ponto ORIGINAL (armazenado no doc, que não muda
      // durante o arrasto local) + delta do início do gesto — nunca incremental, pra não
      // acumular deriva entre frames.
      const el = elements.find((e) => e.id === cur.id)!;
      const raw = el.points![cur.index];
      const base: [number, number] = [el.x + raw[0], el.y + raw[1]];
      const point: [number, number] = [base[0] + dx, base[1] + dy];
      const s: DragState = { ...cur, point };
      dragRef.current = s; setDrag(s);
      const currentId = (cur.index === 0 ? el.startBinding?.id : el.endBinding?.id) || null;
      const excludeId = (cur.index === 0 ? el.endBinding?.id : el.startBinding?.id) || null;
      const hint = pickBindable({ x: point[0], y: point[1] }, elements, excludeId, scale.value, currentId);
      setBindHint(hint ? hint.id : null);
    } else if (cur.kind === 'rotate') {
      const angle = Math.atan2(p.y - cur.center.y, p.x - cur.center.x);
      const rotation = snapRotation(cur.startRotation + (angle - cur.startAngle));
      const s: DragState = { ...cur, rotation };
      dragRef.current = s; setDrag(s);
    } else if (cur.kind === 'move-multi') {
      const s: DragState = { ...cur, dx, dy };
      dragRef.current = s; setDrag(s);
    } else if (cur.kind === 'marquee') {
      const s: DragState = { ...cur, current: p };
      dragRef.current = s; setDrag(s);
    } else if (cur.kind === 'rotate-group') {
      const angle = Math.atan2(p.y - cur.center.y, p.x - cur.center.x);
      const delta = snapRotation(angle - cur.startAngle);
      const s: DragState = { ...cur, delta };
      dragRef.current = s; setDrag(s);
    }
  }
  function selectEnd() {
    const cur = dragRef.current;
    dragRef.current = null; setDrag(null);
    moveStart.current = null;
    setBindHint(null);
    if (!cur) return;
    if (!gestureMoved.current) {
      // Toque sem arrasto só seleciona — nunca abre o editor de texto (isso é 2 toques ou o
      // botão "Editar" explícito, ver `doubleTapAt`/`RabiscoScreen`); um único toque que também
      // abrisse o editor tornava impossível só selecionar um texto pra, por exemplo, mudar cor.
      // Exceto o "marquee" parado: aí o toque foi mesmo no fundo vazio (nenhum elemento sob o
      // dedo), então limpa a seleção — a menos que o botão aditivo esteja ligado, onde um toque
      // perdido no fundo não deve derrubar o que já estava escolhido.
      if (cur.kind === 'marquee' && !additive) onSelect(null);
      return;
    }
    if (cur.kind === 'move') {
      if (Math.abs(cur.dx) > 0.5 || Math.abs(cur.dy) > 0.5) onMoveElement(cur.id, cur.dx, cur.dy);
    } else if (cur.kind === 'resize') {
      onResizeElement(cur.id, normalizeBox(applyResize(cur.box, cur.handle, cur.dx, cur.dy)));
    } else if (cur.kind === 'endpoint') {
      const el = elements.find((e) => e.id === cur.id);
      if (!el) return;
      const currentId = (cur.index === 0 ? el.startBinding?.id : el.endBinding?.id) || null;
      const excludeId = (cur.index === 0 ? el.endBinding?.id : el.startBinding?.id) || null;
      const target = pickBindable({ x: cur.point[0], y: cur.point[1] }, elements, excludeId, scale.value, currentId);
      const binding = target ? bindingAt(target, { x: cur.point[0], y: cur.point[1] }, elements) : null;
      onSetBinding(cur.id, cur.index === 0 ? 'start' : 'end', binding, cur.point);
    } else if (cur.kind === 'rotate') {
      onRotateElement(cur.id, cur.rotation);
    } else if (cur.kind === 'move-multi') {
      if (Math.abs(cur.dx) > 0.5 || Math.abs(cur.dy) > 0.5) onMoveMultiple(cur.ids, cur.dx, cur.dy);
    } else if (cur.kind === 'marquee') {
      const rect = normalizeBox({ x: cur.start.x, y: cur.start.y, w: cur.current.x - cur.start.x, h: cur.current.y - cur.start.y });
      const hitIds = elements.filter((el) => rectsOverlap(rect, bounds(el, elements))).map((el) => el.id);
      const next = additive ? Array.from(new Set([...selectedIds, ...hitIds])) : hitIds;
      onSelectMany(next);
    } else if (cur.kind === 'rotate-group') {
      if (Math.abs(cur.delta) > 0.001) onRotateGroup(cur.ids, cur.center, cur.delta);
    }
  }
  function normalizeBox(box: { x: number; y: number; w: number; h: number }) {
    let { x, y, w, h } = box;
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    return { x, y, w, h };
  }
  // Selecionado por SOBREPOR, não por conter inteiro — igual Excalidraw: encostar a borda do
  // retângulo num elemento já pega ele, não precisa envolver ele todo.
  function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }


  // Pan (translationX/Y) e Pinch (scale) chegam ACUMULADOS desde o início do gesto — cada
  // gesto guarda um snapshot "base" no onStart e calcula o valor absoluto no onUpdate.
  const panBaseX = useSharedValue(0);
  const panBaseY = useSharedValue(0);

  const panOne = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    // Sem isso, o Pan só ativa (chama onStart) depois de uns 10pt de arrasto — um toque parado
    // (selecionar, tocar um botão de texto) nunca dispara nada, e um arrasto de redimensionar
    // já começa com um "salto" de ~10pt não capturado, fazendo o elemento crescer mais do que
    // o dedo realmente andou.
    .minDistance(0)
    .onStart((e) => {
      'worklet';
      const t = toolRef.value;
      if (t === 'hand') { panBaseX.value = offsetX.value; panBaseY.value = offsetY.value; return; }
      if (t === 'draw') runOnJS(beginStroke)(e.x, e.y);
      else if (t === 'eraser') runOnJS(eraseAt)(e.x, e.y);
      else if (t === 'shape') runOnJS(beginShape)(e.x, e.y);
      else if (t === 'text') runOnJS(placeText)(e.x, e.y);
      else if (t === 'select') runOnJS(selectStart)(e.x, e.y);
    })
    .onUpdate((e) => {
      'worklet';
      const t = toolRef.value;
      if (t === 'hand') {
        offsetX.value = panBaseX.value + e.translationX;
        offsetY.value = panBaseY.value + e.translationY;
      } else if (t === 'draw') runOnJS(extendStroke)(e.x, e.y);
      else if (t === 'eraser') runOnJS(eraseAt)(e.x, e.y);
      else if (t === 'shape') runOnJS(extendShape)(e.x, e.y);
      else if (t === 'select') runOnJS(selectUpdate)(e.x, e.y);
    })
    .onEnd(() => {
      'worklet';
      const t = toolRef.value;
      if (t === 'draw') runOnJS(endStroke)();
      else if (t === 'shape') runOnJS(endShape)();
      else if (t === 'select') runOnJS(selectEnd)();
      else if (t === 'eraser') runOnJS(endErase)();
    });

  const panTwo = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .onStart(() => { 'worklet'; panBaseX.value = offsetX.value; panBaseY.value = offsetY.value; })
    .onUpdate((e) => {
      'worklet';
      offsetX.value = panBaseX.value + e.translationX;
      offsetY.value = panBaseY.value + e.translationY;
    });

  const pinchBaseScale = useSharedValue(1);
  const pinchBaseX = useSharedValue(0);
  const pinchBaseY = useSharedValue(0);
  const pinch = Gesture.Pinch()
    .onStart(() => { 'worklet'; pinchBaseScale.value = scale.value; pinchBaseX.value = offsetX.value; pinchBaseY.value = offsetY.value; })
    .onUpdate((e) => {
      'worklet';
      const next = Math.max(0.15, Math.min(6, pinchBaseScale.value * e.scale));
      offsetX.value = e.focalX - ((e.focalX - pinchBaseX.value) / pinchBaseScale.value) * next;
      offsetY.value = e.focalY - ((e.focalY - pinchBaseY.value) / pinchBaseScale.value) * next;
      scale.value = next;
    });

  // Botões de zoom — mesma matemática do pinch (zoom em torno de um ponto focal), só que o
  // ponto focal é o centro da área visível em vez de onde os dois dedos estão.
  function zoomBy(factor: number) {
    const cx = viewSize.w / 2, cy = viewSize.h / 2;
    const next = Math.max(0.15, Math.min(6, scale.value * factor));
    offsetX.value = cx - ((cx - offsetX.value) / scale.value) * next;
    offsetY.value = cy - ((cy - offsetY.value) / scale.value) * next;
    scale.value = next;
  }

  // Toque parado (sem arrastar nadinha) nunca ativa um Gesture.Pan — ele só reconhece a partir
  // de um evento de MOVIMENTO, então um toque matematicamente parado nunca dispara onStart,
  // mesmo com minDistance(0) (isso é o que fazia "ter que mover pra selecionar"). Um
  // Gesture.Tap() de verdade, à parte, é o jeito certo de reconhecer um toque parado.
  function tapAt(x: number, y: number) {
    const t = toolRef.value;
    if (t === 'select') { selectStart(x, y); selectEnd(); }
    else if (t === 'text') placeText(x, y);
    else if (t === 'eraser') { eraseAt(x, y); setTimeout(endErase, 150); }
  }
  // 2 toques abrem o editor de texto na hora — o outro jeito é o botão "Editar" explícito
  // (RabiscoScreen), quando um texto já está selecionado. Um toque só nunca abre editor nenhum
  // (ver `selectEnd`) — só seleciona, pra dar pra trocar cor/tamanho sem cair direto editando.
  // Em cima de uma FORMA (rect/diamond/ellipse, `LABELABLE`) abre o mesmo editor, mas o texto
  // vira um RÓTULO preso dentro dela (não um elemento `text` à parte) — pedido do usuário.
  function doubleTapAt(x: number, y: number) {
    if (toolRef.value !== 'select') return;
    const p = toScene(x, y);
    const hit = hitTest(elements, p, scale.value);
    if (!hit) return;
    onSelect(hit.id);
    if (hit.type === 'text' || LABELABLE.has(hit.type)) onRequestTextEdit(hit.id);
  }
  const doubleTapOne = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd((e, success) => {
      'worklet';
      if (success) runOnJS(doubleTapAt)(e.x, e.y);
    });
  const tapOne = Gesture.Tap()
    .maxDuration(280)
    .requireExternalGestureToFail(doubleTapOne)
    .onEnd((e, success) => {
      'worklet';
      if (success) runOnJS(tapAt)(e.x, e.y);
    });

  const gesture = Gesture.Race(Gesture.Simultaneous(pinch, panTwo), panOne, Gesture.Exclusive(doubleTapOne, tapOne));
  const transform = useDerivedValue(() => [{ translateX: offsetX.value }, { translateY: offsetY.value }, { scale: scale.value }]);

  // ---- elementos visíveis, incluindo prévia ao vivo de mover/redimensionar/endpoint ----
  function withPreview(el: RabiscoElement): RabiscoElement {
    if (drag?.kind === 'move-multi') {
      if (!drag.ids.includes(el.id)) return el;
      return { ...el, x: el.x + drag.dx, y: el.y + drag.dy };
    }
    if (drag?.kind === 'rotate-group') {
      if (!drag.ids.includes(el.id)) return el;
      return rotateElementAround(el, drag.center, drag.delta);
    }
    if (!drag || !('id' in drag) || drag.id !== el.id) return el;
    if (drag.kind === 'move') return { ...el, x: el.x + drag.dx, y: el.y + drag.dy };
    if (drag.kind === 'resize') return { ...el, ...applyResize(drag.box, drag.handle, drag.dx, drag.dy) };
    if (drag.kind === 'endpoint' && el.points) {
      const pts = el.points.map((q) => [...q]) as [number, number][];
      pts[drag.index] = [drag.point[0] - el.x, drag.point[1] - el.y];
      return { ...el, points: pts };
    }
    if (drag.kind === 'rotate') return { ...el, rotation: drag.rotation };
    return el;
  }
  const rendered = elements.map(withPreview);
  const selectedEl = selectedId ? rendered.find((e) => e.id === selectedId) || null : null;
  const multiSelectedEls = selectedIds.length > 1 ? rendered.filter((e) => selectedIds.includes(e.id)) : [];
  // Caixa do GRUPO pro handle de rotação — calculada a partir de `elements` (a base imutável do
  // doc, parada durante todo o gesto), nunca de `rendered`: o handle gira como um retângulo
  // RÍGIDO em volta do centro (via `transform` no render), não recalcula eixo-alinhado a cada
  // frame (isso faria a caixa "respirar" de tamanho enquanto gira, em vez de girar de verdade).
  const groupBox = selectedIds.length > 1
    ? boundsOfSelection(elements.filter((e) => selectedIds.includes(e.id)), elements)
    : null;
  const marqueeRect = drag?.kind === 'marquee'
    ? normalizeBox({ x: drag.start.x, y: drag.start.y, w: drag.current.x - drag.start.x, h: drag.current.y - drag.start.y })
    : null;

  const draftStrokeEl: RabiscoElement | null = draftPoints && draftOrigin.current
    ? { id: 'draft', ...newElement('draw', draftOrigin.current.x, draftOrigin.current.y, strokeColor), points: draftPoints, strokeWidth }
    : null;

  const eraseTrailPath = eraseTrail && eraseTrail.length
    ? eraseTrail.reduce((d, p, i) => `${d}${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`, '')
    : '';

  const bindHintEl = bindHint ? rendered.find((e) => e.id === bindHint) || null : null;

  return (
    <View style={styles.fill}>
      <GestureDetector gesture={gesture}>
        <View
          ref={outerViewRef}
          style={styles.fill}
          onLayout={(e) => {
            setViewSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
            outerViewRef.current?.measureInWindow((x, y) => { winPos.current = { x, y }; });
          }}
        >
          <SkiaCanvas ref={skCanvasRef} style={styles.fill}>
            <Group transform={transform}>
              {backgroundPath ? <Path path={backgroundPath} color={colors.separator} style="stroke" strokeWidth={1 / zoomState} /> : null}
              {rendered.map((el) => <ElementView key={el.id} el={el} all={rendered} />)}
              {shapeDraft ? <ElementView el={shapeDraft} all={rendered} /> : null}
              {draftStrokeEl ? <ElementView el={draftStrokeEl} all={rendered} /> : null}
              {eraseTrailPath ? (
                <Path path={eraseTrailPath} color={colors.blue} style="stroke" strokeWidth={22 / zoomState} strokeCap="round" strokeJoin="round" opacity={0.28} />
              ) : null}
              {selectedEl ? <SelectionOverlay el={selectedEl} all={rendered} zoom={zoomState} rotating={drag?.kind === 'rotate' && drag.id === selectedEl.id} /> : null}
              {multiSelectedEls.map((el) => <MultiSelectOutline key={el.id} el={el} all={rendered} zoom={zoomState} />)}
              {groupBox ? (
                <GroupRotateHandle
                  box={groupBox}
                  center={{ x: groupBox.x + groupBox.w / 2, y: groupBox.y + groupBox.h / 2 }}
                  delta={drag?.kind === 'rotate-group' ? drag.delta : 0}
                  zoom={zoomState}
                  showDeg={drag?.kind === 'rotate-group'}
                />
              ) : null}
              {marqueeRect ? (
                <Group>
                  <Path path={`M${marqueeRect.x} ${marqueeRect.y}L${marqueeRect.x + marqueeRect.w} ${marqueeRect.y}L${marqueeRect.x + marqueeRect.w} ${marqueeRect.y + marqueeRect.h}L${marqueeRect.x} ${marqueeRect.y + marqueeRect.h}Z`} color="#0A84FF" style="fill" opacity={0.08} />
                  <Path path={`M${marqueeRect.x} ${marqueeRect.y}L${marqueeRect.x + marqueeRect.w} ${marqueeRect.y}L${marqueeRect.x + marqueeRect.w} ${marqueeRect.y + marqueeRect.h}L${marqueeRect.x} ${marqueeRect.y + marqueeRect.h}Z`} color="#0A84FF" style="stroke" strokeWidth={1.5 / zoomState} opacity={0.7}>
                    <DashPathEffect intervals={[6 / zoomState, 4 / zoomState]} />
                  </Path>
                </Group>
              ) : null}
              {bindHintEl ? <BindHintOverlay el={bindHintEl} all={rendered} zoom={zoomState} /> : null}
            </Group>
          </SkiaCanvas>
        </View>
      </GestureDetector>
      {/* Fora do GestureDetector de propósito — dentro dele, os gestos do canvas (pan/tap/
          pinch) capturam o toque antes de chegar num Pressable aninhado, e os botões de zoom
          nunca respondiam (bug real, achado testando ao vivo). */}
      <View style={styles.zoomHud} pointerEvents="box-none">
        <BlurView intensity={50} tint={scheme} style={[styles.zoomBar, { borderRadius: radius.pill, borderColor: colors.separator }]}>
          <Pressable onPress={() => zoomBy(1 / 1.25)} accessibilityRole="button" accessibilityLabel="Diminuir zoom" hitSlop={6} style={styles.zoomBtn}>
            <Icon name="minus" size={18} color={colors.label} />
          </Pressable>
          <Text style={[styles.zoomLabel, { color: colors.label }]}>{Math.round(zoomState * 100)}%</Text>
          <Pressable onPress={() => zoomBy(1.25)} accessibilityRole="button" accessibilityLabel="Aumentar zoom" hitSlop={6} style={styles.zoomBtn}>
            <Icon name="plus" size={18} color={colors.label} />
          </Pressable>
        </BlurView>
      </View>
    </View>
  );
}

const FONT_FAMILY_MAP: Record<string, string> = Object.fromEntries(FONT_FAMILIES.map((f) => [f.key, f.family]));

// Transform de rotação em volta do CENTRO da forma — `undefined` (não `[]`) quando não gira,
// pra não criar um Group extra à toa em todo elemento sem rotação (a maioria). Só formas com
// caixa própria giram nesta etapa (`ROTATABLE`, domain/rabisco/geom.ts) — linha/seta/traço
// ficam de fora, ver comentário lá.
function rotateTransform(el: RabiscoElement, all: RabiscoElement[]) {
  if (!el.rotation || !ROTATABLE.has(el.type)) return undefined;
  const g = bounds(el, all);
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  return [{ translateX: cx }, { translateY: cy }, { rotate: el.rotation }, { translateX: -cx }, { translateY: -cy }];
}

function ElementView({ el, all }: { el: RabiscoElement; all: RabiscoElement[] }) {
  const geo = elementGeometry(el, all);
  const rotate = rotateTransform(el, all);
  if (el.type === 'text') {
    const font = matchFont({ fontFamily: FONT_FAMILY_MAP[el.fontFamily] || 'Helvetica Neue', fontSize: el.fontSize });
    const lh = el.fontSize * 1.25;
    return (
      <Group opacity={el.opacity} transform={rotate}>
        {el.text.split('\n').map((line, i) => {
          const lineW = font.measureText(line).width;
          const x = el.textAlign === 'center' ? el.x + (el.w - lineW) / 2 : el.textAlign === 'right' ? el.x + el.w - lineW : el.x;
          return <SkiaText key={i} font={font} text={line} x={x} y={el.y + i * lh + el.fontSize} color={el.strokeColor} />;
        })}
      </Group>
    );
  }
  return (
    <Group opacity={el.opacity} transform={rotate}>
      {geo.fillKind === 'solid' ? <Path path={geo.clip} color={el.bgColor} style="fill" /> : null}
      {geo.fillKind === 'hatch' ? <Path path={geo.hatch} color={el.bgColor} style="stroke" strokeWidth={Math.max(1.4, el.strokeWidth * 0.62)} strokeCap="round" /> : null}
      {geo.stroke ? (
        <Path path={geo.stroke} color={el.strokeColor} style="stroke" strokeWidth={el.strokeWidth} strokeCap="round" strokeJoin="round">
          {el.strokeStyle !== 'solid' ? <DashPathEffect intervals={dashPattern(el)} /> : null}
        </Path>
      ) : null}
      {geo.arrowHeads ? <Path path={geo.arrowHeads} color={el.strokeColor} style="stroke" strokeWidth={el.strokeWidth} strokeCap="round" strokeJoin="round" /> : null}
      {LABELABLE.has(el.type) && el.text ? <ShapeLabel el={el} all={all} /> : null}
    </Group>
  );
}

// Rótulo preso numa forma (duplo toque, Etapa R5) — texto CENTRALIZADO na caixa da forma, que
// nunca muda de tamanho por causa dele (diferente do texto solto acima, cuja caixa É o texto).
// Sem quebra de linha automática — mesma simplicidade do texto solto, só quebra em '\n' que o
// próprio usuário digitar.
function ShapeLabel({ el, all }: { el: RabiscoElement; all: RabiscoElement[] }) {
  const font = matchFont({ fontFamily: FONT_FAMILY_MAP[el.fontFamily] || 'Helvetica Neue', fontSize: el.fontSize });
  const g = bounds(el, all);
  const lines = el.text.split('\n');
  const lh = el.fontSize * 1.25;
  const top = g.y + g.h / 2 - (lines.length * lh) / 2;
  return (
    <>
      {lines.map((line, i) => {
        const lineW = font.measureText(line).width;
        return <SkiaText key={i} font={font} text={line} x={g.x + (g.w - lineW) / 2} y={top + i * lh + el.fontSize} color={el.labelColor} />;
      })}
    </>
  );
}

// Raios em px de TELA (não de cena) — divididos por `zoom` pra ficarem do mesmo tamanho
// visual em qualquer nível de zoom, igual ao protótipo (HR=11, whiteboard-ios.html:1195,
// desenhado depois de `toScreen()`). Handle bem maior que o traço fino da caixa: é o alvo de
// toque, não só um indicador visual. A folga até a borda é `HANDLE_PAD_PX`, definida junto do
// hit-test (perto do topo do arquivo) — as duas têm que combinar, senão a bolinha aparece num
// lugar e o toque só é reconhecido perto de outro.
const HANDLE_R_PX = 9;
const ENDPOINT_R_PX = 8;

function circlePath(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}`;
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return `M${x + rr} ${y}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}V${y + h - rr}A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}Z`;
}

// Destaque ao redor da forma candidata a receber a ponta de seta/linha que está sendo
// arrastada — porte visual de `S.bindHint` (whiteboard-ios.html:1239-1251): contorno azul,
// arredondado, 4px de folga da borda real, sem preenchimento. Só o destaque; a histerese que
// decide QUANDO ele aparece/some (10px pra prender, 22px pra soltar) vive em
// `pickBindable` (domain/rabisco/geom.ts) — aqui só desenha o que já foi decidido lá.
function BindHintOverlay({ el, all, zoom }: { el: RabiscoElement; all: RabiscoElement[]; zoom: number }) {
  const g = bounds(el, all);
  const pad = 4 / zoom;
  const d = roundedRectPath(g.x - pad, g.y - pad, g.w + pad * 2, g.h + pad * 2, 8 / zoom);
  return <Path path={d} color="#0A84FF" style="stroke" strokeWidth={2.5 / zoom} opacity={0.55} />;
}

function SelectionOverlay({ el, all, zoom, rotating }: { el: RabiscoElement; all: RabiscoElement[]; zoom: number; rotating: boolean }) {
  const blue = '#0A84FF';
  const er = ENDPOINT_R_PX / zoom;
  if (LINEAR.has(el.type) && el.points) {
    const pts = resolvedPoints(el, all) || [];
    return (
      <Group>
        {pts.map((p, i) => (i === 0 || i === pts.length - 1 ? (
          <Group key={i}>
            <Path path={circlePath(p[0], p[1], er)} color="#fff" style="fill" />
            <Path path={circlePath(p[0], p[1], er)} color={blue} style="stroke" strokeWidth={2 / zoom} />
          </Group>
        ) : null))}
      </Group>
    );
  }
  const g = bounds(el, all);
  const box = paddedBox(g, HANDLE_PAD_PX / zoom);
  const rectPath = `M${box.x} ${box.y}L${box.x + box.w} ${box.y}L${box.x + box.w} ${box.y + box.h}L${box.x} ${box.y + box.h}Z`;
  const hr = HANDLE_R_PX / zoom;
  const canRotate = ROTATABLE.has(el.type);
  // Alça de rotação — "bola acima" (pedido do usuário, igual Excalidraw): fica FORA da caixa
  // (folga generosa, `ROTATE_HANDLE_OFFSET_PX`, pra não se confundir com a seleção nem com as
  // alças de resize), ligada por uma haste fina, e gira JUNTO com a forma — está DENTRO do
  // mesmo `<Group transform={rotate}>` que a caixa, então não precisa recalcular a posição
  // rotacionada na mão, o Skia já desenha ela no lugar certo.
  const rotHandleY = box.y - ROTATE_HANDLE_OFFSET_PX / zoom;
  const rotHandleX = box.x + box.w / 2;
  const rhr = 12 / zoom;
  const degFont = matchFont({ fontFamily: 'Helvetica Neue', fontSize: 13 / zoom });
  const degText = `${Math.round(((el.rotation || 0) * 180) / Math.PI)}°`;
  return (
    <Group transform={rotateTransform(el, all)}>
      {/* As alças aparecem SEMPRE, giradas ou não — este `<Group>` já está dentro do mesmo
          `transform={rotate}` da forma (ver `rotateTransform` acima), então o Skia desenha elas
          na posição visual certa sozinho, sem nenhuma conta extra aqui. */}
      <Path path={rectPath} color={blue} style="stroke" strokeWidth={1.5 / zoom} />
      {handlePoints(box).map((h) => (
        <Group key={h.k}>
          <Path path={circlePath(h.x, h.y, hr)} color="#fff" style="fill" />
          <Path path={circlePath(h.x, h.y, hr)} color={blue} style="stroke" strokeWidth={2 / zoom} />
        </Group>
      ))}
      {canRotate ? (
        <Group>
          <Path path={`M${rotHandleX} ${box.y}L${rotHandleX} ${rotHandleY}`} color={blue} style="stroke" strokeWidth={1.5 / zoom} />
          <Path path={circlePath(rotHandleX, rotHandleY, rhr)} color={blue} style="fill" />
          <Path path={circlePath(rotHandleX, rotHandleY, rhr)} color="#fff" style="stroke" strokeWidth={2 / zoom} />
          {rotating ? (
            <SkiaText font={degFont} text={degText} x={rotHandleX + rhr + 6 / zoom} y={rotHandleY + 4 / zoom} color={blue} />
          ) : null}
        </Group>
      ) : null}
    </Group>
  );
}

// Contorno de um elemento dentro de um grupo selecionado — mais simples que `SelectionOverlay`
// de propósito: sem alças de resize/rotação/endpoint (mover o grupo inteiro numa direção só é o
// único gesto que faz sentido com vários selecionados; redimensionar/girar um por um exige
// voltar pra seleção única primeiro).
function MultiSelectOutline({ el, all, zoom }: { el: RabiscoElement; all: RabiscoElement[]; zoom: number }) {
  const blue = '#0A84FF';
  const g = bounds(el, all);
  const box = paddedBox(g, HANDLE_PAD_PX / zoom);
  const rectPath = `M${box.x} ${box.y}L${box.x + box.w} ${box.y}L${box.x + box.w} ${box.y + box.h}L${box.x} ${box.y + box.h}Z`;
  return (
    <Group transform={rotateTransform(el, all)}>
      <Path path={rectPath} color={blue} style="stroke" strokeWidth={1.5 / zoom} opacity={0.85} />
    </Group>
  );
}

// Alça de rotação do GRUPO (mais de um selecionado, Etapa R5) — mesma linguagem visual da alça
// de um elemento só (`SelectionOverlay`), mas ligada à caixa da SELEÇÃO inteira, não de um
// elemento. Gira como um retângulo rígido (`transform` em volta de `center`) — não recalcula
// eixo-alinhado a cada frame, ver comentário em `groupBox` acima.
function GroupRotateHandle({ box, center, delta, zoom, showDeg }: {
  box: { x: number; y: number; w: number; h: number }; center: { x: number; y: number };
  delta: number; zoom: number; showDeg: boolean;
}) {
  const blue = '#0A84FF';
  const padded = paddedBox(box, HANDLE_PAD_PX / zoom);
  const rectPath = `M${padded.x} ${padded.y}L${padded.x + padded.w} ${padded.y}L${padded.x + padded.w} ${padded.y + padded.h}L${padded.x} ${padded.y + padded.h}Z`;
  const rhr = 12 / zoom;
  const handleX = padded.x + padded.w / 2;
  const handleY = padded.y - ROTATE_HANDLE_OFFSET_PX / zoom;
  const degFont = matchFont({ fontFamily: 'Helvetica Neue', fontSize: 13 / zoom });
  const degText = `${Math.round((delta * 180) / Math.PI)}°`;
  const transform = delta
    ? [{ translateX: center.x }, { translateY: center.y }, { rotate: delta }, { translateX: -center.x }, { translateY: -center.y }]
    : undefined;
  return (
    <Group transform={transform}>
      <Path path={rectPath} color={blue} style="stroke" strokeWidth={1 / zoom} opacity={0.4}>
        <DashPathEffect intervals={[5 / zoom, 4 / zoom]} />
      </Path>
      <Path path={`M${handleX} ${padded.y}L${handleX} ${handleY}`} color={blue} style="stroke" strokeWidth={1.5 / zoom} />
      <Path path={circlePath(handleX, handleY, rhr)} color={blue} style="fill" />
      <Path path={circlePath(handleX, handleY, rhr)} color="#fff" style="stroke" strokeWidth={2 / zoom} />
      {showDeg ? <SkiaText font={degFont} text={degText} x={handleX + rhr + 6 / zoom} y={handleY + 4 / zoom} color={blue} /> : null}
    </Group>
  );
}

export { boundsOfSelection };

const styles = StyleSheet.create({
  fill: { flex: 1 },
  zoomHud: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  zoomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4, paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  zoomBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  zoomLabel: { fontSize: 13, fontWeight: '500', minWidth: 42, textAlign: 'center' },
});
