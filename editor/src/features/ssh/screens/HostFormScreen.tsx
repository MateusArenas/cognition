import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isApiError } from '@/api/http';
import { GroupedList } from '@/design/components/GroupedList';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { RowSwitch } from '@/design/components/RowSwitch';
import { Segmented } from '@/design/components/Segmented';
import { Sheet } from '@/design/components/Sheet';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { createHost, deleteHost, getHost, listCredentials, testHost, updateHost } from '../api/services';
import type { SshAuthMethod, SshCredential } from '../types';
import { FormField } from './FormField';

const COLORS = ['#8E8E93', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#0A84FF', '#5856D6'];

// Formulário de host — nome/endereço/porta/usuário, chave-ou-senha (credencial escolhida numa
// folha à parte, mesmo padrão de menu do resto do app), grupo/tags, cor, manter conexão viva,
// comando ao conectar. "Testar conexão" só depois de salvo (a rota é POST /ssh/hosts/:id/test).
export function HostFormScreen() {
  const { colors, space, radius, type } = useTheme();
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const credentialSheetRef = useRef<BottomSheetModal>(null);

  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [authMethod, setAuthMethod] = useState<SshAuthMethod>('key');
  const [credentialId, setCredentialId] = useState<string | undefined>(undefined);
  const [groupName, setGroupName] = useState('');
  const [tags, setTags] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [keepalive, setKeepalive] = useState(true);
  const [startupCommand, setStartupCommand] = useState('');

  const [credentials, setCredentials] = useState<SshCredential[]>([]);
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setCredentials(await listCredentials());
        if (id) {
          const host = await getHost(id);
          setLabel(host.label);
          setAddress(host.address);
          setPort(String(host.port));
          setUsername(host.username);
          setAuthMethod(host.authMethod);
          setCredentialId(host.credentialId ?? undefined);
          setGroupName(host.groupName ?? '');
          setTags(host.tags.join(', '));
          setColor(host.color);
          setKeepalive(host.keepalive);
          setStartupCommand(host.startupCommand ?? '');
        }
      } catch (e) {
        setError(isApiError(e) ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, t]);

  const credentialsOfKind = credentials.filter((c) => c.kind === authMethod);
  const selectedCredential = credentials.find((c) => c.id === credentialId);

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      const input = {
        label: label.trim(),
        address: address.trim(),
        port: port ? Number(port) : undefined,
        username: username.trim(),
        authMethod,
        credentialId,
        groupName: groupName.trim() || undefined,
        tags: tags
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        color,
        keepalive,
        startupCommand: startupCommand.trim() || undefined,
      };
      if (editing && id) await updateHost(id, input);
      else await createHost(input);
      router.back();
    } catch (e) {
      setError(isApiError(e) ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!id) return;
    setBusy(true);
    try {
      await deleteHost(id);
      router.back();
    } catch (e) {
      setError(isApiError(e) ? e.message : String(e));
      setBusy(false);
    }
  }

  async function onTest() {
    if (!id) return;
    setBusy(true);
    setTestResult(null);
    setError(null);
    try {
      const r = await testHost(id);
      setTestResult(r.connected ? t('ssh.testOk') : (r.message ?? t('ssh.testFailed')));
    } catch (e) {
      setError(isApiError(e) ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar
        title={editing ? t('ssh.editHost') : t('ssh.newHost')}
        left={{ label: t('common.cancel'), onPress: () => router.back() }}
        right={{ label: t('common.save'), onPress: onSave, disabled: !label.trim() || !address.trim() || !username.trim() || busy }}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <FormField label={t('ssh.fieldLabel')} value={label} onChangeText={setLabel} placeholder={t('ssh.fieldLabelPlaceholder')} />
        <FormField label={t('ssh.fieldAddress')} value={address} onChangeText={setAddress} placeholder="189.84.220.14" autoCapitalize="none" />
        <FormField label={t('ssh.fieldPort')} value={port} onChangeText={setPort} keyboardType="number-pad" />
        <FormField label={t('ssh.fieldUsername')} value={username} onChangeText={setUsername} placeholder="deploy" autoCapitalize="none" />

        <Text style={[{ color: colors.labelSecondary, marginBottom: 6, marginTop: space.sm }, type.footnote]}>{t('ssh.fieldAuthMethod')}</Text>
        <Segmented
          options={[
            { value: 'key', label: t('ssh.authKey') },
            { value: 'password', label: t('ssh.authPassword') },
          ]}
          value={authMethod}
          onChange={(v) => {
            setAuthMethod(v as SshAuthMethod);
            setCredentialId(undefined);
          }}
        />

        <View style={{ marginTop: space.lg }}>
          <GroupedList>
            <Row
              title={t('ssh.fieldCredential')}
              subtitle={selectedCredential?.name ?? t('ssh.credentialNone')}
              navigable
              onPress={() => credentialSheetRef.current?.present()}
            />
          </GroupedList>
        </View>

        <View style={{ marginTop: space.lg }}>
          <FormField label={t('ssh.fieldGroup')} value={groupName} onChangeText={setGroupName} placeholder={t('ssh.fieldGroupPlaceholder')} />
        </View>
        <FormField label={t('ssh.fieldTags')} value={tags} onChangeText={setTags} placeholder="prod, api" autoCapitalize="none" />

        <Text style={[{ color: colors.labelSecondary, marginBottom: 6, marginTop: space.sm }, type.footnote]}>{t('ssh.fieldColor')}</Text>
        <View style={styles.colorRow}>
          {COLORS.map((c) => (
            <View
              key={c}
              onTouchEnd={() => setColor(c)}
              style={[styles.colorDot, { backgroundColor: c, borderRadius: radius.pill, borderWidth: c === color ? 3 : 0, borderColor: colors.label }]}
            />
          ))}
        </View>

        <View style={{ marginTop: space.lg }}>
          <GroupedList>
            <Row title={t('ssh.fieldKeepalive')} right={<RowSwitch value={keepalive} onValueChange={setKeepalive} />} />
          </GroupedList>
        </View>

        <View style={{ marginTop: space.lg }}>
          <FormField
            label={t('ssh.fieldStartupCommand')}
            value={startupCommand}
            onChangeText={setStartupCommand}
            placeholder={t('ssh.fieldStartupCommandPlaceholder')}
            autoCapitalize="none"
          />
        </View>
        <Text style={[{ color: colors.labelTertiary, marginTop: -4 }, type.caption]}>{t('ssh.startupCommandHint')}</Text>

        {error ? <Text style={[{ color: colors.red, marginTop: space.md }, type.footnote]}>{error}</Text> : null}
        {testResult ? <Text style={[{ color: colors.green, marginTop: space.md }, type.footnote]}>{testResult}</Text> : null}

        {editing ? (
          <View style={[styles.actions, { marginTop: space.lg }]}>
            {busy ? <ActivityIndicator /> : <Row title={t('ssh.testConnection')} onPress={onTest} />}
          </View>
        ) : null}
        {editing ? (
          <View style={{ marginTop: space.md }}>
            <GroupedList>
              <Row title={t('common.delete')} onPress={onDelete} />
            </GroupedList>
          </View>
        ) : null}
      </ScrollView>

      <Sheet ref={credentialSheetRef} title={t('ssh.fieldCredential')}>
        <GroupedList>
          <Row
            title={t('ssh.credentialNone')}
            onPress={() => {
              setCredentialId(undefined);
              credentialSheetRef.current?.dismiss();
            }}
          />
          {credentialsOfKind.map((c) => (
            <Row
              key={c.id}
              title={c.name}
              subtitle={c.fingerprintSha256 ?? undefined}
              onPress={() => {
                setCredentialId(c.id);
                credentialSheetRef.current?.dismiss();
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
  colorRow: { flexDirection: 'row', gap: 12 },
  colorDot: { width: 28, height: 28 },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
});
