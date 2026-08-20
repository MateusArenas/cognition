import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Text } from 'react-native';
import { ActionBar, type ActionBarItem } from '@/design/components/ActionBar';
import { AlertDialog } from '@/design/components/AlertDialog';
import { Field } from '@/design/components/Field';
import { Sheet } from '@/design/components/Sheet';
import { useTheme } from '@/design/useTheme';
import { useToast } from '@/design/components/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import { useDoc } from '@/store/useDoc';
import { hapticWarning } from '@/services/haptics';
import type { Doc, ErDoc, FlowDoc, RawDoc } from '@/domain/types';
import { colunaDe, relById, tableById } from '@/domain/mermaid/lookup';
import * as flow from '@/domain/mutations/flow';
import * as er from '@/domain/mutations/er';
import * as raw from '@/domain/mutations/raw';
import { NodeInspector } from './inspectors/NodeInspector';
import { EdgeInspector } from './inspectors/EdgeInspector';
import { GroupInspector } from './inspectors/GroupInspector';
import { TableInspector } from './inspectors/TableInspector';
import { ColumnInspector } from './inspectors/ColumnInspector';
import { RelationInspector } from './inspectors/RelationInspector';

type InspectorKind = 'node' | 'edge' | 'group' | 'table' | 'column' | 'relation' | null;

interface Props {
  onOpenCode?: () => void;
  onStartLink: (from: string) => void;
  onOpenAi: () => void;
  /** Altura real da barra, pra quem mais flutua sobre o canvas (FABs) desviar dela. */
  onBarLayout?: (height: number) => void;
}

export interface ActionBarControllerHandle {
  /** Toque duplo no canvas abre o painel completo direto — mesmo destino do botão "Editar". */
  openForCurrentSelection: () => void;
}

const KIND_FOR_SEL: Record<string, InspectorKind> = { node: 'node', edge: 'edge', group: 'group', table: 'table', col: 'column', rel: 'relation' };

