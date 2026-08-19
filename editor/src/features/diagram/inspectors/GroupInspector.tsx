import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import { useDoc } from '@/store/useDoc';
import { setNodeGroup } from '@/domain/mutations/flow';
import type { FlowDoc } from '@/domain/types';

interface Props {
  id: string;
}

// Quais nós pertencem ao grupo — mesmo padrão de "Colunas" da tabela (§11): cada linha edita
// ao vivo, sem confirmação extra. Renomear o grupo em si fica na ActionBar direto ("Nome"),
// igual tabela faz — aqui é só composição.
export function GroupInspector({ id }: Props) {
  const { colors, radius } = useTheme();
  const doc = useDoc((s) => s.doc) as FlowDoc;
  const apply = useDoc((s) => s.apply);
  const g = doc.groups.find((x) => x.id === id);
  if (!g) return null;

  const fora = doc.nodes.filter((n) => !g.nodes.includes(n.id));

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={[styles.section, { color: colors.labelSecondary }]}>NÓS DO GRUPO</Text>
        {g.nodes.length ? (
          g.nodes.map((nid) => {
            const n = doc.nodes.find((x) => x.id === nid);
            return (
              <View key={nid} style={[styles.row, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.label, flex: 1 }} numberOfLines={1}>{n?.label || nid}</Text>
                <Pressable onPress={() => apply((d) => setNodeGroup(d as FlowDoc, nid, null))} style={[styles.mini, { backgroundColor: colors.surface3 }]}>
                  <Icon name="trash" size={16} color={colors.labelSecondary} />
                </Pressable>
              </View>
            );
          })
        ) : (
          <Text style={{ color: colors.labelSecondary }}>Nenhum nó ainda.</Text>
        )}
      </View>

      {fora.length ? (
        <View>
          <Text style={[styles.section, { color: colors.labelSecondary }]}>ADICIONAR</Text>
          <View style={styles.grid}>
            {fora.map((n) => (
              <Pressable
                key={n.id}
                onPress={() => apply((d) => setNodeGroup(d as FlowDoc, n.id, id))}
                style={[styles.chip, { borderRadius: radius.control + 2, backgroundColor: colors.surface }]}
              >
                <Text style={{ color: colors.label, fontSize: 13 }}>{n.label || n.id}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 7, alignItems: 'center', borderRadius: 12, padding: 10, marginBottom: 7 },
  mini: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 13, borderWidth: 1.5, borderColor: 'transparent' },
});
