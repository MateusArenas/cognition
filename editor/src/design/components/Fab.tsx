import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../useTheme';
import { Icon, type IconName } from '../Icon';

interface Props {
  icon: IconName;
  onPress: () => void;
  primary?: boolean;
  accessibilityLabel: string;
}

// 56pt azul preenchido para a ação primária, 48pt material translúcido para as secundárias (§5.2).
export function Fab({ icon, onPress, primary, accessibilityLabel }: Props) {
  const { colors, scheme } = useTheme();
  const size = primary ? 56 : 48;

  const content = (
    <Icon name={icon} size={primary ? 26 : 23} color={primary ? '#fff' : colors.blue} />
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.fab,
        { width: size, height: size, borderRadius: size / 2 },
        primary ? { backgroundColor: colors.blue } : { borderColor: colors.separator, borderWidth: StyleSheet.hairlineWidth },
        pressed && styles.pressed,
      ]}
    >
      {primary ? (
        content
      ) : (
        <BlurView intensity={40} tint={scheme} style={[StyleSheet.absoluteFill, styles.fab, { borderRadius: size / 2 }]}>
          {content}
        </BlurView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pressed: { transform: [{ scale: 0.92 }], opacity: 0.85 },
});
