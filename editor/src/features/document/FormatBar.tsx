import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design/useTheme';
import { REGUA, TABELA_MODELO, cycleHeading, insertAt, insertLink, toggleLinePrefix, toggleTask, toggleWrap, type EditResult } from '@/domain/markdown/format';

interface Selection {
  start: number;
  end: number;
}

interface Props {
  text: string;
  selection: Selection;
  onApply: (r: EditResult) => void;
  onInsertDiagram: (pos: number) => void;
}

// Doze botões colados ao teclado (§13.2) — cada um age sobre a seleção (envolver) ou sobre as
// linhas do cursor (prefixo), como no Notas.
export function FormatBar({ text, selection, onApply, onInsertDiagram }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { start, end } = selection;

  const acoes: Array<{ key: string; label: string; run: () => void }> = [
    { key: 'titulo', label: 'Título', run: () => onApply(cycleHeading(text, start)) },
    { key: 'negrito', label: 'Negrito', run: () => onApply(toggleWrap(text, start, end, '**')) },
    { key: 'italico', label: 'Itálico', run: () => onApply(toggleWrap(text, start, end, '*')) },
    { key: 'lista', label: 'Lista', run: () => onApply(toggleLinePrefix(text, start, end, '- ')) },
    { key: 'numerada', label: 'Numerada', run: () => onApply(toggleLinePrefix(text, start, end, '1. ')) },
    { key: 'tarefa', label: 'Tarefa', run: () => onApply(toggleTask(text, start, end)) },
    { key: 'citacao', label: 'Citação', run: () => onApply(toggleLinePrefix(text, start, end, '> ')) },
    { key: 'codigo', label: 'Código', run: () => onApply(toggleWrap(text, start, end, '`')) },
    { key: 'link', label: 'Link', run: () => onApply(insertLink(text, start, end)) },
    { key: 'tabela', label: 'Tabela', run: () => onApply(insertAt(text, end, TABELA_MODELO)) },
    { key: 'diagrama', label: 'Diagrama', run: () => onInsertDiagram(end) },
    { key: 'linha', label: 'Linha', run: () => onApply(insertAt(text, end, REGUA)) },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.separator }]}
      contentContainerStyle={[styles.content, { paddingBottom: 8 + insets.bottom }]}
      keyboardShouldPersistTaps="always"
    >
      {acoes.map((a) => (
        <Pressable key={a.key} onPress={a.run} style={[styles.btn, { backgroundColor: colors.surface2 }]}>
          <Text style={{ color: colors.label, fontSize: 13.5 }}>{a.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth },
  content: { flexDirection: 'row', gap: 7, padding: 8 },
  btn: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 10 },
});
