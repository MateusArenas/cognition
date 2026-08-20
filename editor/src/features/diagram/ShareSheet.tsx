import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { forwardRef } from 'react';
import { GroupedList } from '@/design/components/GroupedList';
import { Row } from '@/design/components/Row';
import { Sheet } from '@/design/components/Sheet';
import { Icon } from '@/design/Icon';
import { useI18n } from '@/i18n/I18nProvider';

interface Props {
  /** "Arquivo .mmd" ou "Arquivo .md" — o tipo do doc já resolvido por quem monta a tela. */
  textoLabel: string;
  onPng: () => void;
  onTexto: () => void;
  onCopiar: () => void;
}

// Substitui o antigo botão "Exportar" (chamava exportarTexto direto, sem escolha) e o chip
// "PNG" solto no HUD do canvas — as saídas moram juntas aqui, como no editor-mermaid.html.
// "Copiar texto" não passa pelo share sheet nativo — copia direto pro clipboard (mesmo padrão
// já usado no bloco mermaid embutido do markdown, ver MermaidBlock.tsx).
export const ShareSheet = forwardRef<BottomSheetModal, Props>(function ShareSheet(
  { textoLabel, onPng, onTexto, onCopiar },
  ref
) {
  const { t } = useI18n();
  return (
    <Sheet ref={ref} title={t('common.share')} snapPoints={['36%']}>
      <GroupedList>
        <Row
          title={t('diagram.exportPng')}
          subtitle={t('diagram.diagramAsIs')}
          left={<Icon name="image" size={20} />}
          navigable
          onPress={onPng}
        />
        <Row title={t('diagram.sourceCode')} subtitle={textoLabel} left={<Icon name="code" size={20} />} navigable onPress={onTexto} />
        <Row title={t('diagram.copyText')} subtitle={t('diagram.copyToClipboard')} left={<Icon name="copy" size={20} />} onPress={onCopiar} />
      </GroupedList>
    </Sheet>
  );
});
