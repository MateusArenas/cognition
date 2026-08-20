import { Row } from '@/design/components/Row';
import { useI18n } from '@/i18n/I18nProvider';
import type { DocRow } from '@/services/storage';

interface Props {
  doc: DocRow | null; // null = estado vazio acionável (§ nenhum documento ainda)
  onPress: () => void;
  onLongPress?: () => void;
}

export function DocCard({ doc, onPress, onLongPress }: Props) {
  const { language, t } = useI18n();
  if (!doc) {
    return <Row title={t('library.emptyTitle')} subtitle={t('library.emptySubtitle')} navigable onPress={onPress} />;
  }
  const typeName = t(`library.types.${doc.tipo}`);
  const subtitulo = `${doc.subtipo || typeName || doc.tipo} · ${new Date(doc.atualizado_em).toLocaleDateString(language)}`;
  return <Row title={doc.nome} subtitle={subtitulo} navigable onPress={onPress} onLongPress={onLongPress} />;
}
