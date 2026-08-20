import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { forwardRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Chip } from '@/design/components/Chip';
import { Field } from '@/design/components/Field';
import { Segmented } from '@/design/components/Segmented';
import { Sheet } from '@/design/components/Sheet';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import type { Doc, Selection } from '@/domain/types';
import { useAi } from './useAi';
import type { Alvo } from './prompt';

interface Props {
  doc: Doc;
  sel: Selection | null;
  onValidate: (code: string) => Promise<{ ok: boolean; message?: string }>;
  onApply: (codigoResultante: string) => void;
}

function alvoDe(doc: Doc, sel: Selection | null): Alvo | undefined {
  if (!sel) return undefined;
  if (sel.kind === 'node' && doc.tipo === 'flow') {
    const n = doc.nodes.find((x) => x.id === sel.id);
    return n ? { descricao: `o nó de id \`${n.id}\` (texto atual: "${n.label}")` } : undefined;
  }
  if (sel.kind === 'table' && doc.tipo === 'er') return { descricao: `a tabela \`${sel.id}\`` };
  return undefined;
}

function sugestoesPara(sel: Selection | null, t: (key: string) => string): string[] {
  if (!sel) return [t('ai.colorSuggestion'), t('ai.labelSuggestion')];
  if (sel.kind === 'edge') return [t('ai.invertSuggestion')];
  if (sel.kind === 'table') return [t('ai.auditFieldsSuggestion')];
  if (sel.kind === 'col') return [t('ai.betterTypeSuggestion')];
  if (sel.kind === 'node') return [t('ai.shorterTextSuggestion')];
  return [];
}

// Botão no canvas (escopo = diagrama inteiro) e ação "IA" na barra de ações (escopo =
// elemento selecionado) chegam nesta mesma sheet (§14.2).
export const AiSheet = forwardRef<BottomSheetModal, Props>(function AiSheet({ doc, sel, onValidate, onApply }, ref) {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const { pedir, loading, erro } = useAi(onValidate);
  const [escopo, setEscopo] = useState<'doc' | 'elemento'>('doc');
  const [pedido, setPedido] = useState('');

  const alvo = escopo === 'elemento' ? alvoDe(doc, sel) : undefined;

  async function gerar(textoPedido?: string) {
    const texto = textoPedido ?? pedido;
    if (!texto.trim()) return;
    const saida = await pedir(doc, texto, alvo);
    if (saida) {
      onApply(saida);
      setPedido('');
    }
  }

  return (
    <Sheet ref={ref} title={t('ai.title')}>
      <View style={{ gap: space.lg }}>
        {sel ? (
          <Segmented
            options={[
              { value: 'doc', label: t('ai.wholeDiagram') },
              { value: 'elemento', label: t('ai.selectedElement') },
            ]}
            value={escopo}
            onChange={(v) => setEscopo(v as 'doc' | 'elemento')}
          />
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {sugestoesPara(escopo === 'elemento' ? sel : null, t).map((s) => (
            <Chip key={s} label={s} onPress={() => gerar(s)} />
          ))}
        </View>

        <Field value={pedido} onChangeText={setPedido} placeholder={t('ai.whatToChange')} multiline />

        {loading ? <ActivityIndicator color={colors.blue} /> : null}
        {erro ? <Text style={{ color: colors.red, fontSize: 13 }}>{erro}</Text> : null}

        <Chip label={loading ? t('ai.generating') : t('ai.generate')} onPress={() => gerar()} />
      </View>
    </Sheet>
  );
});
