import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useKeyboardContext } from 'react-native-keyboard-controller';
import { AlertDialog } from '@/design/components/AlertDialog';
import { GroupedList } from '@/design/components/GroupedList';
import { Icon } from '@/design/Icon';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { Sheet } from '@/design/components/Sheet';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { getHost, listSnippets } from '../api/services';
import { getSshSocket } from '../socket/sshSocket';
import { useSshSettings } from '../store/useSshSettings';
import { base64EncodeAscii } from '../terminal/base64';
import { KeyBar } from '../terminal/KeyBar';
import { TERMINAL_THEMES, terminalThemeById } from '../terminal/themes';
import { TerminalCanvas, type TerminalCanvasHandle } from '../terminal/TerminalCanvas';
import type { DataEvent, ExitEvent, ReplayEvent, SshHost, SshSnippet, StatusEvent } from '../types';

// Terminal — WebView (xterm.js) + barra de teclas, ligado numa sessão que JÁ está aberta
// (ConnectionsScreen só navega pra cá depois que o TOFU foi resolvido e o shell abriu de
// verdade, ver socket/sshSocket.ts#openSession — sem essa garantia haveria uma corrida real
// entre eventos do socket chegando e esta tela montar os listeners).
export function TerminalScreen() {
  const { sessionId, hostId } = useLocalSearchParams<{ sessionId: string; hostId?: string }>();
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const { themeId, fontSize, hydrate: hydrateSshSettings, setThemeId, setFontSize } = useSshSettings();
  const { setEnabled: setKeyboardControllerEnabled } = useKeyboardContext();

  const [host, setHost] = useState<SshHost | null>(null);
  const [status, setStatus] = useState<StatusEvent['state']>('connecting');
  const [snippets, setSnippets] = useState<SshSnippet[]>([]);
  const [snippetConfirm, setSnippetConfirm] = useState<SshSnippet | null>(null);

  const canvasRef = useRef<TerminalCanvasHandle>(null);
  const menuRef = useRef<BottomSheetModal>(null);
  const appearanceRef = useRef<BottomSheetModal>(null);
  const snippetsRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    void hydrateSshSettings();
  }, [hydrateSshSettings]);

  // O reload relatado ao digitar no terminal era o atalho de teclado do próprio Metro CLI ('r' =
  // reload) disparando sem querer porque o foco do teclado do Mac estava no terminal em vez do
  // Simulator — nada de errado no app. Mesmo assim, `setEnabled(false)` aqui continua valendo a
  // pena: o `KeyboardProvider` global (app/_layout.tsx) mede o layout do input focado toda vez
  // que o teclado de verdade abre, e o input focado nesta tela é o textarea escondido do
  // xterm.js, DENTRO de uma WebView, sem nó nenhum na shadow tree do Fabric pro nativo medir —
  // desliga o rastreamento nativo só enquanto esta tela está montada, evitando essa medição
  // inútil (e potencialmente frágil) sem afetar o resto do app.
  useEffect(() => {
    setKeyboardControllerEnabled(false);
    return () => setKeyboardControllerEnabled(true);
  }, [setKeyboardControllerEnabled]);

  useEffect(() => {
    if (!hostId) return;
    getHost(hostId)
      .then(setHost)
      .catch(() => undefined);
    listSnippets()
      .then(setSnippets)
      .catch(() => undefined);
  }, [hostId]);

  const applyAppearance = useCallback(() => {
    const theme = terminalThemeById(themeId);
    canvasRef.current?.setTheme(theme.colors);
    canvasRef.current?.setFontSize(fontSize);
  }, [themeId, fontSize]);

  useEffect(() => {
    applyAppearance();
  }, [applyAppearance]);

  // Eventos do gateway pra ESTA sessão — replay ao anexar cobre tanto o mount inicial (o que já
  // rodou entre a sessão abrir e esta tela montar) quanto reanexar depois do app voltar do
  // background (AppState abaixo).
  useEffect(() => {
    const socket = getSshSocket();
    const onData = (p: DataEvent) => {
      if (p.sessionId === sessionId) canvasRef.current?.write(p.b64);
    };
    const onReplay = (p: ReplayEvent) => {
      if (p.sessionId !== sessionId) return;
      canvasRef.current?.clear();
      canvasRef.current?.write(p.b64);
    };
    const onStatus = (p: StatusEvent) => {
      if (p.sessionId === sessionId) setStatus(p.state);
    };
    const onExit = (p: ExitEvent) => {
      if (p.sessionId === sessionId) setStatus('closed');
    };
    socket.on('data', onData);
    socket.on('replay', onReplay);
    socket.on('status', onStatus);
    socket.on('exit', onExit);
    socket.emit('session:attach', { sessionId });

    return () => {
      socket.off('data', onData);
      socket.off('replay', onReplay);
      socket.off('status', onStatus);
      socket.off('exit', onExit);
    };
  }, [sessionId]);

  // App volta do background: reconecta o socket se caiu e reanexa (replay cobre o que rolou
  // enquanto em segundo plano) — mesmo problema real que o resto do app já resolve com AppState.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const socket = getSshSocket();
      if (!socket.connected) socket.connect();
      socket.emit('session:attach', { sessionId });
    });
    return () => sub.remove();
  }, [sessionId]);

  // useCallback nos três — TerminalCanvas é memo() (ver TerminalCanvas.tsx) justamente pra não
  // re-renderizar (e não recarregar a WebView) em toda renderização desta tela; passar função
  // nova a cada render aqui anularia o memo() na mesma hora.
  const onCanvasReady = useCallback(
    (cols: number, rows: number) => {
      applyAppearance();
      getSshSocket().emit('resize', { sessionId, cols, rows });
    },
    [applyAppearance, sessionId],
  );
  const onCanvasInput = useCallback(
    (b64: string) => {
      getSshSocket().emit('data', { sessionId, b64 });
    },
    [sessionId],
  );
  const onCanvasResize = useCallback(
    (cols: number, rows: number) => {
      getSshSocket().emit('resize', { sessionId, cols, rows });
    },
    [sessionId],
  );
  function onKey(seq: string) {
    getSshSocket().emit('data', { sessionId, b64: base64EncodeAscii(seq) });
  }

  function injectSnippet(snippet: SshSnippet) {
    getSshSocket().emit('data', { sessionId, b64: base64EncodeAscii(snippet.command) });
    canvasRef.current?.focus();
  }
  function onPickSnippet(snippet: SshSnippet) {
    snippetsRef.current?.dismiss();
    if (snippet.requireConfirm) setSnippetConfirm(snippet);
    else injectSnippet(snippet);
  }

  async function onDisconnect() {
    menuRef.current?.dismiss();
    await getSshSocket()
      .timeout(5000)
      .emitWithAck('session:close', { sessionId })
      .catch(() => undefined);
    router.back();
  }

  const statusLabel =
    status === 'open' ? t('ssh.terminal.connected') : status === 'connecting' ? t('ssh.terminal.connecting') : status === 'error' ? t('ssh.terminal.error') : t('ssh.terminal.closed');

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar
        title={host?.label ?? t('ssh.terminal.title')}
        subtitle={statusLabel}
        left={{ label: t('ssh.title'), onPress: () => router.back() }}
        right={{ label: '•••', onPress: () => menuRef.current?.present() }}
      />
      <TerminalCanvas ref={canvasRef} onReady={onCanvasReady} onInput={onCanvasInput} onResize={onCanvasResize} />
      <KeyBar onKey={onKey} onSnippets={() => snippetsRef.current?.present()} />

      <Sheet ref={menuRef} title={host?.label ?? t('ssh.terminal.title')}>
        <GroupedList>
          <Row title={t('ssh.terminal.appearance')} navigable onPress={() => { menuRef.current?.dismiss(); appearanceRef.current?.present(); }} />
          <Row title={t('ssh.terminal.disconnect')} onPress={onDisconnect} />
        </GroupedList>
      </Sheet>

      <Sheet ref={appearanceRef} title={t('ssh.terminal.appearance')}>
        <GroupedList>
          {TERMINAL_THEMES.map((th) => (
            <Row key={th.id} title={t(th.nameKey)} right={themeId === th.id ? <Text style={{ color: colors.blue }}>✓</Text> : undefined} onPress={() => setThemeId(th.id)} />
          ))}
        </GroupedList>
        <View style={[styles.fontRow, { marginTop: space.md }]}>
          <Text style={{ color: colors.label }}>{t('ssh.terminal.fontSize')}</Text>
          <View style={styles.fontButtons}>
            <Pressable onPress={() => setFontSize(Math.max(9, fontSize - 1))} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <Icon name="minus" size={20} />
            </Pressable>
            <Text style={{ color: colors.labelSecondary, minWidth: 28, textAlign: 'center' }}>{fontSize}</Text>
            <Pressable onPress={() => setFontSize(Math.min(22, fontSize + 1))} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <Icon name="plus" size={20} />
            </Pressable>
          </View>
        </View>
      </Sheet>

      <Sheet ref={snippetsRef} title={t('ssh.snippets.title')}>
        {snippets.length === 0 ? (
          <Text style={{ color: colors.labelSecondary, textAlign: 'center', marginTop: space.lg }}>{t('ssh.snippets.empty')}</Text>
        ) : (
          <GroupedList>
            {snippets.map((s) => (
              <Row key={s.id} title={s.name} subtitle={s.command} onPress={() => onPickSnippet(s)} />
            ))}
          </GroupedList>
        )}
      </Sheet>

      <AlertDialog
        visible={!!snippetConfirm}
        title={t('ssh.snippets.confirmTitle')}
        message={snippetConfirm?.command}
        onRequestClose={() => setSnippetConfirm(null)}
        buttons={[
          { label: t('common.cancel'), role: 'cancel', onPress: () => setSnippetConfirm(null) },
          {
            label: t('ssh.snippets.run'),
            role: 'primary',
            onPress: () => {
              if (snippetConfirm) injectSnippet(snippetConfirm);
              setSnippetConfirm(null);
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fontRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  fontButtons: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
