import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { forwardRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/design/components/Chip';
import { Field } from '@/design/components/Field';
import { Sheet } from '@/design/components/Sheet';
import { TintedButton } from '@/design/components/TintedButton';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import type { FilterOp } from '../types';

const OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith', 'isNull', 'notNull'];
const TEXT_OPS = new Set<FilterOp>(['contains', 'startsWith', 'endsWith']);
const TEXT_TYPE = /char|text|uuid|json|enum/i;

function opsFor(type: string): FilterOp[] {
  return OPS.filter((o) => !TEXT_OPS.has(o) || TEXT_TYPE.test(type));
}

export interface FilterDraft {
  index: number | null;
  column: string;
  op: FilterOp;
  value: string;
}

interface Props {
  fields: { name: string; type: string }[];
  draft: FilterDraft | null;
  onDraftChange: (draft: FilterDraft) => void;
  onApply: () => void;
  onRemove: () => void;
}

// Editor de UMA condição por vez (coluna → operador → valor), igual ao protótipo
// (prototipo.html `folhaFiltro`) — a lista de filtros ativos não mora mais aqui dentro: agora
// são pills coloridas inline acima da grade (DataGrid.tsx), cada uma tocável pra reabrir este
// editor já preenchida. Sheet+lista+construtor tudo junto era o que deixava a folha poluída e
// "pouco Apple" (pedido do usuário depois de usar). `draft` mora no DataGrid (controlado), não
// aqui — evita o mesmo bug já corrigido em RecordFormSheet (campo reabrindo com valor da vez
// anterior porque o estado local só reseta quando a referência de uma prop muda).
export const FiltersSheet = forwardRef<BottomSheetModal, Props>(function FiltersSheet(
  { fields, draft, onDraftChange, onApply, onRemove },
  ref
) {
  const { colors, space } = useTheme();
  const { t } = useI18n();

  if (!draft) {
    return (
      <Sheet ref={ref} title={t('dbclient.filterTitle')} snapPoints={['55%']}>
        <View />
      </Sheet>
    );
  }

  const columnType = fields.find((f) => f.name === draft.column)?.type ?? '';
  const ops = opsFor(columnType);
  const needsValue = draft.op !== 'isNull' && draft.op !== 'notNull';

  function pickColumn(column: string) {
    const nextType = fields.find((f) => f.name === column)?.type ?? '';
    const allowed = opsFor(nextType);
    onDraftChange({ ...draft!, column, op: allowed.includes(draft!.op) ? draft!.op : allowed[0] });
  }

  return (
    <Sheet ref={ref} title={t('dbclient.filterTitle')} snapPoints={['65%']}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.gtitle, { color: colors.labelSecondary }]}>{t('dbclient.filterColumn')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {fields.map((f) => (
            <Chip key={f.name} label={f.name} active={f.name === draft.column} onPress={() => pickColumn(f.name)} />
          ))}
        </ScrollView>

        <Text style={[styles.gtitle, { color: colors.labelSecondary }]}>{t('dbclient.filterOperator')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {ops.map((o) => (
            <Chip
              key={o}
              label={t(`dbclient.filterOp.${o}`)}
              active={o === draft.op}
              onPress={() => onDraftChange({ ...draft, op: o })}
            />
          ))}
        </ScrollView>

        {needsValue ? (
          <>
            <Text style={[styles.gtitle, { color: colors.labelSecondary }]}>{t('dbclient.filterValue')}</Text>
            <Field
              value={draft.value}
              onChangeText={(v) => onDraftChange({ ...draft, value: v })}
              placeholder={t('dbclient.filterValue')}
              autoFocus
            />
          </>
        ) : null}

        <View style={{ marginTop: space.lg }}>
          <TintedButton
            icon="check"
            label={t('dbclient.applyFilterAction')}
            onPress={onApply}
            disabled={needsValue && draft.value.trim() === ''}
          />
          {draft.index !== null ? (
            <Pressable onPress={onRemove} style={({ pressed }) => [styles.textBtn, { opacity: pressed ? 0.5 : 1 }]}>
              <Text style={{ color: colors.red, fontSize: 17 }}>{t('dbclient.removeFilterAction')}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </Sheet>
  );
});

const styles = StyleSheet.create({
  gtitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 18, marginBottom: 6, marginLeft: 4 },
  chipRow: { gap: 8, paddingVertical: 6 },
  textBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
});
