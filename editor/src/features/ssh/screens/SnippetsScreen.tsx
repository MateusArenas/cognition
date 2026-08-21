import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isApiError } from '@/api/http';
import { AlertDialog } from '@/design/components/AlertDialog';
import { Fab } from '@/design/components/Fab';
import { GroupedList } from '@/design/components/GroupedList';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { RowSwitch } from '@/design/components/RowSwitch';
import { Sheet } from '@/design/components/Sheet';
import { TintedButton } from '@/design/components/TintedButton';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { createSnippet, deleteSnippet, listSnippets } from '../api/services';
import type { SshSnippet } from '../types';
import { FormField } from './FormField';

// Snippets — comando pronto, injetado no terminal quando escolhido (nunca roda sozinho).
// requireConfirm começa ligado por padrão: snippet com "rm"/"restart" disparando por toque
// acidental é o pior cenário do produto (mesma preocupação da spec de referência).
export function SnippetsScreen() {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const [snippets, setSnippets] = useState<SshSnippet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = useState<SshSnippet | null>(null);
  const [busy, setBusy] = useState(false);
  const formSheetRef = useRef<BottomSheetModal>(null);

  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [tag, setTag] = useState('');
  const [requireConfirm, setRequireConfirm] = useState(true);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSnippets(await listSnippets());
    } catch (e) {
      setError(isApiError(e) ? e.message : t('ssh.loadError'));
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      await createSnippet({ name: name.trim(), command: command.trim(), tag: tag.trim() || undefined, requireConfirm });
      formSheetRef.current?.dismiss();
      setName('');
      setCommand('');
      setTag('');
      setRequireConfirm(true);
      void load();
    } catch (e) {
      setError(isApiError(e) ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmarExclusao() {
    if (!paraExcluir) return;
    await deleteSnippet(paraExcluir.id);
    setParaExcluir(null);
    void load();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar title={t('ssh.snippets.title')} left={{ label: t('common.back'), onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        {error ? <Text style={{ color: colors.red, marginBottom: space.sm }}>{error}</Text> : null}
        {snippets === null ? (
          <ActivityIndicator />
        ) : snippets.length === 0 ? (
          <Text style={{ color: colors.labelSecondary, textAlign: 'center', marginTop: space.xl }}>{t('ssh.snippets.empty')}</Text>
        ) : (
          <GroupedList>
            {snippets.map((s) => (
              <Row key={s.id} title={s.name} subtitle={s.command} onLongPress={() => setParaExcluir(s)} />
            ))}
          </GroupedList>
        )}
      </ScrollView>

      <View style={[styles.fab, { bottom: 16 }]}>
        <Fab icon="plus" primary accessibilityLabel={t('ssh.snippets.new')} onPress={() => formSheetRef.current?.present()} />
      </View>

      <Sheet ref={formSheetRef} title={t('ssh.snippets.new')}>
        <FormField label={t('ssh.fieldName')} value={name} onChangeText={setName} placeholder={t('ssh.snippets.namePlaceholder')} />
        <FormField label={t('ssh.snippets.command')} value={command} onChangeText={setCommand} placeholder="docker logs -f --tail 200 api" autoCapitalize="none" mono />
        <FormField label={t('ssh.snippets.tag')} value={tag} onChangeText={setTag} placeholder="docker" autoCapitalize="none" />
        <View style={{ marginTop: space.sm }}>
          <GroupedList>
            <Row title={t('ssh.snippets.requireConfirm')} right={<RowSwitch value={requireConfirm} onValueChange={setRequireConfirm} />} />
          </GroupedList>
        </View>
        <View style={{ marginTop: space.md }}>
          {busy ? <ActivityIndicator /> : <TintedButton label={t('common.save')} onPress={onCreate} disabled={!name.trim() || !command.trim()} />}
        </View>
      </Sheet>

      <AlertDialog
        visible={!!paraExcluir}
        title={t('ssh.snippets.deleteTitle')}
        message={paraExcluir?.name}
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
