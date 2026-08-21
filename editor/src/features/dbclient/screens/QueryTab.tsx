import { useEffect, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner } from '@/design/components/Banner';
import { GroupedList } from '@/design/components/GroupedList';
import { Row } from '@/design/components/Row';
import { RowSwitch } from '@/design/components/RowSwitch';
import { TintedButton } from '@/design/components/TintedButton';
import { Icon } from '@/design/Icon';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { CodeEditor } from '@/features/code/CodeEditor';
import { isApiError } from '@/api/http';
import { getConnection, runQuery } from '../api/services';
import { tokenizeSql, SQL_COLORS } from '../lib/sql-highlight';
import type { RowsResult } from '../types';
import { DataGrid } from './DataGrid';

// Consulta pronta pra rodar de cara ao abrir a aba — lista os nomes de tabela do catálogo real
// do banco-alvo (não do app), uma por dialeto porque cada um guarda isso num lugar diferente.
function defaultTableListQuery(client: string): string {
  if (client.includes('sqlite')) return "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;";
  if (client === 'tedious') return "SELECT table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' ORDER BY table_name;";
  if (client.startsWith('mysql')) return 'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name;';
  return "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;";
}

const WRITE_FIRST_WORDS = ['insert', 'update', 'delete'];

function primeiraPalavra(sql: string): string {
  return (/^\s*(\w+)/.exec(sql.trim())?.[1] || '').toLowerCase();
}

// Console SQL livre (Etapa DB2) — a ÚNICA aba do app em que o que o usuário digita vira SQL de
// verdade (o resto sempre passa por builder, ver DataGrid/FiltersSheet). Por padrão só leitura:
// o backend (sql-safety.ts) rejeita qualquer coisa que não seja um único SELECT/WITH. O toggle
// "Permitir alterar dados" (Etapa DB3, pedido explícito do usuário) libera INSERT/UPDATE/DELETE
// — mas só nesta aba, só com o toggle ligado, e o backend valida de novo do lado dele (nunca
// confia só na checagem daqui: alguém podia contornar o app e chamar a rota direto). DROP/
// ALTER/TRUNCATE continuam bloqueados sempre, com ou sem o toggle. Editável célula a célula só
// quando o SELECT vem de uma tabela só, sem JOIN — com JOIN, a grade fica com borda laranja e
// sem ações de escrita (DataGrid já cuida disso via `data.edicao.editavel`).
export function QueryTab({ connectionId }: { connectionId: string }) {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const [sql, setSql] = useState('');
  const [allowWrite, setAllowWrite] = useState(false);
  const [result, setResult] = useState<RowsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    getConnection(connectionId)
      .then((c) => setSql((current) => current || defaultTableListQuery(c.client)))
      .catch(() => {});
  }, [connectionId]);

  async function execute() {
    Keyboard.dismiss();
    if (!sql.trim()) return;
    if (!allowWrite && WRITE_FIRST_WORDS.includes(primeiraPalavra(sql))) {
      setResult(null);
      setError(t('dbclient.writeToggleRequired'));
      return;
    }
    setRunning(true);
    setError(null);
    try {
      setResult(await runQuery(connectionId, sql, allowWrite));
    } catch (e) {
      setResult(null);
      setError(isApiError(e) ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <GroupedList>
          <Row
            title={t('dbclient.allowWrite')}
            subtitle={t('dbclient.allowWriteHint')}
            left={<Icon name="pencil" size={20} color={allowWrite ? colors.orange : colors.labelTertiary} />}
            right={<RowSwitch value={allowWrite} onValueChange={setAllowWrite} trackColor={{ true: colors.orange }} />}
          />
        </GroupedList>
        {allowWrite ? (
          <View style={{ marginTop: space.sm }}>
            <Banner tone="warning" title={t('dbclient.allowWriteActiveTitle')} message={t('dbclient.allowWriteActiveMessage')} />
          </View>
        ) : null}
      </View>

      <Text style={[styles.gtitle, { color: colors.labelSecondary }]}>{t('dbclient.queryTitle')}</Text>
      <View
        style={[
          styles.editorCard,
          { marginHorizontal: space.lg, backgroundColor: colors.surface, borderLeftColor: error ? colors.red : colors.separator },
        ]}
      >
        <CodeEditor code={sql} onChangeText={setSql} tokenizer={tokenizeSql} palette={SQL_COLORS} />
      </View>
      <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <TintedButton
          label={running ? t('dbclient.runningQuery') : t('dbclient.runQuery')}
          icon="play"
          busy={running}
          disabled={!sql.trim()}
          onPress={execute}
          accessibilityLabel={t('dbclient.runQuery')}
        />
      </View>

      {error ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          <Banner tone="error" title={t('dbclient.queryErrorTitle')} message={error} />
        </View>
      ) : null}

      {result?.affectedRows !== undefined ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          <Banner
            tone="warning"
            title={t('dbclient.affectedRowsTitle', { count: result.affectedRows })}
            message={result.edicao.table ? t('dbclient.affectedRowsTable', { table: result.edicao.table }) : undefined}
          />
        </View>
      ) : result ? (
        <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
          <Text style={[styles.gtitle, { color: colors.labelSecondary, marginTop: 0 }]}>{t('dbclient.queryResult')}</Text>
          <DataGrid
            connectionId={connectionId}
            data={result}
            page={1}
            pageSize={result.rows.length || 1}
            onPageChange={() => {}}
            onPageSizeChange={() => {}}
            filters={[]}
            onFiltersChange={() => {}}
            onReload={execute}
            showFilters={false}
            showPagination={false}
          />
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gtitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 18, marginBottom: 6, marginLeft: 20 },
  editorCard: { height: 160, borderRadius: 10, borderLeftWidth: 3, overflow: 'hidden' },
});
