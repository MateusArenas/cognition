import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { forwardRef } from 'react';
import { GroupedList } from '@/design/components/GroupedList';
import { Row } from '@/design/components/Row';
import { RowSwitch } from '@/design/components/RowSwitch';
import { Sheet } from '@/design/components/Sheet';
import { Icon } from '@/design/Icon';
import { colName } from '@/domain/csv/formula';
import { useI18n } from '@/i18n/I18nProvider';

// Os 4 menus contextuais do editor de tabelas — mesmo padrão da casa pra "action sheet" que o
// resto do app já usa (Sheet + GroupedList + Row, ver docs/03-design-system.md; o design system
// não tem um componente ActionSheet dedicado). Cada `dismiss()` é feito pelo próprio onPress do
// item, chamando o handler passado — quem monta cada sheet (CsvScreen) decide se some antes ou
// depois de rodar a ação.

interface CellMenuProps {
  onEdit: () => void;
  onFillDown: () => void;
  onClear: () => void;
}
export const CellMenu = forwardRef<BottomSheetModal, CellMenuProps>(function CellMenu({ onEdit, onFillDown, onClear }, ref) {
  const { t } = useI18n();
  return (
    <Sheet ref={ref} title={t('csv.cellMenuTitle')} snapPoints={['32%']}>
      <GroupedList>
        <Row title={t('csv.edit')} left={<Icon name="pencil" size={20} />} onPress={onEdit} />
        <Row title={t('csv.fillDown')} left={<Icon name="chevronDown" size={20} />} onPress={onFillDown} />
        <Row title={t('csv.clearContent')} left={<Icon name="trash" size={20} color="#D70015" />} onPress={onClear} />
      </GroupedList>
    </Sheet>
  );
});

interface RowMenuProps {
  row: number;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDuplicate: () => void;
  onClear: () => void;
  onDelete: () => void;
}
export const RowMenu = forwardRef<BottomSheetModal, RowMenuProps>(function RowMenu(
  { row, onInsertAbove, onInsertBelow, onDuplicate, onClear, onDelete },
  ref
) {
  const { t } = useI18n();
  return (
    <Sheet ref={ref} title={t('csv.rowMenuTitle', { n: row + 1 })} snapPoints={['42%']}>
      <GroupedList>
        <Row title={t('csv.insertRowAbove')} left={<Icon name="plus" size={20} />} onPress={onInsertAbove} />
        <Row title={t('csv.insertRowBelow')} left={<Icon name="plus" size={20} />} onPress={onInsertBelow} />
        <Row title={t('csv.duplicateRow')} left={<Icon name="copy" size={20} />} onPress={onDuplicate} />
        <Row title={t('csv.clearRow')} left={<Icon name="eraser" size={20} />} onPress={onClear} />
        <Row title={t('csv.deleteRow')} left={<Icon name="trash" size={20} color="#D70015" />} onPress={onDelete} />
      </GroupedList>
    </Sheet>
  );
});

interface ColMenuProps {
  col: number;
  onInsertLeft: () => void;
  onInsertRight: () => void;
  onAutoFit: () => void;
  onDefaultWidth: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClear: () => void;
  onDelete: () => void;
}
export const ColMenu = forwardRef<BottomSheetModal, ColMenuProps>(function ColMenu(
  { col, onInsertLeft, onInsertRight, onAutoFit, onDefaultWidth, onSortAsc, onSortDesc, onClear, onDelete },
  ref
) {
  const { t } = useI18n();
  return (
    <Sheet ref={ref} title={t('csv.colMenuTitle', { n: colName(col) })} snapPoints={['58%']}>
      <GroupedList>
        <Row title={t('csv.insertColLeft')} left={<Icon name="plus" size={20} />} onPress={onInsertLeft} />
        <Row title={t('csv.insertColRight')} left={<Icon name="plus" size={20} />} onPress={onInsertRight} />
      </GroupedList>
      <GroupedList>
        <Row title={t('csv.autoFitCol')} left={<Icon name="scan" size={20} />} onPress={onAutoFit} />
        <Row title={t('csv.defaultWidthCol')} left={<Icon name="columns" size={20} />} onPress={onDefaultWidth} />
      </GroupedList>
      <GroupedList>
        <Row title={t('csv.sortAsc')} left={<Icon name="sort" size={20} />} onPress={onSortAsc} />
        <Row title={t('csv.sortDesc')} left={<Icon name="sort" size={20} />} onPress={onSortDesc} />
      </GroupedList>
      <GroupedList>
        <Row title={t('csv.clearCol')} left={<Icon name="eraser" size={20} />} onPress={onClear} />
        <Row title={t('csv.deleteCol')} left={<Icon name="trash" size={20} color="#D70015" />} onPress={onDelete} />
      </GroupedList>
    </Sheet>
  );
});

interface MoreMenuProps {
  wrap: boolean;
  headerRow: boolean;
  onImport: () => void;
  onExport: () => void;
  onToggleWrap: () => void;
  onToggleHeaderRow: () => void;
  onAutoFitAll: () => void;
  onRename: () => void;
  onClearAll: () => void;
}
export const MoreMenu = forwardRef<BottomSheetModal, MoreMenuProps>(function MoreMenu(
  { wrap, headerRow, onImport, onExport, onToggleWrap, onToggleHeaderRow, onAutoFitAll, onRename, onClearAll },
  ref
) {
  const { t } = useI18n();
  return (
    <Sheet ref={ref} title={t('csv.moreMenuTitle')} snapPoints={['58%']}>
      <GroupedList>
        <Row title={t('csv.importCsv')} left={<Icon name="document" size={20} />} navigable onPress={onImport} />
        <Row title={t('csv.exportCsv')} left={<Icon name="share" size={20} />} navigable onPress={onExport} />
      </GroupedList>
      <GroupedList>
        <Row title={t('csv.wrapText')} right={<RowSwitch value={wrap} onValueChange={onToggleWrap} />} />
        <Row title={t('csv.headerRowToggle')} right={<RowSwitch value={headerRow} onValueChange={onToggleHeaderRow} />} />
        <Row title={t('csv.autoFitAllCols')} left={<Icon name="scan" size={20} />} onPress={onAutoFitAll} />
      </GroupedList>
      <GroupedList>
        <Row title={t('csv.renameTable')} left={<Icon name="pencil" size={20} />} onPress={onRename} />
        <Row title={t('csv.clearAll')} left={<Icon name="trash" size={20} color="#D70015" />} onPress={onClearAll} />
      </GroupedList>
    </Sheet>
  );
});
