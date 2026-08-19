import { useEffect, useRef, useState, type RefObject } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { Canvas as SkiaCanvas, Image as SkiaImage, Rect, LinearGradient, vec, type SkImage } from '@shopify/react-native-skia';
import { Field } from '@/design/components/Field';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import { hsvToRgb, parseColor, rgbaToCss, rgbaToHex, rgbToHsv, type HSV } from '@/domain/rabisco/color';
import type { RabiscoCanvasHandle } from './Canvas';

interface Props {
  visible: boolean;
  title: string;
  value: string; // hex ou 'transparent'
  usedColors: string[];
  canvasRef: RefObject<RabiscoCanvasHandle | null>;
  // Toque único e discreto (swatch de "cores usadas") — empilha undo na hora, como qualquer
  // outro toque do app.
  onChange: (hex: string) => void;
  // Arrasto contínuo (SV, matiz, conta-gotas) e digitação nos campos hex/rgba — mesmo padrão de
  // `useLiveField`/`applyLive`+`commitLive` (store/useDoc.ts) já usado pro editor de Markdown:
  // `onBeginLive` tira o snapshot ANTES da sessão (equivalente a onFocus), `onChangeLive` roda a
  // cada frame/tecla sem empilhar undo nem clonar+stringificar o doc inteiro (era isso que
  // pesava — `apply()` normal faz `JSON.stringify` + `structuredClone` do documento a cada
  // chamada, e um arrasto de cor dispara isso ~60x/segundo), `onEndLive` fecha a sessão num
  // ÚNICO passo de undo (equivalente a onBlur).
  onBeginLive: () => void;
  onChangeLive: (hex: string) => void;
  onEndLive: () => void;
  onRequestClose: () => void;
}

const LOUPE_SIZE = 96;
const LOUPE_ZOOM = 6;
const SAMPLE_THROTTLE_MS = 32; // ~30fps — suave o bastante pra lupa, barato o bastante pra não travar

// Lupa do conta-gotas — mostra uma cópia ampliada do quadro em volta do pixel mirado (círculo,
// off-set acima do dedo pra não tampar a mira) com uma mirinha no centro marcando o pixel exato
// e um anel na cor amostrada. Desenha o MESMO snapshot (`SkImage`) tirado uma vez em
// `beginColorSample()` — Skia permite renderizar a mesma imagem em telas diferentes, então não
// precisa recortar/recodificar nada, só um `transform` posicionando o pixel certo no centro.
function Loupe({ image, canvasSize, localX, localY, hex }: { image: SkImage; canvasSize: { w: number; h: number }; localX: number; localY: number; hex: string }) {
  const L = LOUPE_SIZE;
  return (
    <View style={[styles.loupe, { borderColor: hex }]}>
      <SkiaCanvas style={styles.loupeCanvas}>
        <SkiaImage
          image={image}
          x={0} y={0} width={canvasSize.w} height={canvasSize.h}
          fit="fill"
          transform={[
            { translateX: L / 2 }, { translateY: L / 2 },
            { scale: LOUPE_ZOOM },
            { translateX: -localX }, { translateY: -localY },
          ]}
        />
        <Rect x={L / 2 - 8} y={L / 2 - 1} width={16} height={2} color="#fff" opacity={0.9} />
        <Rect x={L / 2 - 1} y={L / 2 - 8} width={2} height={16} color="#fff" opacity={0.9} />
        <Rect x={L / 2 - 1} y={L / 2 - 1} width={2} height={2} color="#000" />
      </SkiaCanvas>
    </View>
  );
}

const SV_SIZE = 220;
const HUE_W = 26;
const HUE_STOPS = ['#f00', '#ff0', '#0f0', '#0ff', '#00f', '#f0f', '#f00'];

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

