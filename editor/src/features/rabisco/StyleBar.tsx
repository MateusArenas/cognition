import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Icon, type IconName } from '@/design/Icon';
import { Segmented } from '@/design/components/Segmented';
import { useTheme } from '@/design/useTheme';
import { FILLS, FONT_FAMILIES, FONT_SIZES, STROKES } from '@/domain/rabisco/palette';
import type { RabiscoArrowType, RabiscoFontFamily, RabiscoTextAlign } from '@/domain/types';

interface Props {
  strokeValue: string;
  onStrokeChange: (color: string) => void;
  onOpenStrokePicker: () => void;
  fillValue?: string;
  onFillChange?: (color: string) => void;
  onOpenFillPicker?: () => void;
  arrowType?: RabiscoArrowType;
  onArrowTypeChange?: (v: RabiscoArrowType) => void;
  opacity: number;
  onOpacityChange: (v: number) => void;
  fontSize?: number;
  onFontSizeChange?: (v: number) => void;
  fontFamily?: RabiscoFontFamily;
  onFontFamilyChange?: (v: RabiscoFontFamily) => void;
  textAlign?: RabiscoTextAlign;
  onTextAlignChange?: (v: RabiscoTextAlign) => void;
  onLayerForward: () => void;
  onLayerBackward: () => void;
  onLayerToFront: () => void;
  onLayerToBack: () => void;
}

const ARROW_TYPES: { v: RabiscoArrowType; icon: IconName; label: string }[] = [
  { v: 'straight', icon: 'moveUpRight', label: 'Seta reta' },
  { v: 'curved', icon: 'spline', label: 'Seta curva' },
  { v: 'elbow', icon: 'route', label: 'Seta em cotovelo' },
];

const TEXT_ALIGNS: { v: RabiscoTextAlign; icon: IconName; label: string }[] = [
  { v: 'left', icon: 'alignLeft', label: 'Alinhar à esquerda' },
  { v: 'center', icon: 'alignCenter', label: 'Centralizar' },
  { v: 'right', icon: 'alignRight', label: 'Alinhar à direita' },
];

// Trilho de opacidade — mesmo range do protótipo (whiteboard-ios.html:481, 10-100% em passos
// de 5). Usa Gesture.Pan (react-native-gesture-handler) em vez do sistema de responder puro do
// RN: um `onStartShouldSetResponder` isolado, aninhado dentro de vários `Pressable`s vizinhos
// (as faixas de cor/preenchimento logo acima), tranca — o toque nem sempre chega até ele, e
// pior, pode deixar o responder num estado que atrapalha os `Pressable`s ao lado (bug real
// reportado: "trocar opacidade bugava o input de fill"). `Gesture.Pan` roda no reconhecedor
// nativo (UIGestureRecognizer), o mesmo usado com sucesso em todo `Canvas.tsx` — não disputa o
// responder da mesma forma. `onBegin` (não `onStart`) dispara já no toque inicial, sem precisar
// de arrasto nenhum, pra pintar a cor já na primeira batida do dedo.
function OpacityTrack({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { colors, radius } = useTheme();
  const [trackW, setTrackW] = useState(1);
  function fromX(x: number) {
    const pct = Math.min(1, Math.max(0.1, x / Math.max(trackW, 1)));
    onChange(Math.round(pct * 20) / 20);
  }
  const pan = Gesture.Pan()
    .onBegin((e) => {
      'worklet';
      runOnJS(fromX)(e.x);
    })
    .onUpdate((e) => {
      'worklet';
      runOnJS(fromX)(e.x);
    });
  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.opacityTrack, { backgroundColor: colors.surface3, borderRadius: radius.control }]}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      >
        <View style={[styles.opacityFill, { width: `${value * 100}%`, backgroundColor: colors.blue, borderRadius: radius.control }]} />
        <View style={[styles.opacityThumb, { left: `${Math.max(0, value * 100 - 4)}%`, borderColor: colors.blue, backgroundColor: colors.surface }]} />
      </View>
    </GestureDetector>
  );
}

function Swatch({ color, selected, onPress, transparent }: { color: string; selected: boolean; onPress: () => void; transparent?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={transparent ? 'Sem preenchimento' : `Cor ${color}`}
      accessibilityState={{ selected }}
      hitSlop={6}
      style={styles.btn}
    >
      <View
        style={[
          styles.swatch,
          {
            backgroundColor: transparent ? 'transparent' : color,
            borderColor: selected ? colors.blue : colors.separator,
            borderWidth: selected ? 2.5 : 1.5,
          },
        ]}
      >
        {transparent ? <View style={[styles.slash, { backgroundColor: colors.labelSecondary }]} /> : null}
      </View>
    </Pressable>
  );
}

