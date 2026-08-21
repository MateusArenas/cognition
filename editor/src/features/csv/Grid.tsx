import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useTheme } from '@/design/useTheme';
import { evaluateSheet } from '@/domain/csv/formula';
import { colOffsets, GUTTER_W } from '@/domain/csv/geometry';
import { GridRow } from './GridRow';
import { HeaderRow } from './HeaderRow';

export interface CsvSelection {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

interface Props {
  cells: string[][];
  colWidths: number[];
  headerRow: boolean;
  wrap: boolean;
  sel: CsvSelection;
  onPressCell: (r: number, c: number) => void;
  onLongPressCell: (r: number, c: number) => void;
  onPressCol: (c: number) => void;
  onLongPressCol: (c: number) => void;
  onPressRow: (r: number) => void;
  onLongPressRow: (r: number) => void;
  onResizeCol: (c: number, width: number) => void;
  onAddCol: () => void;
  onAddRow: () => void;
}

// Grade — ScrollView horizontal (rola as colunas) contendo um cabeçalho fixo (fora da lista,
// então não rola verticalmente) + FlashList vertical de linhas (virtualiza a dimensão que
// costuma ter mais volume). Cabeçalho de coluna e gutter (numeração de linha) ficam "congelados"
// via translateX que anula o scroll horizontal SÓ neles (GridRow.tsx/HeaderRow.tsx) — nunca duas
// listas espelhadas brigando por sincronização, é tudo UMA lista + uma transformação na UI
// thread. Porte de plano-editor-csv-expo.md §10.2-10.3.
export function Grid({ cells, colWidths, headerRow, wrap, sel, onPressCell, onLongPressCell, onPressCol, onLongPressCol, onPressRow, onLongPressRow, onResizeCol, onAddCol, onAddRow }: Props) {
  const { colors } = useTheme();
  const scrollX = useSharedValue(0);
  const offsets = useMemo(() => colOffsets(colWidths), [colWidths]);
  const totalWidth = offsets[offsets.length - 1];
  const evaluated = useMemo(() => evaluateSheet(cells), [cells]);
  // `flex: 1` sozinho não propaga uma altura confiável através de um ScrollView HORIZONTAL
  // contendo uma FlashList vertical (achado ao vivo: a grade vazava por baixo da Toolbar,
  // conteúdo desenhando fora da área reservada) — mede a altura real do container UMA vez por
  // layout e aplica como número fixo no ScrollView, travando o teto que a FlashList por dentro
  // respeita de verdade.
  const [height, setHeight] = useState(0);
  const onWrapLayout = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  const selectedCol = sel.r1 === 0 && sel.r2 === cells.length - 1 && sel.c1 === sel.c2 ? sel.c1 : null;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]} onLayout={onWrapLayout}>
      {height > 0 ? (
        <Animated.ScrollView style={{ height }} horizontal onScroll={scrollHandler} scrollEventThrottle={16} bounces={false}>
          <View style={{ width: totalWidth + GUTTER_W + 60, height }}>
            <HeaderRow
              colWidths={colWidths}
              scrollX={scrollX}
              selectedCol={selectedCol}
              onPressCol={onPressCol}
              onLongPressCol={onLongPressCol}
              onResizeEnd={onResizeCol}
              onAddCol={onAddCol}
            />
            <FlashList
              style={styles.list}
              data={cells}
              keyExtractor={(_row, i) => String(i)}
              renderItem={({ item, index }) => (
                <GridRow
                  r={index}
                  cells={item}
                  colWidths={colWidths}
                  isHeaderRow={headerRow && index === 0}
                  wrap={wrap}
                  scrollX={scrollX}
                  sel={sel}
                  evaluated={evaluated}
                  onPressCell={onPressCell}
                  onLongPressCell={onLongPressCell}
                  onPressGutter={onPressRow}
                  onLongPressGutter={onLongPressRow}
                />
              )}
              ListFooterComponent={
                <View style={[styles.addRow, { backgroundColor: colors.surface2, borderColor: colors.separator }]} onTouchEnd={onAddRow}>
                  <View style={[styles.addRowGutter, { width: GUTTER_W }]} />
                </View>
              }
            />
          </View>
        </Animated.ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { flex: 1 },
  addRow: { height: 40, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  addRowGutter: { height: '100%' },
});
