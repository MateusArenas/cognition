import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import type { Inline, MdItem, MdNode } from '@/domain/markdown/render';
import { MermaidBlock } from './MermaidBlock';

interface Props {
  nodes: MdNode[];
  onToggleTask: (ini: number, fim: number, feita: boolean) => void;
  onEditBlock: (bloco: { corpo: string; ini: number; fim: number }) => void;
}

// Modo Ler (§13.1, §13.3): a árvore de MdNode vira componentes RN — sem
// dangerouslySetInnerHTML, porque RN não tem isso. Rola por conta própria (mesmo respiro
// horizontal do editor, 18pt) — sem isso, um documento mais longo que a tela ficava cortado
// e sem jeito de rolar até o fim.
export function MarkdownPreview({ nodes, onToggleTask, onEditBlock }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {nodes.map((n, i) => (
        <Block key={i} node={n} onToggleTask={onToggleTask} onEditBlock={onEditBlock} />
      ))}
    </ScrollView>
  );
}

function Block({ node, onToggleTask, onEditBlock }: { node: MdNode } & Pick<Props, 'onToggleTask' | 'onEditBlock'>) {
  const { colors, type } = useTheme();

  switch (node.t) {
    case 'heading': {
      const sizes = { 1: 27, 2: 22, 3: 19, 4: 17 } as const;
      const weights = { 1: '700', 2: '700', 3: '600', 4: '600' } as const;
      return (
        <Text style={{ fontSize: sizes[node.nivel], fontWeight: weights[node.nivel], color: node.nivel === 4 ? colors.labelSecondary : colors.label, marginTop: 18, marginBottom: 6 }}>
          <InlineText filhos={node.filhos} />
        </Text>
      );
    }
    case 'paragraph':
      return (
        <Text style={[{ color: colors.label, marginBottom: 14 }, type.body]}>
          <InlineText filhos={node.filhos} />
        </Text>
      );
    case 'hr':
      return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separatorBold, marginVertical: 18 }} />;
    case 'quote':
      return (
        <View style={{ borderLeftWidth: 3, borderLeftColor: colors.blue, paddingLeft: 15, marginBottom: 14 }}>
          {node.filhos.map((n, i) => (
            <Block key={i} node={n} onToggleTask={onToggleTask} onEditBlock={onEditBlock} />
          ))}
        </View>
      );
    case 'code':
      return (
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <Text style={{ fontFamily: 'Menlo', fontSize: 13.5, color: colors.label }}>{node.corpo}</Text>
        </View>
      );
    case 'mermaid':
      return <MermaidBlock corpo={node.corpo} onEdit={() => onEditBlock({ corpo: node.corpo, ini: node.ini, fim: node.fim })} />;
    case 'list':
      return (
        <View style={{ marginBottom: 14, gap: 4 }}>
          {node.itens.map((item, i) => (
            <ListItem key={i} item={item} ordenada={node.ordenada} indice={i + 1} onToggleTask={onToggleTask} onEditBlock={onEditBlock} />
          ))}
        </View>
      );
    case 'table':
      return <Table node={node} />;
    default:
      return null;
  }
}

function ListItem({ item, ordenada, indice, onToggleTask, onEditBlock }: { item: MdItem; ordenada: boolean; indice: number } & Pick<Props, 'onToggleTask' | 'onEditBlock'>) {
  const { colors } = useTheme();
  if (item.tarefa) {
    const feita = item.tarefa.feita;
    return (
      <Pressable style={styles.taskRow} onPress={() => onToggleTask(item.tarefa!.ini, item.tarefa!.fim, feita)}>
        <View style={[styles.box, { borderColor: colors.separatorBold }, feita && { backgroundColor: colors.blue, borderColor: colors.blue }]}>
          {feita ? <Icon name="check" size={13} color="#fff" /> : null}
        </View>
        <Text style={{ color: feita ? colors.labelSecondary : colors.label, flex: 1 }}>
          <InlineText filhos={item.filhos} />
        </Text>
      </Pressable>
    );
  }
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ color: colors.labelSecondary }}>{ordenada ? `${indice}.` : '•'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.label }}>
          <InlineText filhos={item.filhos} />
        </Text>
        {item.sub ? item.sub.map((n, i) => <Block key={i} node={n} onToggleTask={onToggleTask} onEditBlock={onEditBlock} />) : null}
      </View>
    </View>
  );
}

function Table({ node }: { node: Extract<MdNode, { t: 'table' }> }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separatorBold, borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
      <View style={[styles.row, { backgroundColor: colors.surface2 }]}>
        {node.cabecalho.map((c, i) => (
          <Text key={i} style={[styles.cell, { color: colors.label, fontWeight: '600', textAlign: node.alinhamento[i] }]}>
            <InlineText filhos={c} />
          </Text>
        ))}
      </View>
      {node.linhas.map((linha, li) => (
        <View key={li} style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separatorBold }]}>
          {linha.map((c, i) => (
            <Text key={i} style={[styles.cell, { color: colors.label, textAlign: node.alinhamento[i] }]}>
              <InlineText filhos={c} />
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function InlineText({ filhos }: { filhos: Inline[] }) {
  const { colors } = useTheme();
  return (
    <Fragment>
      {filhos.map((n, i) => {
        switch (n.t) {
          case 'text':
            return n.texto;
          case 'bold':
            return <Text key={i} style={{ fontWeight: '700' }}><InlineText filhos={n.filhos} /></Text>;
          case 'italic':
            return <Text key={i} style={{ fontStyle: 'italic' }}><InlineText filhos={n.filhos} /></Text>;
          case 'strike':
            return <Text key={i} style={{ textDecorationLine: 'line-through', color: colors.labelSecondary }}><InlineText filhos={n.filhos} /></Text>;
          case 'mark':
            return <Text key={i} style={{ backgroundColor: colors.orange + '55' }}><InlineText filhos={n.filhos} /></Text>;
          case 'code':
            return <Text key={i} style={{ fontFamily: 'Menlo', fontSize: 14, backgroundColor: colors.surface2 }}>{n.texto}</Text>;
          case 'link':
            return <Text key={i} style={{ color: colors.blue }}><InlineText filhos={n.filhos} /></Text>;
          case 'image':
            return <Text key={i} style={{ color: colors.labelTertiary }}>{`[${n.alt || 'imagem'}]`}</Text>;
          default:
            return null;
        }
      })}
    </Fragment>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, paddingBottom: 32 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  box: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.8, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  row: { flexDirection: 'row' },
  cell: { flex: 1, padding: 9, fontSize: 14 },
});
