import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavBar } from '@/design/components/NavBar';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import { useDoc } from '@/store/useDoc';
import { GRUPOS, TIPOS, type TipoDiagrama } from '@/domain/mermaid/catalog';
import { parseMermaid } from '@/domain/mermaid/parse';
import { blankMd, blankRabisco } from '@/domain/mermaid/factory';
import { templateER, templateFlow, templateMd } from '@/domain/mermaid/templates';
import type { Doc } from '@/domain/types';
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
  const openDoc = useDoc((s) => s.openDoc);
  const infoRef = useRef<BottomSheetModal>(null);
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
      <NavBar title="Novo" left={{ label: 'Cancelar', onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <View style={{ marginBottom: space.lg }}>
          <Text style={[styles.grupo, { color: colors.labelSecondary }]}>DOCUMENTOS</Text>
          <View style={styles.grid}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.card }]}>
              <Pressable style={styles.cardMain} onPress={() => abrirDoc(templateMd())}>
                <Text style={[styles.nome, { color: colors.label }]} numberOfLines={1}>Documento</Text>
                <Text style={[styles.tagVisual, { color: colors.blue }]}>COM DIAGRAMA</Text>
              </Pressable>
              <Pressable style={styles.info} onPress={() => abrirInfo(INFO_DOCUMENTO)} accessibilityLabel="Sobre Documento">
                <Icon name="info" size={18} color={colors.blue} />
              </Pressable>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.card }]}>
              <Pressable
                style={styles.cardMain}
                onPress={() => abrirDoc(blankMd('Novo documento', '# Novo documento\n\nComece a escrever…'))}
              >
                <Text style={[styles.nome, { color: colors.label }]} numberOfLines={1}>Em branco</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={{ marginBottom: space.lg }}>
          <Text style={[styles.grupo, { color: colors.labelSecondary }]}>DESENHO</Text>
          <View style={styles.grid}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.card }]}>
              <Pressable style={styles.cardMain} onPress={() => abrirDoc(blankRabisco('Novo rabisco'))}>
                <Text style={[styles.nome, { color: colors.label }]} numberOfLines={1}>Rabisco</Text>
                <Text style={[styles.tagVisual, { color: colors.blue }]}>DESENHO LIVRE</Text>
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
                    {t.visual ? <Text style={[styles.tagVisual, { color: colors.blue }]}>EDITÁVEL</Text> : null}
                  </Pressable>
                  <Pressable style={styles.info} onPress={() => abrirInfo(t)} accessibilityLabel={`Sobre ${t.nome}`}>
                    <Icon name="info" size={18} color={colors.blue} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      <TypeInfoSheet ref={infoRef} tipo={infoTipo} />
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
