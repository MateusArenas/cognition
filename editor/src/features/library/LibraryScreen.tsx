import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AlertDialog } from '@/design/components/AlertDialog';
import { Fab } from '@/design/components/Fab';
import { Field } from '@/design/components/Field';
import { GroupedList } from '@/design/components/GroupedList';
import { NavBar } from '@/design/components/NavBar';
import { useTheme } from '@/design/useTheme';
import { useToast } from '@/design/components/Toast';
import { useLibrary } from '@/store/useLibrary';
import type { DocRow } from '@/services/storage';
import { importarDocumento } from '@/services/import';
import { DocCard } from './DocCard';
import { useI18n } from '@/i18n/I18nProvider';

// Biblioteca de verdade (§15): grade de documentos salvos, busca por nome/conteúdo,
// excluir com confirmação. "+" abre a galeria (§15). Miniatura visual (renderizar o SVG e
// guardar como arquivo) ainda não existe — cada cartão mostra tipo/data por enquanto, ver
// docs/12-persistencia-e-export.md.
export default function LibraryScreen() {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const { show } = useToast();
  const docs = useLibrary((s) => s.docs);
  const query = useLibrary((s) => s.query);
  const setQuery = useLibrary((s) => s.setQuery);
  const load = useLibrary((s) => s.load);
  const remove = useLibrary((s) => s.remove);
  const [paraExcluir, setParaExcluir] = useState<DocRow | null>(null);
  const tabBarHeight = useBottomTabBarHeight();

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function confirmarExclusao() {
    if (!paraExcluir) return;
    await remove(paraExcluir.id);
    show(t('library.deleted'));
    setParaExcluir(null);
  }

  async function importar() {
    const doc = await importarDocumento();
    if (doc) {
      show(t('library.imported', { name: doc.nome }));
      load();
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar title={t('library.title')} subtitle={t('library.subtitle')} right={{ label: t('library.import'), onPress: importar }} />
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <Field value={query} onChangeText={setQuery} placeholder={t('library.search')} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.lg + tabBarHeight }}>
        <GroupedList>
          {docs.length ? (
            docs.map((d) => (
              <DocCard key={d.id} doc={d} onPress={() => router.push(`/doc/${d.id}`)} onLongPress={() => setParaExcluir(d)} />
            ))
          ) : (
            <DocCard doc={null} onPress={() => router.push('/gallery')} />
          )}
        </GroupedList>
      </ScrollView>

      <View style={[styles.fab, { bottom: 16 + tabBarHeight }]}>
        <Fab icon="plus" primary accessibilityLabel={t('library.newDocument')} onPress={() => router.push('/gallery')} />
      </View>

      <AlertDialog
        visible={!!paraExcluir}
        title={t('library.deleteTitle')}
        message={paraExcluir?.nome}
        onRequestClose={() => setParaExcluir(null)}
        buttons={[
          { label: t('common.cancel'), role: 'cancel', onPress: () => setParaExcluir(null) },
          { label: t('common.delete'), role: 'destructive', onPress: confirmarExclusao },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fab: { position: 'absolute', right: 16 },
});
