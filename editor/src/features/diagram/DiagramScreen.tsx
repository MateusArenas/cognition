import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { NavBar } from '@/design/components/NavBar';
import { Chip } from '@/design/components/Chip';
import { Fab } from '@/design/components/Fab';
import { GroupedList } from '@/design/components/GroupedList';
import { Row } from '@/design/components/Row';
import { Segmented } from '@/design/components/Segmented';
import { useTheme } from '@/design/useTheme';
import { useToast } from '@/design/components/Toast';
import { useDoc } from '@/store/useDoc';
import { serialize } from '@/domain/mermaid/serialize';
import { parseMermaid } from '@/domain/mermaid/parse';
import { resolveTapSelection } from '@/domain/selection';
import { setCode } from '@/domain/mutations/raw';
import { hapticSelect } from '@/services/haptics';
import { exportarPng, exportarTexto } from '@/services/export';
import { addEdge } from '@/domain/mutations/flow';
import { addRelation } from '@/domain/mutations/er';
import type { Doc, ErDoc, FlowDoc, RawDoc, Selection } from '@/domain/types';
import { DiagramCanvas, type DiagramCanvasHandle } from './canvas/DiagramCanvas';
import { toRuntimeTokens } from './canvas/themeTokens';
import { ActionBarController, type ActionBarControllerHandle } from './ActionBarController';
import { NodeComposer } from './composers/NodeComposer';
import { TableComposer } from './composers/TableComposer';
import { CodeEditor } from '@/features/code/CodeEditor';
import { AiSheet } from '@/features/ai/AiSheet';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

type Tab = 'canvas' | 'elements' | 'code';

