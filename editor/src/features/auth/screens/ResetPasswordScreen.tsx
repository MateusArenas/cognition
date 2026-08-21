import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Banner } from '@/design/components/Banner';
import { Field } from '@/design/components/Field';
import { NavBar } from '@/design/components/NavBar';
import { TintedButton } from '@/design/components/TintedButton';
import { useTheme } from '@/design/useTheme';
import { isApiError } from '@/api/http';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/i18n/I18nProvider';

export function ResetPasswordScreen() {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const { resetPassword } = useAuth();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token.trim(), newPassword);
      setDone(true);
    } catch (e) {
      setError(isApiError(e) ? e.message : t('auth.resetPasswordError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavBar title={t('auth.resetPasswordTitle')} left={{ label: t('common.cancel'), onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        {done ? (
          <>
            <Banner tone="info" title={t('auth.resetPasswordSuccess')} />
            <View style={{ marginTop: space.lg }}>
              <TintedButton icon="check" label={t('auth.backToLoginLink')} onPress={() => router.replace('/')} />
            </View>
          </>
        ) : (
          <>
            <Text style={{ color: colors.labelSecondary, marginBottom: space.lg }}>{t('auth.resetPasswordHint')}</Text>
            <Field value={token} onChangeText={setToken} autoCapitalize="none" placeholder={t('auth.fieldResetToken')} mono style={{ marginBottom: space.sm }} />
            <Field
              value={newPassword}
              onChangeText={setNewPassword}
              secureToggle
              placeholder={t('auth.fieldNewPassword')}
              style={{ marginBottom: space.sm }}
            />
            {error ? (
              <View style={{ marginBottom: space.sm }}>
                <Banner tone="error" title={error} />
              </View>
            ) : null}
            <TintedButton
              icon="check"
              label={t('auth.resetPasswordAction')}
              onPress={submit}
              busy={busy}
              disabled={!token.trim() || newPassword.length < 6}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
