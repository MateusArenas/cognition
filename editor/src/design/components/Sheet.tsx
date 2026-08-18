import { BottomSheetModal, BottomSheetView, type BottomSheetModalProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useMemo, useRef, useState, type ForwardedRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
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

// @gorhom/bottom-sheet com BottomSheetModal, snap inicial em 45%, grabber 36x5, cantos 14.
// Fundo `bg` — as linhas agrupadas por dentro é que são `surface` (§5.2).
export const Sheet = forwardRef<BottomSheetModal, Props>(function Sheet(
  { title, tag, children, snapPoints, onChange, ...rest },
  ref
) {
  const { colors, radius, space } = useTheme();
  const { setOpen } = useOptionalSheetChrome();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Só o snap pequeno por padrão — sem um '92%' fixo, quem decide o quão alto o sheet pode
  // ficar é o próprio conteúdo (`enableDynamicSizing`, abaixo), não um número arbitrário. Quem
  // chama com snapPoints explícito (ShareSheet) continua no controle.
  const points = useMemo(() => snapPoints ?? ['45%'], [snapPoints]);
  // Teto pro tamanho dinâmico — sem isso um conteúdo muito comprido tentaria abrir maior que a
  // tela. Mesma folga de sempre (92%) menos a safe area de cima.
  const maxDynamicContentSize = Math.round(windowHeight * 0.92 - insets.top);
  const [headHeight, setHeadHeight] = useState(0);
  // onChange dispara a cada TROCA DE SNAP, não só abrir/fechar — com o dynamic sizing (acima),
  // um único "abrir" já passa por 2+ índices (o snap inicial, depois o snap de conteúdo medido
  // de verdade). setOpen(index>=0) ingênuo chamava "abriu" de novo em cada uma dessas trocas
  // intermediárias — openCount (SheetChrome.tsx) é um contador, incrementava mais vezes do que
  // decrementava no fechar (um único -1), ficando preso > 0 pra sempre: a tela continuava
  // encolhida mesmo com tudo fechado (bug real reportado pelo usuário — "às vezes fica
  // travado"). Só chama setOpen quando o estado aberto/fechado de fato muda de borda.
  const wasOpenRef = useRef(false);
  const handleChange = useCallback<NonNullable<BottomSheetModalProps['onChange']>>(
    (index, position, type) => {
      const isOpen = index >= 0;
      if (isOpen !== wasOpenRef.current) {
        wasOpenRef.current = isOpen;
        setOpen(isOpen);
      }
      onChange?.(index, position, type);
    },
    [onChange, setOpen]
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={points}
      enableDynamicSizing
      maxDynamicContentSize={maxDynamicContentSize}
      // Sem isso, no snap mais alto (dinâmico ou '92%' explícito) o header nasce colado no
      // status bar/notch — reportado pelo usuário ("respeitar o safe area do status bar").
      topInset={insets.top}
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
      {/* headHeight sozinho só evita a sobreposição (acima) — sem folga extra, a primeira
          linha do conteúdo ficava colada na borda do header, sem respiro nenhum (bug real
          reportado pelo usuário). space.lg por cima e por baixo dá o respiro — mesma folga que
          o rodapé já tinha, agora espelhada no topo. */}
      <BottomSheetView style={[styles.body, { paddingTop: headHeight + space.lg, paddingBottom: space.lg + insets.bottom }]}>
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
