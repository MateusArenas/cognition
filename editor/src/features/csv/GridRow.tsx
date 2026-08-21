import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/design/useTheme';
import type { evaluateSheet } from '@/domain/csv/formula';
import { isFormulaErr } from '@/domain/csv/formula';
import { GUTTER_W, ROW_H, ROW_H_WRAP } from '@/domain/csv/geometry';
import { Cell } from './Cell';

interface Props {
  r: number;
  cells: string[];
  colWidths: number[];
  isHeaderRow: boolean;
  wrap: boolean;
  scrollX: SharedValue<number>;
  sel: { r1: number; c1: number; r2: number; c2: number };
  evaluated: ReturnType<typeof evaluateSheet>;
  onPressCell: (r: number, c: number) => void;
  onLongPressCell: (r: number, c: number) => void;
  onPressGutter: (r: number) => void;
  onLongPressGutter: (r: number) => void;
}

function GridRowImpl({ r, cells, colWidths, isHeaderRow, wrap, scrollX, sel, evaluated, onPressCell, onLongPressCell, onPressGutter, onLongPressGutter }: Props) {
  const { colors } = useTheme();
  const gutterStyle = useAnimatedStyle(() => ({ transform: [{ translateX: scrollX.value }] }));
  const rowSelected = sel.r1 <= r && r <= sel.r2;
  const normC1 = Math.min(sel.c1, sel.c2);
  const normC2 = Math.max(sel.c1, sel.c2);
  const gutterOn = rowSelected && normC1 === 0 && normC2 === colWidths.length - 1;

  return (
    <View style={styles.row}>
      <Animated.View
        style={[
          styles.gutter,
          {
            width: GUTTER_W,
            height: wrap ? ROW_H_WRAP : ROW_H,
            // `colors.bg` (preto de verdade no escuro), não `surface2` — precisa continuar
            // OPACO (é o que faz o gutter "cobrir" as células passando por baixo dele durante o
            // scroll horizontal, ver comentário do zIndex/elevation abaixo), mas casando com o
            // fundo da célula vazia (agora transparente) em vez de destacar um bloco cinza à
            // parte.
            backgroundColor: gutterOn ? colors.blue : colors.bg,
            borderColor: colors.separator,
          },
          gutterStyle,
        ]}
      >
        <Pressable style={styles.gutterPress} onPress={() => onPressGutter(r)} onLongPress={() => onLongPressGutter(r)}>
          <GutterLabel n={r + 1} on={gutterOn} />
        </Pressable>
      </Animated.View>
      {cells.map((raw, c) => {
        const value = evaluated.value(r, c);
        const shown = evaluated.shown(r, c);
        const selected = sel.r1 === sel.r2 && sel.c1 === sel.c2 && sel.r1 === r && sel.c1 === c;
        const inRange = !selected && r >= sel.r1 && r <= sel.r2 && c >= normC1 && c <= normC2;
        return (
          <Cell
            key={c}
            text={shown}
            width={colWidths[c]}
            isNum={typeof value === 'number' && !isHeaderRow}
            isErr={isFormulaErr(shown)}
            isHeader={isHeaderRow}
            selected={selected}
            inRange={inRange}
            wrap={wrap}
            onPress={() => onPressCell(r, c)}
            onLongPress={() => onLongPressCell(r, c)}
          />
        );
      })}
    </View>
  );
}

function GutterLabel({ n, on }: { n: number; on: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={{ color: on ? '#fff' : colors.labelSecondary, fontSize: 12, fontVariant: ['tabular-nums'] }}>{n}</Text>
  );
}

function propsEqual(a: Props, b: Props): boolean {
  return (
    a.r === b.r &&
    a.cells === b.cells &&
    a.colWidths === b.colWidths &&
    a.isHeaderRow === b.isHeaderRow &&
    a.wrap === b.wrap &&
    a.evaluated === b.evaluated &&
    a.sel.r1 === b.sel.r1 &&
    a.sel.c1 === b.sel.c1 &&
    a.sel.r2 === b.sel.r2 &&
    a.sel.c2 === b.sel.c2
  );
}

export const GridRow = memo(GridRowImpl, propsEqual);

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  // NÃO é position:'absolute' — continua um filho flex normal, ocupando GUTTER_W de espaço de
  // verdade (é isso que empurra as células de dado pra direita). O `transform` só desloca o que
  // é PINTADO, sem mexer no layout — é o que faz parecer congelado enquanto rola horizontal.
  // zIndex+elevation (Android precisa dos dois — zIndex sozinho não garante ordem lá) garantem
  // que o gutter pinta POR CIMA das células que passam "por baixo" dele.
  gutter: { zIndex: 2, elevation: 2, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  gutterPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
