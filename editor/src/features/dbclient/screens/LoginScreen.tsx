import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/design/components/Chip';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { useSettings } from '@/store/useSettings';
import { isApiError } from '../api/http';
import { login } from '../api/services';
import { FormField } from './FormField';

// Sem tela de cadastro aqui — usuários são criados por um admin (POST /users, precisa de
// permissão CASL de create em User), não auto-serviço. Ver docs/17-db-client.md.
export function LoginScreen({ onLoggedIn }: { onLoggedIn?: () => void }) {
  const { colors, space, type } = useTheme();
  const { t } = useI18n();
  const setDbAuthToken = useSettings((s) => s.setDbAuthToken);
  const dbApiBaseUrl = useSettings((s) => s.dbApiBaseUrl);
  const setDbApiBaseUrl = useSettings((s) => s.setDbApiBaseUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await login(email.trim(), password);
      setDbAuthToken(result.accessToken);
      onLoggedIn?.();
    } catch (e) {
      setError(isApiError(e) ? e.message : t('dbclient.loginError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.center}>
        <Text style={[{ color: colors.label, textAlign: 'center', marginBottom: space.xs }, type.title]}>{t('dbclient.title')}</Text>
        <Text style={[{ color: colors.labelSecondary, textAlign: 'center', marginBottom: space.lg }, type.subhead]}>{t('dbclient.subtitle')}</Text>

        <FormField label={t('dbclient.fieldBackendUrl')} value={dbApiBaseUrl} onChangeText={setDbApiBaseUrl} autoCapitalize="none" keyboardType="url" placeholder="http://192.168.0.10:3333/api/v1" />
        <FormField label={t('dbclient.fieldEmail')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <FormField label={t('dbclient.fieldPassword')} value={password} onChangeText={setPassword} secureTextEntry />

        {error ? <Text style={[{ color: colors.red, marginTop: space.sm }, type.footnote]}>{error}</Text> : null}

        <View style={{ marginTop: space.lg, alignItems: 'center' }}>
          {busy ? <ActivityIndicator /> : <Chip label={t('dbclient.loginAction')} active onPress={submit} />}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  center: { paddingHorizontal: 24 },
});
