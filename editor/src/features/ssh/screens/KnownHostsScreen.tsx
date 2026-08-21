import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isApiError } from '@/api/http';
import { AlertDialog } from '@/design/components/AlertDialog';
import { GroupedList } from '@/design/components/GroupedList';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { forgetKnownHost, listKnownHosts } from '../api/services';
import type { SshKnownHost } from '../types';

// Chaves de host confiadas (TOFU) — "esquecer" uma delas faz a próxima conexão passar pelo
// alerta de confiança de novo, do zero.
export function KnownHostsScreen() {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const [items, setItems] = useState<SshKnownHost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paraEsquecer, setParaEsquecer] = useState<SshKnownHost | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await listKnownHosts());
    } catch (e) {
      setError(isApiError(e) ? e.message : t('ssh.loadError'));
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function confirmarEsquecer() {
    if (!paraEsquecer) return;
    await forgetKnownHost(paraEsquecer.id);
    setParaEsquecer(null);
    void load();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar title={t('ssh.knownHosts.title')} left={{ label: t('common.back'), onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        {error ? <Text style={{ color: colors.red, marginBottom: space.sm }}>{error}</Text> : null}
        {items === null ? (
          <ActivityIndicator />
        ) : items.length === 0 ? (
          <Text style={{ color: colors.labelSecondary, textAlign: 'center', marginTop: space.xl }}>{t('ssh.knownHosts.empty')}</Text>
        ) : (
          <GroupedList>
            {items.map((k) => (
              <Row
                key={k.id}
                title={`${k.address}:${k.port}`}
                subtitle={`${k.keyType} · ${k.fingerprintSha256}`}
                onLongPress={() => setParaEsquecer(k)}
              />
            ))}
          </GroupedList>
        )}
        <Text style={[{ color: colors.labelTertiary, marginTop: space.md, fontSize: 12 }]}>{t('ssh.knownHosts.hint')}</Text>
      </ScrollView>

      <AlertDialog
        visible={!!paraEsquecer}
        title={t('ssh.knownHosts.forgetTitle')}
        message={paraEsquecer ? `${paraEsquecer.address}:${paraEsquecer.port}` : undefined}
        onRequestClose={() => setParaEsquecer(null)}
        buttons={[
          { label: t('common.cancel'), role: 'cancel', onPress: () => setParaEsquecer(null) },
          { label: t('ssh.knownHosts.forget'), role: 'destructive', onPress: confirmarEsquecer },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
