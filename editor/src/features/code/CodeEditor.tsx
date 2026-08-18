import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
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
  const [focused, setFocused] = useState(false);
  const tokens = useMemo(() => tokenize(code), [code]);
  const palette = COLORS[scheme];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: focused ? colors.blue : 'transparent' }]}>
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
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        editable={editable}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        allowFontScaling={false}
        style={[metrics, styles.input, { color: 'transparent' }]}
      />
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
  wrap: { flex: 1, borderRadius: 12, borderWidth: 1.5, overflow: 'hidden' },
  hl: { pointerEvents: 'none' },
  input: { flex: 1, textAlignVertical: 'top' },
});
