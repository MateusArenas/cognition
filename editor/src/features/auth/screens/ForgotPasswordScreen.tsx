import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Banner } from '@/design/components/Banner';
import { Field } from '@/design/components/Field';
import { NavBar } from '@/design/components/NavBar';
import { TintedButton } from '@/design/components/TintedButton';
import { useTheme } from '@/design/useTheme';
import { isApiError } from '@/api/http';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/i18n/I18nProvider';

export function ForgotPasswordScreen() {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (e) {
      setError(isApiError(e) ? e.message : t('auth.forgotPasswordError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavBar title={t('auth.forgotPasswordTitle')} left={{ label: t('common.cancel'), onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.labelSecondary, marginBottom: space.lg }}>{t('auth.forgotPasswordHint')}</Text>

        {sent ? (
          <>
            <Banner tone="info" title={t('auth.forgotPasswordSuccess')} />
            <View style={{ marginTop: space.lg }}>
              <Pressable onPress={() => router.push('/reset-password')} style={{ height: 32, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.blue, fontSize: 15 }}>{t('auth.haveResetToken')}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Field
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder={t('auth.fieldEmail')}
              style={{ marginBottom: space.sm }}
            />
            {error ? (
              <View style={{ marginBottom: space.sm }}>
                <Banner tone="error" title={error} />
              </View>
            ) : null}
            <TintedButton icon="check" label={t('auth.forgotPasswordAction')} onPress={submit} busy={busy} disabled={!email.trim()} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
