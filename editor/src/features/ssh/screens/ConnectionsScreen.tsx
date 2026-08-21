import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { isApiError } from '@/api/http';
import { AlertDialog } from '@/design/components/AlertDialog';
import { Fab } from '@/design/components/Fab';
import { GroupedList } from '@/design/components/GroupedList';
import { Icon } from '@/design/Icon';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { Sheet } from '@/design/components/Sheet';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { deleteHost, listHosts } from '../api/services';
import { openSession } from '../socket/sshSocket';
import type { SshHost } from '../types';

// Hosts — lista com bolinha colorida (mesmo hábito do cliente de banco: cor antes de tocar em
// qualquer coisa). Tocar abre uma folha de ações (Entrar/Editar/Apagar) — nenhuma delas dispara
// sozinha só de tocar na linha, mesmo cuidado que o resto do app já tem com ação destrutiva.
export function ConnectionsScreen() {
  const { colors, space, radius } = useTheme();
  const { t } = useI18n();
  const tabBarHeight = useBottomTabBarHeight();
  const [hosts, setHosts] = useState<SshHost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<SshHost | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [hostKeyPrompt, setHostKeyPrompt] = useState<{ fingerprint: string; keyType: string; resolve: (trust: boolean) => void } | null>(null);
  const [hostActionsFor, setHostActionsFor] = useState<SshHost | null>(null);
  const menuRef = useRef<BottomSheetModal>(null);
  const hostActionsRef = useRef<BottomSheetModal>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setHosts(await listHosts());
    } catch (e) {
      setError(isApiError(e) ? e.message : t('ssh.loadError'));
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
    await deleteHost(paraExcluir.id);
    setParaExcluir(null);
    void load();
  }

  function abrirAcoes(host: SshHost) {
    setHostActionsFor(host);
    hostActionsRef.current?.present();
  }

  async function abrirTerminal(host: SshHost) {
    if (connectingId) return;
    setConnectingId(host.id);
    setError(null);
    try {
      // Só navega quando a sessão está DE VERDADE aberta — nunca antes (openSession resolve só
      // depois do shell pronto), pra não perder um evento que já tinha disparado antes da tela
      // do terminal montar e assinar os listeners. O alerta de TOFU acontece aqui, ainda nesta
      // tela, síncrono com essa espera.
      const sessionId = await openSession(
        host.id,
        (info) =>
          new Promise<boolean>((resolve) => {
            setHostKeyPrompt({ ...info, resolve });
          })
      );
      router.push({ pathname: '/ssh/terminal/[sessionId]', params: { sessionId, hostId: host.id } });
    } catch (e) {
      setError(isApiError(e) ? e.message : e instanceof Error ? e.message : t('ssh.connectError'));
    } finally {
      setConnectingId(null);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar title={t('ssh.title')} right={{ label: t('ssh.menu'), onPress: () => menuRef.current?.present() }} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.lg + tabBarHeight }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? <Text style={{ color: colors.red, marginBottom: space.sm }}>{error}</Text> : null}
        {hosts === null ? (
          <ActivityIndicator />
        ) : hosts.length === 0 ? (
          <Text style={{ color: colors.labelSecondary, textAlign: 'center', marginTop: space.xl }}>{t('ssh.emptyHosts')}</Text>
        ) : (
          <GroupedList>
            {hosts.map((h) => (
              <Row
                key={h.id}
                title={h.label}
                subtitle={`${h.username}@${h.address}${h.port !== 22 ? ':' + h.port : ''}`}
                navigable
                left={<View style={[styles.dot, { backgroundColor: h.color, borderRadius: radius.pill }]} />}
                right={connectingId === h.id ? <ActivityIndicator /> : undefined}
                onPress={() => abrirAcoes(h)}
              />
            ))}
          </GroupedList>
        )}
      </ScrollView>

      <View style={[styles.fab, { bottom: 16 + tabBarHeight }]}>
        <Fab icon="plus" primary accessibilityLabel={t('ssh.newHost')} onPress={() => router.push('/ssh/host')} />
      </View>

      <Sheet ref={menuRef} title={t('ssh.menu')}>
        <GroupedList>
          <Row title={t('ssh.sessions.title')} navigable onPress={() => { menuRef.current?.dismiss(); router.push('/ssh/sessions'); }} />
          <Row title={t('ssh.credentials.title')} navigable onPress={() => { menuRef.current?.dismiss(); router.push('/ssh/credentials'); }} />
          <Row title={t('ssh.snippets.title')} navigable onPress={() => { menuRef.current?.dismiss(); router.push('/ssh/snippets'); }} />
          <Row title={t('ssh.knownHosts.title')} navigable onPress={() => { menuRef.current?.dismiss(); router.push('/ssh/known-hosts'); }} />
        </GroupedList>
      </Sheet>

      <Sheet ref={hostActionsRef} title={hostActionsFor?.label ?? t('ssh.title')}>
        <GroupedList>
          <Row
            title={t('ssh.connect')}
            left={<Icon name="play" size={20} />}
            onPress={() => {
              hostActionsRef.current?.dismiss();
              if (hostActionsFor) abrirTerminal(hostActionsFor);
            }}
          />
          <Row
            title={t('ssh.editHost')}
            left={<Icon name="pencil" size={20} />}
            navigable
            onPress={() => {
              hostActionsRef.current?.dismiss();
              if (hostActionsFor) router.push({ pathname: '/ssh/host', params: { id: hostActionsFor.id } });
            }}
          />
          <Row
            title={t('common.delete')}
            left={<Icon name="trash" size={20} color="#D70015" />}
            onPress={() => {
              hostActionsRef.current?.dismiss();
              setParaExcluir(hostActionsFor);
            }}
          />
        </GroupedList>
      </Sheet>

      <AlertDialog
        visible={!!paraExcluir}
        title={t('ssh.deleteHostTitle')}
        message={paraExcluir?.label}
        onRequestClose={() => setParaExcluir(null)}
        buttons={[
          { label: t('common.cancel'), role: 'cancel', onPress: () => setParaExcluir(null) },
          { label: t('common.delete'), role: 'destructive', onPress: confirmarExclusao },
        ]}
      />

      {/* TOFU — primeira conexão com um host mostra a impressão digital SHA256 (mesmo formato
          que "ssh-keygen -lf" mostra, pra dar pra comparar) e pergunta antes de qualquer coisa. */}
      <AlertDialog
        visible={!!hostKeyPrompt}
        title={t('ssh.hostKeyTitle')}
        message={hostKeyPrompt ? `${hostKeyPrompt.keyType}\n${hostKeyPrompt.fingerprint}` : undefined}
        onRequestClose={() => {
          hostKeyPrompt?.resolve(false);
          setHostKeyPrompt(null);
        }}
        buttons={[
          {
            label: t('common.cancel'),
            role: 'cancel',
            onPress: () => {
              hostKeyPrompt?.resolve(false);
              setHostKeyPrompt(null);
            },
          },
          {
            label: t('ssh.trustHostKey'),
            role: 'primary',
            onPress: () => {
              hostKeyPrompt?.resolve(true);
              setHostKeyPrompt(null);
            },
          },
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
