import { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertDialog } from '@/design/components/AlertDialog';
import { Chip } from '@/design/components/Chip';
import { Fab } from '@/design/components/Fab';
import { GroupedList } from '@/design/components/GroupedList';
import { Row } from '@/design/components/Row';
import { Sheet } from '@/design/components/Sheet';
import { useTheme } from '@/design/useTheme';
import { useToast } from '@/design/components/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import { isApiError } from '../api/http';
import { applyMutations } from '../api/services';
import type { ColumnMeta, FilterInput, RowsResult } from '../types';
import { FiltersSheet } from './FiltersSheet';
import { FormField } from './FormField';
import { RecordFormSheet } from './RecordFormSheet';

const ROW_NUM_WIDTH = 40;
const CELL_WIDTH = 140;
const PAGE_SIZES = [25, 50, 100];

interface Props {
  connectionId: string;
  data: RowsResult;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  filters: FilterInput[];
  onFiltersChange: (filters: FilterInput[]) => void;
  onReload: () => void;
  /** Presente = habilita "Nova linha" e "Editar registro inteiro" (precisa de tipo/obrigatoriedade por coluna). */
  columnsMeta?: ColumnMeta[];
  /** Falso no Consulta (QueryTab) — resultado de SQL livre não pagina nem filtra pelo builder. */
  showFilters?: boolean;
  showPagination?: boolean;
}

function rowToObject(fields: { name: string }[], row: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  fields.forEach((f, i) => (obj[f.name] = row[i]));
  return obj;
}

