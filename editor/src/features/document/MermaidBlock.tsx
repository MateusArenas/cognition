import * as Clipboard from 'expo-clipboard';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { useTheme } from '@/design/useTheme';
import { useToast } from '@/design/components/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import { DiagramCanvas } from '@/features/diagram/canvas/DiagramCanvas';
import { toRuntimeTokens } from '@/features/diagram/canvas/themeTokens';

interface Props {
  corpo: string;
  onEdit: () => void;
}

// Bloco ```mermaid``` embutido no modo Ler: cartão com cabeçalho Editar/Copiar e o diagrama
// renderizado por uma instância pequena do canvas, somente leitura (§13.4).
export function MermaidBlock({ corpo, onEdit }: Props) {
  const { colors, scheme, radius } = useTheme();
  const { show } = useToast();
  const { t } = useI18n();

  async function copiar() {
    await Clipboard.setStringAsync(corpo);
    show(t('common.copied'));
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.card }]}>
      <View style={[styles.cab, { borderBottomColor: colors.separator }]}>
        <Text style={[styles.label, { color: colors.labelSecondary }]}>{t('document.diagramLabel')}</Text>
        <Pressable onPress={copiar}><Text style={{ color: colors.blue, fontSize: 14 }}>{t('common.copy')}</Text></Pressable>
        <Pressable onPress={onEdit}><Text style={{ color: colors.blue, fontSize: 14 }}>{t('common.edit')}</Text></Pressable>
      </View>
      <View style={styles.tela}>
        <DiagramCanvas code={corpo} theme={scheme} tokens={toRuntimeTokens(colors)} sel={null} onTap={() => {}} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 14, overflow: 'hidden' },
  cab: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { flex: 1, fontSize: 12.5 },
  tela: { height: 220 },
});
