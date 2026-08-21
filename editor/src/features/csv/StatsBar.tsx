import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/design/useTheme';
import { fmtNum } from '@/domain/csv/formula';
import { useI18n } from '@/i18n/I18nProvider';

interface Props {
  count: number;
  filled: number;
  nums: number[];
}

// Faixa de estatísticas da seleção — só aparece com mais de uma célula selecionada (linha ou
// coluna inteira, ver CsvScreen). Porte de tabelas.html updateBar()/`.stats`.
export function StatsBar({ count, filled, nums }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  if (count <= 1) return null;

  const sum = nums.reduce((s, v) => s + v, 0);

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface2, borderBottomColor: colors.separator }]}>
      {nums.length ? (
        <>
          <Stat label={t('csv.statSum')} value={fmtNum(sum)} colors={colors} />
          <Stat label={t('csv.statAvg')} value={fmtNum(sum / nums.length)} colors={colors} />
          <Stat label={t('csv.statMin')} value={fmtNum(Math.min(...nums))} colors={colors} />
          <Stat label={t('csv.statMax')} value={fmtNum(Math.max(...nums))} colors={colors} />
          <Stat label={t('csv.statCount')} value={String(filled)} colors={colors} />
        </>
      ) : (
        <>
          <Stat label={t('csv.statCells')} value={String(count)} colors={colors} />
          <Stat label={t('csv.statFilled')} value={String(filled)} colors={colors} />
        </>
      )}
    </View>
  );
}

function Stat({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <Text style={[styles.item, { color: colors.labelSecondary }]}>
      {label} <Text style={[styles.value, { color: colors.label }]}>{value}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 14, alignItems: 'center', height: 30, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  item: { fontSize: 12, fontVariant: ['tabular-nums'] },
  value: { fontWeight: '600' },
});
