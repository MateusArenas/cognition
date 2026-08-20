import * as Clipboard from 'expo-clipboard';
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
import { useI18n } from '@/i18n/I18nProvider';
import { useDoc } from '@/store/useDoc';
import { serialize } from '@/domain/mermaid/serialize';
import { parseMermaid } from '@/domain/mermaid/parse';
import { resolveTapSelection } from '@/domain/selection';
import { setCode } from '@/domain/mutations/raw';
import { hapticSelect } from '@/services/haptics';
import { exportarPng, exportarTexto } from '@/services/export';
import { exportExtension } from '@/domain/exportMeta';
import { addEdge } from '@/domain/mutations/flow';
import { addRelation } from '@/domain/mutations/er';
import type { Doc, ErDoc, FlowDoc, RawDoc, Selection } from '@/domain/types';
import { DiagramCanvas, type DiagramCanvasHandle } from './canvas/DiagramCanvas';
import { toRuntimeTokens } from './canvas/themeTokens';
import { ActionBarController, type ActionBarControllerHandle } from './ActionBarController';
import { NodeComposer } from './composers/NodeComposer';
import { TableComposer } from './composers/TableComposer';
import { CodeEditor } from '@/features/code/CodeEditor';
import { CodeKeyboardBar } from '@/features/code/CodeKeyboardBar';
import { AiSheet } from '@/features/ai/AiSheet';
import { ShareSheet } from './ShareSheet';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

type Tab = 'canvas' | 'elements' | 'code';

