import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../useTheme';
import { Icon, type IconName } from '../Icon';

export interface ActionBarItem {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  primary?: boolean;
}

interface Props {
  title: string;
  items: ActionBarItem[];
  onClose: () => void;
}

// A barra contextual (§11) — não-modal, persistente, acima da tab bar. Isto é só o shell
// visual (cabeçalho + fila horizontal de ações); a lógica de qual ação aparece por tipo de
// seleção é da Etapa 6 (features/diagram/ActionBarController.tsx).
export function ActionBar({ title, items, onClose }: Props) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.surface, borderTopColor: colors.separator, paddingBottom: 8 + insets.bottom },
      ]}
    >
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: colors.blue }]} />
        <Text style={[styles.title, { color: colors.labelSecondary }]} numberOfLines={1}>
          {title}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancelar seleção"
          hitSlop={8}
          style={({ pressed }) => [styles.close, { backgroundColor: colors.surface3, opacity: pressed ? 0.5 : 1 }]}
        >
          <Icon name="close" size={14} color={colors.labelSecondary} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}
      >
        {items.map((item) => (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            style={({ pressed }) => [
              styles.act,
              { backgroundColor: item.primary ? colors.blue : colors.surface2 },
              pressed && { opacity: 0.8, transform: [{ scale: 0.93 }] },
            ]}
          >
            <Icon name={item.icon} size={21} color={item.primary ? '#fff' : item.destructive ? colors.red : colors.blue} />
            <Text
              style={{
                fontSize: 11,
                fontWeight: '500',
                color: item.primary ? '#fff' : item.destructive ? colors.red : colors.blue,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 16, paddingBottom: 9 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { flex: 1, fontSize: 13.5 },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  act: {
    minWidth: 70, alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: 13, paddingVertical: 10, paddingHorizontal: 10,
  },
});
