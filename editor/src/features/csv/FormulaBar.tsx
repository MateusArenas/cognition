import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Field } from '@/design/components/Field';
import { useTheme } from '@/design/useTheme';
import { colName } from '@/domain/csv/formula';
import type { CsvDoc } from '@/domain/types';
import { useI18n } from '@/i18n/I18nProvider';
import { useLiveField } from '@/store/useDoc';
import { KEYBOARD_ACCESSORY_ID } from './KeyboardBar';

export interface FormulaBarHandle {
  focus: () => void;
  insertAtCursor: (text: string) => void;
}

interface Props {
  r: number; // célula-âncora da seleção (norm().r1,c1) — é sempre ela que a barra edita
  c: number;
  onSubmit: (dr: number) => void;
  onFocusChange?: (focused: boolean) => void;
}

// Barra de fórmulas — referência da célula + valor cru + edição. Em vez de um TextInput
// flutuante posicionado exatamente sobre a célula (exigiria acompanhar scroll horizontal E
// vertical de uma FlashList virtualizada, matemática frágil sem dispositivo real pra calibrar),
// a edição acontece AQUI: um único campo sempre visível, mesmo lugar que apps de planilha no
// celular (Google Sheets/Excel) já usam como superfície principal de edição. Tocar a célula
// na grade só troca a seleção/foca este campo — mesmo resultado final do protótipo de
// referência (editar a célula tocada), caminho mais simples e mais robusto sem simulador à mão
// a cada ajuste de pixel.
export const FormulaBar = forwardRef<FormulaBarHandle, Props>(function FormulaBar({ r, c, onSubmit, onFocusChange }, handleRef) {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const inputRef = useRef<TextInput>(null);
  const selRef = useRef({ start: 0, end: 0 });
  const field = useLiveField(
    (d) => (d.tipo === 'csv' ? (d as CsvDoc).cells[r]?.[c] ?? '' : ''),
    (d, v) => {
      if (d.tipo === 'csv' && (d as CsvDoc).cells[r]) (d as CsvDoc).cells[r][c] = v;
    }
  );

  useImperativeHandle(handleRef, () => ({
    focus: () => inputRef.current?.focus(),
    insertAtCursor: (text: string) => {
      const { start, end } = selRef.current;
      const before = field.value.slice(0, start);
      const after = field.value.slice(end);
      const next = before + text + after;
      field.onChangeText(next);
      const pos = start + text.length;
      selRef.current = { start: pos, end: pos };
      requestAnimationFrame(() => inputRef.current?.setNativeProps({ selection: { start: pos, end: pos } }));
    },
  }));

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface2, borderBottomColor: colors.separator }]}>
      <View style={[styles.ref, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
        <Text style={[styles.refText, { color: colors.labelSecondary }]}>{colName(c)}{r + 1}</Text>
      </View>
      <Text style={[styles.fx, { color: colors.labelTertiary }]}>fx</Text>
      <Field
        ref={inputRef}
        value={field.value}
        onFocus={() => {
          field.onFocus();
          onFocusChange?.(true);
        }}
        onChangeText={field.onChangeText}
        onBlur={() => {
          field.onBlur();
          onFocusChange?.(false);
        }}
        onSelectionChange={(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
          selRef.current = e.nativeEvent.selection;
        }}
        onSubmitEditing={() => onSubmit(1)}
        inputAccessoryViewID={KEYBOARD_ACCESSORY_ID}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={t('csv.tapCell')}
        style={[styles.field, { marginBottom: 0, paddingVertical: 6, backgroundColor: 'transparent', borderColor: 'transparent' }]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  ref: { minWidth: 52, height: 26, paddingHorizontal: 8, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  refText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  fx: { fontStyle: 'italic', fontWeight: '600', fontSize: 15, fontFamily: 'Georgia' },
  field: { flex: 1, fontSize: 15 },
});
