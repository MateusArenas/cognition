import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Field } from '@/design/components/Field';
import { GroupedList } from '@/design/components/GroupedList';
import { NavBar } from '@/design/components/NavBar';
import { Row } from '@/design/components/Row';
import { Segmented } from '@/design/components/Segmented';
import { TintedButton } from '@/design/components/TintedButton';
import { useTheme } from '@/design/useTheme';
import { useToast } from '@/design/components/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import { isApiError } from '../api/http';
import { rows as fetchRows, tableDdl, tableDetail, tableErd } from '../api/services';
import { tokenizeSql, SQL_COLORS } from '../lib/sql-highlight';
import type { FilterInput, RowsResult, TableDetail } from '../types';
import { DataGrid } from './DataGrid';
import { DiagramCard } from './DiagramCard';

type Tab = 'data' | 'structure' | 'ddl' | 'erd';

// Tabela — segmented de quatro: Dados (grade compartilhada, ver DataGrid.tsx — paginação real,
// filtros, ações de linha/célula, "Nova linha"), Estrutura (selos PK/FK/UK e índices), DDL
// (cartão rolável + copiar), Diagrama (vizinhança, cartão com colunas/só-chaves/profundidade +
// exportar) — DB-MOBILE.md, lote de retoques pós-uso real.
export function TableScreen() {
  const { colors, space, scheme } = useTheme();
  const { height: alturaJanela } = useWindowDimensions();
  const { t } = useI18n();
  const { show } = useToast();
  const { id, table } = useLocalSearchParams<{ id: string; table: string }>();
  const [tab, setTab] = useState<Tab>('data');

  const [data, setData] = useState<RowsResult | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState<FilterInput[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<TableDetail | null>(null);
  const [ddl, setDdl] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchRows(id, table, { limit: pageSize, offset: (page - 1) * pageSize, filters, q: q || undefined }));
    } catch (e) {
      setError(isApiError(e) ? e.message : String(e));
    }
  }, [id, table, page, pageSize, filters, q]);

  useEffect(() => {
    if (tab === 'data') void loadRows();
  }, [tab, loadRows]);

  useEffect(() => {
    if (!detail) tableDetail(id, table).then(setDetail).catch((e) => setError(isApiError(e) ? e.message : String(e)));
  }, [id, table, detail]);

  useEffect(() => {
    if (tab === 'ddl' && ddl === null) tableDdl(id, table).then(setDdl).catch((e) => setError(isApiError(e) ? e.message : String(e)));
  }, [tab, id, table, ddl]);

  const fetchTableErd = useCallback(
    (opts: { columns: boolean; keysOnly: boolean; depth?: number }) => tableErd(id, table, opts.depth ?? 1, opts),
    [id, table]
  );

  function changeFilters(f: FilterInput[]) {
    setFilters(f);
    setPage(1);
  }

  async function copyDdl() {
    if (!ddl) return;
    await Clipboard.setStringAsync(ddl);
    show(t('common.copied'));
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <NavBar title={table} left={{ label: t('common.cancel'), onPress: () => router.back() }} />
      <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <Segmented
          options={[
            { value: 'data', label: t('dbclient.tabData') },
            { value: 'structure', label: t('dbclient.tabStructure') },
            { value: 'ddl', label: t('dbclient.tabDdl') },
            { value: 'erd', label: t('dbclient.tabDiagram') },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
      </View>

      {error ? <Text style={{ color: colors.red, paddingHorizontal: space.lg }}>{error}</Text> : null}

      {tab === 'data' ? (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
            <Field
              value={q}
              onChangeText={setQ}
              onSubmitEditing={() => setPage(1)}
              placeholder={t('dbclient.search')}
            />
          </View>
          {!data ? (
            <ActivityIndicator style={{ marginTop: space.xl }} />
          ) : (
            <DataGrid
              connectionId={id}
              data={data}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
              filters={filters}
              onFiltersChange={changeFilters}
              onReload={loadRows}
              columnsMeta={detail?.columns}
            />
          )}
        </View>
      ) : null}

      {tab === 'structure' ? (
        <ScrollView contentContainerStyle={{ padding: space.lg }}>
          {!detail ? (
            <ActivityIndicator />
          ) : (
            <>
              <Text style={[{ color: colors.labelSecondary, marginBottom: 6 }]}>{t('dbclient.columns')}</Text>
              <GroupedList>
                {detail.columns.map((c) => (
                  <Row
                    key={c.name}
                    title={c.name}
                    subtitle={c.type + (c.nullable ? '' : ' · NOT NULL')}
                    right={
                      <Text style={{ color: colors.blue, fontSize: 12, fontWeight: '600' }}>
                        {c.isPrimaryKey ? 'PK ' : ''}
                        {detail.foreignKeys.some((fk) => fk.columns.includes(c.name)) ? 'FK' : ''}
                      </Text>
                    }
                  />
                ))}
              </GroupedList>

              {detail.indexes.length ? (
                <>
                  <Text style={[{ color: colors.labelSecondary, marginBottom: 6, marginTop: space.lg }]}>{t('dbclient.indexes')}</Text>
                  <GroupedList>
                    {detail.indexes.map((ix) => (
                      <Row key={ix.name} title={ix.name} subtitle={ix.columns.join(', ')} right={ix.unique ? <Text style={{ color: colors.green }}>UNIQUE</Text> : null} />
                    ))}
                  </GroupedList>
                </>
              ) : null}

              {detail.referencedBy.length ? (
                <>
                  <Text style={[{ color: colors.labelSecondary, marginBottom: 6, marginTop: space.lg }]}>{t('dbclient.referencedBy')}</Text>
                  <GroupedList>
                    {detail.referencedBy.map((fk) => (
                      <Row key={fk.name} title={fk.table} subtitle={`${fk.columns.join(', ')} → ${detail.name}.${fk.refColumns.join(', ')}`} />
                    ))}
                  </GroupedList>
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      ) : null}

      {tab === 'ddl' ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
          {ddl === null ? (
            <ActivityIndicator style={{ marginTop: space.xl }} />
          ) : (
            <>
              <View
                style={[
                  styles.ddlCard,
                  { height: alturaJanela * 0.4, borderColor: colors.separator, backgroundColor: colors.surface },
                ]}
              >
                <ScrollView>
                  <ScrollView horizontal>
                    <Text selectable style={styles.ddlText} allowFontScaling={false}>
                      {tokenizeSql(ddl).map((tok, i) => (
                        <Text
                          key={i}
                          style={{
                            color: SQL_COLORS[scheme][tok.type],
                            fontStyle: tok.type === 'com' ? 'italic' : 'normal',
                            fontWeight: tok.type === 'kw' ? '600' : '400',
                          }}
                        >
                          {tok.text}
                        </Text>
                      ))}
                    </Text>
                  </ScrollView>
                </ScrollView>
              </View>
              <View style={{ paddingVertical: space.sm }}>
                <TintedButton label={t('dbclient.copyDdl')} icon="copy" onPress={copyDdl} />
              </View>
            </>
          )}
        </View>
      ) : null}

      {tab === 'erd' ? <DiagramCard nome={table} fetchMermaid={fetchTableErd} depthControl /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Altura fixa (~40% da tela, calculada em alturaJanela) em vez de flex:1 — o cartão não deve
  // dominar a tela sozinho; rolagem vertical E horizontal por dentro dá conta do texto inteiro,
  // por maior que seja o CREATE TABLE, sem quebra de linha (pedido do usuário, DB-MOBILE.md).
  ddlCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: 'hidden' },
  ddlText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
  },
});
