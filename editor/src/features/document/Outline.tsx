import { ScrollView, Text, View } from 'react-native';
import { Row } from '@/design/components/Row';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import type { MdNode } from '@/domain/markdown/render';

interface Props {
  nodes: MdNode[];
  onJump: (offset: number) => void;
}

interface Entrada {
  tipo: 'titulo' | 'diagrama';
  texto: string;
  nivel: number;
  offset: number;
}

function coletar(nodes: MdNode[], diagramaTexto: string): Entrada[] {
  const out: Entrada[] = [];
  for (const n of nodes) {
    if (n.t === 'heading') out.push({ tipo: 'titulo', texto: n.filhos.map((f) => (f.t === 'text' ? f.texto : '')).join(''), nivel: n.nivel, offset: n.ini });
    else if (n.t === 'mermaid') out.push({ tipo: 'diagrama', texto: diagramaTexto, nivel: 1, offset: n.ini });
    else if (n.t === 'quote') out.push(...coletar(n.filhos, diagramaTexto));
  }
  return out;
}

// Aba Estrutura (§13.5): títulos com recuo por nível e diagramas embutidos. Tocar num título
// leva o cursor até lá; tocar num diagrama abre no canvas.
export function Outline({ nodes, onJump }: Props) {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const entradas = coletar(nodes, t('document.diagramEntry'));

  if (!entradas.length) {
    return (
      <View style={{ padding: space.lg }}>
        <Text style={{ color: colors.labelSecondary }}>{t('document.noOutline')}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg }}>
      {entradas.map((e, i) => (
        <Row
          key={i}
          title={e.texto}
          onPress={() => onJump(e.offset)}
          style={{ paddingLeft: (e.nivel - 1) * 16 }}
          navigable
        />
      ))}
    </ScrollView>
  );
}
