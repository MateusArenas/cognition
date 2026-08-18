import { Row } from '@/design/components/Row';
import type { DocRow } from '@/services/storage';

const NOME_TIPO: Record<string, string> = { flow: 'Fluxograma', er: 'Modelo relacional', raw: 'Diagrama', md: 'Documento' };

interface Props {
  doc: DocRow | null; // null = estado vazio acionável (§ nenhum documento ainda)
  onPress: () => void;
  onLongPress?: () => void;
}

export function DocCard({ doc, onPress, onLongPress }: Props) {
  if (!doc) {
    return <Row title="Nenhum documento ainda" subtitle="Toque para criar o primeiro" navigable onPress={onPress} />;
  }
  const subtitulo = `${doc.subtipo || NOME_TIPO[doc.tipo] || doc.tipo} · ${new Date(doc.atualizado_em).toLocaleDateString('pt-BR')}`;
  return <Row title={doc.nome} subtitle={subtitulo} navigable onPress={onPress} onLongPress={onLongPress} />;
}
