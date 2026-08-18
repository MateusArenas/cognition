import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../useTheme';

interface Props {
  label: string;
  onPress?: () => void;
  mono?: boolean;
}

// Cápsula translúcida com blur — equivalente ao backdrop-filter do protótipo (§5.2).
export function Chip({ label, onPress, mono }: Props) {
  const { colors, radius, scheme } = useTheme();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.45 : 1, borderRadius: radius.pill })}>
      <BlurView
        intensity={40}
        tint={scheme}
        style={[styles.chip, { borderRadius: radius.pill, borderColor: colors.separator }]}
      >
        <Text style={{ color: mono ? colors.labelSecondary : colors.blue, fontSize: mono ? 12 : 13, fontWeight: mono ? '400' : '500' }}>
          {label}
        </Text>
      </BlurView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
