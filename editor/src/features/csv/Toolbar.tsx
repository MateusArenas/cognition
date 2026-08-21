import { BlurView } from 'expo-blur';
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
// caso de uso — ver docs/03-design-system.md) — porte de tabelas.html `.toolbar`/`.bottom`
// (que já usava `backdrop-filter: blur(20px)` no protótipo — vidro fosco, não um painel opaco).
// Continua um filho flex normal da coluna em CsvScreen.tsx (não position:absolute) — é assim
// que a grade automaticamente ganha só o espaço que sobra, sem precisar medir/repassar altura
// nenhuma; o bug real de conteúdo vazando por baixo da barra estava em Grid.tsx (a altura não
// era medida ali dentro, só suposta pelo flex através de um ScrollView horizontal — corrigido
// lá). Some/cede lugar pro KeyboardBar (iOS: InputAccessoryView; Android: View absoluta) só
// durante edição.
export function Toolbar({ onUndo, onRedo, canUndo, canRedo, onAddRow, onAddCol, onSort }: Props) {
  const { colors, scheme, radius } = useTheme();
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
    <View style={styles.wrap}>
      <BlurView
        intensity={80}
        tint={scheme}
        style={[
          styles.bar,
          { borderColor: colors.separator, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingBottom: 6 + insets.bottom },
        ]}
      >
        {items.map((it) => (
          <Pressable
            key={it.key}
            onPress={it.disabled ? undefined : it.onPress}
            disabled={it.disabled}
            style={({ pressed }) => [styles.btn, pressed && !it.disabled && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel={t(it.labelKey)}
          >
            <Icon name={it.icon} size={21} color={it.disabled ? colors.labelTertiary : colors.blue} />
            <Text style={{ fontSize: 10, color: it.disabled ? colors.labelTertiary : colors.blue }}>{t(it.labelKey)}</Text>
          </Pressable>
        ))}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sombra sutil pra cima — separa a barra da grade mesmo com o blur translúcido, mesma
  // linguagem de elevação flutuante que ActionBar/Sheet já usam no resto do app.
  wrap: {
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },
  bar: {
    flexDirection: 'row', paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  // Sem altura fixa no `bar` — vem do conteúdo: min-height de alvo de toque (44pt) + o padding
  // de safe area. A grade não precisa saber esse número (Toolbar continua um filho flex normal,
  // não position:absolute — ver comentário acima da função).
  btn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 10 },
  btnPressed: { opacity: 0.45 },
});
