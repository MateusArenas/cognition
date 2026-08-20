import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { matchFont } from '@shopify/react-native-skia';
import { NavBar } from '@/design/components/NavBar';
import { Chip } from '@/design/components/Chip';
import { AlertDialog } from '@/design/components/AlertDialog';
import { Field } from '@/design/components/Field';
import { useToast } from '@/design/components/Toast';
import { useTheme } from '@/design/useTheme';
import { useDoc } from '@/store/useDoc';
import { addElement, bringForward, bringToFront, duplicateElements, groupElements, moveElement, moveElements, removeElement, resizeElement, rotateGroup, sendBackward, sendToBack, ungroupElements, updateElement } from '@/domain/rabisco/mutations';
import { LABELABLE, LINEAR } from '@/domain/rabisco/geom';
import { FONT_FAMILIES } from '@/domain/rabisco/palette';
import type { RabiscoArrowType, RabiscoBinding, RabiscoDoc, RabiscoElement, RabiscoFontFamily, RabiscoTextAlign } from '@/domain/types';
import { RabiscoCanvas, type Background, type RabiscoCanvasHandle } from './Canvas';
import { Dock, type ShapeKind, type Tool } from './Dock';
import { StyleBar } from './StyleBar';
import { ColorPicker } from './ColorPicker';

const BACKGROUNDS: { kind: Background; icon: 'square' | 'grid' | 'dot'; label: string }[] = [
  { kind: 'none', icon: 'square', label: 'Fundo liso' },
  { kind: 'grid', icon: 'grid', label: 'Fundo em grade' },
  { kind: 'dots', icon: 'dot', label: 'Fundo pontilhado' },
];

