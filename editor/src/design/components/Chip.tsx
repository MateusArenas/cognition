import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Icon, type IconName } from '../Icon';
import { useTheme } from '../useTheme';

interface Props {
  label?: string;
  icon?: IconName;
  accessibilityLabel?: string;
  onPress?: () => void;
  mono?: boolean;
  disabled?: boolean;
}

// Cápsula translúcida com blur — equivalente ao backdrop-filter do protótipo (§5.2). Com
// `icon` em vez de `label` vira uma cápsula redonda só-ícone (Desfazer/Refazer do HUD do
// canvas), mesmo visual, sem duplicar o Pressable+BlurView.
export function Chip({ label, icon, accessibilityLabel, onPress, mono, disabled }: Props) {
  const { colors, radius, scheme } = useTheme();
  const tintColor = mono ? colors.labelSecondary : colors.blue;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({ opacity: disabled ? 0.35 : pressed ? 0.45 : 1, borderRadius: radius.pill })}
    >
      <BlurView
        intensity={40}
        tint={scheme}
        style={[
          icon ? styles.chipIcon : styles.chip,
          { borderRadius: radius.pill, borderColor: colors.separator },
        ]}
      >
        {icon ? (
          <Icon name={icon} size={19} color={tintColor} />
        ) : (
          <Text style={{ color: tintColor, fontSize: mono ? 12 : 13, fontWeight: mono ? '400' : '500' }}>{label}</Text>
        )}
      </BlurView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  chipIcon: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
});
