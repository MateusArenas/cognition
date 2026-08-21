import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { isApiError } from '@/api/http';
import { AlertDialog } from '@/design/components/AlertDialog';
import { GroupedList } from '@/design/components/GroupedList';
import { Icon } from '@/design/Icon';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { Segmented } from '@/design/components/Segmented';
import { Sheet } from '@/design/components/Sheet';
import { TintedButton } from '@/design/components/TintedButton';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { deleteCredential, generateCredential, importCredential, listCredentials, updateCredential } from '../api/services';
import type { SshCredential, SshCredentialKind } from '../types';
import { FormField } from './FormField';

// Chaves — gerar Ed25519 nova (nasce cifrada no servidor), importar chave/senha existente ou
// editar uma já salva (tocar abre Editar/Apagar, mesmo padrão de ConnectionsScreen). O tipo
// (chave/senha) nunca muda depois de criada — editar só troca nome/chave-pública e, se
// preenchido, o segredo em si; em branco mantém o que já tem. Fingerprint só existe se o
// servidor conseguiu calcular (gerada, ou importada com a pública colada junto) — ver
// docs/20-ssh-mobile.md.
export function CredentialsScreen() {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const [credentials, setCredentials] = useState<SshCredential[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = useState<SshCredential | null>(null);
  const [busy, setBusy] = useState(false);
  const formSheetRef = useRef<BottomSheetModal>(null);
  const genSheetRef = useRef<BottomSheetModal>(null);
  const actionsRef = useRef<BottomSheetModal>(null);

  const [actionsFor, setActionsFor] = useState<SshCredential | null>(null);
  const [editing, setEditing] = useState<SshCredential | null>(null);
  const [kind, setKind] = useState<SshCredentialKind>('key');
  const [name, setName] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [password, setPassword] = useState('');
  const [genName, setGenName] = useState('');

  const load = useCallback(async () => {
    try {
      setError(null);
      setCredentials(await listCredentials());
    } catch (e) {
      setError(isApiError(e) ? e.message : t('ssh.loadError'));
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function resetForm() {
    setEditing(null);
    setKind('key');
    setName('');
    setPrivateKey('');
    setPassphrase('');
    setPublicKey('');
    setPassword('');
  }

  function openImportForm() {
    resetForm();
    formSheetRef.current?.present();
  }

  function openEditForm(c: SshCredential) {
    setEditing(c);
    setKind(c.kind);
    setName(c.name);
    setPrivateKey('');
    setPassphrase('');
    setPublicKey(c.publicKey ?? '');
    setPassword('');
    formSheetRef.current?.present();
  }

  function abrirAcoes(c: SshCredential) {
    setActionsFor(c);
    actionsRef.current?.present();
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      const input = {
        name: name.trim(),
        privateKey: kind === 'key' && privateKey ? privateKey : undefined,
        passphrase: kind === 'key' && passphrase ? passphrase : undefined,
        publicKey: kind === 'key' && publicKey ? publicKey : undefined,
        password: kind === 'password' && password ? password : undefined,
      };
      if (editing) await updateCredential(editing.id, input);
      else await importCredential({ ...input, kind });
      formSheetRef.current?.dismiss();
      resetForm();
      void load();
    } catch (e) {
      setError(isApiError(e) ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onGenerate() {
    setBusy(true);
    setError(null);
    try {
      await generateCredential(genName.trim());
      setGenName('');
      genSheetRef.current?.dismiss();
      void load();
    } catch (e) {
      setError(isApiError(e) ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmarExclusao() {
    if (!paraExcluir) return;
    await deleteCredential(paraExcluir.id);
    setParaExcluir(null);
    void load();
  }

  const canSubmit = editing ? !!name.trim() : !!name.trim() && (kind === 'key' ? !!privateKey : !!password);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar title={t('ssh.credentials.title')} left={{ label: t('common.back'), onPress: () => router.back() }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        {error ? <Text style={{ color: colors.red, marginBottom: space.sm }}>{error}</Text> : null}
        {credentials === null ? (
          <ActivityIndicator />
        ) : credentials.length === 0 ? (
          <Text style={{ color: colors.labelSecondary, textAlign: 'center', marginTop: space.xl }}>{t('ssh.credentials.empty')}</Text>
        ) : (
          <GroupedList>
            {credentials.map((c) => (
              <Row
                key={c.id}
                title={c.name}
                subtitle={c.fingerprintSha256 ?? (c.kind === 'password' ? t('ssh.authPassword') : t('ssh.credentials.noFingerprint'))}
                navigable
                onPress={() => abrirAcoes(c)}
              />
            ))}
          </GroupedList>
        )}

        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <TintedButton label={t('ssh.credentials.generate')} icon="plus" onPress={() => genSheetRef.current?.present()} />
          <TintedButton label={t('ssh.credentials.import')} icon="plus" onPress={openImportForm} />
        </View>
      </ScrollView>

      <Sheet ref={genSheetRef} title={t('ssh.credentials.generate')}>
        <FormField label={t('ssh.fieldName')} value={genName} onChangeText={setGenName} placeholder="chave-nova" autoCapitalize="none" />
        <View style={{ marginTop: space.md }}>
          {busy ? <ActivityIndicator /> : <TintedButton label={t('common.save')} onPress={onGenerate} disabled={!genName.trim()} />}
        </View>
      </Sheet>

      <Sheet ref={actionsRef} title={actionsFor?.name ?? t('ssh.credentials.title')}>
        <GroupedList>
          <Row
            title={t('ssh.edit')}
            left={<Icon name="pencil" size={20} />}
            navigable
            onPress={() => {
              actionsRef.current?.dismiss();
              if (actionsFor) openEditForm(actionsFor);
            }}
          />
          <Row
            title={t('common.delete')}
            left={<Icon name="trash" size={20} color="#D70015" />}
            onPress={() => {
              actionsRef.current?.dismiss();
              setParaExcluir(actionsFor);
            }}
          />
        </GroupedList>
      </Sheet>

      <Sheet ref={formSheetRef} title={editing ? t('ssh.credentials.edit') : t('ssh.credentials.import')}>
        {editing ? null : (
          <Segmented
            options={[
              { value: 'key', label: t('ssh.authKey') },
              { value: 'password', label: t('ssh.authPassword') },
            ]}
            value={kind}
            onChange={(v) => setKind(v as SshCredentialKind)}
          />
        )}
        <FormField label={t('ssh.fieldName')} value={name} onChangeText={setName} placeholder="invent-deploy" autoCapitalize="none" style={{ marginTop: space.md }} />
        {kind === 'key' ? (
          <>
            <FormField
              label={t('ssh.credentials.privateKey')}
              value={privateKey}
              onChangeText={setPrivateKey}
              placeholder={editing ? t('ssh.credentials.keepCurrent') : '-----BEGIN OPENSSH PRIVATE KEY-----'}
              multiline
              autoCapitalize="none"
              mono
              style={styles.multiline}
            />
            <FormField
              label={t('ssh.credentials.passphrase')}
              value={passphrase}
              onChangeText={setPassphrase}
              placeholder={editing ? t('ssh.credentials.keepCurrent') : undefined}
              secureToggle
              autoCapitalize="none"
            />
            <FormField label={t('ssh.credentials.publicKey')} value={publicKey} onChangeText={setPublicKey} placeholder="ssh-ed25519 AAAA..." autoCapitalize="none" mono />
          </>
        ) : (
          <FormField
            label={t('ssh.fieldPassword')}
            value={password}
            onChangeText={setPassword}
            placeholder={editing ? t('ssh.credentials.keepCurrent') : undefined}
            secureToggle
            autoCapitalize="none"
          />
        )}
        <View style={{ marginTop: space.md }}>
          {busy ? <ActivityIndicator /> : <TintedButton label={t('common.save')} onPress={onSubmit} disabled={!canSubmit} />}
        </View>
      </Sheet>

      <AlertDialog
        visible={!!paraExcluir}
        title={t('ssh.credentials.deleteTitle')}
        message={paraExcluir?.name}
        onRequestClose={() => setParaExcluir(null)}
        buttons={[
          { label: t('common.cancel'), role: 'cancel', onPress: () => setParaExcluir(null) },
          { label: t('common.delete'), role: 'destructive', onPress: confirmarExclusao },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  multiline: { minHeight: 90 },
});
