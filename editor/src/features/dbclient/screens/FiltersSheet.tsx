import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { forwardRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/design/components/Chip';
import { Field } from '@/design/components/Field';
import { GroupedList } from '@/design/components/GroupedList';
import { Row } from '@/design/components/Row';
import { Sheet } from '@/design/components/Sheet';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import type { FilterInput, FilterOp } from '../types';

const OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith', 'isNull', 'notNull'];

interface Props {
  fields: string[];
  filters: FilterInput[];
  onChange: (filters: FilterInput[]) => void;
}

// Construtor de filtro por toque — nunca texto livre virando SQL (REGRA DE PROJETO): coluna e
// operador só saem de listas fechadas (this.filters no backend valida de novo do lado dele).
export const FiltersSheet = forwardRef<BottomSheetModal, Props>(function FiltersSheet({ fields, filters, onChange }, ref) {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const [column, setColumn] = useState<string | null>(fields[0] ?? null);
  const [op, setOp] = useState<FilterOp>('eq');
  const [value, setValue] = useState('');
  const needsValue = op !== 'isNull' && op !== 'notNull';

  function add() {
    if (!column) return;
    onChange([...filters, { column, op, value: needsValue ? value : undefined }]);
    setValue('');
  }

  function remove(i: number) {
    onChange(filters.filter((_, idx) => idx !== i));
  }

  return (
    <Sheet ref={ref} title={t('dbclient.filters')} snapPoints={['75%']}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        {filters.length ? (
          <GroupedList>
            {filters.map((f, i) => (
              <Row
                key={i}
                title={f.column}
                subtitle={`${t(`dbclient.filterOp.${f.op}`)}${f.value !== undefined ? ` "${f.value}"` : ''}`}
                right={<Icon name="trash" size={18} color={colors.red} />}
                onPress={() => remove(i)}
              />
            ))}
          </GroupedList>
        ) : (
          <Text style={{ color: colors.labelSecondary, marginBottom: space.sm }}>{t('dbclient.noFilters')}</Text>
        )}

        <Text style={[{ color: colors.labelSecondary, marginTop: space.lg, marginBottom: 6 }]}>{t('dbclient.addFilter')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {fields.map((f) => (
            <Chip key={f} label={f} active={f === column} onPress={() => setColumn(f)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {OPS.map((o) => (
            <Chip key={o} label={t(`dbclient.filterOp.${o}`)} active={o === op} onPress={() => setOp(o)} />
          ))}
        </ScrollView>
        {needsValue ? (
          <View style={{ marginTop: space.sm }}>
            <Field value={value} onChangeText={setValue} placeholder={t('dbclient.filterValue')} />
          </View>
        ) : null}
        <View style={{ marginTop: space.sm, alignItems: 'flex-start' }}>
          <Chip label={t('dbclient.addFilterAction')} onPress={add} disabled={!column} />
        </View>
      </ScrollView>
    </Sheet>
  );
});

const styles = StyleSheet.create({ chipRow: { gap: 8, paddingVertical: 6 } });
