import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/design/useTheme';
import { tokenize, type TokenType } from './highlight';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const COLORS: Record<'dark' | 'light', Record<TokenType, string>> = {
  dark: { com: '#6E7681', str: '#7BD88F', card: '#64D2FF', op: '#64D2FF', kw: '#FF7AB2', num: '#FF9F0A', br: '#8E8E93', pun: '#9CA3AF', text: '#FFFFFF' },
  light: { com: '#8A8F98', str: '#1E7F35', card: '#0062CC', op: '#0062CC', kw: '#A036C4', num: '#B35A00', br: '#6E6E73', pun: '#6B7280', text: '#000000' },
};

interface Props {
  code: string;
  onChangeText: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  editable?: boolean;
}

// Técnica de sobreposição: um <Text> colorido embaixo e um <TextInput> transparente por cima,
// com só o cursor visível (§12). Funciona só se as duas caixas tiverem exatamente a mesma
// métrica — por isso `metrics` é compartilhado entre as duas, nunca duplicado.
export function CodeEditor({ code, onChangeText, onFocus, onBlur, editable = true }: Props) {
  const { colors, scheme } = useTheme();
  const tokens = useMemo(() => tokenize(code), [code]);
  const palette = COLORS[scheme];

  return (
    // Sem borda e sem cartão arredondado de propósito — pedido do usuário ("não quero borda
    // por volta do código"). O fundo (colors.surface) é o mesmo do container em DiagramScreen,
    // pra ficar tudo uma superfície só, sem costura de cor nenhuma.
    <View style={[styles.wrap, { backgroundColor: colors.surface }]}>
      {/* Bug real: rolar dava a impressão de escrolar, mas o texto colorido ficava parado —
          o <Text> de realce e o TextInput eram irmãos soltos; o TextInput rolava por conta
          própria (scroll nativo dele, invisível já que o texto dele é transparente) sem mexer
          no <Text> absoluto por baixo, que sempre desenhava a partir do topo do wrap. Corrigido
          pondo os dois dentro do MESMO ScrollView (scrollEnabled=false no TextInput, ele só
          cresce com o conteúdo) — como sobem juntos como uma unidade só, nunca mais desalinham. */}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always">
        <View style={styles.editArea}>
          <Text style={[StyleSheet.absoluteFill, metrics, styles.hl]} allowFontScaling={false}>
            {tokens.map((t, i) => (
              <Text key={i} style={{ color: palette[t.type], fontStyle: t.type === 'com' ? 'italic' : 'normal', fontWeight: t.type === 'kw' ? '600' : '400' }}>
                {t.text}
              </Text>
            ))}
            {'\n'}
          </Text>
          <TextInput
            value={code}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            editable={editable}
            multiline
            scrollEnabled={false}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            allowFontScaling={false}
            style={[metrics, styles.input, { color: 'transparent' }]}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const metrics = {
  fontFamily: monoFont,
  fontSize: 13.5,
  lineHeight: 21.9,
  letterSpacing: 0,
  padding: 14,
};

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  editArea: { flex: 1 },
  hl: { pointerEvents: 'none' },
  input: { textAlignVertical: 'top' },
});
