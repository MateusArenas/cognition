import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Field } from '@/design/components/Field';
import { KeyCaps } from '@/design/components/KeyCaps';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import { useDoc } from '@/store/useDoc';
import { useI18n } from '@/i18n/I18nProvider';
import { addColumn, removeColumn, updateColumn } from '@/domain/mutations/er';
import type { ColumnKey, ErDoc } from '@/domain/types';

interface Props {
  id: string;
}

// Lista de colunas da tabela — cada linha edita ao vivo (nome/tipo/chaves), sem confirmação
// extra, e some com um toque (§11).
export function TableInspector({ id }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const doc = useDoc((s) => s.doc) as ErDoc;
  const apply = useDoc((s) => s.apply);
  const t2 = doc.tables.find((x) => x.id === id);
  if (!t2) return null;

  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.section, { color: colors.labelSecondary }]}>{t('diagram.columns')}</Text>
      {t2.cols.map((c, i) => (
        <View key={i} style={[styles.row, { backgroundColor: colors.surface }]}>
          <Field mono value={c.type} onChangeText={(v) => apply((d) => updateColumn(d as ErDoc, id, i, { type: v }))} style={styles.cty} />
          <Field mono value={c.name} onChangeText={(v) => apply((d) => updateColumn(d as ErDoc, id, i, { name: v }))} style={styles.cnm} />
          <KeyCaps
            keys={['PK', 'FK', 'UK']}
            active={c.keys}
            onToggle={(k) =>
              apply((d) => {
                const keys = c.keys.includes(k as ColumnKey) ? c.keys.filter((x) => x !== k) : [...c.keys, k as ColumnKey];
                return updateColumn(d as ErDoc, id, i, { keys });
              })
            }
          />
          <Pressable onPress={() => apply((d) => removeColumn(d as ErDoc, id, i))} style={[styles.mini, { backgroundColor: colors.surface3 }]}>
            <Icon name="trash" size={16} color={colors.labelSecondary} />
          </Pressable>
        </View>
      ))}
      <Pressable
        onPress={() => apply((d) => addColumn(d as ErDoc, id, { type: 'varchar', name: 'campo', keys: [], note: '' }))}
        style={[styles.add, { backgroundColor: colors.surface }]}
      >
        <Icon name="plus" size={18} color={colors.blue} />
        <Text style={{ color: colors.blue, fontSize: 15 }}>{t('diagram.addColumn')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 7, alignItems: 'center', borderRadius: 12, padding: 8 },
  cty: { flex: 0.35, paddingVertical: 9, paddingHorizontal: 9 },
  cnm: { flex: 1, paddingVertical: 9, paddingHorizontal: 9 },
  mini: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, padding: 13, marginTop: 4 },
});
