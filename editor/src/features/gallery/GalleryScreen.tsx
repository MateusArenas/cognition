import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavBar } from '@/design/components/NavBar';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { useDoc } from '@/store/useDoc';
import { GRUPOS, TIPOS, type TipoDiagrama } from '@/domain/mermaid/catalog';
import { parseMermaid } from '@/domain/mermaid/parse';
import { blankCsv, blankMd, blankRabisco, csvDocFromText } from '@/domain/mermaid/factory';
import { templateER, templateFlow, templateMd } from '@/domain/mermaid/templates';
import type { Doc } from '@/domain/types';
import { ImportSheet, type ImportSheetHandle } from '@/features/csv/ImportSheet';
import { TypeInfoSheet } from './TypeInfoSheet';

const INFO_DOCUMENTO = {
  nome: 'Documento',
  kw: 'markdown',
  oque: 'Texto formatado com títulos, listas, tarefas, tabelas e código — e diagramas Mermaid embutidos.',
  quando: 'Especificação, README, ata de reunião — qualquer coisa que precise de texto e desenho juntos.',
  nota: 'Toque em Editar num diagrama do documento e ele abre no canvas. Ao voltar, o texto atualiza sozinho.',
};

// A galeria dos 25 tipos de diagrama (§6.5) + os dois pontos de partida pra documento
// markdown (§13, sem equivalente na spec original — o protótipo já tinha essa seção
// "Documentos", só nunca tinha sido portada). ZenUML/Wardley ficam de fora de propósito (ver
// docs/04-dominio.md).
export function GalleryScreen() {
  const { colors, space, radius } = useTheme();
  const { t: tr } = useI18n();
  const openDoc = useDoc((s) => s.openDoc);
  const infoRef = useRef<BottomSheetModal>(null);
  const importRef = useRef<ImportSheetHandle>(null);
  const [infoTipo, setInfoTipo] = useState<(TipoDiagrama | typeof INFO_DOCUMENTO) | null>(null);

  function abrirDoc(doc: Doc) {
    openDoc(doc);
    router.push('/doc/aberto');
  }

  function abrir(tipo: TipoDiagrama) {
    if (tipo.id === 'flow') abrirDoc(templateFlow());
    else if (tipo.id === 'er') abrirDoc(templateER());
    else if (tipo.code) abrirDoc(parseMermaid(tipo.code, tipo.nome));
  }

  function abrirInfo(tipo: TipoDiagrama | typeof INFO_DOCUMENTO) {
    setInfoTipo(tipo);
    infoRef.current?.present();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar title={tr('gallery.title')} left={{ label: tr('common.cancel'), onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <View style={{ marginBottom: space.lg }}>
          <Text style={[styles.grupo, { color: colors.labelSecondary }]}>{tr('gallery.documentsGroup')}</Text>
          <View style={styles.grid}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.card }]}>
              <Pressable style={styles.cardMain} onPress={() => abrirDoc(templateMd())}>
                <Text style={[styles.nome, { color: colors.label }]} numberOfLines={1}>{tr('gallery.document')}</Text>
                <Text style={[styles.tagVisual, { color: colors.blue }]}>{tr('gallery.withDiagramTag')}</Text>
              </Pressable>
              <Pressable style={styles.info} onPress={() => abrirInfo(INFO_DOCUMENTO)} accessibilityLabel={tr('gallery.aboutDocument')}>
                <Icon name="info" size={18} color={colors.blue} />
              </Pressable>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.card }]}>
              <Pressable
                style={styles.cardMain}
                onPress={() => abrirDoc(blankMd(tr('gallery.blankDocName'), tr('gallery.blankDocBody')))}
              >
                <Text style={[styles.nome, { color: colors.label }]} numberOfLines={1}>{tr('gallery.blank')}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={{ marginBottom: space.lg }}>
          <Text style={[styles.grupo, { color: colors.labelSecondary }]}>{tr('gallery.drawingGroup')}</Text>
          <View style={styles.grid}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.card }]}>
              <Pressable style={styles.cardMain} onPress={() => abrirDoc(blankRabisco(tr('gallery.blankSketchName')))}>
                <Text style={[styles.nome, { color: colors.label }]} numberOfLines={1}>{tr('gallery.sketch')}</Text>
                <Text style={[styles.tagVisual, { color: colors.blue }]}>{tr('gallery.freeDrawTag')}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={{ marginBottom: space.lg }}>
          <Text style={[styles.grupo, { color: colors.labelSecondary }]}>{tr('gallery.tablesGroup')}</Text>
          <View style={styles.grid}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.card }]}>
              <Pressable style={styles.cardMain} onPress={() => abrirDoc(blankCsv(tr('gallery.blankTableName')))}>
                <Text style={[styles.nome, { color: colors.label }]} numberOfLines={1}>{tr('gallery.blank')}</Text>
                <Text style={[styles.tagVisual, { color: colors.blue }]}>{tr('gallery.spreadsheetTag')}</Text>
              </Pressable>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.card }]}>
              <Pressable style={styles.cardMain} onPress={() => importRef.current?.present()}>
                <Text style={[styles.nome, { color: colors.label }]} numberOfLines={1}>{tr('gallery.importTable')}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {GRUPOS.map((grupo) => (
          <View key={grupo} style={{ marginBottom: space.lg }}>
            <Text style={[styles.grupo, { color: colors.labelSecondary }]}>{grupo.toUpperCase()}</Text>
            <View style={styles.grid}>
              {TIPOS.filter((t) => t.grupo === grupo).map((t) => (
                <View key={t.id} style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.card }]}>
                  <Pressable style={styles.cardMain} onPress={() => abrir(t)}>
                    <Text style={[styles.nome, { color: colors.label }]} numberOfLines={1}>{t.nome}</Text>
                    {t.visual ? <Text style={[styles.tagVisual, { color: colors.blue }]}>{tr('gallery.editableTag')}</Text> : null}
                  </Pressable>
                  <Pressable style={styles.info} onPress={() => abrirInfo(t)} accessibilityLabel={tr('gallery.aboutType', { name: t.nome })}>
                    <Icon name="info" size={18} color={colors.blue} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      <TypeInfoSheet ref={infoRef} tipo={infoTipo} />
      <ImportSheet
        ref={importRef}
        onImport={(text, fileName, headerRow) => abrirDoc(csvDocFromText(text, fileName || tr('gallery.blankTableName'), headerRow))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  grupo: { fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', minWidth: 152, flexGrow: 1 },
  cardMain: { flex: 1, paddingVertical: 12, paddingLeft: 13, gap: 2 },
  nome: { fontSize: 14.5 },
  tagVisual: { fontSize: 9.5, fontWeight: '600', letterSpacing: 0.4 },
  info: { width: 34, height: 34, marginRight: 5, alignItems: 'center', justifyContent: 'center' },
});
