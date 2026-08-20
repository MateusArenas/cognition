import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Icon, type IconName } from '../Icon';
import { useTheme } from '../useTheme';

interface Props {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
}

// Botão de largura cheia, fundo azul-do-sistema em baixa opacidade, ícone+rótulo azuis,
// opacidade reduzida no toque (sem trocar cor de fundo) — o padrão "Apple/iPhone sutil" usado
// em toda ação primária de tela cheia do cliente de banco (rodar query, compartilhar diagrama,
// copiar DDL), em vez de duplicar o mesmo Pressable+estilos em cada tela.
export function TintedButton({ label, icon, onPress, disabled, busy, accessibilityLabel }: Props) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={disabled || busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.blue + '1F', borderRadius: radius.card },
        (pressed || disabled || busy) && styles.buttonPressed,
      ]}
    >
      {busy ? <ActivityIndicator color={colors.blue} /> : icon ? <Icon name={icon} size={17} color={colors.blue} /> : null}
      <Text style={[styles.label, { color: colors.blue }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 44 },
  label: { fontSize: 15, fontWeight: '600' },
  buttonPressed: { opacity: 0.45 },
});
