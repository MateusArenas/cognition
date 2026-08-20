import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../useTheme';

interface Props {
  tone: 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

// Fundo e borda tingidos na cor do tom, opacidade baixa — cor cheia só no título, mensagem no
// label padrão. Nunca texto vermelho solto sem moldura (§5.2, mesmo padrão do protótipo).
export function Banner({ tone, title, message }: Props) {
  const { colors, radius, space } = useTheme();
  const tint = tone === 'error' ? colors.red : tone === 'warning' ? colors.orange : colors.blue;
  return (
    <View style={[styles.box, { borderColor: tint + '44', backgroundColor: tint + '14', borderRadius: radius.card, padding: space.sm }]}>
      <Text style={[styles.title, { color: tint }]}>{title}</Text>
      {message ? <Text style={{ color: colors.label, marginTop: 2 }}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth },
  title: { fontWeight: '600', fontSize: 13 },
});
