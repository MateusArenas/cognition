import { BlurView } from 'expo-blur';
import { Keyboard, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Altura real (com margem), pra CodeEditor reservar esse tanto no fim do conteúdo rolável. */
  onLayout?: (height: number) => void;
}

// Colada ao teclado na aba Código (§12) — desfazer/refazer (mesma ação do HUD do canvas, ver
// docs/06-canvas.md) e Confirmar. Confirmar só chama Keyboard.dismiss() — isso já tira o foco
// do TextInput (o cursor some) e dispara o onBlur que existe (commitCode), sem precisar de ref.
//
// Visual: cápsula flutuante com blur (mesma linguagem do Chip/ActionBar — §5.2), não uma barra
// full-bleed colada nas bordas. Pedido do usuário depois da primeira versão ("tem que ser mais
// pegada apple... margens pra ver por trás algo sutil e tamanho compacto").
export function CodeKeyboardBar({ canUndo, canRedo, onUndo, onRedo, onLayout }: Props) {
  const { colors, radius, scheme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    // KeyboardStickyView por si só já cola sem gap nenhum — o afastamento vinha inteiro de
    // marginBottom: insets.bottom no wrap, aplicado igual com o teclado aberto OU fechado.
    // Com o teclado fechado isso é certo (o home indicator ocupa esse espaço); aberto, o
    // teclado já vai até o fim físico da tela — não sobra insets.bottom nenhum ali, então
    // aquela margem só empurrava a barra pra longe do teclado à toa (bug real reportado pelo
    // usuário: "a toolbar ainda está muito longe do keyboard"). offset por estado resolve:
    // insets.bottom só entra fechado; aberto, cola direto (só a margem fixa de 2 do wrap).
    <KeyboardStickyView offset={{ closed: -insets.bottom, opened: 0 }}>
      <View
        // A barra é um transform (translateY) por cima do teclado — não reflui layout, então o
        // espaço que ela reserva como irmã comum (flex) não coincide exatamente com onde ela
        // visualmente termina depois de deslizar. Reportar a altura aqui deixa CodeEditor
        // reservar esse tanto A MAIS no fim do conteúdo rolável, garantindo que o texto sempre
        // limpa a barra de verdade, sem depender de acertar esse cálculo de layout+transform no
        // pixel (bug real: "ainda tampando texto... tem que dar pra escrolar mais").
        onLayout={(e: LayoutChangeEvent) => onLayout?.(e.nativeEvent.layout.height + 2)}
        style={styles.wrap}
      >
        <BlurView intensity={50} tint={scheme} style={[styles.bar, { borderRadius: radius.card, borderColor: colors.separator }]}>
          <View style={styles.side}>
            <Pressable
              onPress={onUndo}
              disabled={!canUndo}
              accessibilityRole="button"
              accessibilityLabel={t('common.undo')}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: !canUndo ? 0.3 : pressed ? 0.5 : 1 })}
            >
              <Icon name="undo" size={22} />
            </Pressable>
            <Pressable
              onPress={onRedo}
              disabled={!canRedo}
              accessibilityRole="button"
              accessibilityLabel={t('common.redo')}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: !canRedo ? 0.3 : pressed ? 0.5 : 1 })}
            >
              <Icon name="redo" size={22} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => Keyboard.dismiss()}
            accessibilityRole="button"
            accessibilityLabel={t('code.confirmAndClose')}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Icon name="check" size={22} />
          </Pressable>
        </BlurView>
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  // Sombra e margens no wrap (sem overflow:hidden — cortaria a própria sombra); raio + blur +
  // clip no filho, senão o BlurView vaza retângulo por fora dos cantos arredondados.
  wrap: {
    margin: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  side: { flexDirection: 'row', gap: 24 },
});
