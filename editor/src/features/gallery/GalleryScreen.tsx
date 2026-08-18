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
import { templateER, templateFlow } from '@/domain/mermaid/templates';
import { TypeInfoSheet } from './TypeInfoSheet';

// A galeria dos 25 tipos (§6.5) — Novo documento abre aqui (§15). ZenUML/Wardley ficam de
// fora de propósito (ver docs/04-dominio.md).
export function GalleryScreen() {
  const { colors, space, radius } = useTheme();
  const openDoc = useDoc((s) => s.openDoc);
  const infoRef = useRef<BottomSheetModal>(null);
  const [infoTipo, setInfoTipo] = useState<TipoDiagrama | null>(null);

  function abrir(tipo: TipoDiagrama) {
    if (tipo.id === 'flow') openDoc(templateFlow());
    else if (tipo.id === 'er') openDoc(templateER());
    else if (tipo.code) openDoc(parseMermaid(tipo.code, tipo.nome));
    else return;
    router.push('/doc/aberto');
  }

  function abrirInfo(tipo: TipoDiagrama) {
    setInfoTipo(tipo);
    infoRef.current?.present();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar title="Novo diagrama" left={{ label: 'Cancelar', onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
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
