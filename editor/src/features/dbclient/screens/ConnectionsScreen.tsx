import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertDialog } from '@/design/components/AlertDialog';
import { Fab } from '@/design/components/Fab';
import { GroupedList } from '@/design/components/GroupedList';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { useSettings } from '@/store/useSettings';
import { isApiError } from '../api/http';
import { deleteConnection, listConnections } from '../api/services';
import type { DbConnection } from '../types';
import { driverByClient } from '../drivers';

// Bancos — lista de conexões com bolinha colorida, hábito do TablePlus: vermelho é produção, e
// você vê isso antes de tocar em qualquer coisa (DB-MOBILE.md §2.10).
export function ConnectionsScreen() {
  const { colors, space, radius } = useTheme();
  const { t } = useI18n();
  const tabBarHeight = useBottomTabBarHeight();
  const setDbAuthToken = useSettings((s) => s.setDbAuthToken);
  const [connections, setConnections] = useState<DbConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<DbConnection | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setConnections(await listConnections());
    } catch (e) {
      setError(isApiError(e) ? e.message : t('dbclient.loadError'));
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function confirmarExclusao() {
    if (!paraExcluir) return;
    await deleteConnection(paraExcluir.id);
    setParaExcluir(null);
    void load();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar
        title={t('dbclient.title')}
        right={{ label: t('dbclient.logout'), onPress: () => setDbAuthToken(null) }}
      />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.lg + tabBarHeight }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? <Text style={{ color: colors.red, marginBottom: space.sm }}>{error}</Text> : null}
        {connections === null ? (
          <ActivityIndicator />
        ) : connections.length === 0 ? (
          <Text style={{ color: colors.labelSecondary, textAlign: 'center', marginTop: space.xl }}>{t('dbclient.emptyConnections')}</Text>
        ) : (
          <GroupedList>
            {connections.map((c) => (
              <Row
                key={c.id}
                title={c.name}
                subtitle={t(driverByClient(c.client)?.labelKey ?? c.client)}
                navigable
                left={<View style={[styles.dot, { backgroundColor: c.color, borderRadius: radius.pill }]} />}
                onPress={() => router.push({ pathname: '/db/[id]', params: { id: c.id } })}
                onLongPress={() => setParaExcluir(c)}
              />
            ))}
          </GroupedList>
        )}
      </ScrollView>

      <View style={[styles.fab, { bottom: 16 + tabBarHeight }]}>
        <Fab icon="plus" primary accessibilityLabel={t('dbclient.newConnection')} onPress={() => router.push('/db/connection')} />
      </View>

      <AlertDialog
        visible={!!paraExcluir}
        title={t('dbclient.deleteConnectionTitle')}
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
  dot: { width: 10, height: 10 },
  fab: { position: 'absolute', right: 16 },
});