// Grade compartilhada — Dados (TableScreen) e Consulta (QueryTab) usam a MESMA aqui, com as
// mesmas interações (toque no número da linha = ações da linha; toque numa célula = folha de
// opções, nunca edição direta). DB-MOBILE.md, lote de retoques pós-uso real. Borda em laranja
// quando `!data.edicao.editavel` — mesmo resultado que veio de um JOIN no console SQL.
export function DataGrid({
  connectionId,
  data,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  filters,
  onFiltersChange,
  onReload,
  columnsMeta,
  showFilters = true,
  showPagination = true,
}: Props) {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const { show } = useToast();

  const rowSheetRef = useRef<BottomSheetModal>(null);
  const cellSheetRef = useRef<BottomSheetModal>(null);
  const filtersSheetRef = useRef<BottomSheetModal>(null);
  const formSheetRef = useRef<BottomSheetModal>(null);

  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ rowIdx: number; colIdx: number; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [formInitial, setFormInitial] = useState<Record<string, unknown> | null>(null);

  const table = data.edicao.table;
  const canMutate = data.edicao.editavel && !!table;
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  function keyFor(row: unknown[]): Record<string, unknown> {
    const key: Record<string, unknown> = {};
    for (const pk of data.edicao.primaryKey) key[pk] = row[data.fields.findIndex((f) => f.name === pk)];
    return key;
  }

  // Contexto da linha selecionada pro `tag` do cabeçalho da folha (badge monoespaçado, já
  // existia no Sheet mas ninguém usava) — "Ações da linha" sozinho não dizia QUAL linha nem DE
  // QUAL tabela (pedido explícito do usuário: "tem que mostrar o id qual tabela se trata").
  function rowSheetTag(): string | undefined {
    if (selectedRow === null) return undefined;
    const table = data.edicao.table;
    if (!table) return undefined;
    const key = keyFor(data.rows[selectedRow]);
    const parts = Object.entries(key).map(([k, v]) => `${k}=${v}`);
    return parts.length ? `${table} · ${parts.join(', ')}` : table;
  }

  function openRow(ri: number) {
    setSelectedRow(ri);
    rowSheetRef.current?.present();
  }

  function openCell(ri: number, ci: number) {
    setSelectedCell({ rowIdx: ri, colIdx: ci });
    cellSheetRef.current?.present();
  }

  async function copyRow(ri: number) {
    rowSheetRef.current?.dismiss();
    const obj = rowToObject(data.fields, data.rows[ri]);
    await Clipboard.setStringAsync(Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(', '));
    show(t('common.copied'));
  }

  async function duplicateRow(ri: number) {
    rowSheetRef.current?.dismiss();
    if (!canMutate || !table) return;
    const obj = rowToObject(data.fields, data.rows[ri]);
    for (const auto of data.edicao.autoIncrement) delete obj[auto];
    try {
      await applyMutations(connectionId, table, [{ kind: 'insert', values: obj }]);
      onReload();
      show(t('dbclient.rowDuplicated'));
    } catch (e) {
      show(isApiError(e) ? e.message : String(e));
    }
  }

  function askDeleteRow(ri: number) {
    rowSheetRef.current?.dismiss();
    setConfirmDeleteRow(ri);
  }

  async function confirmDelete() {
    if (confirmDeleteRow === null || !canMutate || !table) {
      setConfirmDeleteRow(null);
      return;
    }
    const ri = confirmDeleteRow;
    setConfirmDeleteRow(null);
    try {
      await applyMutations(connectionId, table, [{ kind: 'delete', key: keyFor(data.rows[ri]) }]);
      onReload();
    } catch (e) {
      show(isApiError(e) ? e.message : String(e));
    }
  }

  function editRow(ri: number) {
    rowSheetRef.current?.dismiss();
    setFormInitial(rowToObject(data.fields, data.rows[ri]));
    setFormMode('edit');
    formSheetRef.current?.present();
  }

  function openNewRecord() {
    setFormInitial(null);
    setFormMode('create');
    formSheetRef.current?.present();
  }

  async function submitForm(values: Record<string, unknown>) {
    if (!table) throw new Error(t('dbclient.notEditable'));
    if (formMode === 'create') {
      await applyMutations(connectionId, table, [{ kind: 'insert', values }]);
    } else if (formMode === 'edit' && formInitial) {
      const key: Record<string, unknown> = {};
      for (const pk of data.edicao.primaryKey) key[pk] = formInitial[pk];
      const set = { ...values };
      for (const pk of data.edicao.primaryKey) delete set[pk];
      await applyMutations(connectionId, table, [{ kind: 'update', key, set }]);
    }
    formSheetRef.current?.dismiss();
    setFormMode(null);
    onReload();
  }

  function openEditValue() {
    if (!selectedCell) return;
    cellSheetRef.current?.dismiss();
    const v = data.rows[selectedCell.rowIdx][selectedCell.colIdx];
    setEditing({ ...selectedCell, value: v === null || v === undefined ? '' : String(v) });
  }

  async function filterByValue(exclude: boolean) {
    if (!selectedCell) return;
    cellSheetRef.current?.dismiss();
    const col = data.fields[selectedCell.colIdx].name;
    const value = data.rows[selectedCell.rowIdx][selectedCell.colIdx];
    onFiltersChange([...filters, { column: col, op: exclude ? 'neq' : 'eq', value }]);
  }

  async function copyCell() {
    if (!selectedCell) return;
    cellSheetRef.current?.dismiss();
    const value = data.rows[selectedCell.rowIdx][selectedCell.colIdx];
    await Clipboard.setStringAsync(value === null || value === undefined ? '' : String(value));
    show(t('common.copied'));
  }

  async function saveCell(value: string | null) {
    if (!editing || !table) return;
    const colName = data.fields[editing.colIdx].name;
    setSaving(true);
    try {
      await applyMutations(connectionId, table, [{ kind: 'update', key: keyFor(data.rows[editing.rowIdx]), set: { [colName]: value } }], false);
      setEditing(null);
      onReload();
    } catch (e) {
      show(isApiError(e) ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      {showFilters ? (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          <Chip label={t('dbclient.filters')} icon="sliders" onPress={() => filtersSheetRef.current?.present()} active={filters.length > 0} />
          {filters.length ? <Chip label={t('dbclient.filterCount', { count: filters.length })} mono onPress={() => onFiltersChange([])} /> : null}
        </View>
      ) : null}

      <View
        style={[
          styles.gridCard,
          {
            marginHorizontal: space.lg,
            borderColor: data.edicao.editavel ? colors.separator : colors.orange,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <ScrollView horizontal>
          <View>
            <View style={[styles.row, { backgroundColor: colors.surface2 }]}>
              <Text style={[styles.cell, styles.rowNumCell, { width: ROW_NUM_WIDTH, color: colors.labelTertiary }]}>#</Text>
              {data.fields.map((f) => (
                <Text key={f.name} numberOfLines={1} style={[styles.cell, { width: CELL_WIDTH, color: colors.label, fontWeight: '600' }]}>
                  {f.name}
                </Text>
              ))}
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {data.rows.map((r, ri) => (
                <View key={ri} style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
                  <Text
                    onPress={() => openRow(ri)}
                    style={[styles.cell, styles.rowNumCell, { width: ROW_NUM_WIDTH, color: colors.blue }]}
                  >
                    {(page - 1) * pageSize + ri + 1}
                  </Text>
                  {r.map((v, ci) => (
                    <Text
                      key={ci}
                      numberOfLines={1}
                      onPress={() => openCell(ri, ci)}
                      style={[styles.cell, { width: CELL_WIDTH, color: colors.label, fontFamily: 'Menlo' }]}
                    >
                      {v === null || v === undefined ? '∅' : String(v)}
                    </Text>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      </View>

      {!data.edicao.editavel && data.edicao.motivoBloqueio ? (
        <Text style={{ color: colors.orange, paddingHorizontal: space.lg, paddingTop: space.sm }}>{data.edicao.motivoBloqueio}</Text>
      ) : null}

      <View style={[styles.footer, { borderTopColor: colors.separator }]}>
        <View>
          <Text style={{ color: colors.labelSecondary }}>{t('dbclient.recordCount', { total: data.total })}</Text>
          {showPagination ? <Text style={{ color: colors.labelTertiary, fontSize: 12 }}>{t('dbclient.pageOf', { page, totalPages })}</Text> : null}
        </View>
        {showPagination ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Chip
              mono
              label={t('dbclient.pageSize', { size: pageSize })}
              onPress={() => onPageSizeChange(PAGE_SIZES[(PAGE_SIZES.indexOf(pageSize) + 1) % PAGE_SIZES.length])}
            />
            <Chip label={t('dbclient.prevPage')} disabled={page <= 1} onPress={() => onPageChange(page - 1)} />
            <Chip label={t('dbclient.nextPage')} disabled={page >= totalPages} onPress={() => onPageChange(page + 1)} />
          </View>
        ) : null}
      </View>

      {columnsMeta && canMutate ? (
        <View style={styles.fab}>
          <Fab icon="plus" primary accessibilityLabel={t('dbclient.newRecord')} onPress={openNewRecord} />
        </View>
      ) : null}

      <Sheet ref={rowSheetRef} title={t('dbclient.rowActions')} tag={rowSheetTag()} snapPoints={['40%']}>
        <GroupedList>
          <Row title={t('dbclient.copyRow')} onPress={() => selectedRow !== null && copyRow(selectedRow)} />
          {canMutate ? <Row title={t('dbclient.duplicateRow')} onPress={() => selectedRow !== null && duplicateRow(selectedRow)} /> : null}
          {canMutate && columnsMeta ? <Row title={t('dbclient.editRecord')} onPress={() => selectedRow !== null && editRow(selectedRow)} /> : null}
          {canMutate ? (
            <Row title={t('dbclient.deleteRow')} onPress={() => selectedRow !== null && askDeleteRow(selectedRow)} />
          ) : null}
        </GroupedList>
      </Sheet>

      <Sheet
        ref={cellSheetRef}
        title={selectedCell ? data.fields[selectedCell.colIdx]?.name ?? '' : ''}
        tag={t('dbclient.columnTag')}
        snapPoints={['40%']}
      >
        <GroupedList>
          {canMutate && selectedCell && !data.edicao.primaryKey.includes(data.fields[selectedCell.colIdx].name) ? (
            <Row title={t('dbclient.editValue')} onPress={openEditValue} />
          ) : null}
          {showFilters ? (
            <>
              <Row title={t('dbclient.filterByValue')} onPress={() => filterByValue(false)} />
              <Row title={t('dbclient.excludeValue')} onPress={() => filterByValue(true)} />
            </>
          ) : null}
          <Row title={t('common.copy')} onPress={copyCell} />
        </GroupedList>
      </Sheet>

      <FiltersSheet ref={filtersSheetRef} fields={data.fields.map((f) => f.name)} filters={filters} onChange={onFiltersChange} />

      {columnsMeta ? (
        <RecordFormSheet
          ref={formSheetRef}
          columns={columnsMeta}
          initial={formMode === 'edit' ? formInitial : null}
          onSubmit={submitForm}
          onCancel={() => formSheetRef.current?.dismiss()}
        />
      ) : null}

      <AlertDialog
        visible={!!editing}
        title={editing ? data.fields[editing.colIdx].name : ''}
        onRequestClose={() => setEditing(null)}
        buttons={[
          { label: t('common.cancel'), role: 'cancel', onPress: () => setEditing(null) },
          { label: t('dbclient.setNull'), onPress: () => saveCell(null) },
          { label: saving ? '…' : t('common.save'), role: 'primary', onPress: () => saveCell(editing?.value ?? '') },
        ]}
      >
        {editing ? <FormField label="" value={editing.value} onChangeText={(v) => setEditing((e) => (e ? { ...e, value: v } : e))} autoFocus /> : null}
      </AlertDialog>

      <AlertDialog
        visible={confirmDeleteRow !== null}
        title={t('dbclient.confirmDeleteRow')}
        onRequestClose={() => setConfirmDeleteRow(null)}
        buttons={[
          { label: t('common.cancel'), role: 'cancel', onPress: () => setConfirmDeleteRow(null) },
          { label: t('common.delete'), role: 'destructive', onPress: confirmDelete },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gridCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: { paddingVertical: 8, paddingHorizontal: 10, fontSize: 13 },
  rowNumCell: { textAlign: 'center', fontFamily: 'Menlo', fontSize: 12 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  fab: { position: 'absolute', right: 20, bottom: 84 },
});
