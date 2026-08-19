import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Text } from 'react-native';
import { ActionBar, type ActionBarItem } from '@/design/components/ActionBar';
import { AlertDialog } from '@/design/components/AlertDialog';
import { Field } from '@/design/components/Field';
import { Sheet } from '@/design/components/Sheet';
import { useTheme } from '@/design/useTheme';
import { useToast } from '@/design/components/Toast';
import { useDoc } from '@/store/useDoc';
import { hapticWarning } from '@/services/haptics';
import type { ErDoc, FlowDoc, RawDoc } from '@/domain/types';
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
        { key: 'texto', icon: 'pencil', label: 'Texto', onPress: () => openPrompt('Texto do nó', n.label, (v) => apply((d) => flow.setNodeLabel(d as FlowDoc, sel.id, v))) },
        { key: 'conectar', icon: 'link', label: 'Conectar', onPress: () => onStartLink(sel.id) },
        { key: 'forma', icon: 'shapes', label: 'Forma', onPress: () => openInspector('node') },
        { key: 'cor', icon: 'palette', label: 'Cor', onPress: () => openInspector('node') },
        { key: 'grupo', icon: 'columns', label: 'Grupo', onPress: () => openInspector('node') },
        { key: 'duplicar', icon: 'copy', label: 'Duplicar', onPress: () => apply((d) => flow.duplicateNode(d as FlowDoc, sel.id)) },
        { key: 'ia', icon: 'spark', label: 'IA', onPress: onOpenAi },
        {
          key: 'excluir', icon: 'trash', label: 'Excluir', destructive: true,
          onPress: () => askDelete('Excluir nó?', `"${n.label}" e as ligações dele.`, () => {
            apply((d) => flow.removeNode(d as FlowDoc, sel.id));
            select(null);
            show('Excluído — desfazer no botão de desfazer');
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: 'Editar', onPress: () => openInspector('node') },
      ];
    }

    if (sel.kind === 'edge' && doc.tipo === 'flow') {
      const e = doc.edges.find((x) => x.id === sel.id);
      if (!e) return null;
      return [
        { key: 'rotulo', icon: 'pencil', label: 'Rótulo', onPress: () => openPrompt('Rótulo da ligação', e.label, (v) => apply((d) => flow.setEdgeLabel(d as FlowDoc, sel.id, v))) },
        { key: 'inverter', icon: 'swap', label: 'Inverter', onPress: () => apply((d) => flow.invertEdge(d as FlowDoc, sel.id)) },
        { key: 'traco', icon: 'sliders', label: 'Traço', onPress: () => openInspector('edge') },
        { key: 'ia', icon: 'spark', label: 'IA', onPress: onOpenAi },
        {
          key: 'excluir', icon: 'trash', label: 'Excluir', destructive: true,
          onPress: () => askDelete('Excluir ligação?', 'Não dá pra desfazer isso sozinho — mas dá pra desfazer a ação.', () => {
            apply((d) => flow.removeEdge(d as FlowDoc, sel.id));
            select(null);
            show('Excluída — desfazer no botão de desfazer');
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: 'Editar', onPress: () => openInspector('edge') },
      ];
    }

    if (sel.kind === 'group' && doc.tipo === 'flow') {
      const g = doc.groups.find((x) => x.id === sel.id);
      if (!g) return null;
      return [
        { key: 'nome', icon: 'pencil', label: 'Nome', onPress: () => openPrompt('Nome do grupo', g.label, (v) => apply((d) => flow.renameGroup(d as FlowDoc, sel.id, v))) },
        { key: 'nos', icon: 'columns', label: 'Nós', onPress: () => openInspector('group') },
        { key: 'ia', icon: 'spark', label: 'IA', onPress: onOpenAi },
        {
          key: 'excluir', icon: 'trash', label: 'Excluir', destructive: true,
          onPress: () => askDelete('Excluir grupo?', `"${g.label}" — os nós continuam existindo, só saem do grupo.`, () => {
            apply((d) => flow.removeGroup(d as FlowDoc, sel.id));
            select(null);
            show('Excluído — desfazer no botão de desfazer');
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: 'Editar', onPress: () => openInspector('group') },
      ];
    }

    if (sel.kind === 'table' && doc.tipo === 'er') {
      const t = tableById(doc as ErDoc, sel.id);
      if (!t) return null;
      return [
        { key: 'colunas', icon: 'columns', label: 'Colunas', onPress: () => openInspector('table') },
        { key: 'nome', icon: 'pencil', label: 'Nome', onPress: () => openPrompt('Nome da tabela', t.id, (v) => apply((d) => er.renameTable(d as ErDoc, sel.id, v))) },
        { key: 'relacionar', icon: 'link', label: 'Relacionar', onPress: () => onStartLink(sel.id) },
        { key: 'duplicar', icon: 'copy', label: 'Duplicar', onPress: () => apply((d) => er.duplicateTable(d as ErDoc, sel.id)) },
        { key: 'ia', icon: 'spark', label: 'IA', onPress: onOpenAi },
        {
          key: 'excluir', icon: 'trash', label: 'Excluir', destructive: true,
          onPress: () => askDelete('Excluir tabela?', `"${t.id}" e as relações dela.`, () => {
            apply((d) => er.removeTable(d as ErDoc, sel.id));
            select(null);
            show('Excluída — desfazer no botão de desfazer');
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: 'Editar', onPress: () => openInspector('table') },
      ];
    }

    if (sel.kind === 'col' && doc.tipo === 'er') {
      const c = colunaDe(doc as ErDoc, sel.id);
      if (!c) return null;
      return [
        { key: 'nome', icon: 'pencil', label: 'Nome', onPress: () => openPrompt('Nome da coluna', c.col.name, (v) => apply((d) => er.updateColumn(d as ErDoc, c.tab.id, c.idx, { name: v }))) },
        { key: 'tipo', icon: 'type', label: 'Tipo', onPress: () => openPrompt('Tipo da coluna', c.col.type, (v) => apply((d) => er.updateColumn(d as ErDoc, c.tab.id, c.idx, { type: v }))) },
        { key: 'comentario', icon: 'comment', label: 'Comentário', onPress: () => openPrompt('Comentário', c.col.note, (v) => apply((d) => er.updateColumn(d as ErDoc, c.tab.id, c.idx, { note: v }))) },
        { key: 'ia', icon: 'spark', label: 'IA', onPress: onOpenAi },
        { key: 'tabela', icon: 'table', label: 'Tabela', onPress: () => select({ kind: 'table', id: c.tab.id }) },
        {
          key: 'excluir', icon: 'trash', label: 'Excluir', destructive: true,
          onPress: () => askDelete('Excluir coluna?', `"${c.col.name}" de ${c.tab.id}.`, () => {
            apply((d) => er.removeColumn(d as ErDoc, c.tab.id, c.idx));
            select(null);
            show('Excluída — desfazer no botão de desfazer');
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: 'Editar', onPress: () => openInspector('column') },
      ];
    }

    if (sel.kind === 'rel' && doc.tipo === 'er') {
      const r = relById(doc as ErDoc, sel.id);
      if (!r) return null;
      return [
        { key: 'verbo', icon: 'pencil', label: 'Verbo', onPress: () => openPrompt('Verbo da relação', r.label, (v) => apply((d) => { const dd = structuredClone(d as ErDoc); const rr = dd.relations.find((x) => x.id === sel.id); if (rr) rr.label = v; return dd; })) },
        { key: 'cardinalidade', icon: 'cardinality', label: 'Cardinalidade', onPress: () => openInspector('relation') },
        { key: 'inverter', icon: 'swap', label: 'Inverter', onPress: () => apply((d) => er.invertRelation(d as ErDoc, sel.id)) },
        { key: 'ia', icon: 'spark', label: 'IA', onPress: onOpenAi },
        {
          key: 'excluir', icon: 'trash', label: 'Excluir', destructive: true,
          onPress: () => askDelete('Excluir relação?', '', () => {
            apply((d) => er.removeRelation(d as ErDoc, sel.id));
            select(null);
            show('Excluída — desfazer no botão de desfazer');
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: 'Editar', onPress: () => openInspector('relation') },
      ];
    }

    if (sel.kind === 'txt' && doc.tipo === 'raw') {
      const span = raw.textSpanAt(doc as RawDoc, sel);
      if (!span) return null;
      return [
        { key: 'texto', icon: 'pencil', label: 'Texto', onPress: () => openPrompt('Texto', span.texto, (v) => apply((d) => raw.replaceTextSpan(d as RawDoc, span, v))) },
        { key: 'duplicar', icon: 'copy', label: 'Duplicar linha', onPress: () => apply((d) => raw.duplicateLine(d as RawDoc, span)) },
        { key: 'ia', icon: 'spark', label: 'IA', onPress: onOpenAi },
        { key: 'codigo', icon: 'code', label: 'Código', onPress: () => onOpenCode?.() },
        {
          key: 'excluir', icon: 'trash', label: 'Excluir linha', destructive: true,
          onPress: () => askDelete('Excluir linha?', span.linha, () => {
            apply((d) => raw.removeLine(d as RawDoc, span));
            select(null);
            show('Linha removida — desfazer no botão de desfazer');
          }),
        },
        { key: 'editar', icon: 'chevronRight', label: 'Editar', onPress: () => openPrompt('Texto', span.texto, (v) => apply((d) => raw.replaceTextSpan(d as RawDoc, span, v))) },
      ];
    }

    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, doc]);

  if (!items || !sel) return null;

  return (
    <>
      <ActionBar title={describeSelection(doc, sel)} items={items} onClose={() => select(null)} onLayout={onBarLayout} />

      <AlertDialog
        visible={!!prompt}
        title={prompt?.title ?? ''}
        buttons={[
          { label: 'Cancelar', role: 'cancel', onPress: () => setPrompt(null) },
          { label: 'OK', role: 'primary', onPress: () => { prompt?.onSubmit(draft); setPrompt(null); } },
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
          { label: 'Cancelar', role: 'cancel', onPress: () => setConfirm(null) },
          { label: 'Excluir', role: 'destructive', onPress: () => { hapticWarning(); confirm?.onConfirm(); setConfirm(null); } },
        ]}
        onRequestClose={() => setConfirm(null)}
      />

      <Sheet ref={inspectorRef} title={inspectorTitle(inspectorKind)}>
        {inspectorKind === 'node' && sel?.kind === 'node' ? <NodeInspector id={sel.id} /> : null}
        {inspectorKind === 'edge' && sel?.kind === 'edge' ? <EdgeInspector id={sel.id} /> : null}
        {inspectorKind === 'group' && sel?.kind === 'group' ? <GroupInspector id={sel.id} /> : null}
        {inspectorKind === 'table' && sel?.kind === 'table' ? <TableInspector id={sel.id} /> : null}
        {inspectorKind === 'column' && sel?.kind === 'col' ? <ColumnInspector selId={sel.id} /> : null}
        {inspectorKind === 'relation' && sel?.kind === 'rel' ? <RelationInspector id={sel.id} /> : null}
        {!sel ? <Text style={{ color: colors.labelSecondary }}>Nada selecionado.</Text> : null}
      </Sheet>
    </>
  );
});

function inspectorTitle(kind: InspectorKind): string {
  switch (kind) {
    case 'node': return 'Nó';
    case 'edge': return 'Ligação';
    case 'group': return 'Grupo';
    case 'table': return 'Tabela';
    case 'column': return 'Coluna';
    case 'relation': return 'Relação';
    default: return 'Painel';
  }
}

function describeSelection(doc: FlowDoc | ErDoc | RawDoc | { tipo: 'md' }, sel: NonNullable<ReturnType<typeof useDoc.getState>['sel']>): string {
  if (sel.kind === 'node' && doc.tipo === 'flow') return doc.nodes.find((n) => n.id === sel.id)?.label || sel.id;
  if (sel.kind === 'edge' && doc.tipo === 'flow') return doc.edges.find((e) => e.id === sel.id)?.label || 'ligação';
  if (sel.kind === 'group' && doc.tipo === 'flow') return doc.groups.find((g) => g.id === sel.id)?.label || sel.id;
  if (sel.kind === 'table' && doc.tipo === 'er') return sel.id;
  if (sel.kind === 'col' && doc.tipo === 'er') { const c = colunaDe(doc, sel.id); return c ? `${c.tab.id} · ${c.col.name}` : sel.id; }
  if (sel.kind === 'rel' && doc.tipo === 'er') return relById(doc, sel.id)?.label || 'relação';
  if (sel.kind === 'txt' && doc.tipo === 'raw') return raw.textSpanAt(doc, sel)?.texto || 'texto';
  return sel.id;
}
