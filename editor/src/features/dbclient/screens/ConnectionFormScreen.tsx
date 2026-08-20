import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Chip } from '@/design/components/Chip';
import { GroupedList } from '@/design/components/GroupedList';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { useTheme } from '@/design/useTheme';
import { useToast } from '@/design/components/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import { isApiError } from '../api/http';
import { createConnection, deleteConnection, getConnection, testConnection, updateConnection } from '../api/services';
import { baseConfigFor, DRIVERS, driverByClient, getPath, setPath, type DriverField } from '../drivers';
import { FormField } from './FormField';

const COLORS = ['#8E8E93', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#0A84FF', '#5856D6'];
const SECTIONS: DriverField['section'][] = ['connection', 'ssl', 'advanced'];

// Conexão — nome, cor, dialeto, campos gerados pelo catálogo (drivers.ts), Testar conexão
// mostra versão+latência ou o erro cru do driver (DB-MOBILE.md §2.10).
export function ConnectionFormScreen() {
  const { colors, space, radius, type } = useTheme();
  const { t } = useI18n();
  const { show } = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;

  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [client, setClient] = useState(DRIVERS[0].client);
  const [config, setConfig] = useState<Record<string, unknown>>(baseConfigFor(DRIVERS[0].client));
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const c = await getConnection(id);
        setName(c.name);
        setColor(c.color);
        setClient(c.client);
        setConfig(c.config as unknown as Record<string, unknown>);
        setReadOnly(c.readOnly);
      } catch (e) {
        setError(isApiError(e) ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const driver = driverByClient(client) ?? DRIVERS[0];
  const fieldsBySection = useMemo(() => {
    const map = new Map<DriverField['section'], DriverField[]>();
    for (const f of driver.fields) map.set(f.section, [...(map.get(f.section) ?? []), f]);
    return map;
  }, [driver]);

  function changeClient(next: string) {
    setClient(next);
    setConfig(baseConfigFor(next));
  }

  function fieldValue(f: DriverField): string {
    const v = getPath(config, f.path);
    return v === undefined || v === null ? '' : String(v);
  }
  function setFieldValue(f: DriverField, value: string) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      setPath(next, f.path, f.type === 'number' ? (value ? Number(value) : undefined) : value);
      return next;
    });
  }
  function fieldSwitch(f: DriverField): boolean {
    return !!getPath(config, f.path);
  }
  function setFieldSwitch(f: DriverField, value: boolean) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      setPath(next, f.path, value);
      return next;
    });
  }

  async function onTest() {
    setBusy(true);
    setTestResult(null);
    setError(null);
    try {
      const r = await testConnection(client, config as never);
      setTestResult(t('dbclient.testOk', { version: r.version ?? '—', ms: Math.round(r.latencyMs) }));
    } catch (e) {
      setError(isApiError(e) ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      const input = { name: name.trim(), color, client, config: config as never, readOnly };
      if (editing && id) await updateConnection(id, input);
      else await createConnection(input);
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
      await deleteConnection(id);
      router.back();
    } catch (e) {
      setError(isApiError(e) ? e.message : String(e));
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
        title={editing ? t('dbclient.editConnection') : t('dbclient.newConnection')}
        left={{ label: t('common.cancel'), onPress: () => router.back() }}
        right={{ label: t('common.save'), onPress: onSave, disabled: !name.trim() || busy }}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <FormField label={t('dbclient.fieldName')} value={name} onChangeText={setName} placeholder={t('dbclient.fieldNamePlaceholder')} />

        <Text style={[{ color: colors.labelSecondary, marginBottom: 6, marginTop: space.sm }, type.footnote]}>{t('dbclient.fieldColor')}</Text>
        <View style={styles.colorRow}>
          {COLORS.map((c) => (
            <View
              key={c}
              onTouchEnd={() => setColor(c)}
              style={[
                styles.colorDot,
                { backgroundColor: c, borderRadius: radius.pill, borderWidth: c === color ? 3 : 0, borderColor: colors.label },
              ]}
            />
          ))}
        </View>

        <Text style={[{ color: colors.labelSecondary, marginBottom: 6, marginTop: space.lg }, type.footnote]}>{t('dbclient.fieldDialect')}</Text>
        <View style={styles.chipRow}>
          {DRIVERS.map((d) => (
            <Chip key={d.client} label={t(d.labelKey)} active={d.client === client} onPress={() => changeClient(d.client)} />
          ))}
        </View>

        {SECTIONS.map((section) => {
          const fields = fieldsBySection.get(section);
          if (!fields?.length) return null;
          return (
            <View key={section} style={{ marginTop: space.lg }}>
              <Text style={[{ color: colors.labelSecondary, marginBottom: 6 }, type.footnote]}>{t(`dbclient.section_${section}`)}</Text>
              <GroupedList>
                {fields.map((f) =>
                  f.type === 'switch' ? (
                    <Row
                      key={f.path}
                      title={t(f.labelKey)}
                      right={<Switch value={fieldSwitch(f)} onValueChange={(v) => setFieldSwitch(f, v)} trackColor={{ true: colors.blue }} />}
                    />
                  ) : null
                )}
              </GroupedList>
              {fields
                .filter((f) => f.type !== 'switch')
                .map((f) => (
                  <FormField
                    key={f.path}
                    label={t(f.labelKey)}
                    value={fieldValue(f)}
                    onChangeText={(v) => setFieldValue(f, v)}
                    placeholder={f.placeholder}
                    secureTextEntry={f.type === 'password'}
                    keyboardType={f.type === 'number' ? 'number-pad' : 'default'}
                    autoCapitalize="none"
                  />
                ))}
            </View>
          );
        })}

        <View style={{ marginTop: space.lg }}>
          <GroupedList>
            <Row title={t('dbclient.fieldReadOnly')} right={<Switch value={readOnly} onValueChange={setReadOnly} trackColor={{ true: colors.blue }} />} />
          </GroupedList>
        </View>

        {error ? <Text style={[{ color: colors.red, marginTop: space.md }, type.footnote]}>{error}</Text> : null}
        {testResult ? <Text style={[{ color: colors.green, marginTop: space.md }, type.footnote]}>{testResult}</Text> : null}

        <View style={[styles.actions, { marginTop: space.lg }]}>
          {busy ? <ActivityIndicator /> : <Chip label={t('dbclient.testConnection')} onPress={onTest} />}
          {editing ? <Chip label={t('common.delete')} onPress={onDelete} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  colorRow: { flexDirection: 'row', gap: 12 },
  colorDot: { width: 28, height: 28 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
});
