import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { forwardRef } from 'react';
import { GroupedList } from '@/design/components/GroupedList';
import { Row } from '@/design/components/Row';
import { Sheet } from '@/design/components/Sheet';
import { Icon } from '@/design/Icon';
import { useI18n } from '@/i18n/I18nProvider';

interface Props {
  onCopy: () => void;
  onMdFile: () => void;
  onPdfFile: () => void;
}

// Mesmo padrão do ShareSheet de diagrama/Rabisco. Sem PNG por ora — não existe caminho pra
// rasterizar HTML/RN em imagem sem sair do Expo Go (ver docs/12-persistencia-e-export.md).
export const DocumentShareSheet = forwardRef<BottomSheetModal, Props>(function DocumentShareSheet(
  { onCopy, onMdFile, onPdfFile },
  ref
) {
  const { t } = useI18n();
  return (
    <Sheet ref={ref} title={t('common.share')} snapPoints={['36%']}>
      <GroupedList>
        <Row
          title={t('document.sharePdfFile')}
          subtitle={t('document.sharePdfFileDesc')}
          left={<Icon name="document" size={20} />}
          navigable
          onPress={onPdfFile}
        />
        <Row
          title={t('document.shareMdFile')}
          subtitle={t('document.shareMdFileDesc')}
          left={<Icon name="code" size={20} />}
          navigable
          onPress={onMdFile}
        />
        <Row title={t('document.shareCopy')} subtitle={t('document.shareCopyDesc')} left={<Icon name="copy" size={20} />} onPress={onCopy} />
      </GroupedList>
    </Sheet>
  );
});
