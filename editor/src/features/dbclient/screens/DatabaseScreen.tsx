import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Field } from '@/design/components/Field';
import { GroupedList } from '@/design/components/GroupedList';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { Segmented } from '@/design/components/Segmented';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { isApiError } from '@/api/http';
import { schemaErd, tables } from '../api/services';
import type { TableRef } from '../types';
import { DiagramCard } from './DiagramCard';
import { QueryTab } from './QueryTab';

type Tab = 'tables' | 'query' | 'erd';

// Banco — segmented de três: Tabelas (busca, agrupadas por tipo, contagem), Consulta (SQL livre
// só-leitura — QueryTab.tsx, Etapa DB2) e Diagrama (schema inteiro, cartão com colunas/
// só-chaves + exportar — DiagramCard.tsx) — DB-MOBILE.md, lote de retoques pós-uso real.
export function DatabaseScreen() {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('tables');
  const [list, setList] = useState<TableRef[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tables(id)
      .then(setList)
      .catch((e) => setError(isApiError(e) ? e.message : String(e)));
  }, [id]);

  const fetchSchemaErd = useCallback((opts: { columns: boolean; keysOnly: boolean }) => schemaErd(id, opts), [id]);

  const filtered = useMemo(() => {
    if (!list) return null;
    const q = query.trim().toLowerCase();
    return q ? list.filter((t2) => t2.name.toLowerCase().includes(q)) : list;
  }, [list, query]);
  const tabelas = filtered?.filter((t2) => t2.type === 'table') ?? [];
  const views = filtered?.filter((t2) => t2.type === 'view') ?? [];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar
        title={t('dbclient.databaseTitle')}
        left={{ label: t('common.cancel'), onPress: () => router.back() }}
        right={{ label: t('dbclient.editConnection'), onPress: () => router.push({ pathname: '/db/connection', params: { id } }) }}
      />
      <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <Segmented
          options={[
            { value: 'tables', label: t('dbclient.tabTables') },
            { value: 'query', label: t('dbclient.tabQuery') },
            { value: 'erd', label: t('dbclient.tabDiagram') },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
      </View>

      {error ? <Text style={{ color: colors.red, paddingHorizontal: space.lg }}>{error}</Text> : null}

      {tab === 'tables' ? (
        <>
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
            <Field value={query} onChangeText={setQuery} placeholder={t('dbclient.searchTables')} />
          </View>
          {list === null ? (
            <ActivityIndicator style={{ marginTop: space.xl }} />
          ) : (
            <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0 }}>
              {tabelas.length ? (
                <>
                  <Text style={[{ color: colors.labelSecondary, marginBottom: 6 }]}>{t('dbclient.groupTables')}</Text>
                  <GroupedList>
                    {tabelas.map((tb) => (
                      <Row
                        key={tb.name}
                        title={tb.name}
                        subtitle={tb.rowCount !== undefined ? t('dbclient.rowCount', { count: tb.rowCount }) : undefined}
                        navigable
                        onPress={() => router.push({ pathname: '/db/[id]/[table]', params: { id, table: tb.name } })}
                      />
                    ))}
                  </GroupedList>
                </>
              ) : null}
              {views.length ? (
                <>
                  <Text style={[{ color: colors.labelSecondary, marginBottom: 6, marginTop: space.lg }]}>{t('dbclient.groupViews')}</Text>
                  <GroupedList>
                    {views.map((tb) => (
                      <Row
                        key={tb.name}
                        title={tb.name}
                        navigable
                        onPress={() => router.push({ pathname: '/db/[id]/[table]', params: { id, table: tb.name } })}
                      />
                    ))}
                  </GroupedList>
                </>
              ) : null}
              {!tabelas.length && !views.length ? (
                <Text style={{ color: colors.labelSecondary, textAlign: 'center', marginTop: space.xl }}>{t('dbclient.emptyTables')}</Text>
              ) : null}
            </ScrollView>
          )}
        </>
      ) : tab === 'query' ? (
        <QueryTab connectionId={id} />
      ) : (
        <DiagramCard nome={t('dbclient.databaseTitle')} fetchMermaid={fetchSchemaErd} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
