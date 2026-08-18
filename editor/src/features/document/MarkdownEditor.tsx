import { forwardRef } from 'react';
import { StyleSheet, TextInput, type TextInputSelectionChangeEventData, type NativeSyntheticEvent } from 'react-native';
import { useTheme } from '@/design/useTheme';

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  onSelectionChange: (sel: { start: number; end: number }) => void;
  selection?: { start: number; end: number };
  onFocus?: () => void;
  onBlur?: () => void;
}

// No espírito do Notas: texto grande, sem moldura, sem numeração de linha (§13.1).
export const MarkdownEditor = forwardRef<TextInput, Props>(function MarkdownEditor(
  { value, onChangeText, onSelectionChange, selection, onFocus, onBlur },
  ref
) {
  const { colors } = useTheme();

  return (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={onChangeText}
      onSelectionChange={(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => onSelectionChange(e.nativeEvent.selection)}
      selection={selection}
      onFocus={onFocus}
      onBlur={onBlur}
      multiline
      placeholder="Comece a escrever…"
      placeholderTextColor={colors.labelTertiary}
      style={[styles.area, { color: colors.label }]}
    />
  );
});

const styles = StyleSheet.create({
  area: { flex: 1, fontSize: 17, lineHeight: 26, padding: 18, backgroundColor: 'transparent' },
});
