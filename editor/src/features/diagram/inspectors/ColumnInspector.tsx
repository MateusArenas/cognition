import { StyleSheet, Text, View } from 'react-native';
import { Field } from '@/design/components/Field';
import { KeyCaps } from '@/design/components/KeyCaps';
import { useTheme } from '@/design/useTheme';
import { useDoc } from '@/store/useDoc';
import { colunaDe } from '@/domain/mermaid/lookup';
import { updateColumn } from '@/domain/mutations/er';
import type { ColumnKey, ErDoc } from '@/domain/types';

interface Props {
  selId: string; // "TABELA#i"
}

export function ColumnInspector({ selId }: Props) {
  const { colors, radius } = useTheme();
  const doc = useDoc((s) => s.doc) as ErDoc;
  const apply = useDoc((s) => s.apply);
  const c = colunaDe(doc, selId);
  if (!c) return null;

  return (
    <View style={{ gap: 14 }}>
      <Field mono placeholder="Nome" value={c.col.name} onChangeText={(v) => apply((d) => updateColumn(d as ErDoc, c.tab.id, c.idx, { name: v }))} />
      <Field mono placeholder="Tipo" value={c.col.type} onChangeText={(v) => apply((d) => updateColumn(d as ErDoc, c.tab.id, c.idx, { type: v }))} />
      <Field value={c.col.note} placeholder="Comentário" onChangeText={(v) => apply((d) => updateColumn(d as ErDoc, c.tab.id, c.idx, { note: v }))} />
      <View>
        <Text style={[styles.section, { color: colors.labelSecondary }]}>CHAVES</Text>
        <KeyCaps
          keys={['PK', 'FK', 'UK']}
          active={c.col.keys}
          onToggle={(k) =>
            apply((d) => {
              const keys = c.col.keys.includes(k as ColumnKey) ? c.col.keys.filter((x) => x !== k) : [...c.col.keys, k as ColumnKey];
              return updateColumn(d as ErDoc, c.tab.id, c.idx, { keys });
            })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
});
