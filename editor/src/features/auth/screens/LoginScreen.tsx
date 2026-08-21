import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner } from '@/design/components/Banner';
import { Field } from '@/design/components/Field';
import { GroupedList } from '@/design/components/GroupedList';
import { Row } from '@/design/components/Row';
import { TintedButton } from '@/design/components/TintedButton';
import { useTheme } from '@/design/useTheme';
import { isApiError } from '@/api/http';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/i18n/I18nProvider';

// Raiz da stack não-logada (app/(auth)/index.tsx) — sem ação de voltar, é a única tela que não
// dá pra "cancelar" (não tem pra onde). Contas salvas aparecem como atalho de um toque acima do
// formulário, reaproveitando o mesmo caminho (token → refresh → senha salva) que Ajustes usa
// pra trocar de conta — ver features/auth/AuthContext.tsx#resolveSession.
export function LoginScreen() {
  const { colors, space, type } = useTheme();
  const { t } = useI18n();
  const { login, switchAccount, accounts } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
    } catch (e) {
      setError(isApiError(e) ? e.message : t('auth.loginError'));
    } finally {
      setBusy(false);
    }
  }

  async function tapSavedAccount(id: string) {
    setBusy(true);
    setError(null);
    const ok = await switchAccount(id);
    setBusy(false);
    if (!ok) setError(t('auth.savedAccountError'));
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
        <Text style={[{ color: colors.label, textAlign: 'center', marginBottom: space.xs }, type.largeTitle]}>{t('settings.appName')}</Text>
        <Text style={[{ color: colors.labelSecondary, textAlign: 'center', marginBottom: space.lg }, type.subhead]}>{t('auth.loginSubtitle')}</Text>

        {accounts.length ? (
          <View style={{ marginBottom: space.lg }}>
            <Text style={[styles.gtitle, { color: colors.labelSecondary }]}>{t('auth.savedAccounts')}</Text>
            <GroupedList>
              {accounts.map((a) => (
                <Row key={a.id} title={a.name} subtitle={a.email} navigable onPress={() => tapSavedAccount(a.id)} />
              ))}
            </GroupedList>
            <Text style={[styles.gtitle, { color: colors.labelSecondary }]}>{t('auth.orLoginWith')}</Text>
          </View>
        ) : null}

        <Field
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          placeholder={t('auth.fieldIdentifier')}
          style={{ marginBottom: space.sm }}
        />
        <Field value={password} onChangeText={setPassword} secureToggle placeholder={t('auth.fieldPassword')} style={{ marginBottom: space.sm }} />

        {error ? (
          <View style={{ marginBottom: space.sm }}>
            <Banner tone="error" title={error} />
          </View>
        ) : null}

        <TintedButton icon="check" label={t('auth.loginAction')} onPress={submit} busy={busy} disabled={!identifier.trim() || !password} />

        <View style={{ marginTop: space.lg, gap: 4 }}>
          <Pressable onPress={() => router.push('/register')} style={styles.link}>
            <Text style={{ color: colors.blue, fontSize: 15 }}>{t('auth.registerLink')}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/forgot-password')} style={styles.link}>
            <Text style={{ color: colors.blue, fontSize: 15 }}>{t('auth.forgotPasswordLink')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  gtitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 14, marginBottom: 6, marginLeft: 4 },
  link: { height: 32, alignItems: 'center', justifyContent: 'center' },
});
