import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';

// Quatro abas: Biblioteca (a "home" do app), Banco de Dados (cliente DBeaver-like — ver
// docs/17-db-client.md), SSH (cliente de terminal remoto — ver docs/20-ssh-mobile.md) e
// Ajustes. Galeria, diagrama e documento continuam empilhados fora daqui
// (docs/02-setup-e-estrutura.md) — o Stack ao redor deste grupo já cobre a barra sozinho ao
// empilhar por cima, sem configuração extra.
export default function TabsLayout() {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.labelTertiary,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '500' },
        // position:'absolute' + fundo transparente + BlurView atrás = cápsula translúcida
        // igual ao Chip/ActionBar (§5.2) em vez da barra opaca padrão do React Navigation.
        // Todo conteúdo dos dois tabs soma useBottomTabBarHeight() ao padding de baixo — sem
        // isso, o conteúdo fica escondido atrás da barra flutuante.
        tabBarStyle: [styles.bar, { height: 49 + insets.bottom, borderTopColor: colors.separator }],
        tabBarBackground: () => <BlurView intensity={60} tint={scheme} style={StyleSheet.absoluteFill} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.library'), tabBarIcon: ({ color, size }) => <Icon name="library" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="dbclient"
        options={{ title: t('tabs.dbclient'), tabBarIcon: ({ color, size }) => <Icon name="database" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="ssh"
        options={{ title: t('tabs.ssh'), tabBarIcon: ({ color, size }) => <Icon name="terminal" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tabs.settings'), tabBarIcon: ({ color, size }) => <Icon name="settings" size={size} color={color} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', backgroundColor: 'transparent', borderTopWidth: StyleSheet.hairlineWidth, elevation: 0 },
});
