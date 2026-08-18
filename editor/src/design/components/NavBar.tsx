import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../useTheme';

interface Action {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

interface Props {
  title: string;
  subtitle?: string;
  left?: Action;
  right?: Action | Action[];
  titleContent?: ReactNode; // ex.: um TextInput editável no lugar do título estático
}

// 44pt + safe area, título centrado com legenda embaixo, ações em azul. Hairline inferior de
// 0.5pt (§5.2).
export function NavBar({ title, subtitle, left, right, titleContent }: Props) {
  const { colors, type, space } = useTheme();
  const insets = useSafeAreaInsets();
  const rightActions = right ? (Array.isArray(right) ? right : [right]) : [];

  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top + 4, backgroundColor: colors.surface, borderBottomColor: colors.separator },
      ]}
    >
      <View style={styles.side}>
        {left ? <NavButton {...left} color={colors.blue} /> : null}
      </View>
      <View style={styles.center}>
        {titleContent ?? (
          <Text style={[{ color: colors.label, textAlign: 'center' }, type.headline]} numberOfLines={1}>
            {title}
          </Text>
        )}
        {subtitle ? (
          <Text style={[{ color: colors.labelSecondary, textAlign: 'center' }, type.caption]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.sideRight, { gap: space.sm }]}>
        {rightActions.map((a) => (
          <NavButton key={a.label} {...a} color={colors.blue} />
        ))}
      </View>
    </View>
  );
}

function NavButton({ label, onPress, disabled, color }: Action & { color: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={({ pressed }) => ({ opacity: disabled ? 0.35 : pressed ? 0.45 : 1 })}>
      <Text style={{ color, fontSize: 17 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { minWidth: 44, justifyContent: 'center' },
  sideRight: { flexDirection: 'row', justifyContent: 'flex-end' },
  center: { flex: 1, alignItems: 'center' },
});
