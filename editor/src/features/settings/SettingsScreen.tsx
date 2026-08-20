import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import Constants from 'expo-constants';
import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { GroupedList } from '@/design/components/GroupedList';
import { Icon } from '@/design/Icon';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { Segmented } from '@/design/components/Segmented';
import { Sheet } from '@/design/components/Sheet';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { SUPPORTED_LANGUAGES, type AppLanguage } from '@/i18n';
import { useSettings } from '@/store/useSettings';

// Segunda aba da tab bar (§5.2). Preferências de tema e idioma são persistidas no SQLite
// usado pelo Expo Go; idiomas ficam em um JSON por locale, sem strings de interface soltas.
export default function SettingsScreen() {
  const { colors, space, mode, setMode } = useTheme();
  const { language, t } = useI18n();
  const setLanguage = useSettings((state) => state.setLanguage);
  const tabBarHeight = useBottomTabBarHeight();
  const languageSheetRef = useRef<BottomSheetModal>(null);
  const themeOptions = [
    { value: 'auto', label: t('settings.themeAuto') },
    { value: 'light', label: t('settings.themeLight') },
    { value: 'dark', label: t('settings.themeDark') },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar title={t('settings.title')} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.lg + tabBarHeight }}>
        <Text style={[styles.sectionTitle, { color: colors.labelSecondary }]}>{t('settings.appearance')}</Text>
        <View style={{ marginBottom: space.xl }}>
          <Text style={[styles.preferenceLabel, { color: colors.label }]}>{t('settings.theme')}</Text>
          <Segmented options={themeOptions} value={mode} onChange={(v) => setMode(v as typeof mode)} />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.labelSecondary }]}>{t('settings.language')}</Text>
        <View style={{ marginBottom: space.xl }}>
          <GroupedList>
            <Row
              title={t('settings.language')}
              right={<Text style={{ color: colors.labelSecondary }}>{t(`languages.${language}`)}</Text>}
              navigable
              onPress={() => languageSheetRef.current?.present()}
            />
          </GroupedList>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.labelSecondary }]}>{t('settings.about')}</Text>
        <GroupedList>
          <Row title={t('settings.appName')} subtitle={t('settings.appDescription')} />
          <Row title={t('settings.version')} right={<Text style={{ color: colors.labelSecondary }}>{Constants.expoConfig?.version ?? '—'}</Text>} />
        </GroupedList>
      </ScrollView>

      <Sheet ref={languageSheetRef} title={t('settings.language')} snapPoints={['40%']}>
        <GroupedList>
          {SUPPORTED_LANGUAGES.map((value) => (
            <Row
              key={value}
              title={t(`languages.${value}`)}
              right={value === language ? <Icon name="check" size={18} color={colors.blue} /> : undefined}
              onPress={() => {
                setLanguage(value as AppLanguage);
                languageSheetRef.current?.dismiss();
              }}
            />
          ))}
        </GroupedList>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4, marginTop: 4 },
  preferenceLabel: { fontSize: 15, fontWeight: '500', marginBottom: 8, marginLeft: 4 },
});
