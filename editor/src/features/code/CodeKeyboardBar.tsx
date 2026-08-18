import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

// Colada ao teclado na aba Código (§12) — desfazer/refazer (mesma ação do HUD do canvas, ver
// docs/06-canvas.md) e Confirmar. Confirmar só chama Keyboard.dismiss() — isso já tira o foco
// do TextInput (o cursor some) e dispara o onBlur que existe (commitCode), sem precisar de ref.
export function CodeKeyboardBar({ canUndo, canRedo, onUndo, onRedo }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardStickyView>
      <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.separator, paddingBottom: 8 + insets.bottom }]}>
        <View style={styles.side}>
          <Pressable
            onPress={onUndo}
            disabled={!canUndo}
            accessibilityRole="button"
            accessibilityLabel="Desfazer"
            hitSlop={8}
            style={({ pressed }) => ({ opacity: !canUndo ? 0.3 : pressed ? 0.5 : 1 })}
          >
            <Icon name="undo" size={21} />
          </Pressable>
          <Pressable
            onPress={onRedo}
            disabled={!canRedo}
            accessibilityRole="button"
            accessibilityLabel="Refazer"
            hitSlop={8}
            style={({ pressed }) => ({ opacity: !canRedo ? 0.3 : pressed ? 0.5 : 1 })}
          >
            <Icon name="redo" size={21} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => Keyboard.dismiss()}
          accessibilityRole="button"
          accessibilityLabel="Confirmar e fechar o teclado"
          hitSlop={8}
          style={({ pressed }) => [styles.confirm, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Text style={{ color: colors.blue, fontSize: 15, fontWeight: '600' }}>Confirmar</Text>
          <Icon name="check" size={16} />
        </Pressable>
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  side: { flexDirection: 'row', gap: 22 },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
