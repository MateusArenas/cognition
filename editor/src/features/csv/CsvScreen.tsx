import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertDialog } from '@/design/components/AlertDialog';
import { Field } from '@/design/components/Field';
import { NavBar } from '@/design/components/NavBar';
import { useTheme } from '@/design/useTheme';
import { evaluateSheet } from '@/domain/csv/formula';
import {
  clearRange,
  deleteCols,
  deleteRows,
  fillDown,
  insertCol,
  insertRow,
  setColWidth,
  sortBy,
  toggleHeaderRow,
  toggleWrap,
} from '@/domain/csv/mutations';
import { blankCsv, csvDocFromText } from '@/domain/mermaid/factory';
import type { CsvDoc } from '@/domain/types';
import { useI18n } from '@/i18n/I18nProvider';
import { useDoc } from '@/store/useDoc';
import { ExportSheet, type ExportSheetHandle } from './ExportSheet';
import { FormulaBar, type FormulaBarHandle } from './FormulaBar';
import { Grid, type CsvSelection } from './Grid';
import { ImportSheet, type ImportSheetHandle } from './ImportSheet';
import { KEYBOARD_ACCESSORY_ID, KeyboardBar } from './KeyboardBar';
import { CellMenu, ColMenu, MoreMenu, RowMenu } from './Menus';
import { StatsBar } from './StatsBar';
import { Toolbar } from './Toolbar';

