import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/design/Icon';
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
// linhas do cursor (prefixo), como no Notas. Ícone em cima do rótulo, mesmo padrão visual do
// `.act` do protótipo (editor-mermaid.html, MD_BOTOES) e da ActionBar contextual do canvas.
export function FormatBar({ text, selection, onApply, onInsertDiagram }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { start, end } = selection;

  const acoes: Array<{ key: string; icon: IconName; label: string; run: () => void }> = [
    { key: 'titulo', icon: 'heading', label: 'Título', run: () => onApply(cycleHeading(text, start)) },
    { key: 'negrito', icon: 'bold', label: 'Negrito', run: () => onApply(toggleWrap(text, start, end, '**')) },
    { key: 'italico', icon: 'italic', label: 'Itálico', run: () => onApply(toggleWrap(text, start, end, '*')) },
    { key: 'lista', icon: 'list', label: 'Lista', run: () => onApply(toggleLinePrefix(text, start, end, '- ')) },
    { key: 'numerada', icon: 'listOrdered', label: 'Numerada', run: () => onApply(toggleLinePrefix(text, start, end, '1. ')) },
    { key: 'tarefa', icon: 'listChecks', label: 'Tarefa', run: () => onApply(toggleTask(text, start, end)) },
    { key: 'citacao', icon: 'quote', label: 'Citação', run: () => onApply(toggleLinePrefix(text, start, end, '> ')) },
    { key: 'codigo', icon: 'code', label: 'Código', run: () => onApply(toggleWrap(text, start, end, '`')) },
    { key: 'link', icon: 'link', label: 'Link', run: () => onApply(insertLink(text, start, end)) },
    { key: 'tabela', icon: 'columns', label: 'Tabela', run: () => onApply(insertAt(text, end, TABELA_MODELO)) },
    { key: 'diagrama', icon: 'flow', label: 'Diagrama', run: () => onInsertDiagram(end) },
    { key: 'linha', icon: 'minus', label: 'Linha', run: () => onApply(insertAt(text, end, REGUA)) },
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
          <Icon name={a.icon} size={19} color={colors.blue} />
          <Text style={{ color: colors.label, fontSize: 11 }}>{a.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth },
  content: { flexDirection: 'row', gap: 7, padding: 8 },
  btn: { minWidth: 62, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 12 },
});
