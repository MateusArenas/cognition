import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isApiError } from '@/api/http';
import { GroupedList } from '@/design/components/GroupedList';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { closeSession, listHosts, listSessions } from '../api/services';
import { attachSession } from '../socket/sshSocket';
import type { SshHost, SshSession } from '../types';

// Sessões ativas/detached — reanexar volta pro terminal sem passar por TOFU de novo (a chave já
// foi confiada quando a sessão abriu); a sessão continua viva no backend mesmo com o app fechado
// (docs/20-ssh-mobile.md).
export function SessionsScreen() {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SshSession[] | null>(null);
  const [hosts, setHosts] = useState<Record<string, SshHost>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [ss, hs] = await Promise.all([listSessions(), listHosts()]);
      setSessions(ss);
      setHosts(Object.fromEntries(hs.map((h) => [h.id, h])));
    } catch (e) {
      setError(isApiError(e) ? e.message : t('ssh.loadError'));
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function reanexar(session: SshSession) {
    setBusyId(session.id);
    setError(null);
    try {
      await attachSession(session.id);
      router.push({ pathname: '/ssh/terminal/[sessionId]', params: { sessionId: session.id, hostId: session.hostId ?? '' } });
    } catch (e) {
      setError(isApiError(e) ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function encerrar(session: SshSession) {
    await closeSession(session.id);
    void load();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar title={t('ssh.sessions.title')} left={{ label: t('common.back'), onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        {error ? <Text style={{ color: colors.red, marginBottom: space.sm }}>{error}</Text> : null}
        {sessions === null ? (
          <ActivityIndicator />
        ) : sessions.length === 0 ? (
          <Text style={{ color: colors.labelSecondary, textAlign: 'center', marginTop: space.xl }}>{t('ssh.sessions.empty')}</Text>
        ) : (
          <GroupedList>
            {sessions.map((s) => (
              <Row
                key={s.id}
                title={s.hostId ? (hosts[s.hostId]?.label ?? s.hostId) : t('ssh.sessions.unknownHost')}
                subtitle={t(`ssh.sessions.status.${s.status}`)}
                navigable
                right={busyId === s.id ? <ActivityIndicator /> : undefined}
                onPress={() => reanexar(s)}
                onLongPress={() => encerrar(s)}
              />
            ))}
          </GroupedList>
        )}
        <Text style={[{ color: colors.labelTertiary, marginTop: space.md, fontSize: 12 }]}>{t('ssh.sessions.hint')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
