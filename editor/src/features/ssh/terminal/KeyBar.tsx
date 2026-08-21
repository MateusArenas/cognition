import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';

function ctrlOf(letter: string): string {
  return String.fromCharCode(letter.toUpperCase().charCodeAt(0) - 64); // ^C = \x03
}

interface KeyDef {
  label: string;
  seq?: string;
  toggle?: boolean; // ctrl — trava de um toque: liga, próxima tecla vira control, desliga
  repeatable?: boolean; // setas — segurar repete
  wide?: boolean;
}

const ROW_1: KeyDef[] = [
  { label: 'esc', seq: '\x1b' },
  { label: 'ctrl', toggle: true },
  { label: 'tab', seq: '\t' },
  { label: '|', seq: '|' },
  { label: '~', seq: '~' },
  { label: '/', seq: '/' },
  { label: '-', seq: '-' },
  { label: "'", seq: "'" },
  { label: '"', seq: '"' },
];
const ROW_2: KeyDef[] = [
  { label: '↑', seq: '\x1b[A', repeatable: true },
  { label: '↓', seq: '\x1b[B', repeatable: true },
  { label: '←', seq: '\x1b[D', repeatable: true },
  { label: '→', seq: '\x1b[C', repeatable: true },
  { label: '^C', seq: ctrlOf('c') },
  { label: '^D', seq: ctrlOf('d') },
  { label: '^L', seq: ctrlOf('l') },
  { label: '^R', seq: ctrlOf('r') },
];

interface Props {
  onKey: (seq: string) => void;
  onSnippets: () => void;
}

// Barra de teclas — sem ela um terminal no iPhone não é usável (sem Esc/Tab/Ctrl/setas, nada de
// vim/histórico/^C). Vive acima do teclado do sistema (KeyboardAvoidingView na tela que monta
// isto), nunca dentro dele.
export function KeyBar({ onKey, onSnippets }: Props) {
  const { colors, radius } = useTheme();
  const { t } = useI18n();
  const [ctrlOn, setCtrlOn] = useState(false);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function press(k: KeyDef) {
    Haptics.selectionAsync();
    if (k.toggle) {
      setCtrlOn((v) => !v);
      return;
    }
    if (!k.seq) return;
    if (ctrlOn && k.seq.length === 1) {
      onKey(ctrlOf(k.seq));
      setCtrlOn(false);
      return;
    }
    onKey(k.seq);
  }

  function startRepeat(k: KeyDef) {
    press(k);
    if (!k.repeatable || !k.seq) return;
    stopRepeat();
    repeatTimer.current = setInterval(() => onKey(k.seq!), 90);
  }

  function stopRepeat() {
    if (repeatTimer.current) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
  }

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface2, borderTopColor: colors.separator }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="always">
        {ROW_1.map((k) => (
          <Key key={k.label} def={k} on={k.toggle ? ctrlOn : false} onPress={() => press(k)} radius={radius.control} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="always">
        {ROW_2.map((k) => (
          <Key key={k.label} def={k} onPressIn={() => startRepeat(k)} onPressOut={stopRepeat} radius={radius.control} />
        ))}
        <Pressable
          onPress={onSnippets}
          style={({ pressed }) => [styles.key, styles.keyWide, { backgroundColor: colors.surface3, borderRadius: radius.control, opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.label, { color: colors.label }]}>⚡ {t('ssh.snippets.title')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Key({
  def,
  on,
  onPress,
  onPressIn,
  onPressOut,
  radius,
}: {
  def: KeyDef;
  on?: boolean;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  radius: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.key,
        def.wide && styles.keyWide,
        { backgroundColor: on ? colors.blue : colors.surface3, borderRadius: radius, opacity: pressed && !onPressIn ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: on ? '#fff' : colors.label }]}>{def.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 7, gap: 6 },
  row: { flexDirection: 'row', gap: 6, paddingHorizontal: 7 },
  key: { minWidth: 37, height: 37, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  keyWide: { minWidth: 52, paddingHorizontal: 12 },
  label: { fontFamily: 'Menlo', fontSize: 13, fontWeight: '500' },
});
