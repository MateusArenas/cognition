import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { forwardRef } from 'react';
import { GroupedList } from '@/design/components/GroupedList';
import { Row } from '@/design/components/Row';
import { Sheet } from '@/design/components/Sheet';
import { Icon } from '@/design/Icon';

interface Props {
  /** "Arquivo .mmd" ou "Arquivo .md" — o tipo do doc já resolvido por quem monta a tela. */
  textoLabel: string;
  onPng: () => void;
  onTexto: () => void;
}

// Substitui o antigo botão "Exportar" (chamava exportarTexto direto, sem escolha) e o chip
// "PNG" solto no HUD do canvas — as duas saídas moram junto aqui, como no editor-mermaid.html.
export const ShareSheet = forwardRef<BottomSheetModal, Props>(function ShareSheet({ textoLabel, onPng, onTexto }, ref) {
  return (
    <Sheet ref={ref} title="Compartilhar" snapPoints={['30%']}>
      <GroupedList>
        <Row
          title="Imagem PNG"
          subtitle="O diagrama como está na tela"
          left={<Icon name="image" size={20} />}
          navigable
          onPress={onPng}
        />
        <Row title="Código-fonte" subtitle={textoLabel} left={<Icon name="code" size={20} />} navigable onPress={onTexto} />
      </GroupedList>
    </Sheet>
  );
});
