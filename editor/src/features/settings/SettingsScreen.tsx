import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Constants from 'expo-constants';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { GroupedList } from '@/design/components/GroupedList';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { Segmented } from '@/design/components/Segmented';
import { useTheme } from '@/design/useTheme';

const MODOS = [
  { value: 'auto', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
] as const;

// Segunda aba da tab bar (§5.2). Só uma escolha real por enquanto — tema — porque é a única
// preferência que já existe no app (ThemeProvider.setMode); a escolha vale só pra esta sessão
// até store/useSettings.ts existir (pendência conhecida, ver CHECKLIST.md).
export default function SettingsScreen() {
  const { colors, space, mode, setMode } = useTheme();
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar title="Ajustes" />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.lg + tabBarHeight }}>
        <Text style={[styles.sectionTitle, { color: colors.labelSecondary }]}>Aparência</Text>
        <View style={{ marginBottom: space.xl }}>
          <Segmented options={[...MODOS]} value={mode} onChange={(v) => setMode(v as typeof mode)} />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.labelSecondary }]}>Sobre</Text>
        <GroupedList>
          <Row title="Editor de Diagramas" subtitle="Diagramas Mermaid e documentos Markdown" />
          <Row title="Versão" right={<Text style={{ color: colors.labelSecondary }}>{Constants.expoConfig?.version ?? '—'}</Text>} />
        </GroupedList>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4, marginTop: 4 },
});