// Tela do Rabisco (docs/16-rabisco.md) — mesmo esqueleto de DiagramScreen (NavBar + canvas +
// HUD de desfazer/refazer), só que o canvas é Skia nativo, não WebView: desenhar É a interação
// central, não tem motor JS nenhum pra rodar (docs/01-decisao-arquitetura.md).
export function RabiscoScreen() {
  const { colors } = useTheme();
  const { show } = useToast();
  const doc = useDoc((s) => s.doc) as RabiscoDoc;
  const apply = useDoc((s) => s.apply);
  const applyLive = useDoc((s) => s.applyLive);
  const commitLive = useDoc((s) => s.commitLive);
  const undo = useDoc((s) => s.undo);
  const redo = useDoc((s) => s.redo);
  const history = useDoc((s) => s.history);
  const [tool, setTool] = useState<Tool>('select');
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Alvo único derivado — toda a UI de edição (StyleBar, texto, camadas, cor) só faz sentido
  // pra UM elemento por vez; com vários selecionados ela some (ver `hudLeft`/`styleBar` abaixo),
  // sobra só mover/duplicar/excluir o grupo inteiro.
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  function setSelectedId(id: string | null) { setSelectedIds(id ? [id] : []); }
  // Botão "shift": ligado, tocar elemento por elemento mescla a seleção em vez de trocar —
  // igual ao pedido do usuário ("um botão como se fosse um shift"), ver Canvas.tsx `selectStart`.
  const [additiveSelect, setAdditiveSelect] = useState(false);
  const [textEdit, setTextEdit] = useState<{ id: string; value: string } | null>(null);
  const [backgroundIdx, setBackgroundIdx] = useState(0);
  const background = BACKGROUNDS[backgroundIdx];
  const [colorPickerTarget, setColorPickerTarget] = useState<'stroke' | 'fill' | null>(null);
  const canvasRef = useRef<RabiscoCanvasHandle>(null);
  const colorLiveSnapshot = useRef<string | null>(null);
  const usedColors = useMemo(() => {
    const set = new Set<string>();
    for (const el of doc.elements) {
      if (el.strokeColor) set.add(el.strokeColor);
      if (el.bgColor && el.bgColor !== 'transparent') set.add(el.bgColor);
    }
    return [...set];
  }, [doc.elements]);

  function commitElement(element: Omit<RabiscoElement, 'id'> & { id?: string }) {
    apply((d) => addElement(d as RabiscoDoc, element));
  }
  function shapeCreated(id: string) {
    setSelectedId(id);
    setTool('select');
  }
  function erase(id: string) {
    apply((d) => removeElement(d as RabiscoDoc, id));
    setSelectedIds((ids) => ids.filter((x) => x !== id));
  }
  function moveEl(id: string, dx: number, dy: number) {
    apply((d) => moveElement(d as RabiscoDoc, id, dx, dy));
  }
  function moveMultiple(ids: string[], dx: number, dy: number) {
    apply((d) => moveElements(d as RabiscoDoc, ids, dx, dy));
  }
  function rotateGroupEls(ids: string[], center: { x: number; y: number }, delta: number) {
    apply((d) => rotateGroup(d as RabiscoDoc, ids, center, delta));
  }
  function joinSelected() {
    if (selectedIds.length < 2) return;
    apply((d) => groupElements(d as RabiscoDoc, selectedIds));
  }
  function ungroupSelected() {
    if (selectedIds.length < 2) return;
    apply((d) => ungroupElements(d as RabiscoDoc, selectedIds));
  }
  function resizeEl(id: string, box: { x: number; y: number; w: number; h: number }) {
    apply((d) => resizeElement(d as RabiscoDoc, id, box));
  }
  function rotateEl(id: string, rotation: number) {
    apply((d) => updateElement(d as RabiscoDoc, id, { rotation }));
  }
  function setBinding(id: string, which: 'start' | 'end', binding: RabiscoBinding | null, point: [number, number]) {
    const el = doc.elements.find((x) => x.id === id);
    if (!el || !el.points) return;
    const idx = which === 'start' ? 0 : el.points.length - 1;
    const points = el.points.map((q, i) => (i === idx ? ([point[0] - el.x, point[1] - el.y] as [number, number]) : q));
    apply((d) => updateElement(d as RabiscoDoc, id, which === 'start' ? { points, startBinding: binding } : { points, endBinding: binding }));
  }
  function requestTextEdit(id: string) {
    const el = doc.elements.find((x) => x.id === id);
    setTextEdit({ id, value: el?.text || '' });
  }
  // Caixa do texto medida com a fonte de verdade (família+tamanho do elemento) em vez de um
  // chute de largura por caractere — importa agora que tamanho/família variam (itens 2 e 5),
  // e é o que o alinhamento (item 3) usa como largura da caixa pra centralizar/alinhar à direita.
  function measureTextBox(text: string, fontSize: number, family: RabiscoFontFamily) {
    const font = matchFont({ fontFamily: FONT_FAMILIES.find((f) => f.key === family)!.family, fontSize });
    const lines = text.split('\n');
    const w = Math.max(60, ...lines.map((l) => font.measureText(l).width));
    const h = lines.length * fontSize * 1.25;
    return { w, h };
  }
  // Texto vazio (cancelar num elemento recém-criado, ou apagar tudo e confirmar) some — igual
  // ao protótipo, um texto solto sem conteúdo não faz sentido ficar no quadro. Rótulo preso
  // numa FORMA (duplo toque, item 2) é diferente: a caixa é da FORMA, não do texto — nunca
  // remedida, e ficar vazio só limpa o rótulo, nunca apaga a forma dona dele.
  function saveText(value: string) {
    if (!textEdit) return;
    const trimmed = value.replace(/\s+$/, '');
    const el = doc.elements.find((x) => x.id === textEdit.id);
    if (el?.type === 'text') {
      if (!trimmed) apply((d) => removeElement(d as RabiscoDoc, textEdit.id));
      else {
        const { w, h } = measureTextBox(trimmed, el.fontSize, el.fontFamily);
        apply((d) => updateElement(d as RabiscoDoc, textEdit.id, { text: trimmed, w, h }));
      }
    } else {
      apply((d) => updateElement(d as RabiscoDoc, textEdit.id, { text: trimmed }));
    }
    setTextEdit(null);
    setTool('select');
  }
  function cancelTextEdit() {
    if (!textEdit) return;
    const el = doc.elements.find((x) => x.id === textEdit.id);
    if (el?.type === 'text' && !el.text) { apply((d) => removeElement(d as RabiscoDoc, textEdit.id)); setSelectedId(null); }
    setTextEdit(null);
  }
  function duplicateSelected() {
    if (!selectedIds.length) return;
    apply((d) => duplicateElements(d as RabiscoDoc, selectedIds));
    setSelectedIds([]);
  }
  function deleteSelected() {
    if (!selectedIds.length) return;
    for (const id of selectedIds) apply((d) => removeElement(d as RabiscoDoc, id));
    setSelectedIds([]);
  }
  function setFill(color: string) {
    if (!selectedId) return;
    apply((d) => updateElement(d as RabiscoDoc, selectedId, { bgColor: color, fillStyle: color === 'transparent' ? 'hachure' : 'solid' }));
  }
  function setStroke(color: string) {
    if (!selectedId) return;
    apply((d) => updateElement(d as RabiscoDoc, selectedId, { strokeColor: color, labelColor: color }));
  }
  // Contraparte "ao vivo" de setFill/setStroke pro ColorPicker (SV, matiz, conta-gotas, campos
  // hex/rgba) — mesmo padrão de `useLiveField` (store/useDoc.ts): `applyLive` muta o doc sem
  // clonar+stringificar+empilhar undo a cada chamada (era isso que pesava, ~60x/s num arrasto),
  // `commitLive` fecha a sessão inteira num ÚNICO passo de undo, usando o snapshot tirado no
  // início (`colorLiveSnapshot`, ref — sobrevive a toda a sessão sem re-render).
  function beginColorLive() {
    colorLiveSnapshot.current = JSON.stringify(useDoc.getState().doc);
  }
  function setFillLive(color: string) {
    if (!selectedId) return;
    applyLive((d) => {
      const el = (d as RabiscoDoc).elements.find((e) => e.id === selectedId);
      if (!el) return;
      el.bgColor = color;
      el.fillStyle = color === 'transparent' ? 'hachure' : 'solid';
      el.version += 1;
    });
  }
  function setStrokeLive(color: string) {
    if (!selectedId) return;
    applyLive((d) => {
      const el = (d as RabiscoDoc).elements.find((e) => e.id === selectedId);
      if (!el) return;
      el.strokeColor = color;
      el.labelColor = color;
      el.version += 1;
    });
  }
  function endColorLive() {
    if (colorLiveSnapshot.current) commitLive(colorLiveSnapshot.current);
    colorLiveSnapshot.current = null;
  }
  function setArrowType(v: RabiscoArrowType) {
    if (!selectedId) return;
    apply((d) => updateElement(d as RabiscoDoc, selectedId, { arrowType: v }));
  }
  function setOpacity(v: number) {
    if (!selectedId) return;
    apply((d) => updateElement(d as RabiscoDoc, selectedId, { opacity: v }));
  }
  // Mudar tamanho/família remede a caixa do texto na hora — senão o alinhamento (item 3) fica
  // olhando pra uma largura de caixa que já não bate com a fonte nova.
  function setFontSize(v: number) {
    if (!selectedId || !selectedEl) return;
    const { w, h } = measureTextBox(selectedEl.text, v, selectedEl.fontFamily);
    apply((d) => updateElement(d as RabiscoDoc, selectedId, { fontSize: v, w, h }));
  }
  function setFontFamily(v: RabiscoFontFamily) {
    if (!selectedId || !selectedEl) return;
    const { w, h } = measureTextBox(selectedEl.text, selectedEl.fontSize, v);
    apply((d) => updateElement(d as RabiscoDoc, selectedId, { fontFamily: v, w, h }));
  }
  function setTextAlign(v: RabiscoTextAlign) {
    if (!selectedId) return;
    apply((d) => updateElement(d as RabiscoDoc, selectedId, { textAlign: v }));
  }
  // Feedback visual de qual camada estava e pra qual foi — sem isso o usuário aperta os botões
  // às cegas, sem saber se mudou nada nem quanto. Lê o doc de novo depois do apply() (via
  // `getState()`, já que a variável `doc` deste render ainda é a de ANTES da mutação) pra
  // comparar posição antiga x nova.
  function announceLayer(beforeIdx: number) {
    if (!selectedId) return;
    const els = (useDoc.getState().doc as RabiscoDoc).elements;
    const afterIdx = els.findIndex((e) => e.id === selectedId);
    if (afterIdx === -1) return;
    show(`Camada ${beforeIdx + 1} → ${afterIdx + 1} de ${els.length}`);
  }
  function layerForward() {
    if (!selectedId) return;
    const before = doc.elements.findIndex((e) => e.id === selectedId);
    apply((d) => bringForward(d as RabiscoDoc, selectedId));
    announceLayer(before);
  }
  function layerBackward() {
    if (!selectedId) return;
    const before = doc.elements.findIndex((e) => e.id === selectedId);
    apply((d) => sendBackward(d as RabiscoDoc, selectedId));
    announceLayer(before);
  }
  function layerToFront() {
    if (!selectedId) return;
    const before = doc.elements.findIndex((e) => e.id === selectedId);
    apply((d) => bringToFront(d as RabiscoDoc, selectedId));
    announceLayer(before);
  }
  function layerToBack() {
    if (!selectedId) return;
    const before = doc.elements.findIndex((e) => e.id === selectedId);
    apply((d) => sendToBack(d as RabiscoDoc, selectedId));
    announceLayer(before);
  }

  const selectedEl = selectedId ? doc.elements.find((e) => e.id === selectedId) : null;
  // Grupo "de verdade" (botão Juntar já apertado antes) vs. seleção solta (laço/aditiva) — só o
  // primeiro caso mostra "Desagrupar" em vez de "Juntar". Checa que TODOS os selecionados
  // compartilham o mesmo `groupId` não-nulo, não só o primeiro.
  const firstGroupId = selectedIds.length > 1 ? doc.elements.find((e) => e.id === selectedIds[0])?.groupId : null;
  const isGroup = !!firstGroupId && selectedIds.every((id) => doc.elements.find((e) => e.id === id)?.groupId === firstGroupId);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar title={doc.nome} left={{ label: '‹ Biblioteca', onPress: () => router.back() }} />
      <View style={styles.canvasArea}>
        <RabiscoCanvas
          ref={canvasRef}
          elements={doc.elements}
          tool={tool}
          shapeKind={shapeKind}
          strokeColor={colors.label}
          strokeWidth={2.6}
          selectedIds={selectedIds}
          additive={additiveSelect}
          background={background.kind}
          onSelect={setSelectedId}
          onSelectMany={setSelectedIds}
          onCommitElement={commitElement}
          onShapeCreated={shapeCreated}
          onMoveElement={moveEl}
          onMoveMultiple={moveMultiple}
          onResizeElement={resizeEl}
          onRotateElement={rotateEl}
          onRotateGroup={rotateGroupEls}
          onSetBinding={setBinding}
          onErase={erase}
          onRequestTextEdit={requestTextEdit}
        />
        <View style={styles.hudRight} pointerEvents="box-none">
          <Chip
            icon={background.icon}
            accessibilityLabel={background.label}
            onPress={() => setBackgroundIdx((i) => (i + 1) % BACKGROUNDS.length)}
          />
          <Chip icon="undo" accessibilityLabel="Desfazer" onPress={undo} disabled={!history.past.length} />
          <Chip icon="redo" accessibilityLabel="Refazer" onPress={redo} disabled={!history.future.length} />
          {tool === 'select' ? (
            <Chip
              icon="multiSelect"
              accessibilityLabel="Selecionar vários"
              active={additiveSelect}
              onPress={() => setAdditiveSelect((v) => !v)}
            />
          ) : null}
        </View>
        {selectedIds.length ? (
          <View style={styles.hudLeft} pointerEvents="box-none">
            {selectedEl?.type === 'text' ? (
              <Chip icon="pencil" accessibilityLabel="Editar texto" onPress={() => requestTextEdit(selectedId!)} />
            ) : null}
            {selectedIds.length > 1 ? (
              isGroup ? (
                <Chip icon="ungroup" accessibilityLabel="Desagrupar" onPress={ungroupSelected} />
              ) : (
                <Chip icon="group" accessibilityLabel="Juntar" onPress={joinSelected} />
              )
            ) : null}
            <Chip icon="copy" accessibilityLabel="Duplicar" onPress={duplicateSelected} />
            <Chip icon="trash" accessibilityLabel="Excluir" onPress={deleteSelected} />
          </View>
        ) : null}
        {selectedEl ? (
          <View style={styles.styleBar} pointerEvents="box-none">
            <StyleBar
              strokeValue={selectedEl.strokeColor}
              onStrokeChange={setStroke}
              onOpenStrokePicker={() => setColorPickerTarget('stroke')}
              fillValue={LABELABLE.has(selectedEl.type) ? selectedEl.bgColor : undefined}
              onFillChange={LABELABLE.has(selectedEl.type) ? setFill : undefined}
              onOpenFillPicker={LABELABLE.has(selectedEl.type) ? () => setColorPickerTarget('fill') : undefined}
              arrowType={LINEAR.has(selectedEl.type) ? selectedEl.arrowType : undefined}
              onArrowTypeChange={LINEAR.has(selectedEl.type) ? setArrowType : undefined}
              opacity={selectedEl.opacity}
              onOpacityChange={setOpacity}
              fontSize={selectedEl.type === 'text' ? selectedEl.fontSize : undefined}
              onFontSizeChange={selectedEl.type === 'text' ? setFontSize : undefined}
              fontFamily={selectedEl.type === 'text' ? selectedEl.fontFamily : undefined}
              onFontFamilyChange={selectedEl.type === 'text' ? setFontFamily : undefined}
              textAlign={selectedEl.type === 'text' ? selectedEl.textAlign : undefined}
              onTextAlignChange={selectedEl.type === 'text' ? setTextAlign : undefined}
              onLayerForward={layerForward}
              onLayerBackward={layerBackward}
              onLayerToFront={layerToFront}
              onLayerToBack={layerToBack}
            />
          </View>
        ) : null}
        <Dock tool={tool} shapeKind={shapeKind} selectedId={selectedId} onChangeTool={setTool} onChangeShape={setShapeKind} />
      </View>

      <AlertDialog
        visible={!!textEdit}
        title={doc.elements.find((e) => e.id === textEdit?.id)?.type === 'text' ? 'Texto' : 'Rótulo'}
        buttons={[
          { label: 'Cancelar', role: 'cancel', onPress: cancelTextEdit },
          { label: 'OK', role: 'primary', onPress: () => saveText(textEdit?.value ?? '') },
        ]}
        onRequestClose={cancelTextEdit}
      >
        <Field value={textEdit?.value ?? ''} onChangeText={(v) => setTextEdit((t) => (t ? { ...t, value: v } : t))} autoFocus multiline />
      </AlertDialog>

      <ColorPicker
        visible={!!colorPickerTarget && !!selectedEl}
        title={colorPickerTarget === 'fill' ? 'Preenchimento' : 'Cor da borda'}
        value={(colorPickerTarget === 'fill' ? selectedEl?.bgColor : selectedEl?.strokeColor) ?? '#000000'}
        usedColors={usedColors}
        canvasRef={canvasRef}
        onChange={colorPickerTarget === 'fill' ? setFill : setStroke}
        onBeginLive={beginColorLive}
        onChangeLive={colorPickerTarget === 'fill' ? setFillLive : setStrokeLive}
        onEndLive={endColorLive}
        onRequestClose={() => setColorPickerTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvasArea: { flex: 1 },
  hudRight: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8 },
  hudLeft: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8 },
  styleBar: { position: 'absolute', left: 0, right: 0, bottom: 82, alignItems: 'center' },
});
