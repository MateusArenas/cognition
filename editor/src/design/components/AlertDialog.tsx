import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../useTheme';

export interface AlertButton {
  label: string;
  onPress: () => void;
  role?: 'primary' | 'cancel' | 'destructive';
}

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
  children?: ReactNode; // campos — é onde acontece toda edição de valor único (§5.2)
  onRequestClose: () => void;
}

// O alerta do iOS: 292pt de largura, raio 16, material desfocado, botões lado a lado (2) ou
// empilhados (3+) (§5.2).
export function AlertDialog({ visible, title, message, buttons, children, onRequestClose }: Props) {
  const { colors, scheme } = useTheme();
  const stacked = buttons.length > 2;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Pressable style={styles.scrim} onPress={onRequestClose} testID="alert-scrim">
        <Pressable onPress={(e) => e.stopPropagation()}>
          <BlurView intensity={60} tint={scheme} style={styles.box}>
            <Text style={[styles.title, { color: colors.label }]}>{title}</Text>
            {message ? <Text style={[styles.message, { color: colors.labelSecondary }]}>{message}</Text> : null}
            {children ? <View style={styles.fields}>{children}</View> : null}
            <View style={[styles.btns, { borderTopColor: colors.separator }, stacked ? styles.btnsStacked : styles.btnsRow]}>
              {buttons.map((b, i) => (
                <Pressable
                  key={b.label}
                  onPress={b.onPress}
                  style={({ pressed }) => [
                    styles.btn,
                    !stacked && styles.btnRow,
                    !stacked && i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.separator },
                    stacked && i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                    pressed && { backgroundColor: colors.surface2 },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 17,
                      textAlign: 'center',
                      color: b.role === 'destructive' ? colors.red : b.role === 'cancel' ? colors.labelSecondary : colors.blue,
                      fontWeight: b.role === 'primary' ? '600' : '400',
                    }}
                  >
                    {b.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </BlurView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { width: 292, borderRadius: 16, overflow: 'hidden' },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center', paddingHorizontal: 18, paddingTop: 19 },
  message: { fontSize: 13, textAlign: 'center', paddingHorizontal: 18, paddingTop: 5, lineHeight: 18 },
  fields: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 4, gap: 11 },
  btns: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12 },
  btnsRow: { flexDirection: 'row' },
  btnsStacked: { flexDirection: 'column' },
  // `flex:1` no RN equivale a flexBasis:0% — em flexDirection:'row' isso só afasta a LARGURA
  // (o que a gente quer, pra dividir igual entre 2 botões), mas num container 'column' de
  // altura automática (`btns`, sem altura fixa) isso zera a ALTURA de cada botão antes de
  // distribuir espaço — e não hà espaço extra pra distribuir porque o próprio pai não tem
  // altura definida. Bug real: os 3 botões de "Adicionar etapa" (NodeComposer) ficavam com
  // altura zero, só a borda superior de cada um visível, texto nenhum. `flex:1` só entra na
  // variante em linha; empilhados usam a altura de conteúdo normal (padding + texto).
  btn: { paddingVertical: 13, paddingHorizontal: 8 },
  btnRow: { flex: 1 },
});