// Tela do editor de Tabelas (docs/19-tabelas-csv.md) — mesmo esqueleto de RabiscoScreen/
// DiagramScreen (NavBar + área principal + barra inferior). A "área principal" aqui é
// FormulaBar + StatsBar + Grid; a edição de célula acontece na FormulaBar (não um TextInput
// flutuante sobre a célula — decisão registrada no doc da feature).
export function CsvScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const doc = useDoc((s) => s.doc) as CsvDoc;
  const apply = useDoc((s) => s.apply);
  const undo = useDoc((s) => s.undo);
  const redo = useDoc((s) => s.redo);
  const history = useDoc((s) => s.history);

  const [sel, setSel] = useState<CsvSelection>({ r1: 0, c1: 0, r2: 0, c2: 0 });
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(doc.nome);

  const formulaBarRef = useRef<FormulaBarHandle>(null);
  const cellMenuRef = useRef<BottomSheetModal>(null);
  const rowMenuRef = useRef<BottomSheetModal>(null);
  const colMenuRef = useRef<BottomSheetModal>(null);
  const moreMenuRef = useRef<BottomSheetModal>(null);
  const importRef = useRef<ImportSheetHandle>(null);
  const exportRef = useRef<ExportSheetHandle>(null);
  const [menuRow, setMenuRow] = useState(0);
  const [menuCol, setMenuCol] = useState(0);

  const lastRow = doc.cells.length - 1;
  const lastCol = doc.cells[0].length - 1;
  const r1 = Math.min(sel.r1, sel.r2);
  const r2 = Math.max(sel.r1, sel.r2);
  const c1 = Math.min(sel.c1, sel.c2);
  const c2 = Math.max(sel.c1, sel.c2);
  const single = r1 === r2 && c1 === c2;

  function mutate(fn: (d: CsvDoc) => CsvDoc) {
    apply((d) => (d.tipo === 'csv' ? fn(d as CsvDoc) : d));
  }

  function selectCell(r: number, c: number) {
    setSel({ r1: r, c1: c, r2: r, c2: c });
    formulaBarRef.current?.focus();
  }
  function selectRow(r: number) {
    setSel({ r1: r, c1: 0, r2: r, c2: lastCol });
  }
  function selectCol(c: number) {
    setSel({ r1: 0, c1: c, r2: lastRow, c2: c });
  }

  function onPressCell(r: number, c: number) {
    if (single && r1 === r && c1 === c) {
      formulaBarRef.current?.focus();
      return;
    }
    selectCell(r, c);
  }

  function onLongPressCell(r: number, c: number) {
    setSel({ r1: r, c1: c, r2: r, c2: c });
    setMenuRow(r);
    setMenuCol(c);
    cellMenuRef.current?.present();
  }
  function onLongPressRow(r: number) {
    selectRow(r);
    setMenuRow(r);
    rowMenuRef.current?.present();
  }
  function onLongPressCol(c: number) {
    selectCol(c);
    setMenuCol(c);
    colMenuRef.current?.present();
  }

  function onAddRow() {
    mutate((d) => insertRow(d, lastRow + 1));
  }
  function onAddCol() {
    mutate((d) => insertCol(d, lastCol + 1));
  }
  function onResizeCol(c: number, width: number) {
    mutate((d) => setColWidth(d, c, width));
  }

  function statsFor() {
    if (single) return { count: 1, filled: 0, nums: [] as number[] };
    const evaluated = evaluateSheet(doc.cells);
    const nums: number[] = [];
    let filled = 0;
    for (let i = r1; i <= r2; i++)
      for (let j = c1; j <= c2; j++) {
        const v = evaluated.value(i, j);
        if (v !== '') filled++;
        if (typeof v === 'number') nums.push(v);
      }
    return { count: (r2 - r1 + 1) * (c2 - c1 + 1), filled, nums };
  }

  const submitEditor = (dr: number) => {
    if (dr === 0) return;
    const nr = Math.min(lastRow, r1 + dr);
    setSel({ r1: nr, c1, r2: nr, c2: c1 });
  };

  const insertOperator = (text: string) => formulaBarRef.current?.insertAtCursor(text);
  const insertFunction = (text: string, needsEquals: boolean) => {
    void needsEquals;
    formulaBarRef.current?.insertAtCursor(text);
  };

  const canFillDown = r2 > r1;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar
        title={doc.nome}
        subtitle={t('csv.subtitle', { rows: doc.cells.length, cols: doc.cells[0].length })}
        left={{ label: t('common.backToLibrary'), onPress: () => router.back() }}
        right={{ label: t('csv.more'), onPress: () => moreMenuRef.current?.present() }}
      />
      <FormulaBar ref={formulaBarRef} r={r1} c={c1} onSubmit={submitEditor} onFocusChange={setEditing} />
      <StatsBar {...statsFor()} />
      <Grid
        cells={doc.cells}
        colWidths={doc.colWidths}
        headerRow={doc.headerRow}
        wrap={doc.wrap}
        sel={sel}
        onPressCell={onPressCell}
        onLongPressCell={onLongPressCell}
        onPressCol={selectCol}
        onLongPressCol={onLongPressCol}
        onPressRow={selectRow}
        onLongPressRow={onLongPressRow}
        onResizeCol={onResizeCol}
        onAddCol={onAddCol}
        onAddRow={onAddRow}
      />
      <Toolbar
        onUndo={undo}
        onRedo={redo}
        canUndo={!!history.past.length}
        canRedo={!!history.future.length}
        onAddRow={onAddRow}
        onAddCol={onAddCol}
        onSort={() => {
          setMenuCol(c1);
          colMenuRef.current?.present();
        }}
      />
      <KeyboardBar
        visible={editing}
        onInsertOperator={insertOperator}
        onInsertFunction={insertFunction}
        onCancel={() => formulaBarRef.current?.focus()}
        onUp={() => submitEditor(-1)}
        onDown={() => submitEditor(1)}
        onDone={() => submitEditor(1)}
      />

      <CellMenu
        ref={cellMenuRef}
        onEdit={() => {
          cellMenuRef.current?.dismiss();
          formulaBarRef.current?.focus();
        }}
        onFillDown={() => {
          cellMenuRef.current?.dismiss();
          if (canFillDown) mutate((d) => fillDown(d, r1, c1, r2, c2));
        }}
        onClear={() => {
          cellMenuRef.current?.dismiss();
          mutate((d) => clearRange(d, menuRow, menuCol, menuRow, menuCol));
        }}
      />
      <RowMenu
        ref={rowMenuRef}
        row={menuRow}
        onInsertAbove={() => {
          rowMenuRef.current?.dismiss();
          mutate((d) => insertRow(d, menuRow));
        }}
        onInsertBelow={() => {
          rowMenuRef.current?.dismiss();
          mutate((d) => insertRow(d, menuRow + 1));
        }}
        onDuplicate={() => {
          rowMenuRef.current?.dismiss();
          mutate((d) => {
            const dup = insertRow(d, menuRow + 1);
            dup.cells[menuRow + 1] = [...d.cells[menuRow]];
            return dup;
          });
        }}
        onClear={() => {
          rowMenuRef.current?.dismiss();
          mutate((d) => clearRange(d, menuRow, 0, menuRow, d.cells[0].length - 1));
        }}
        onDelete={() => {
          rowMenuRef.current?.dismiss();
          mutate((d) => deleteRows(d, menuRow, menuRow));
          setSel((s) => ({ ...s, r1: Math.min(s.r1, lastRow - 1), r2: Math.min(s.r2, lastRow - 1) }));
        }}
      />
      <ColMenu
        ref={colMenuRef}
        col={menuCol}
        onInsertLeft={() => {
          colMenuRef.current?.dismiss();
          mutate((d) => insertCol(d, menuCol));
        }}
        onInsertRight={() => {
          colMenuRef.current?.dismiss();
          mutate((d) => insertCol(d, menuCol + 1));
        }}
        onAutoFit={() => {
          colMenuRef.current?.dismiss();
          mutate((d) => setColWidth(d, menuCol, autoFitWidth(d, menuCol)));
        }}
        onDefaultWidth={() => {
          colMenuRef.current?.dismiss();
          mutate((d) => setColWidth(d, menuCol, 104));
        }}
        onSortAsc={() => {
          colMenuRef.current?.dismiss();
          mutate((d) => sortBy(d, menuCol, 1));
        }}
        onSortDesc={() => {
          colMenuRef.current?.dismiss();
          mutate((d) => sortBy(d, menuCol, -1));
        }}
        onClear={() => {
          colMenuRef.current?.dismiss();
          mutate((d) => clearRange(d, 0, menuCol, d.cells.length - 1, menuCol));
        }}
        onDelete={() => {
          colMenuRef.current?.dismiss();
          mutate((d) => deleteCols(d, menuCol, menuCol));
          setSel((s) => ({ ...s, c1: Math.min(s.c1, lastCol - 1), c2: Math.min(s.c2, lastCol - 1) }));
        }}
      />
      <MoreMenu
        ref={moreMenuRef}
        wrap={doc.wrap}
        headerRow={doc.headerRow}
        onImport={() => {
          moreMenuRef.current?.dismiss();
          importRef.current?.present();
        }}
        onExport={() => {
          moreMenuRef.current?.dismiss();
          exportRef.current?.present();
        }}
        onToggleWrap={() => mutate((d) => toggleWrap(d))}
        onToggleHeaderRow={() => mutate((d) => toggleHeaderRow(d))}
        onAutoFitAll={() => {
          moreMenuRef.current?.dismiss();
          mutate((d) => {
            let next = d;
            for (let c = 0; c <= lastCol; c++) next = setColWidth(next, c, autoFitWidth(next, c));
            return next;
          });
        }}
        onRename={() => {
          moreMenuRef.current?.dismiss();
          setRenameValue(doc.nome);
          setRenaming(true);
        }}
        onClearAll={() => {
          moreMenuRef.current?.dismiss();
          mutate((d) => clearRange(d, 0, 0, d.cells.length - 1, d.cells[0].length - 1));
        }}
      />

      <ImportSheet
        ref={importRef}
        onImport={(text, fileName, headerRow) => {
          const imported = csvDocFromText(text, fileName || doc.nome, headerRow);
          apply((d) => (d.tipo === 'csv' ? { ...imported, id: d.id, criadoEm: d.criadoEm } : d));
          setSel({ r1: 0, c1: 0, r2: 0, c2: 0 });
        }}
      />
      <ExportSheet ref={exportRef} doc={doc} />

      <AlertDialog
        visible={renaming}
        title={t('csv.renameTable')}
        buttons={[
          { label: t('common.cancel'), role: 'cancel', onPress: () => setRenaming(false) },
          {
            label: t('common.ok'),
            role: 'primary',
            onPress: () => {
              const nome = renameValue.trim();
              if (nome) mutate((d) => ({ ...d, nome }));
              setRenaming(false);
            },
          },
        ]}
        onRequestClose={() => setRenaming(false)}
      >
        <Field value={renameValue} onChangeText={setRenameValue} autoFocus />
      </AlertDialog>
    </View>
  );
}

function autoFitWidth(doc: CsvDoc, c: number): number {
  const evaluated = evaluateSheet(doc.cells);
  let w = 56;
  for (let r = 0; r < doc.cells.length; r++) {
    const text = evaluated.shown(r, c);
    w = Math.max(w, text.length * 8.2 + 24);
  }
  return Math.min(560, Math.ceil(w));
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
