import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { NavBar } from '@/design/components/NavBar';
import { Segmented } from '@/design/components/Segmented';
import { Sheet } from '@/design/components/Sheet';
import { useTheme } from '@/design/useTheme';
import { useDoc, useLiveField } from '@/store/useDoc';
import { renderMarkdown } from '@/domain/markdown/render';
import { countDiagrams, countWords, insertMermaidBlock } from '@/domain/markdown/blocks';
import { parseMermaid } from '@/domain/mermaid/parse';
import { setMarkdown } from '@/domain/mutations/md';
import { exportarTexto } from '@/services/export';
import type { MdDoc } from '@/domain/types';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownPreview } from './MarkdownPreview';
import { FormatBar } from './FormatBar';
import { Outline } from './Outline';

type Modo = 'edit' | 'read';

// Documentos Markdown (§13) — Escrever/Ler no topo; diagramas embutidos abrem no canvas de
// verdade e voltam pro lugar exato (§13.4, ver DiagramScreen#voltar).
export function DocumentScreen() {
  const { colors, space } = useTheme();
  const doc = useDoc((s) => s.doc) as MdDoc;
  const apply = useDoc((s) => s.apply);
  const openDoc = useDoc((s) => s.openDoc);
  const setRetornoMd = useDoc((s) => s.setRetornoMd);
  // live só para a digitação contínua no MarkdownEditor (applyLive, não empilha por tecla).
  // Ações discretas (toggle de tarefa, barra de formatação, inserir diagrama) usam apply()
  // direto, porque cada uma é UM toque — precisa empilhar undo na hora, não esperar blur.
  const live = useLiveField(
    (d) => (d.tipo === 'md' ? d.md : ''),
    (d, v) => {
      if (d.tipo === 'md') d.md = v;
    }
  );

  const [modo, setModo] = useState<Modo>('edit');
  const [selection, setSelection] = useState({ start: doc.md.length, end: doc.md.length });
  const outlineRef = useRef<BottomSheetModal>(null);

  const nodes = useMemo(() => renderMarkdown(live.value), [live.value]);
  const palavras = useMemo(() => countWords(live.value), [live.value]);
  const diagramas = useMemo(() => countDiagrams(live.value), [live.value]);

  function onToggleTask(ini: number, fim: number, feita: boolean) {
    const novo = live.value.slice(0, ini) + (feita ? ' ' : 'x') + live.value.slice(fim);
    apply((d) => setMarkdown(d as MdDoc, novo));
  }

  function onEditBlock(bloco: { corpo: string; ini: number; fim: number }) {
    setRetornoMd({ doc, ini: bloco.ini, fim: bloco.fim });
    openDoc(parseMermaid(bloco.corpo, doc.nome));
    router.push('/doc/aberto');
  }

  function inserirDiagrama(pos: number) {
    const texto = insertMermaidBlock(live.value, pos, 'flowchart TD\n    A[Início] --> B[Fim]');
    apply((d) => setMarkdown(d as MdDoc, texto));
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar
        title={doc.nome}
        left={{ label: '‹ Biblioteca', onPress: () => router.back() }}
        right={[
          { label: 'Estrutura', onPress: () => outlineRef.current?.present() },
          { label: 'Exportar', onPress: () => exportarTexto(doc) },
        ]}
      />
      <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <Segmented
          options={[
            { value: 'edit', label: 'Escrever' },
            { value: 'read', label: 'Ler' },
          ]}
          value={modo}
          onChange={(v) => setModo(v as Modo)}
        />
      </View>

      <View style={styles.body}>
        {modo === 'edit' ? (
          <MarkdownEditor
            value={live.value}
            onChangeText={live.onChangeText}
            onSelectionChange={setSelection}
            onFocus={live.onFocus}
            onBlur={live.onBlur}
          />
        ) : (
          <View style={{ flex: 1 }}>
            <MarkdownPreview nodes={nodes} onToggleTask={onToggleTask} onEditBlock={onEditBlock} />
          </View>
        )}
      </View>

      <View style={[styles.status, { borderTopColor: colors.separator }]}>
        <Text style={{ color: colors.labelTertiary, fontSize: 11.5 }}>
          {palavras} palavra{palavras === 1 ? '' : 's'} · {diagramas} diagrama{diagramas === 1 ? '' : 's'}
        </Text>
      </View>

      {modo === 'edit' ? (
        <KeyboardStickyView>
          <FormatBar
            text={live.value}
            selection={selection}
            onApply={(r) => {
              apply((d) => setMarkdown(d as MdDoc, r.text));
              setSelection({ start: r.selStart, end: r.selEnd });
            }}
            onInsertDiagram={inserirDiagrama}
          />
        </KeyboardStickyView>
      ) : null}

      <Sheet ref={outlineRef} title="Estrutura">
        <Outline
          nodes={nodes}
          onJump={(offset) => {
            setModo('edit');
            setSelection({ start: offset, end: offset });
            outlineRef.current?.dismiss();
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  status: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6, alignItems: 'center' },
});
