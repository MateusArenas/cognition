import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Icon, type IconName } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import type { RabiscoElement } from '@/domain/types';

export type Tool = 'select' | 'hand' | 'draw' | 'shape' | 'text' | 'eraser';
export type ShapeKind = Extract<RabiscoElement['type'], 'rect' | 'diamond' | 'ellipse' | 'arrow' | 'line'>;

const TOOLS: { tool: Tool; icon: IconName; label: string }[] = [
  { tool: 'select', icon: 'pointer', label: 'Selecionar' },
  { tool: 'hand', icon: 'hand', label: 'Mão' },
  { tool: 'draw', icon: 'pencil', label: 'Caneta' },
  { tool: 'shape', icon: 'shapes', label: 'Forma' },
  { tool: 'text', icon: 'type', label: 'Texto' },
  { tool: 'eraser', icon: 'eraser', label: 'Borracha' },
];

const SHAPES: { kind: ShapeKind; icon: IconName; label: string }[] = [
  { kind: 'rect', icon: 'square', label: 'Retângulo' },
  { kind: 'diamond', icon: 'cardinality', label: 'Losango' },
  { kind: 'ellipse', icon: 'circle', label: 'Elipse' },
  { kind: 'arrow', icon: 'moveUpRight', label: 'Seta' },
  { kind: 'line', icon: 'slash', label: 'Linha' },
];

interface Props {
  tool: Tool;
  shapeKind: ShapeKind;
  selectedId: string | null;
  onChangeTool: (tool: Tool) => void;
  onChangeShape: (kind: ShapeKind) => void;
}

// Cápsula flutuante com blur — mesma linguagem do Chip/ActionBar (§5.2) já usada em todo o
// app, não os tokens CSS próprios do protótipo de referência. "Forma" abre um popover com as 5
// formas (mesmo padrão do dock do protótipo: tocar no dock alterna o popover, escolher uma
// forma fecha e já ativa a ferramenta).
export function Dock({ tool, shapeKind, selectedId, onChangeTool, onChangeShape }: Props) {
  const { colors, radius, scheme } = useTheme();
  const [shapePopOpen, setShapePopOpen] = useState(false);

  // Bug real: `shapePopOpen` é estado só do Dock, mas o `tool` pode mudar por FORA dele — ao
  // desenhar uma forma, `RabiscoScreen` troca `tool` pra `'select'` direto (não passa pelo
  // `pressTool` daqui embaixo), então o popover ficava aberto pra sempre depois de desenhar, ou
  // depois de selecionar outro elemento. Fecha sempre que `tool` deixa de ser `'shape'` ou a
  // seleção muda — os dois jeitos que o usuário descreveu ("selecionar um elemento... ou clico
  // fora").
  useEffect(() => {
    if (tool !== 'shape') setShapePopOpen(false);
  }, [tool]);
  useEffect(() => {
    setShapePopOpen(false);
  }, [selectedId]);

  function pressTool(t: Tool) {
    if (t === 'shape') {
      setShapePopOpen((v) => !v);
      onChangeTool('shape');
      return;
    }
    setShapePopOpen(false);
    onChangeTool(t);
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {shapePopOpen && tool === 'shape' ? (
        <BlurView intensity={50} tint={scheme} style={[styles.pop, { borderRadius: radius.card, borderColor: colors.separator }]}>
          {SHAPES.map((s) => (
            <Pressable
              key={s.kind}
              onPress={() => { onChangeShape(s.kind); setShapePopOpen(false); }}
              accessibilityRole="button"
              accessibilityLabel={s.label}
              hitSlop={8}
              style={[styles.btn, shapeKind === s.kind && { backgroundColor: colors.blue + '26', borderRadius: radius.control }]}
            >
              <Icon name={s.icon} size={20} color={shapeKind === s.kind ? colors.blue : colors.label} />
            </Pressable>
          ))}
        </BlurView>
      ) : null}
      <BlurView intensity={50} tint={scheme} style={[styles.bar, { borderRadius: radius.card, borderColor: colors.separator }]}>
        {TOOLS.map((t) => (
          <Pressable
            key={t.tool}
            onPress={() => pressTool(t.tool)}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: tool === t.tool }}
            hitSlop={6}
            style={[styles.btn, tool === t.tool && { backgroundColor: colors.blue + '26', borderRadius: radius.control }]}
          >
            <Icon name={t.tool === 'shape' ? SHAPES.find((s) => s.kind === shapeKind)!.icon : t.icon} size={21} color={tool === t.tool ? colors.blue : colors.label} />
          </Pressable>
        ))}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center', gap: 8 },
  bar: {
    flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  pop: {
    flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
