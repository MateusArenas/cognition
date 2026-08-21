import { InputAccessoryView, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View, type KeyboardEvent } from 'react-native';
import { useEffect, useState } from 'react';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';

export const KEYBOARD_ACCESSORY_ID = 'csv-formula-keyboard';

const OPERATOR_KEYS = ['=', '+', '−', '×', '÷', '(', ')', ':', ';'];
const FUNCTION_KEYS = ['SOMA', 'MÉDIA', 'MÍN', 'MÁX', 'SE'];
const OP_MAP: Record<string, string> = { '−': '-', '×': '*', '÷': '/' };
const FN_MAP: Record<string, string> = { MÍN: 'MIN', MÁX: 'MAX' };

interface Props {
  visible: boolean;
  onInsertOperator: (text: string) => void;
  onInsertFunction: (text: string, needsEquals: boolean) => void;
  onCancel: () => void;
  onUp: () => void;
  onDown: () => void;
  onDone: () => void;
}

// Barra de acessório do teclado — operadores + atalhos de função inserem direto no cursor da
// barra de fórmulas (FormulaBar.tsx). InputAccessoryView só existe no iOS; no Android a mesma
// barra vira uma View absoluta reagindo à altura real do teclado (keyboardDidShow/Hide) — sem
// isso ela fica atrás do teclado ou pulando (plano-editor-csv-expo.md §3).
export function KeyboardBar({ visible, onInsertOperator, onInsertFunction, onCancel, onUp, onDown, onDone }: Props) {
  const content = (
    <KeyboardBarContent
      onInsertOperator={onInsertOperator}
      onInsertFunction={onInsertFunction}
      onCancel={onCancel}
      onUp={onUp}
      onDown={onDown}
      onDone={onDone}
    />
  );

  if (Platform.OS === 'ios') {
    return <InputAccessoryView nativeID={KEYBOARD_ACCESSORY_ID}>{content}</InputAccessoryView>;
  }

  return visible ? <AndroidKeyboardBar>{content}</AndroidKeyboardBar> : null;
}

function AndroidKeyboardBar({ children }: { children: React.ReactNode }) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (!height) return null;
  return <View style={[styles.androidWrap, { bottom: height }]}>{children}</View>;
}

function KeyboardBarContent({ onInsertOperator, onInsertFunction, onCancel, onUp, onDown, onDone }: Omit<Props, 'visible'>) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View style={[styles.kb, { backgroundColor: colors.surface2 }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.keysRow}>
        {OPERATOR_KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => onInsertOperator(OP_MAP[k] ?? k)}
            style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.separator }]}
          >
            <Text style={{ color: colors.label, fontSize: 16 }}>{k}</Text>
          </Pressable>
        ))}
        {FUNCTION_KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => onInsertFunction((FN_MAP[k] ?? k) + '(', true)}
            style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.separator }]}
          >
            <Text style={{ color: colors.green, fontSize: 13, fontWeight: '600' }}>{k}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.actionsRow}>
        <Pressable onPress={onCancel}>
          <Text style={{ color: colors.blue, fontSize: 16 }}>{t('common.cancel')}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onUp} style={styles.arrowBtn}>
          <Text style={{ color: colors.blue, fontSize: 16 }}>↑</Text>
        </Pressable>
        <Pressable onPress={onDown} style={styles.arrowBtn}>
          <Text style={{ color: colors.blue, fontSize: 16 }}>↓</Text>
        </Pressable>
        <Pressable onPress={onDone} style={[styles.doneBtn, { backgroundColor: colors.blue }]}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{t('common.ok')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kb: { paddingBottom: 4 },
  keysRow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 46, paddingHorizontal: 8 },
  key: { minWidth: 38, height: 34, paddingHorizontal: 10, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 46, paddingHorizontal: 8 },
  arrowBtn: { height: 34, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  doneBtn: { height: 34, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  androidWrap: { position: 'absolute', left: 0, right: 0, zIndex: 40 },
});