// Roteia por tipo (flow/er/raw) — o mesmo canvas serve os três, só muda o que a barra de
// ações oferece (ActionBarController) e o que "+" cria. Ver docs/06-canvas.md,
// docs/08-barra-de-acoes.md, CHECKLIST.md pra o que ainda falta (documentos .md são a
// Etapa 11, em features/document/).
export function DiagramScreen() {
  const { colors, space, scheme } = useTheme();
  const { show } = useToast();
  const { t } = useI18n();
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
  const shareRef = useRef<BottomSheetModal>(null);
  const [tab, setTab] = useState<Tab>('canvas');
  const [composerOpen, setComposerOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [barHeight, setBarHeight] = useState(0);
  const [codeBarHeight, setCodeBarHeight] = useState(0);
  // Só usado pra doc tipo 'raw' (sem modelo estruturado) — o runtime que informa quais trechos
  // a Camada 3 conseguiu mapear. Fica no DiagramScreen (não no DiagramCanvas) porque a aba
  // "Elementos" desmonta o canvas — o estado precisa sobreviver à troca de aba.
  const [rawElements, setRawElements] = useState<{ id: string; texto: string }[]>([]);

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
        show(t('diagram.chooseDifferentElement'));
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

  // Trocar de aba (Diagrama/Elementos/Código) com uma sheet aberta deixava ela flutuando por
  // cima do conteúdo errado — bug real reportado pelo usuário ("ta indo pra tab e ficando
  // aberto"). select(null) fecha a ActionBar e (ver ActionBarController) o inspetor junto;
  // Compartilhar e o assistente de IA não dependem de seleção, então fecham à parte aqui.
  function handleTabChange(v: Tab) {
    select(null);
    shareRef.current?.dismiss();
    aiRef.current?.dismiss();
    setTab(v);
  }

  async function exportarComoPng() {
    shareRef.current?.dismiss();
    const base64 = await canvasRef.current?.exportPng(2);
    if (base64) await exportarPng(base64, doc.nome);
  }

  function exportarComoTexto() {
    shareRef.current?.dismiss();
    exportarTexto(doc);
  }

  async function copiarTexto() {
    shareRef.current?.dismiss();
    await Clipboard.setStringAsync(code);
    show(t('common.copied'));
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
    return r ?? { ok: false, message: t('diagram.canvasNotReady') };
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
        subtitle={doc.tipo === 'flow' ? t('library.types.flow') : doc.tipo === 'er' ? t('library.types.er') : doc.tipo === 'raw' ? doc.kind : t('library.types.md')}
        left={{ label: retornoMd ? t('diagram.backToDocumentNav') : t('common.backToLibrary'), onPress: voltar }}
        right={[{ label: t('common.share'), onPress: () => shareRef.current?.present() }]}
      />

      <Segmented
        options={[
          { value: 'canvas', label: t('diagram.tabDiagram') },
          { value: 'elements', label: t('diagram.tabElements') },
          { value: 'code', label: t('diagram.tabCode') },
        ]}
        value={tab}
        onChange={(v) => handleTabChange(v as Tab)}
      />

      {tab === 'canvas' ? (
        <View style={styles.canvasArea}>
          <DiagramCanvas
            ref={canvasRef}
            code={code}
            theme={scheme}
            tokens={tokens}
            sel={sel}
            onTap={handleTap}
            onError={setErrorMsg}
            onElements={setRawElements}
            onZoomChange={setZoom}
          />

          {!nEls ? (
            <View style={[styles.empty, { backgroundColor: colors.surface }]} pointerEvents="box-none">
              <Text style={[styles.emptyTitle, { color: colors.label }]}>{t('diagram.emptyTitle')}</Text>
              <Text style={{ color: colors.labelSecondary }}>{t('diagram.emptySubtitle')}</Text>
            </View>
          ) : null}

          <View style={styles.hud}>
            <Chip icon="scan" accessibilityLabel={t('diagram.fitToScreen')} onPress={() => canvasRef.current?.fit()} />
            <Chip icon="minus" accessibilityLabel={t('common.zoomOut')} onPress={() => canvasRef.current?.zoomBy(0.8)} />
            <Chip label={`${Math.round(zoom * 100)}%`} mono />
            <Chip icon="plus" accessibilityLabel={t('common.zoomIn')} onPress={() => canvasRef.current?.zoomBy(1.25)} />
            {retornoMd ? <Chip label={t('diagram.backToDocument')} onPress={voltar} /> : null}
          </View>

          <View style={styles.hudRight}>
            <Chip icon="undo" accessibilityLabel={t('common.undo')} onPress={undo} disabled={!history.past.length} />
            <Chip icon="redo" accessibilityLabel={t('common.redo')} onPress={redo} disabled={!history.future.length} />
          </View>

          {linkMode.ativo ? (
            <View style={[styles.linkBanner, { backgroundColor: colors.orange }]}>
              <Text style={styles.linkText}>{linkMode.de ? t('diagram.linkTapDestination') : t('diagram.linkTapStart')}</Text>
              <Pressable onPress={() => setLinkMode(false)}>
                <Text style={styles.linkCancel}>{t('common.cancel')}</Text>
              </Pressable>
            </View>
          ) : null}

          {errorMsg ? (
            <View style={[styles.err, { backgroundColor: colors.surface, borderColor: colors.red }]}>
              <Text style={{ color: colors.label, fontFamily: 'Menlo', fontSize: 12 }}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={[styles.fabs, { bottom: 16 + (sel ? barHeight : 0) }]}>
            <Fab icon="spark" accessibilityLabel={t('ai.title')} onPress={() => aiRef.current?.present()} />
            {(doc.tipo === 'flow' || doc.tipo === 'er') && (
              <Fab icon="plus" primary accessibilityLabel={t('diagram.addElement')} onPress={openComposer} />
            )}
          </View>
        </View>
      ) : null}

      {tab === 'elements' ? <ElementsList rawElements={rawElements} /> : null}

      {tab === 'code' ? (
        // Fundo colors.surface aqui (não colors.bg do root) — cobre TANTO o editor quanto a
        // área onde a CodeKeyboardBar flutua, pra o blur dela revelar essa mesma cor por trás
        // em vez do preto do root (bug real reportado pelo usuário: "quero que o fundo atras
        // do keyboard seja a mesma cor do fundo do código").
        <View style={[styles.canvasArea, { backgroundColor: colors.surface }]}>
          {/* Sem KeyboardAvoidingView de propósito — `behavior="padding"` é receita de iOS; no
              Android o app já usa `softwareKeyboardLayoutMode: "resize"` (app.json), que
              redimensiona a JANELA sozinho, então empilhar `behavior="padding"` por cima
              compensaria o teclado duas vezes nesse SO. CodeEditor resolve isso sozinho, ligado
              direto ao valor animado de altura do teclado (ver comentário lá) — funciona igual
              nos dois sistemas, sem `behavior` nenhum pra escolher por plataforma. */}
          <CodeEditor code={codeDraft ?? code} onChangeText={handleCodeChange} onBlur={commitCode} bottomInset={codeBarHeight} />
          <CodeKeyboardBar
            canUndo={!!history.past.length}
            canRedo={!!history.future.length}
            onUndo={undo}
            onRedo={redo}
            onLayout={setCodeBarHeight}
          />
        </View>
      ) : null}

      {doc.tipo === 'flow' ? <NodeComposer visible={composerOpen} onClose={() => setComposerOpen(false)} /> : null}
      {doc.tipo === 'er' ? <TableComposer visible={composerOpen} onClose={() => setComposerOpen(false)} /> : null}

      <ActionBarController
        ref={actionBarRef}
        onOpenCode={() => setTab('code')}
        onStartLink={(from) => setLinkMode(true, from)}
        onOpenAi={() => aiRef.current?.present()}
        onBarLayout={setBarHeight}
      />
      <AiSheet ref={aiRef} doc={doc} sel={sel} onValidate={validarParaIA} onApply={aplicarResultadoIA} />
      <ShareSheet
        ref={shareRef}
        textoLabel={`Arquivo ${exportExtension(doc)}`}
        onPng={exportarComoPng}
        onTexto={exportarComoTexto}
        onCopiar={copiarTexto}
      />
    </View>
  );
}

function ElementsList({ rawElements }: { rawElements: { id: string; texto: string }[] }) {
  const { colors, space } = useTheme();
  const { t: tr } = useI18n();
  const doc = useDoc((s) => s.doc);
  const select = useDoc((s) => s.select);

  // Fluxograma vira árvore de 2 níveis (grupo -> nós), não a lista achatada dos outros tipos —
  // pedido do usuário ("ele é um pai dos que vêm abaixo... quero isso numa árvore de
  // elementos"). Sem aninhamento de grupo dentro de grupo (FlowGroup não tem parentId — ver
  // docs/04-dominio.md), só essa relação de 2 níveis, que já cobre o pedido.
  if (doc.tipo === 'flow') {
    const emGrupo = new Set<string>();
    doc.groups.forEach((g) => g.nodes.forEach((id) => emGrupo.add(id)));
    const semGrupo = doc.nodes.filter((n) => !emGrupo.has(n.id));

    return (
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: 20 }}>
        {doc.groups.map((g) => (
          <View key={g.id}>
            <Pressable onPress={() => select({ kind: 'group', id: g.id })}>
              <Text style={[styles.secao, { color: colors.labelSecondary }]}>{g.label.toUpperCase()}</Text>
            </Pressable>
            <GroupedList>
              {g.nodes.length ? (
                g.nodes.map((id) => {
                  const n = doc.nodes.find((x) => x.id === id);
                  return (
                    <Row
                      key={id}
                      title={n?.label || id}
                      subtitle={id}
                      navigable
                      style={styles.filho}
                      onPress={() => select({ kind: 'node', id })}
                    />
                  );
                })
              ) : (
                <Row title={tr('diagram.noNodesYet')} style={styles.filho} />
              )}
            </GroupedList>
          </View>
        ))}

        {!doc.groups.length || semGrupo.length ? (
          <View>
            {doc.groups.length ? <Text style={[styles.secao, { color: colors.labelSecondary }]}>{tr('diagram.noGroupSection')}</Text> : null}
            <GroupedList>
              {semGrupo.length ? (
                semGrupo.map((n) => (
                  <Row key={n.id} title={n.label || n.id} subtitle={n.id} navigable onPress={() => select({ kind: 'node', id: n.id })} />
                ))
              ) : (
                <Row title={tr('diagram.noElements')} />
              )}
            </GroupedList>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  const rows =
    doc.tipo === 'er'
      ? doc.tables.map((t) => ({ key: t.id, title: t.id, subtitle: tr('diagram.columnsCount', { count: t.cols.length }), sel: { kind: 'table' as const, id: t.id } }))
      : doc.tipo === 'raw'
        ? [...rawElements]
            .sort((a, b) => Number(a.id.split(':')[0]) - Number(b.id.split(':')[0]))
            .map((el) => ({ key: el.id, title: el.texto, subtitle: undefined, sel: { kind: 'txt' as const, id: el.id } }))
        : [];

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg }}>
      <GroupedList>
        {rows.length ? (
          rows.map((r) => <Row key={r.key} title={r.title} subtitle={r.subtitle} navigable onPress={() => select(r.sel)} />)
        ) : (
          <Row title={tr('diagram.noElements')} />
        )}
      </GroupedList>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvasArea: { flex: 1 },
  hud: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxWidth: '70%' },
  hudRight: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8 },
  empty: {
    position: 'absolute', left: 14, right: 14, top: 20, padding: 16, borderRadius: 16, maxWidth: 420, alignSelf: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  err: { position: 'absolute', left: 14, right: 14, bottom: 14, padding: 12, borderRadius: 14, borderWidth: 0.5, maxHeight: '34%' },
  linkBanner: { position: 'absolute', left: 14, right: 14, top: 20, borderRadius: 14, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linkText: { color: '#fff', fontWeight: '600' },
  linkCancel: { color: '#fff', textDecorationLine: 'underline' },
  fabs: { position: 'absolute', right: 16, gap: 12, alignItems: 'center' },
  secao: { fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, paddingHorizontal: 4 },
  filho: { paddingLeft: 32 },
});