// Roteia por tipo (flow/er/raw) — o mesmo canvas serve os três, só muda o que a barra de
// ações oferece (ActionBarController) e o que "+" cria. Ver docs/06-canvas.md,
// docs/08-barra-de-acoes.md, CHECKLIST.md pra o que ainda falta (documentos .md são a
// Etapa 11, em features/document/).
export function DiagramScreen() {
  const { colors, space, scheme } = useTheme();
  const { show } = useToast();
  const doc = useDoc((s) => s.doc);
  const sel = useDoc((s) => s.sel);
  const select = useDoc((s) => s.select);
  const apply = useDoc((s) => s.apply);
  const undo = useDoc((s) => s.undo);
  const redo = useDoc((s) => s.redo);
  const history = useDoc((s) => s.history);
  const linkMode = useDoc((s) => s.linkMode);
  const setLinkMode = useDoc((s) => s.setLinkMode);
  const retornoMd = useDoc((s) => s.retornoMd);
  const setRetornoMd = useDoc((s) => s.setRetornoMd);
  const openDoc = useDoc((s) => s.openDoc);

  const canvasRef = useRef<DiagramCanvasHandle>(null);
  const actionBarRef = useRef<ActionBarControllerHandle>(null);
  const aiRef = useRef<BottomSheetModal>(null);
  const [tab, setTab] = useState<Tab>('canvas');
  const [composerOpen, setComposerOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const code = useMemo(() => serialize(doc), [doc]);
  const tokens = useMemo(() => toRuntimeTokens(colors), [colors]);

  // Rotação reajusta o enquadramento (checklist de entrega, §22) — a primeira medida já vem
  // do próprio runtime (fit() automático no primeiro render), então só reage às mudanças.
  const { width, height } = useWindowDimensions();
  const primeiraMedida = useRef(true);
  useEffect(() => {
    if (primeiraMedida.current) {
      primeiraMedida.current = false;
      return;
    }
    canvasRef.current?.fit();
  }, [width, height]);

  function handleTap(raw: Selection | null, duplo: boolean) {
    if (doc.tipo === 'md') return;
    if (!raw) {
      if (!linkMode.ativo) select(null);
      return;
    }
    const resolved = resolveTapSelection(doc, raw);
    if (!resolved) return;

    if (linkMode.ativo) {
      if (!linkMode.de) {
        setLinkMode(true, resolved.id);
        select(resolved);
        return;
      }
      if (linkMode.de === resolved.id) {
        show('Escolha um elemento diferente');
        return;
      }
      if (doc.tipo === 'flow' && resolved.kind === 'node') {
        apply((d) => addEdge(d as FlowDoc, linkMode.de as string, resolved.id));
      } else if (doc.tipo === 'er' && resolved.kind === 'table') {
        apply((d) => addRelation(d as ErDoc, { from: linkMode.de as string, to: resolved.id, cardL: '||', cardR: 'o{', identifying: true, label: '' }));
      }
      setLinkMode(false);
      select(resolved);
      return;
    }

    hapticSelect();
    select(resolved);
    if (duplo) actionBarRef.current?.openForCurrentSelection();
  }

  function openComposer() {
    setComposerOpen(true);
  }

  async function exportarComoPng() {
    const base64 = await canvasRef.current?.exportPng(2);
    if (base64) await exportarPng(base64, doc.nome);
  }

  // Ida e volta documento↔diagrama (§13.4): recorta o serialize() atualizado de volta no
  // intervalo exato [ini, fim) do bloco ```mermaid``` que abriu este canvas.
  function voltar() {
    if (!retornoMd) {
      router.back();
      return;
    }
    const { doc: origem, ini, fim } = retornoMd;
    const novoMd = origem.md.slice(0, ini) + serialize(doc) + origem.md.slice(fim);
    setRetornoMd(null);
    openDoc({ ...origem, md: novoMd, atualizadoEm: Date.now() });
    router.push('/doc/aberto');
  }

  function handleCodeChange(text: string) {
    setCodeDraft(text);
    if (doc.tipo === 'raw') {
      apply((d) => setCode(d as RawDoc, text));
    }
  }

  async function validarParaIA(codigo: string) {
    const r = await canvasRef.current?.validate(codigo);
    return r ?? { ok: false, message: 'Canvas não está pronto.' };
  }

  function aplicarResultadoIA(codigo: string) {
    apply((d) => ({ ...parseMermaid(codigo, d.nome), id: d.id, criadoEm: d.criadoEm }) as Doc);
  }

  function commitCode() {
    if (codeDraft == null) return;
    try {
      const parsed = parseMermaid(codeDraft, doc.nome);
      apply((d) => ({ ...parsed, id: d.id, criadoEm: d.criadoEm }) as Doc);
      setErrorMsg(null);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
    setCodeDraft(null);
  }

  const nEls = doc.tipo === 'raw' ? (doc.code || '').trim().length : doc.tipo === 'er' ? doc.tables.length : doc.tipo === 'flow' ? doc.nodes.length : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar
        title={doc.nome}
        subtitle={doc.tipo === 'flow' ? 'Fluxograma' : doc.tipo === 'er' ? 'Modelo relacional' : doc.tipo === 'raw' ? doc.kind : 'Documento'}
        left={{ label: retornoMd ? '‹ Documento' : '‹ Biblioteca', onPress: voltar }}
        right={[
          { label: 'Desfazer', onPress: undo, disabled: !history.past.length },
          { label: 'Refazer', onPress: redo, disabled: !history.future.length },
          { label: 'Exportar', onPress: () => exportarTexto(doc) },
        ]}
      />

      <Segmented
        options={[
          { value: 'canvas', label: 'Diagrama' },
          { value: 'elements', label: 'Elementos' },
          { value: 'code', label: 'Código' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
      />

      {tab === 'canvas' ? (
        <View style={styles.canvasArea}>
          <DiagramCanvas ref={canvasRef} code={code} theme={scheme} tokens={tokens} sel={sel} onTap={handleTap} onError={setErrorMsg} />

          {!nEls ? (
            <View style={[styles.empty, { backgroundColor: colors.surface }]} pointerEvents="box-none">
              <Text style={[styles.emptyTitle, { color: colors.label }]}>Tela em branco</Text>
              <Text style={{ color: colors.labelSecondary }}>Toque em + para criar a primeira etapa.</Text>
            </View>
          ) : null}

          <View style={styles.hud}>
            <Chip label="Ajustar" onPress={() => canvasRef.current?.fit()} />
            <Chip label="PNG" onPress={exportarComoPng} />
            {retornoMd ? <Chip label="Voltar ao documento" onPress={voltar} /> : null}
          </View>

          {linkMode.ativo ? (
            <View style={[styles.linkBanner, { backgroundColor: colors.orange }]}>
              <Text style={styles.linkText}>{linkMode.de ? 'Toque no destino' : 'Toque no início da ligação'}</Text>
              <Pressable onPress={() => setLinkMode(false)}>
                <Text style={styles.linkCancel}>Cancelar</Text>
              </Pressable>
            </View>
          ) : null}

          {errorMsg ? (
            <View style={[styles.err, { backgroundColor: colors.surface, borderColor: colors.red }]}>
              <Text style={{ color: colors.label, fontFamily: 'Menlo', fontSize: 12 }}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={styles.fabs}>
            <Fab icon="spark" accessibilityLabel="Pedir para a IA" onPress={() => aiRef.current?.present()} />
            {(doc.tipo === 'flow' || doc.tipo === 'er') && (
              <Fab icon="plus" primary accessibilityLabel="Adicionar elemento" onPress={openComposer} />
            )}
          </View>
        </View>
      ) : null}

      {tab === 'elements' ? <ElementsList /> : null}

      {tab === 'code' ? (
        <View style={styles.canvasArea}>
          <CodeEditor code={codeDraft ?? code} onChangeText={handleCodeChange} onBlur={commitCode} />
        </View>
      ) : null}

      {doc.tipo === 'flow' ? <NodeComposer visible={composerOpen} onClose={() => setComposerOpen(false)} /> : null}
      {doc.tipo === 'er' ? <TableComposer visible={composerOpen} onClose={() => setComposerOpen(false)} /> : null}

      <ActionBarController
        ref={actionBarRef}
        onOpenCode={() => setTab('code')}
        onStartLink={(from) => setLinkMode(true, from)}
        onOpenAi={() => aiRef.current?.present()}
      />
      <AiSheet ref={aiRef} doc={doc} sel={sel} onValidate={validarParaIA} onApply={aplicarResultadoIA} />
    </View>
  );
}

function ElementsList() {
  const { space } = useTheme();
  const doc = useDoc((s) => s.doc);
  const select = useDoc((s) => s.select);

  const rows =
    doc.tipo === 'flow'
      ? doc.nodes.map((n) => ({ key: n.id, title: n.label || n.id, subtitle: n.id, sel: { kind: 'node' as const, id: n.id } }))
      : doc.tipo === 'er'
        ? doc.tables.map((t) => ({ key: t.id, title: t.id, subtitle: `${t.cols.length} colunas`, sel: { kind: 'table' as const, id: t.id } }))
        : [];

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg }}>
      <GroupedList>
        {rows.length ? (
          rows.map((r) => <Row key={r.key} title={r.title} subtitle={r.subtitle} navigable onPress={() => select(r.sel)} />)
        ) : (
          <Row title="Nenhum elemento ainda" />
        )}
      </GroupedList>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvasArea: { flex: 1 },
  hud: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxWidth: '70%' },
  empty: {
    position: 'absolute', left: 14, right: 14, top: 20, padding: 16, borderRadius: 16, maxWidth: 420, alignSelf: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  err: { position: 'absolute', left: 14, right: 14, bottom: 14, padding: 12, borderRadius: 14, borderWidth: 0.5, maxHeight: '34%' },
  linkBanner: { position: 'absolute', left: 14, right: 14, top: 20, borderRadius: 14, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linkText: { color: '#fff', fontWeight: '600' },
  linkCancel: { color: '#fff', textDecorationLine: 'underline' },
  fabs: { position: 'absolute', right: 16, bottom: 16, gap: 12, alignItems: 'center' },
});
