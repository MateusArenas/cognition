import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/design/useTheme';
import { colName } from '@/domain/csv/formula';
import { GUTTER_W, HEADER_H, MAX_COL_W, MIN_COL_W } from '@/domain/csv/geometry';

interface Props {
  colWidths: number[];
  scrollX: SharedValue<number>;
  selectedCol: number | null;
  onPressCol: (c: number) => void;
  onLongPressCol: (c: number) => void;
  onResizeEnd: (c: number, width: number) => void;
  onAddCol: () => void;
}

// Cabeçalho de coluna (A, B, C…) — fora da FlashList vertical (fica parado sozinho quando o
// usuário rola pra baixo) mas dentro do ScrollView horizontal (rola junto com as colunas). Só o
// canto (corner) recebe o mesmo translateX que o gutter de cada linha recebe (Row.tsx) — os
// dois cancelam o scroll horizontal, ficando visualmente parados nos dois eixos.
//
// Fundo `colors.bg` (preto de verdade no escuro), não `surface2` — pedido do usuário depois de
// ver ao vivo: um cinza médio uniforme cobrindo cabeçalho+gutter+células vazias não tinha nada
// de "planilha estilo Apple" (Numbers usa linhas de grade sobre fundo liso, cor só nos estados
// que importam). Continua OPACO onde precisa (canto/gutter cobrem células passando por baixo no
// scroll) — só a letra/número em `labelSecondary` marca "isto é cabeçalho", não um bloco cheio.
export function HeaderRow({ colWidths, scrollX, selectedCol, onPressCol, onLongPressCol, onResizeEnd, onAddCol }: Props) {
  const { colors } = useTheme();
  const cornerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: scrollX.value }] }));

  return (
    <View style={[styles.row, { backgroundColor: colors.bg, borderBottomColor: colors.separator }]}>
      <Animated.View style={[styles.corner, { width: GUTTER_W, backgroundColor: colors.bg, borderColor: colors.separator }, cornerStyle]} />
      {colWidths.map((w, c) => (
        <ColHeaderCell
          key={c}
          c={c}
          width={w}
          on={selectedCol === c}
          onPress={() => onPressCol(c)}
          onLongPress={() => onLongPressCol(c)}
          onResizeEnd={(width) => onResizeEnd(c, width)}
        />
      ))}
      <Pressable onPress={onAddCol} style={[styles.add, { backgroundColor: colors.bg }]} accessibilityRole="button">
        <Text style={{ color: colors.blue, fontSize: 19, fontWeight: '300' }}>+</Text>
      </Pressable>
    </View>
  );
}

function ColHeaderCell({
  c,
  width,
  on,
  onPress,
  onLongPress,
  onResizeEnd,
}: {
  c: number;
  width: number;
  on: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onResizeEnd: (w: number) => void;
}) {
  const { colors } = useTheme();
  const w = useSharedValue(width);
  const startW = useSharedValue(width);
  // Sincroniza com o valor commitado só quando ELE muda de verdade (efeito, não a cada render)
  // — escrever w.value incondicionalmente no corpo do componente atropelaria um arrasto em
  // andamento (o gesto muda w.value na UI thread; um re-render por outro motivo qualquer não
  // pode desfazer isso no meio do gesto).
  useEffect(() => {
    w.value = width;
  }, [width, w]);

  const style = useAnimatedStyle(() => ({ width: w.value }));

  const pan = Gesture.Pan()
    .hitSlop({ left: 10, right: 10 })
    .activeOffsetX([-4, 4])
    .onBegin(() => {
      startW.value = w.value;
    })
    .onUpdate((e) => {
      w.value = Math.max(MIN_COL_W, Math.min(MAX_COL_W, Math.round(startW.value + e.translationX)));
    })
    .onEnd(() => {
      if (w.value !== startW.value) onResizeEnd(w.value);
    });

  return (
    <Animated.View style={[styles.colCell, { backgroundColor: on ? colors.blue : colors.bg, borderColor: colors.separator }, style]}>
      <Pressable style={styles.colCellPress} onPress={onPress} onLongPress={onLongPress}>
        <Text style={{ color: on ? '#fff' : colors.labelSecondary, fontSize: 12, fontWeight: '500' }}>{colName(c)}</Text>
      </Pressable>
      <GestureDetector gesture={pan}>
        <Pressable
          hitSlop={8}
          onLongPress={() => Haptics.selectionAsync()}
          style={styles.grip}
        >
          <View style={[styles.gripBar, { backgroundColor: on ? 'rgba(255,255,255,0.75)' : colors.labelTertiary }]} />
        </Pressable>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', height: HEADER_H, borderBottomWidth: StyleSheet.hairlineWidth },
  // Mesmo truque de GridRow.tsx — filho flex normal (ocupa GUTTER_W de verdade, empurrando as
  // colunas), só o `transform` desloca a pintura. zIndex 3 > o 2 do gutter das linhas, porque o
  // canto senta ACIMA de tudo (linha 0 do cabeçalho, cruza gutter E header).
  corner: { height: HEADER_H, zIndex: 3, elevation: 3, borderRightWidth: StyleSheet.hairlineWidth },
  colCell: { height: HEADER_H, borderRightWidth: StyleSheet.hairlineWidth, position: 'relative' },
  colCellPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grip: { position: 'absolute', top: 0, right: -10, width: 20, height: '100%', alignItems: 'center', justifyContent: 'center' },
  gripBar: { width: 2, height: 13, borderRadius: 1 },
  add: { width: 38, height: HEADER_H, alignItems: 'center', justifyContent: 'center' },
});
