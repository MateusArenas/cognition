import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';

interface Item {
  key: string;
  icon: IconName;
  labelKey: string;
  onPress: () => void;
  disabled?: boolean;
}

interface Props {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAddRow: () => void;
  onAddCol: () => void;
  onSort: () => void;
}

// Barra inferior SEMPRE visível (não contextual-por-seleção como ActionBar, que é pra outro
// caso de uso — ver docs/03-design-system.md) — porte de tabelas.html `.toolbar`. Some/cede
// lugar pro KeyboardBar (iOS: InputAccessoryView; Android: View absoluta) só durante edição.
export function Toolbar({ onUndo, onRedo, canUndo, canRedo, onAddRow, onAddCol, onSort }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const items: Item[] = [
    { key: 'undo', icon: 'undo', labelKey: 'common.undo', onPress: onUndo, disabled: !canUndo },
    { key: 'redo', icon: 'redo', labelKey: 'common.redo', onPress: onRedo, disabled: !canRedo },
    { key: 'row', icon: 'plus', labelKey: 'csv.row', onPress: onAddRow },
    { key: 'col', icon: 'columns', labelKey: 'csv.column', onPress: onAddCol },
    { key: 'sort', icon: 'sort', labelKey: 'csv.sort', onPress: onSort },
  ];

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface2, borderTopColor: colors.separator, paddingBottom: 6 + insets.bottom }]}>
      {items.map((it) => (
        <Pressable
          key={it.key}
          onPress={it.disabled ? undefined : it.onPress}
          disabled={it.disabled}
          style={styles.btn}
          accessibilityRole="button"
          accessibilityLabel={t(it.labelKey)}
        >
          <Icon name={it.icon} size={21} color={it.disabled ? colors.labelTertiary : colors.blue} />
          <Text style={{ fontSize: 10, color: it.disabled ? colors.labelTertiary : colors.blue }}>{t(it.labelKey)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 52, borderTopWidth: StyleSheet.hairlineWidth },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
