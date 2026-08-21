import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner } from '@/design/components/Banner';
import { Field } from '@/design/components/Field';
import { NavBar } from '@/design/components/NavBar';
import { TintedButton } from '@/design/components/TintedButton';
import { useTheme } from '@/design/useTheme';
import { isApiError } from '@/api/http';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/i18n/I18nProvider';

export function RegisterScreen() {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await register({ email: email.trim(), username: username.trim(), name: name.trim(), password });
    } catch (e) {
      setError(isApiError(e) ? e.message : t('auth.registerError'));
    } finally {
      setBusy(false);
    }
  }

  const valid = email.trim() && username.trim() && name.trim() && password.length >= 6;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavBar title={t('auth.registerTitle')} left={{ label: t('common.cancel'), onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <Field value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder={t('auth.fieldEmail')} style={{ marginBottom: space.sm }} />
        <Field value={username} onChangeText={setUsername} autoCapitalize="none" placeholder={t('auth.fieldUsername')} style={{ marginBottom: space.sm }} />
        <Field value={name} onChangeText={setName} placeholder={t('auth.fieldName')} style={{ marginBottom: space.sm }} />
        <Field value={password} onChangeText={setPassword} secureToggle placeholder={t('auth.fieldPassword')} style={{ marginBottom: space.sm }} />

        {error ? (
          <View style={{ marginBottom: space.sm }}>
            <Banner tone="error" title={error} />
          </View>
        ) : null}

        <TintedButton icon="check" label={t('auth.registerAction')} onPress={submit} busy={busy} disabled={!valid} />
        <Text style={{ color: colors.labelTertiary, fontSize: 12, marginTop: space.sm, textAlign: 'center' }}>{t('auth.passwordHint')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
