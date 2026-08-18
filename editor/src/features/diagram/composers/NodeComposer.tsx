import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertDialog } from '@/design/components/AlertDialog';
import { Field } from '@/design/components/Field';
import { useTheme } from '@/design/useTheme';
import { useDoc } from '@/store/useDoc';
import { SHAPES } from '@/domain/mermaid/shapes';
import { addEdge, addNode } from '@/domain/mutations/flow';
import { hapticCreate } from '@/services/haptics';
import type { FlowDoc, ShapeKey } from '@/domain/types';

const COMUNS: ShapeKey[] = ['rect', 'round', 'stadium', 'rhombus', 'subroutine', 'cylinder'];

interface Props {
  visible: boolean;
  onClose: () => void;
}

// "Adicionar e continuar" é a única coisa no editor que muda a produtividade em ordem de
// grandeza (§11) — dá pra montar um fluxo de doze etapas sem sair do teclado.
export function NodeComposer({ visible, onClose }: Props) {
  const { colors, radius } = useTheme();
  const sel = useDoc((s) => s.sel);
  const apply = useDoc((s) => s.apply);
  const select = useDoc((s) => s.select);

  const [label, setLabel] = useState('');
  const [shape, setShape] = useState<ShapeKey>('rect');
  const [from, setFrom] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setFrom(sel?.kind === 'node' ? sel.id : null);
      setLabel('');
      setShape('rect');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function criar(continuar: boolean) {
    if (!label.trim()) return;
    hapticCreate();
    let novoId = '';
    apply((d) => {
      const before = (d as FlowDoc).nodes.length;
      let next = addNode(d as FlowDoc, { label: label.trim(), shape, cls: null });
      novoId = next.nodes[before].id;
      if (from) next = addEdge(next, from, novoId);
      return next;
    });
    if (continuar) {
      select({ kind: 'node', id: novoId });
      setFrom(novoId);
      setLabel('');
    } else {
      select({ kind: 'node', id: novoId });
      onClose();
    }
  }

  return (
    <AlertDialog
      visible={visible}
      title={from ? 'Adicionar etapa' : 'Nova etapa'}
      onRequestClose={onClose}
      buttons={[
        { label: 'Cancelar', role: 'cancel', onPress: onClose },
        { label: 'Adicionar e continuar', onPress: () => criar(true) },
        { label: 'Adicionar', role: 'primary', onPress: () => criar(false) },
      ]}
    >
      <Field value={label} onChangeText={setLabel} placeholder="Texto do nó" autoFocus multiline />
      <View style={styles.shapes}>
        {COMUNS.map((k) => (
          <Pressable
            key={k}
            onPress={() => setShape(k)}
            style={[
              styles.shape,
              { borderRadius: radius.control, backgroundColor: colors.surface2 },
              shape === k && { borderColor: colors.blue, borderWidth: 1.5 },
            ]}
          >
            <Text style={{ color: shape === k ? colors.blue : colors.labelSecondary, fontSize: 12 }}>{SHAPES[k].nome}</Text>
          </Pressable>
        ))}
      </View>
    </AlertDialog>
  );
}

const styles = StyleSheet.create({
  shapes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  shape: { paddingVertical: 8, paddingHorizontal: 9, borderWidth: 1.5, borderColor: 'transparent' },
});