// A barra de ações contextual (§11) — orquestra o quê aparece e pra onde cada ação leva:
// alerta (valor único), sheet (formulário — Forma/Cor/Colunas/Cardinalidade), ou direto no
// modelo (Duplicar, Inverter). "Editar" sempre abre a sheet, já no inspetor certo.
export const ActionBarController = forwardRef<ActionBarControllerHandle, Props>(function ActionBarController(
  { onOpenCode, onStartLink, onOpenAi, onBarLayout },
  ref
) {
  const { colors } = useTheme();
  const { show } = useToast();
  const { t: tr } = useI18n();
  const doc = useDoc((s) => s.doc);
  const sel = useDoc((s) => s.sel);
  const select = useDoc((s) => s.select);
  const apply = useDoc((s) => s.apply);

  const inspectorRef = useRef<BottomSheetModal>(null);
  const [inspectorKind, setInspectorKind] = useState<InspectorKind>(null);
  const [prompt, setPrompt] = useState<{ title: string; value: string; onSubmit: (v: string) => void } | null>(null);
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  function openInspector(kind: InspectorKind) {
    setInspectorKind(kind);
    inspectorRef.current?.present();
  }

  // sel virando null (trocar de aba, tocar em vazio, cancelar na ActionBar) sem fechar o
  // inspetor deixava a sheet aberta flutuando sobre conteúdo sem nenhuma seleção por trás dela.
  useEffect(() => {
    if (!sel) inspectorRef.current?.dismiss();
  }, [sel]);

  useImperativeHandle(ref, () => ({
    openForCurrentSelection: () => {
      if (!sel) return;
      const kind = KIND_FOR_SEL[sel.kind];
      if (kind) openInspector(kind);
    },
  }));

  function openPrompt(title: string, value: string, onSubmit: (v: string) => void) {
    setDraft(value);
    setPrompt({ title, value, onSubmit });
  }

  function askDelete(title: string, message: string, onConfirm: () => void) {
    setConfirm({ title, message, onConfirm });
  }

  const items = useMemo<ActionBarItem[] | null>(() => {
    if (!sel) return null;

    if (sel.kind === 'node' && doc.tipo === 'flow') {
      const n = doc.nodes.find((x) => x.id === sel.id);
      if (!n) return null;
      return [
        { key: 'texto', icon: 'pencil', label: tr('diagram.text'), onPress: () => openPrompt(tr('diagram.nodeTextTitle'), n.label, (v) => apply((d) => flow.setNodeLabel(d as FlowDoc, sel.id, v))) },
        { key: 'conectar', icon: 'link', label: tr('diagram.connect'), onPress: () => onStartLink(sel.id) },
        { key: 'forma', icon: 'shapes', label: tr('diagram.shape'), onPress: () => openInspector('node') },
        { key: 'cor', icon: 'palette', label: tr('common.color'), onPress: () => openInspector('node') },
        { key: 'grupo', icon: 'columns', label: tr('diagram.group'), onPress: () => openInspector('node') },
        { key: 'duplicar', icon: 'copy', label: tr('common.duplicate'), onPress: () => apply((d) => flow.duplicateNode(d as FlowDoc, sel.id)) },
        { key: 'ia', icon: 'spark', label: tr('common.ai'), onPress: onOpenAi },
        {
          key: 'excluir', icon: 'trash', label: tr('common.delete'), destructive: true,
          onPress: () => askDelete(tr('diagram.deleteNodeConfirm'), tr('diagram.deleteNodeMessage', { label: n.label }), () => {
            apply((d) => flow.removeNode(d as FlowDoc, sel.id));
            select(null);
            show(tr('diagram.deletedCanUndo'));
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: tr('common.edit'), onPress: () => openInspector('node') },
      ];
    }

    if (sel.kind === 'edge' && doc.tipo === 'flow') {
      const e = doc.edges.find((x) => x.id === sel.id);
      if (!e) return null;
      return [
        { key: 'rotulo', icon: 'pencil', label: tr('diagram.label'), onPress: () => openPrompt(tr('diagram.edgeLabelTitle'), e.label, (v) => apply((d) => flow.setEdgeLabel(d as FlowDoc, sel.id, v))) },
        { key: 'inverter', icon: 'swap', label: tr('diagram.invert'), onPress: () => apply((d) => flow.invertEdge(d as FlowDoc, sel.id)) },
        { key: 'traco', icon: 'sliders', label: tr('diagram.stroke'), onPress: () => openInspector('edge') },
        { key: 'ia', icon: 'spark', label: tr('common.ai'), onPress: onOpenAi },
        {
          key: 'excluir', icon: 'trash', label: tr('common.delete'), destructive: true,
          onPress: () => askDelete(tr('diagram.deleteEdgeConfirm'), tr('diagram.deleteEdgeMessage'), () => {
            apply((d) => flow.removeEdge(d as FlowDoc, sel.id));
            select(null);
            show(tr('diagram.deletedCanUndo'));
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: tr('common.edit'), onPress: () => openInspector('edge') },
      ];
    }

    if (sel.kind === 'group' && doc.tipo === 'flow') {
      const g = doc.groups.find((x) => x.id === sel.id);
      if (!g) return null;
      return [
        { key: 'nome', icon: 'pencil', label: tr('diagram.name'), onPress: () => openPrompt(tr('diagram.groupNameTitle'), g.label, (v) => apply((d) => flow.renameGroup(d as FlowDoc, sel.id, v))) },
        { key: 'nos', icon: 'columns', label: tr('diagram.nodes'), onPress: () => openInspector('group') },
        { key: 'ia', icon: 'spark', label: tr('common.ai'), onPress: onOpenAi },
        {
          key: 'excluir', icon: 'trash', label: tr('common.delete'), destructive: true,
          onPress: () => askDelete(tr('diagram.deleteGroupConfirm'), tr('diagram.deleteGroupMessage', { label: g.label }), () => {
            apply((d) => flow.removeGroup(d as FlowDoc, sel.id));
            select(null);
            show(tr('diagram.deletedCanUndo'));
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: tr('common.edit'), onPress: () => openInspector('group') },
      ];
    }

    if (sel.kind === 'table' && doc.tipo === 'er') {
      const t = tableById(doc as ErDoc, sel.id);
      if (!t) return null;
      return [
        { key: 'colunas', icon: 'columns', label: tr('diagram.columns'), onPress: () => openInspector('table') },
        { key: 'nome', icon: 'pencil', label: tr('diagram.name'), onPress: () => openPrompt(tr('diagram.tableNameTitle'), t.id, (v) => apply((d) => er.renameTable(d as ErDoc, sel.id, v))) },
        { key: 'relacionar', icon: 'link', label: tr('diagram.relate'), onPress: () => onStartLink(sel.id) },
        { key: 'duplicar', icon: 'copy', label: tr('common.duplicate'), onPress: () => apply((d) => er.duplicateTable(d as ErDoc, sel.id)) },
        { key: 'ia', icon: 'spark', label: tr('common.ai'), onPress: onOpenAi },
        {
          key: 'excluir', icon: 'trash', label: tr('common.delete'), destructive: true,
          onPress: () => askDelete(tr('diagram.deleteTableConfirm'), tr('diagram.deleteTableMessage', { id: t.id }), () => {
            apply((d) => er.removeTable(d as ErDoc, sel.id));
            select(null);
            show(tr('diagram.deletedCanUndo'));
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: tr('common.edit'), onPress: () => openInspector('table') },
      ];
    }

    if (sel.kind === 'col' && doc.tipo === 'er') {
      const c = colunaDe(doc as ErDoc, sel.id);
      if (!c) return null;
      return [
        { key: 'nome', icon: 'pencil', label: tr('diagram.name'), onPress: () => openPrompt(tr('diagram.columnNameTitle'), c.col.name, (v) => apply((d) => er.updateColumn(d as ErDoc, c.tab.id, c.idx, { name: v }))) },
        { key: 'tipo', icon: 'type', label: tr('diagram.type'), onPress: () => openPrompt(tr('diagram.columnTypeTitle'), c.col.type, (v) => apply((d) => er.updateColumn(d as ErDoc, c.tab.id, c.idx, { type: v }))) },
        { key: 'comentario', icon: 'comment', label: tr('diagram.comment'), onPress: () => openPrompt(tr('diagram.comment'), c.col.note, (v) => apply((d) => er.updateColumn(d as ErDoc, c.tab.id, c.idx, { note: v }))) },
        { key: 'ia', icon: 'spark', label: tr('common.ai'), onPress: onOpenAi },
        { key: 'tabela', icon: 'table', label: tr('diagram.table'), onPress: () => select({ kind: 'table', id: c.tab.id }) },
        {
          key: 'excluir', icon: 'trash', label: tr('common.delete'), destructive: true,
          onPress: () => askDelete(tr('diagram.deleteColumnConfirm'), tr('diagram.deleteColumnMessage', { name: c.col.name, table: c.tab.id }), () => {
            apply((d) => er.removeColumn(d as ErDoc, c.tab.id, c.idx));
            select(null);
            show(tr('diagram.deletedCanUndo'));
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: tr('common.edit'), onPress: () => openInspector('column') },
      ];
    }

    if (sel.kind === 'rel' && doc.tipo === 'er') {
      const r = relById(doc as ErDoc, sel.id);
      if (!r) return null;
      return [
        { key: 'verbo', icon: 'pencil', label: tr('diagram.verb'), onPress: () => openPrompt(tr('diagram.relationVerbTitle'), r.label, (v) => apply((d) => { const dd = structuredClone(d as ErDoc); const rr = dd.relations.find((x) => x.id === sel.id); if (rr) rr.label = v; return dd; })) },
        { key: 'cardinalidade', icon: 'cardinality', label: tr('diagram.cardinality'), onPress: () => openInspector('relation') },
        { key: 'inverter', icon: 'swap', label: tr('diagram.invert'), onPress: () => apply((d) => er.invertRelation(d as ErDoc, sel.id)) },
        { key: 'ia', icon: 'spark', label: tr('common.ai'), onPress: onOpenAi },
        {
          key: 'excluir', icon: 'trash', label: tr('common.delete'), destructive: true,
          onPress: () => askDelete(tr('diagram.deleteRelationConfirm'), '', () => {
            apply((d) => er.removeRelation(d as ErDoc, sel.id));
            select(null);
            show(tr('diagram.deletedCanUndo'));
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: tr('common.edit'), onPress: () => openInspector('relation') },
      ];
    }

    if (sel.kind === 'txt' && doc.tipo === 'raw') {
      const span = raw.textSpanAt(doc as RawDoc, sel);
      if (!span) return null;
      return [
        { key: 'texto', icon: 'pencil', label: tr('diagram.text'), onPress: () => openPrompt(tr('diagram.text'), span.texto, (v) => apply((d) => raw.replaceTextSpan(d as RawDoc, span, v))) },
        { key: 'duplicar', icon: 'copy', label: tr('diagram.duplicateLine'), onPress: () => apply((d) => raw.duplicateLine(d as RawDoc, span)) },
        { key: 'ia', icon: 'spark', label: tr('common.ai'), onPress: onOpenAi },
        { key: 'codigo', icon: 'code', label: tr('diagram.code'), onPress: () => onOpenCode?.() },
        {
          key: 'excluir', icon: 'trash', label: tr('diagram.deleteLineLabel'), destructive: true,
          onPress: () => askDelete(tr('diagram.deleteLineConfirm'), span.linha, () => {
            apply((d) => raw.removeLine(d as RawDoc, span));
            select(null);
            show(tr('diagram.lineDeletedCanUndo'));
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: tr('common.edit'), onPress: () => openPrompt(tr('diagram.text'), span.texto, (v) => apply((d) => raw.replaceTextSpan(d as RawDoc, span, v))) },
      ];
    }

    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, doc]);

  if (!items || !sel) return null;

  return (
    <>
      <ActionBar title={describeSelection(tr, doc, sel)} items={items} onClose={() => select(null)} onLayout={onBarLayout} />

      <AlertDialog
        visible={!!prompt}
        title={prompt?.title ?? ''}
        buttons={[
          { label: tr('common.cancel'), role: 'cancel', onPress: () => setPrompt(null) },
          { label: tr('common.ok'), role: 'primary', onPress: () => { prompt?.onSubmit(draft); setPrompt(null); } },
        ]}
        onRequestClose={() => setPrompt(null)}
      >
        <Field value={draft} onChangeText={setDraft} autoFocus multiline />
      </AlertDialog>

      <AlertDialog
        visible={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        buttons={[
          { label: tr('common.cancel'), role: 'cancel', onPress: () => setConfirm(null) },
          { label: tr('common.delete'), role: 'destructive', onPress: () => { hapticWarning(); confirm?.onConfirm(); setConfirm(null); } },
        ]}
        onRequestClose={() => setConfirm(null)}
      />

      <Sheet ref={inspectorRef} title={inspectorTitle(tr, inspectorKind)}>
        {inspectorKind === 'node' && sel?.kind === 'node' ? <NodeInspector id={sel.id} /> : null}
        {inspectorKind === 'edge' && sel?.kind === 'edge' ? <EdgeInspector id={sel.id} /> : null}
        {inspectorKind === 'group' && sel?.kind === 'group' ? <GroupInspector id={sel.id} /> : null}
        {inspectorKind === 'table' && sel?.kind === 'table' ? <TableInspector id={sel.id} /> : null}
        {inspectorKind === 'column' && sel?.kind === 'col' ? <ColumnInspector selId={sel.id} /> : null}
        {inspectorKind === 'relation' && sel?.kind === 'rel' ? <RelationInspector id={sel.id} /> : null}
        {!sel ? <Text style={{ color: colors.labelSecondary }}>{tr('diagram.nothingSelected')}</Text> : null}
      </Sheet>
    </>
  );
});

function inspectorTitle(tr: (key: string) => string, kind: InspectorKind): string {
  switch (kind) {
    case 'node': return tr('diagram.inspectorTitleNode');
    case 'edge': return tr('diagram.inspectorTitleEdge');
    case 'group': return tr('diagram.group');
    case 'table': return tr('diagram.table');
    case 'column': return tr('diagram.inspectorTitleColumn');
    case 'relation': return tr('diagram.inspectorTitleRelation');
    default: return tr('diagram.inspectorTitlePanel');
  }
}

function describeSelection(tr: (key: string) => string, doc: Doc, sel: NonNullable<ReturnType<typeof useDoc.getState>['sel']>): string {
  if (sel.kind === 'node' && doc.tipo === 'flow') return doc.nodes.find((n) => n.id === sel.id)?.label || sel.id;
  if (sel.kind === 'edge' && doc.tipo === 'flow') return doc.edges.find((e) => e.id === sel.id)?.label || tr('diagram.fallbackLink');
  if (sel.kind === 'group' && doc.tipo === 'flow') return doc.groups.find((g) => g.id === sel.id)?.label || sel.id;
  if (sel.kind === 'table' && doc.tipo === 'er') return sel.id;
  if (sel.kind === 'col' && doc.tipo === 'er') { const c = colunaDe(doc, sel.id); return c ? `${c.tab.id} · ${c.col.name}` : sel.id; }
  if (sel.kind === 'rel' && doc.tipo === 'er') return relById(doc, sel.id)?.label || tr('diagram.fallbackRelation');
  if (sel.kind === 'txt' && doc.tipo === 'raw') return raw.textSpanAt(doc, sel)?.texto || tr('diagram.fallbackText');
  return sel.id;
}
