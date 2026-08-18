import type { LayoutChangeEvent } from 'react-native';
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
  onLayout?: (height: number) => void;
}

// A barra contextual (§11) — não-modal, persistente, flutua ACIMA do canvas em vez de
// empurrá-lo. Bug real: antes disso ela era um irmão de flex normal, então aparecer/sumir
// encolhia/crescia o WebView de verdade — e cada mudança de tamanho disparava o
// ResizeObserver do runtime, que reencaixa (fit()) o diagrama, mudando o zoom sozinho toda
// vez que algo era selecionado (reportado pelo usuário: "seleciona e dá um zoom out").
// position:'absolute' tira a barra do fluxo — o WebView nunca muda de tamanho por causa
// dela, então nunca reencaixa sozinho. `onLayout` reporta a altura de verdade pra quem
// precisa desviar dela (os FABs do canvas, ver DiagramScreen).
export function ActionBar({ title, items, onClose, onLayout }: Props) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => onLayout?.(e.nativeEvent.layout.height)}
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
  wrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 16, paddingBottom: 9 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { flex: 1, fontSize: 13.5 },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  act: {
    minWidth: 70, alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: 13, paddingVertical: 10, paddingHorizontal: 10,
  },
});