// Faixas de cor da borda (sempre visível com um elemento selecionado, qualquer tipo) e do
// preenchimento (só com retângulo/losango/elipse — `fillValue`/`onFillChange` ausentes escondem
// a linha) — porte de `syncSheetRows()`/`strokes`/`fills` do protótipo, numa cápsula com blur
// só (mesma linguagem do Dock, §5.2), não a sheet cheia de lá.
export function StyleBar({
  strokeValue, onStrokeChange, onOpenStrokePicker,
  fillValue, onFillChange, onOpenFillPicker,
  arrowType, onArrowTypeChange,
  opacity, onOpacityChange,
  fontSize, onFontSizeChange,
  fontFamily, onFontFamilyChange,
  textAlign, onTextAlignChange,
  onLayerForward, onLayerBackward, onLayerToFront, onLayerToBack,
}: Props) {
  const { radius, colors, scheme } = useTheme();
  return (
    <BlurView intensity={50} tint={scheme} style={[styles.card, { borderRadius: radius.card, borderColor: colors.separator }]}>
      <View style={styles.row}>
        {STROKES.map((c) => (
          <Swatch key={c} color={c} selected={strokeValue === c} onPress={() => onStrokeChange(c)} />
        ))}
        <Pressable onPress={onOpenStrokePicker} accessibilityRole="button" accessibilityLabel="Mais cores de borda" hitSlop={6} style={styles.btn}>
          <View style={[styles.swatch, styles.moreSwatch, { borderColor: colors.separator }]}>
            <Icon name="palette" size={16} color={colors.labelSecondary} />
          </View>
        </Pressable>
      </View>
      {fillValue !== undefined && onFillChange ? (
        <View style={styles.row}>
          {FILLS.map((c) => (
            <Swatch key={c} color={c} selected={fillValue === c} onPress={() => onFillChange(c)} transparent={c === 'transparent'} />
          ))}
          <Pressable onPress={onOpenFillPicker} accessibilityRole="button" accessibilityLabel="Mais cores de preenchimento" hitSlop={6} style={styles.btn}>
            <View style={[styles.swatch, styles.moreSwatch, { borderColor: colors.separator }]}>
              <Icon name="palette" size={16} color={colors.labelSecondary} />
            </View>
          </Pressable>
        </View>
      ) : null}
      {arrowType !== undefined && onArrowTypeChange ? (
        <View style={styles.row}>
          {ARROW_TYPES.map((t) => (
            <Pressable
              key={t.v}
              onPress={() => onArrowTypeChange(t.v)}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: arrowType === t.v }}
              hitSlop={6}
              style={[styles.btn, arrowType === t.v && { backgroundColor: colors.blue + '26', borderRadius: radius.control }]}
            >
              <Icon name={t.icon} size={20} color={arrowType === t.v ? colors.blue : colors.label} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {fontSize !== undefined && onFontSizeChange ? (
        <View style={styles.segRow}>
          <Segmented
            options={FONT_SIZES.map((f) => ({ value: f.key, label: f.key }))}
            value={FONT_SIZES.find((f) => f.value === fontSize)?.key ?? 'M'}
            onChange={(k) => onFontSizeChange(FONT_SIZES.find((f) => f.key === k)!.value)}
          />
        </View>
      ) : null}
      {fontFamily !== undefined && onFontFamilyChange ? (
        <View style={styles.segRow}>
          <Segmented
            options={FONT_FAMILIES.map((f) => ({ value: f.key, label: f.label }))}
            value={fontFamily}
            onChange={(k) => onFontFamilyChange(k as RabiscoFontFamily)}
          />
        </View>
      ) : null}
      {textAlign !== undefined && onTextAlignChange ? (
        <View style={styles.row}>
          {TEXT_ALIGNS.map((t) => (
            <Pressable
              key={t.v}
              onPress={() => onTextAlignChange(t.v)}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: textAlign === t.v }}
              hitSlop={6}
              style={[styles.btn, textAlign === t.v && { backgroundColor: colors.blue + '26', borderRadius: radius.control }]}
            >
              <Icon name={t.icon} size={20} color={textAlign === t.v ? colors.blue : colors.label} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={[styles.row, styles.opacityRow]}>
        <Icon name="sliders" size={16} color={colors.labelSecondary} />
        <OpacityTrack value={opacity} onChange={onOpacityChange} />
        <Text style={[styles.opacityLabel, { color: colors.labelSecondary }]}>{Math.round(opacity * 100)}%</Text>
      </View>
      <View style={styles.row}>
        <Pressable onPress={onLayerToBack} accessibilityRole="button" accessibilityLabel="Enviar para trás (fundo)" hitSlop={6} style={styles.btn}>
          <Icon name="sendToBack" size={18} color={colors.label} />
        </Pressable>
        <Pressable onPress={onLayerBackward} accessibilityRole="button" accessibilityLabel="Recuar uma camada" hitSlop={6} style={styles.btn}>
          <Icon name="chevronDown" size={18} color={colors.label} />
        </Pressable>
        <Pressable onPress={onLayerForward} accessibilityRole="button" accessibilityLabel="Avançar uma camada" hitSlop={6} style={styles.btn}>
          <Icon name="chevronUp" size={18} color={colors.label} />
        </Pressable>
        <Pressable onPress={onLayerToFront} accessibilityRole="button" accessibilityLabel="Trazer para frente (topo)" hitSlop={6} style={styles.btn}>
          <Icon name="bringToFront" size={18} color={colors.label} />
        </Pressable>
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 2, paddingHorizontal: 8, paddingVertical: 4, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 4 },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  moreSwatch: { borderWidth: 1.5, borderStyle: 'dashed' },
  slash: { width: 30, height: 1.5, transform: [{ rotate: '45deg' }] },
  segRow: { paddingHorizontal: 4, paddingVertical: 2 },
  opacityRow: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 8 },
  opacityTrack: { flex: 1, height: 22, justifyContent: 'center', overflow: 'visible' },
  opacityFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  opacityThumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 2, top: 3 },
  opacityLabel: { fontSize: 12, fontWeight: '500', minWidth: 34, textAlign: 'right' },
});
