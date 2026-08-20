import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { forwardRef } from 'react';
import { GroupedList } from '@/design/components/GroupedList';
import { Row } from '@/design/components/Row';
import { Sheet } from '@/design/components/Sheet';
import { Icon } from '@/design/Icon';
import { useI18n } from '@/i18n/I18nProvider';

interface Props {
  onCopySvg: () => void;
  onSvgFile: () => void;
  onPngFile: () => void;
  onPdfFile: () => void;
}

// Mesmo padrão do ShareSheet de diagrama (features/diagram/ShareSheet.tsx), adaptado pro
// Rabisco: sem "código-fonte" (não existe texto Mermaid pra ele, ver domain/mermaid/serialize.ts)
// — no lugar, "Copiar SVG" (mesmo texto que vira o arquivo .svg, só direto pro clipboard em vez
// de share sheet nativo, igual ao "Copiar texto" de lá) e PDF (Etapa R6.2, docs/16-rabisco.md).
export const RabiscoShareSheet = forwardRef<BottomSheetModal, Props>(function RabiscoShareSheet(
  { onCopySvg, onSvgFile, onPngFile, onPdfFile },
  ref
) {
  const { t } = useI18n();
  return (
    <Sheet ref={ref} title={t('common.share')} snapPoints={['44%']}>
      <GroupedList>
        <Row
          title={t('rabisco.shareCopySvg')}
          subtitle={t('rabisco.shareCopySvgDesc')}
          left={<Icon name="copy" size={20} />}
          onPress={onCopySvg}
        />
        <Row
          title={t('rabisco.shareSvgFile')}
          subtitle={t('rabisco.shareSvgFileDesc')}
          left={<Icon name="code" size={20} />}
          navigable
          onPress={onSvgFile}
        />
        <Row
          title={t('rabisco.sharePngFile')}
          subtitle={t('rabisco.sharePngFileDesc')}
          left={<Icon name="image" size={20} />}
          navigable
          onPress={onPngFile}
        />
        <Row
          title={t('rabisco.sharePdfFile')}
          subtitle={t('rabisco.sharePdfFileDesc')}
          left={<Icon name="document" size={20} />}
          navigable
          onPress={onPdfFile}
        />
      </GroupedList>
    </Sheet>
  );
});
