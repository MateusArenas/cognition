import { BottomSheetModal, BottomSheetView, type BottomSheetModalProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useMemo, useState, type ForwardedRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../useTheme';
import { Icon } from '../Icon';
import { useOptionalSheetChrome } from '../SheetChrome';
import { InsideSheetContext } from './insideSheetContext';

function dismiss(ref: ForwardedRef<BottomSheetModal>) {
  if (ref && typeof ref === 'object') ref.current?.dismiss();
}

interface Props extends Partial<BottomSheetModalProps> {
  title: string;
  tag?: string;
  children: ReactNode;
}

// @gorhom/bottom-sheet com BottomSheetModal, snaps ['45%','92%'], grabber 36x5, cantos 14.
// Fundo `bg` — as linhas agrupadas por dentro é que são `surface` (§5.2).
export const Sheet = forwardRef<BottomSheetModal, Props>(function Sheet(
  { title, tag, children, snapPoints, onChange, ...rest },
  ref
) {
  const { colors, radius } = useTheme();
  const { setOpen } = useOptionalSheetChrome();
  const insets = useSafeAreaInsets();
  const points = useMemo(() => snapPoints ?? ['45%', '92%'], [snapPoints]);
  const [headHeight, setHeadHeight] = useState(0);

  const handleChange = useCallback<NonNullable<BottomSheetModalProps['onChange']>>(
    (index, position, type) => {
      setOpen(index >= 0);
      onChange?.(index, position, type);
    },
    [onChange, setOpen]
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={points}
      onChange={handleChange}
      backgroundStyle={{ backgroundColor: colors.bg }}
      handleIndicatorStyle={{ backgroundColor: colors.separatorBold, width: 36, height: 5 }}
      style={{ borderRadius: radius.sheet }}
      {...rest}
    >
      <View
        onLayout={(e: LayoutChangeEvent) => setHeadHeight(e.nativeEvent.layout.height)}
        style={[styles.head, { borderBottomColor: colors.separator }]}
      >
        <Text style={[styles.title, { color: colors.label }]} numberOfLines={1}>
          {title}
        </Text>
        {tag ? (
          <Text style={[styles.tag, { color: colors.labelSecondary, backgroundColor: colors.surface3 }]}>{tag}</Text>
        ) : null}
        <Pressable
          onPress={() => dismiss(ref)}
          accessibilityRole="button"
          accessibilityLabel="Fechar painel"
          hitSlop={8}
          style={({ pressed }) => [styles.close, { backgroundColor: colors.surface3, opacity: pressed ? 0.5 : 1 }]}
        >
          <Icon name="close" size={14} color={colors.labelSecondary} />
        </Pressable>
      </View>
      {/* BottomSheetView se posiciona absolute/top:0 por dentro (biblioteca) — ignora
          completamente a altura do `head` acima, por mais que ele venha antes no JSX. Sem esse
          paddingTop medido de verdade, o conteúdo (children) nasce debaixo do próprio header,
          sobrepondo o título — bug real, reportado pelo usuário ("o header fica em cima de
          Colunas"). */}
      <BottomSheetView style={[styles.body, { paddingTop: headHeight, paddingBottom: 16 + insets.bottom }]}>
        {/* Field usa isso pra trocar TextInput por BottomSheetTextInput — sem esse componente
            específico da lib, o teclado não sabe que um input aqui dentro ganhou foco e não
            reposiciona nada, cobrindo o campo (bug real reportado pelo usuário). */}
        <InsideSheetContext.Provider value={true}>{children}</InsideSheetContext.Provider>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18,
    paddingTop: 6, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '700' },
  tag: { fontFamily: 'Menlo', fontSize: 11.5, borderRadius: 7, paddingVertical: 3, paddingHorizontal: 7 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: 16 },
});
