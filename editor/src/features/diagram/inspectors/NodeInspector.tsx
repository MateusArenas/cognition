import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Field } from '@/design/components/Field';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import { useDoc } from '@/store/useDoc';
import { SHAPES } from '@/domain/mermaid/shapes';
import { addGroup, setNodeClass, setNodeGroup, setNodeShape } from '@/domain/mutations/flow';
import type { FlowDoc, ShapeKey } from '@/domain/types';

interface Props {
  id: string;
}

// Forma + Cor do nó (§11) — a barra de ações já leva direto pra cá, na seção certa.
export function NodeInspector({ id }: Props) {
  const { colors, radius } = useTheme();
  const doc = useDoc((s) => s.doc) as FlowDoc;
  const apply = useDoc((s) => s.apply);
  const [novoGrupo, setNovoGrupo] = useState('');
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) return null;
  const grupoAtual = doc.groups.find((g) => g.nodes.includes(id));

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={[styles.section, { color: colors.labelSecondary }]}>FORMA</Text>
        <View style={styles.grid}>
          {(Object.keys(SHAPES) as ShapeKey[]).map((k) => (
            <Pressable
              key={k}
              onPress={() => apply((d) => setNodeShape(d as FlowDoc, id, k))}
              style={[
                styles.chip,
                { borderRadius: radius.control + 2, backgroundColor: colors.surface },
                n.shape === k && { borderColor: colors.blue, borderWidth: 1.5 },
              ]}
            >
              <Text style={{ color: n.shape === k ? colors.blue : colors.label, fontSize: 13 }}>{SHAPES[k].nome}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <Text style={[styles.section, { color: colors.labelSecondary }]}>COR</Text>
        <View style={styles.grid}>
          <Pressable
            onPress={() => apply((d) => setNodeClass(d as FlowDoc, id, null))}
            style={[styles.chip, { borderRadius: radius.control + 2, backgroundColor: colors.surface }, !n.cls && { borderColor: colors.blue, borderWidth: 1.5 }]}
          >
            <Text style={{ color: colors.label, fontSize: 13 }}>Nenhuma</Text>
          </Pressable>
          {doc.classes.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => apply((d) => setNodeClass(d as FlowDoc, id, c.id))}
              style={[
                styles.chip,
                { borderRadius: radius.control + 2, backgroundColor: c.fill || colors.surface },
                n.cls === c.id && { borderColor: colors.blue, borderWidth: 1.5 },
              ]}
            >
              <Text style={{ color: colors.label, fontSize: 13 }}>{c.id}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <Text style={[styles.section, { color: colors.labelSecondary }]}>GRUPO</Text>
        <View style={styles.grid}>
          <Pressable
            onPress={() => apply((d) => setNodeGroup(d as FlowDoc, id, null))}
            style={[styles.chip, { borderRadius: radius.control + 2, backgroundColor: colors.surface }, !grupoAtual && { borderColor: colors.blue, borderWidth: 1.5 }]}
          >
            <Text style={{ color: colors.label, fontSize: 13 }}>Nenhum</Text>
          </Pressable>
          {doc.groups.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => apply((d) => setNodeGroup(d as FlowDoc, id, g.id))}
              style={[
                styles.chip,
                { borderRadius: radius.control + 2, backgroundColor: colors.surface },
                grupoAtual?.id === g.id && { borderColor: colors.blue, borderWidth: 1.5 },
              ]}
            >
              <Text style={{ color: grupoAtual?.id === g.id ? colors.blue : colors.label, fontSize: 13 }}>{g.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.novoGrupo}>
          <Field
            placeholder="Novo grupo"
            value={novoGrupo}
            onChangeText={setNovoGrupo}
            style={styles.novoGrupoField}
          />
          <Pressable
            disabled={!novoGrupo.trim()}
            onPress={() => {
              apply((d) => addGroup(d as FlowDoc, novoGrupo.trim(), [id]));
              setNovoGrupo('');
            }}
            style={[styles.mini, { backgroundColor: novoGrupo.trim() ? colors.blue : colors.surface3 }]}
          >
            <Icon name="plus" size={18} color={novoGrupo.trim() ? '#fff' : colors.labelTertiary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 13, borderWidth: 1.5, borderColor: 'transparent' },
  novoGrupo: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10 },
  novoGrupoField: { flex: 1 },
  mini: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
