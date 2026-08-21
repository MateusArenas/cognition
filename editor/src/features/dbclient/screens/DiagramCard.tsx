import { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner } from '@/design/components/Banner';
import { GroupedList } from '@/design/components/GroupedList';
import { Row } from '@/design/components/Row';
import { RowSwitch } from '@/design/components/RowSwitch';
import { Segmented } from '@/design/components/Segmented';
import { TintedButton } from '@/design/components/TintedButton';
import { useTheme } from '@/design/useTheme';
import { useToast } from '@/design/components/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import type { DiagramCanvasHandle } from '@/features/diagram/canvas/DiagramCanvas';
import { ShareSheet } from '@/features/diagram/ShareSheet';
import { exportarMermaidTexto, exportarPdf, exportarPng } from '@/services/export';
import { isApiError } from '@/api/http';
import { MermaidView } from './MermaidView';

interface Props {
  nome: string;
  fetchMermaid: (opts: { columns: boolean; keysOnly: boolean; depth?: number }) => Promise<string>;
  /** Só a vizinhança de UMA tabela tem profundidade de relação escolhível (TableScreen). */
  depthControl?: boolean;
}

const DEPTHS = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
];

// `erDiagram` sem nenhuma entidade (schema/vizinhança vazios) — mermaid.js recusa renderizar
// isso, e sem essa checagem a tela ficava tentando desenhar um diagrama impossível.
function semEntidades(code: string): boolean {
  return code.replace(/\s+/g, '') === 'erDiagram';
}

// Cartão de diagrama compartilhado — Diagrama do banco inteiro (DatabaseScreen) e da vizinhança
// de uma tabela (TableScreen) usam o MESMO: grupo "Modelo relacional" no estilo grouped-list do
// resto do app (Row+Switch, igual ConnectionFormScreen — não Chip flutuante, que é pra HUD sobre
// canvas) com alternâncias de colunas/só-chaves/profundidade/ver-código-fonte, canvas
// interativo (pan/zoom de verdade, não a imagem estática do protótipo) com "Compartilhar"
// reaproveitando o MESMO ShareSheet/services/export.ts da tela de Diagrama de documentos.
export function DiagramCard({ nome, fetchMermaid, depthControl }: Props) {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const { show } = useToast();
  const canvasRef = useRef<DiagramCanvasHandle>(null);
  const shareRef = useRef<BottomSheetModal>(null);

  const [showColumns, setShowColumns] = useState(true);
  const [keysOnly, setKeysOnly] = useState(false);
  const [depth, setDepth] = useState(1);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    setCode(null);
    setLoadError(null);
    setRenderError(null);
    fetchMermaid({ columns: showColumns, keysOnly, depth: depthControl ? depth : undefined })
      .then(setCode)
      .catch((e) => setLoadError(isApiError(e) ? e.message : String(e)));
  }, [showColumns, keysOnly, depth, depthControl, fetchMermaid]);

  async function exportarComoPng() {
    shareRef.current?.dismiss();
    const base64 = await canvasRef.current?.exportPng(2);
    if (base64) await exportarPng(base64, nome);
  }

  async function exportarComoPdf() {
    shareRef.current?.dismiss();
    const svg = await canvasRef.current?.exportSvg();
    if (svg) await exportarPdf(svg, nome);
  }

  async function exportarComoTexto() {
    shareRef.current?.dismiss();
    if (code) await exportarMermaidTexto(code, nome);
  }

  async function copiarCodigo() {
    shareRef.current?.dismiss();
    if (code) {
      await Clipboard.setStringAsync(code);
      show(t('common.copied'));
    }
  }

  const vazio = code !== null && semEntidades(code);
  const podeExportar = !!code && !loadError && !vazio;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <Text style={[styles.gtitle, { color: colors.labelSecondary }]}>{t('dbclient.relationalModel')}</Text>
        <GroupedList>
          <Row title={t('dbclient.showColumns')} right={<RowSwitch value={showColumns} onValueChange={setShowColumns} />} />
          <Row
            title={t('dbclient.keysOnly')}
            subtitle={t('dbclient.keysOnlyHint')}
            right={<RowSwitch value={keysOnly} onValueChange={setKeysOnly} />}
          />
          <Row title={t('dbclient.viewMermaidCode')} right={<RowSwitch value={showCode} onValueChange={setShowCode} />} />
        </GroupedList>
        {depthControl ? (
          <>
            <Text style={[styles.gtitle, { color: colors.labelSecondary }]}>{t('dbclient.depthTitle')}</Text>
            <Segmented options={DEPTHS} value={String(depth)} onChange={(v) => setDepth(Number(v))} />
          </>
        ) : null}
        {podeExportar ? (
          <View style={{ marginTop: 14 }}>
            <TintedButton label={t('common.share')} icon="share" onPress={() => shareRef.current?.present()} />
          </View>
        ) : null}
      </View>

      <View style={styles.canvasArea}>
        {loadError ? (
          <View style={{ padding: space.lg }}>
            <Banner tone="error" title={t('dbclient.erdLoadErrorTitle')} message={loadError} />
          </View>
        ) : code === null ? (
          <ActivityIndicator style={{ marginTop: space.xl }} />
        ) : vazio ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyTitle, { color: colors.label }]}>{t('dbclient.erdEmptyTitle')}</Text>
            <Text style={{ color: colors.labelSecondary, textAlign: 'center' }}>{t('dbclient.erdEmptySubtitle')}</Text>
          </View>
        ) : showCode ? (
          <ScrollView
            style={[styles.codeCard, { marginHorizontal: space.lg, marginBottom: space.md, borderColor: colors.separator, backgroundColor: colors.surface }]}
          >
            <Text selectable style={{ color: colors.label, fontFamily: 'Menlo', fontSize: 12, padding: space.sm }}>
              {code}
            </Text>
          </ScrollView>
        ) : (
          <>
            <MermaidView ref={canvasRef} code={code} onError={setRenderError} />
            {renderError ? (
              <View style={styles.err}>
                <Banner tone="error" title={t('dbclient.erdRenderErrorTitle')} message={renderError} />
              </View>
            ) : null}
          </>
        )}
      </View>

      <ShareSheet
        ref={shareRef}
        textoLabel={t('dbclient.mermaidSource')}
        onPng={exportarComoPng}
        onPdf={exportarComoPdf}
        onTexto={exportarComoTexto}
        onCopiar={copiarCodigo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gtitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 18, marginBottom: 6, marginLeft: 4 },
  canvasArea: { flex: 1, marginTop: 8 },
  err: { position: 'absolute', left: 14, right: 14, bottom: 14, maxHeight: '34%' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  codeCard: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
});