// Seletor de cor completo: quadrado de saturação/valor + barra de matiz (Skia — já é
// dependência do canvas, sem lib nova só pro gradiente), campos hex e rgba bidirecionais
// (digitar ou colar um dos dois atualiza o outro e o picker), um atalho pras cores já usadas no
// quadro, e um conta-gotas de verdade que lê o pixel do canvas (não só um atalho pras cores já
// usadas — os dois convivem, cada um mais rápido pra um caso diferente).
export function ColorPicker({ visible, title, value, usedColors, canvasRef, onChange, onBeginLive, onChangeLive, onEndLive, onRequestClose }: Props) {
  const { colors, scheme } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const [hsv, setHsv] = useState<HSV>({ h: 0, s: 1, v: 1 });
  const [hexText, setHexText] = useState('#000000');
  const [rgbaText, setRgbaText] = useState('rgb(0, 0, 0)');

  // Conta-gotas — pedido do usuário: (1) o botão tem que ficar "selecionado" (estado visível de
  // ativo/inativo — antes era só um ícone decorativo, tocar não fazia nada), (2) arrastar o
  // dedo mostra uma lupa ao lado, ampliada, com o pixel mirado, (3) o fundo do picker não pode
  // escurecer o que está atrás (ver `scrim` abaixo) — se escurecesse, a cor lida pelo
  // conta-gotas sairia mais escura que a real. Amostra do `RabiscoCanvas` via `canvasRef`
  // (`Canvas.tsx`): `beginColorSample()` tira UM snapshot congelado no toque inicial (não
  // precisa acompanhar o desenho mudando, só escolher uma cor dele), `sampleColorAt()` lê o
  // pixel por coordenada de tela a cada movimento.
  const [eyedropperOn, setEyedropperOn] = useState(false);
  const [sample, setSample] = useState<{ hex: string; localX: number; localY: number; pageX: number; pageY: number; image: SkImage; size: { w: number; h: number } } | null>(null);
  // `readPixels()` num SkImage vindo de `makeImageSnapshot()` costuma ser GPU-backed — ler um
  // pixel de volta é um readback síncrono da GPU, caro o bastante pra pesar visivelmente se
  // chamado a cada frame de um arrasto (~60x/s). Throttle (não debounce: debounce só dispararia
  // no fim do gesto, e a lupa precisa acompanhar o dedo ENQUANTO arrasta) — no máximo uma
  // leitura a cada `SAMPLE_THROTTLE_MS`, sem acumular chamadas perdidas.
  const lastSampleAt = useRef(0);

  // Posição arrastável (item pedido: dá pra mover a caixa pra enxergar o que está atrás, mas
  // não dá pra jogar fora da tela — `clampTranslate` prende dentro da janela). Offset a partir
  // do centro (a caixa nasce centralizada pelo `scrim`), reseta toda vez que o picker abre de
  // novo — mesmo padrão do `useEffect` abaixo que reinicializa hsv/hex/rgba.
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragBaseX = useSharedValue(0);
  const dragBaseY = useSharedValue(0);
  const boxSize = useSharedValue({ w: 320, h: 460 });

  useEffect(() => {
    if (!visible) return;
    translateX.value = 0;
    translateY.value = 0;
    setEyedropperOn(false);
    setSample(null);
    const parsed = value === 'transparent' ? { r: 255, g: 255, b: 255, a: 0 } : parseColor(value);
    if (!parsed) return;
    setHsv(rgbToHsv(parsed.r, parsed.g, parsed.b));
    setHexText(rgbaToHex(parsed));
    setRgbaText(rgbaToCss(parsed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function applyLiveHsv(next: HSV) {
    setHsv(next);
    const rgb = hsvToRgb(next);
    const rgba = { ...rgb, a: 1 };
    setHexText(rgbaToHex(rgba));
    setRgbaText(rgbaToCss(rgba));
    onChangeLive(rgbaToHex(rgba));
  }
  function applyFromText(text: string) {
    const parsed = parseColor(text);
    if (!parsed) return;
    setHsv(rgbToHsv(parsed.r, parsed.g, parsed.b));
    onChangeLive(rgbaToHex(parsed));
  }

  function svAt(x: number, y: number) {
    applyLiveHsv({ ...hsv, s: clamp01(x / SV_SIZE), v: clamp01(1 - y / SV_SIZE) });
  }
  function hueAt(y: number) {
    applyLiveHsv({ ...hsv, h: clamp01(y / SV_SIZE) * 360 });
  }

  // Gesture.Pan (react-native-gesture-handler) em vez do sistema de responder puro do RN que
  // tinha aqui antes — bug real reportado ("o picker de cor está travado, não consigo
  // selecionar as cores"): um `onStartShouldSetResponder` isolado, dentro de dois `Pressable`s
  // encadeados (o scrim e a caixa) mais um `SkiaCanvas` por cima, nem sempre ganhava a
  // negociação de responder. `Gesture.Pan` roda no reconhecedor nativo, mesmo padrão já provado
  // em `Canvas.tsx` a sessão inteira. `onBegin` (não `onStart`) já aplica no primeiro toque, sem
  // precisar arrastar. `onBeginLive`/`onEndLive` marcam o início/fim da sessão pro pai poder
  // empilhar um ÚNICO passo de undo (ver comentário na Props) — sem isso, cada pixel do arrasto
  // virava um `apply()` completo (clona + stringifica o doc inteiro), pesado o bastante pra
  // travar visivelmente (bug real reportado: "está pesando muito a seleção no picker de cor").
  const svPan = Gesture.Pan()
    .onBegin((e) => { 'worklet'; runOnJS(onBeginLive)(); runOnJS(svAt)(e.x, e.y); })
    .onUpdate((e) => { 'worklet'; runOnJS(svAt)(e.x, e.y); })
    .onEnd(() => { 'worklet'; runOnJS(onEndLive)(); });
  const huePan = Gesture.Pan()
    .onBegin((e) => { 'worklet'; runOnJS(onBeginLive)(); runOnJS(hueAt)(e.y); })
    .onUpdate((e) => { 'worklet'; runOnJS(hueAt)(e.y); })
    .onEnd(() => { 'worklet'; runOnJS(onEndLive)(); });

  // `e.absoluteX/absoluteY` (não `e.x/e.y`) — coordenada de TELA, o mesmo espaço de
  // `measureInWindow()` que `Canvas.tsx` usa pra achar onde o canvas está; a superfície de
  // toque do conta-gotas é `StyleSheet.absoluteFill` cobrindo a tela inteira (ver render), não
  // só a caixa do picker, então o toque pode cair sobre o canvas de verdade por trás dele.
  function sampleAt(pageX: number, pageY: number, force = false) {
    const now = Date.now();
    if (!force && now - lastSampleAt.current < SAMPLE_THROTTLE_MS) return;
    lastSampleAt.current = now;
    const r = canvasRef.current?.sampleColorAt(pageX, pageY);
    const image = canvasRef.current?.getSampleImage();
    const size = canvasRef.current?.getSize();
    if (!r || !image || !size) return;
    const parsed = parseColor(r.hex);
    if (parsed) {
      setHsv(rgbToHsv(parsed.r, parsed.g, parsed.b));
      setHexText(r.hex);
      setRgbaText(rgbaToCss(parsed));
      onChangeLive(r.hex);
    }
    setSample({ hex: r.hex, localX: r.localX, localY: r.localY, pageX, pageY, image, size });
  }
  function beginSample(pageX: number, pageY: number) {
    canvasRef.current?.beginColorSample();
    onBeginLive();
    sampleAt(pageX, pageY, true);
  }
  function endSample(pageX: number, pageY: number) {
    sampleAt(pageX, pageY, true); // força uma leitura final no ponto exato de soltar, sem
    // ficar até `SAMPLE_THROTTLE_MS` desatualizada por causa do throttle
    canvasRef.current?.endColorSample();
    setSample(null);
    setEyedropperOn(false);
    onEndLive();
  }
  const eyedropperPan = Gesture.Pan()
    .onBegin((e) => { 'worklet'; runOnJS(beginSample)(e.absoluteX, e.absoluteY); })
    .onUpdate((e) => { 'worklet'; runOnJS(sampleAt)(e.absoluteX, e.absoluteY, false); })
    .onEnd((e) => { 'worklet'; runOnJS(endSample)(e.absoluteX, e.absoluteY); });

  function clampTranslate(dx: number, dy: number) {
    'worklet';
    const maxX = Math.max(0, (winW - boxSize.value.w) / 2 - 8);
    const maxY = Math.max(0, (winH - boxSize.value.h) / 2 - 8);
    return { x: Math.min(maxX, Math.max(-maxX, dx)), y: Math.min(maxY, Math.max(-maxY, dy)) };
  }
  const headerPan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      dragBaseX.value = translateX.value;
      dragBaseY.value = translateY.value;
    })
    .onUpdate((e) => {
      'worklet';
      const next = clampTranslate(dragBaseX.value + e.translationX, dragBaseY.value + e.translationY);
      translateX.value = next.x;
      translateY.value = next.y;
    });
  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  const rgb = hsvToRgb(hsv);
  const hueColor = `hsl(${hsv.h}, 100%, 50%)`;

  const loupeLeft = sample ? Math.min(Math.max(8, sample.pageX - LOUPE_SIZE / 2), winW - LOUPE_SIZE - 8) : 0;
  const loupeTop = sample ? Math.max(8, sample.pageY - LOUPE_SIZE - 40) : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      {/* Sem escurecer o fundo (pedido do usuário) — o quadro por trás precisa continuar com a
          cor real, senão o conta-gotas lê uma versão escurecida dela. */}
      <Pressable style={styles.scrim} onPress={eyedropperOn ? undefined : onRequestClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View
            style={boxStyle}
            onLayout={(e) => { boxSize.value = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; }}
          >
            <BlurView intensity={60} tint={scheme} style={[styles.box, { borderColor: colors.separator }]}>
              <View style={styles.header}>
                {/* Só o título é a alça de arrastar — o botão fechar fica FORA do
                    GestureDetector: um Pressable aninhado dentro de um GestureDetector não
                    recebe o toque (achado real desta sessão, no HUD de zoom do Canvas). */}
                <GestureDetector gesture={headerPan}>
                  <View style={styles.headerDrag}>
                    <View style={[styles.grabber, { backgroundColor: colors.separator }]} />
                    <Text style={[styles.title, { color: colors.label }]}>{title}</Text>
                  </View>
                </GestureDetector>
                <Pressable onPress={onRequestClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fechar">
                  <Icon name="close" size={20} color={colors.labelSecondary} />
                </Pressable>
              </View>

              <View style={styles.pickerRow}>
                <GestureDetector gesture={svPan}>
                  <View style={styles.sv}>
                    <SkiaCanvas style={StyleSheet.absoluteFill}>
                      <Rect x={0} y={0} width={SV_SIZE} height={SV_SIZE} color={hueColor} />
                      <Rect x={0} y={0} width={SV_SIZE} height={SV_SIZE}>
                        <LinearGradient start={vec(0, 0)} end={vec(SV_SIZE, 0)} colors={['#fff', '#ffffff00']} />
                      </Rect>
                      <Rect x={0} y={0} width={SV_SIZE} height={SV_SIZE}>
                        <LinearGradient start={vec(0, 0)} end={vec(0, SV_SIZE)} colors={['#00000000', '#000']} />
                      </Rect>
                    </SkiaCanvas>
                    <View
                      pointerEvents="none"
                      style={[
                        styles.svThumb,
                        { left: hsv.s * SV_SIZE - 8, top: (1 - hsv.v) * SV_SIZE - 8, backgroundColor: rgbaToHex({ ...rgb, a: 1 }) },
                      ]}
                    />
                  </View>
                </GestureDetector>

                <GestureDetector gesture={huePan}>
                  <View style={styles.hue}>
                    <SkiaCanvas style={StyleSheet.absoluteFill}>
                      <Rect x={0} y={0} width={HUE_W} height={SV_SIZE}>
                        <LinearGradient start={vec(0, 0)} end={vec(0, SV_SIZE)} colors={HUE_STOPS} />
                      </Rect>
                    </SkiaCanvas>
                    <View pointerEvents="none" style={[styles.hueThumb, { top: (hsv.h / 360) * SV_SIZE - 3 }]} />
                  </View>
                </GestureDetector>
              </View>

              <View style={styles.fieldsRow}>
                <View style={[styles.preview, { backgroundColor: value === 'transparent' ? 'transparent' : hexText, borderColor: colors.separator }]} />
                <Field
                  style={styles.field} value={hexText}
                  onFocus={onBeginLive}
                  onChangeText={(t) => { setHexText(t); applyFromText(t); }}
                  onBlur={onEndLive}
                  placeholder="#0A84FF" autoCapitalize="none"
                />
                <Field
                  style={styles.field} value={rgbaText}
                  onFocus={onBeginLive}
                  onChangeText={(t) => { setRgbaText(t); applyFromText(t); }}
                  onBlur={onEndLive}
                  placeholder="rgb(10, 132, 255)" autoCapitalize="none"
                />
              </View>

              <View style={styles.usedRow}>
                <Pressable
                  onPress={() => setEyedropperOn((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel="Conta-gotas — escolher cor do quadro"
                  accessibilityState={{ selected: eyedropperOn }}
                  hitSlop={6}
                  style={[
                    styles.eyedropperBtn,
                    { borderColor: colors.separator },
                    eyedropperOn && { backgroundColor: colors.blue + '26', borderColor: colors.blue },
                  ]}
                >
                  <Icon name="pipette" size={16} color={eyedropperOn ? colors.blue : colors.labelSecondary} />
                </Pressable>
                {usedColors.length ? (
                  <View style={styles.usedSwatches}>
                    {usedColors.map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => onChange(c)}
                        accessibilityRole="button"
                        accessibilityLabel={`Usar cor ${c}`}
                        style={[styles.usedSwatch, { backgroundColor: c, borderColor: colors.separator }]}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            </BlurView>
          </Animated.View>
        </Pressable>
      </Pressable>
      {/* Superfície de toque do conta-gotas — irmã do scrim, não filha: um Pressable/GestureDetector
          aninhado dentro do scrim ficaria sujeito à mesma disputa de responder que já causou bug
          na `StyleBar` e no `ColorPicker` antes (ver comentário em `svPan` acima). Cobre a tela
          inteira só enquanto ativo, pra poder arrastar por cima do quadro de verdade. */}
      {eyedropperOn ? (
        <GestureDetector gesture={eyedropperPan}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>
      ) : null}
      {sample ? (
        <View pointerEvents="none" style={[styles.loupeWrap, { left: loupeLeft, top: loupeTop }]}>
          <Loupe image={sample.image} canvasSize={sample.size} localX={sample.localX} localY={sample.localY} hex={sample.hex} />
          <View style={[styles.loupeHexPill, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
            <Text style={[styles.loupeHexText, { color: colors.label }]}>{sample.hex}</Text>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Transparente de propósito (pedido do usuário) — um scrim escuro tingiria o quadro atrás,
  // e o conta-gotas leria uma versão mais escura da cor real.
  scrim: { flex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { width: 320, borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerDrag: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 2 },
  grabber: { width: 34, height: 4, borderRadius: 2 },
  title: { fontSize: 17, fontWeight: '600' },
  pickerRow: { flexDirection: 'row', gap: 10 },
  sv: { width: SV_SIZE, height: SV_SIZE, borderRadius: 12, overflow: 'hidden' },
  svThumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 2.5, borderColor: '#fff' },
  hue: { width: HUE_W, height: SV_SIZE, borderRadius: 8, overflow: 'hidden' },
  hueThumb: { position: 'absolute', left: 0, right: 0, height: 6, borderWidth: 2, borderColor: '#fff', borderRadius: 3 },
  fieldsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  preview: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5 },
  field: { flex: 1 },
  usedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  usedSwatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  usedSwatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1 },
  eyedropperBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  loupeWrap: { position: 'absolute', alignItems: 'center', gap: 6 },
  loupe: { width: LOUPE_SIZE, height: LOUPE_SIZE, borderRadius: LOUPE_SIZE / 2, overflow: 'hidden', borderWidth: 3 },
  loupeCanvas: { width: LOUPE_SIZE, height: LOUPE_SIZE },
  loupeHexPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  loupeHexText: { fontSize: 13, fontWeight: '600' },
});
