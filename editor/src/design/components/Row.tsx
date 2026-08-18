import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../useTheme';
import { Icon } from '../Icon';

interface Props {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  navigable?: boolean;
  left?: ReactNode;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

// A linha da lista inset do iOS — alvo mínimo de 44pt (§5.3), opacidade reduz no toque em vez
// de mudar cor de fundo.
export function Row({ title, subtitle, onPress, onLongPress, navigable, left, right, style }: Props) {
  const { colors, type, space } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        { paddingHorizontal: space.lg, opacity: pressed && onPress ? 0.45 : 1 },
        style,
      ]}
    >
      {left}
      <View style={styles.body}>
        <Text style={[{ color: colors.label }, type.body]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[{ color: colors.labelSecondary, marginTop: 2 }, type.footnote]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {navigable ? <Icon name="chevronRight" size={16} color={colors.labelTertiary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 },
  body: { flex: 1, minWidth: 0 },
});
