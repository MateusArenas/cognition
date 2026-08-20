import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/design/useTheme';
import { useDoc } from '@/store/useDoc';
import { useI18n } from '@/i18n/I18nProvider';
import { CARD_L, CARD_R } from '@/domain/mermaid/cardinality';
import { setRelationCardinality } from '@/domain/mutations/er';
import type { ErDoc, Relation } from '@/domain/types';

interface Props {
  id: string;
}

export function RelationInspector({ id }: Props) {
  const { t } = useI18n();
  const doc = useDoc((s) => s.doc) as ErDoc;
  const apply = useDoc((s) => s.apply);
  const r = doc.relations.find((x) => x.id === id);
  if (!r) return null;

  return (
    <View style={{ gap: 20 }}>
      <Picker
        title={t('diagram.sideLabel', { side: r.from })}
        options={CARD_L}
        value={r.cardL}
        onChange={(v) => apply((d) => setRelationCardinality(d as ErDoc, id, v as Relation['cardL'], r.cardR))}
      />
      <Picker
        title={t('diagram.sideLabel', { side: r.to })}
        options={CARD_R}
        value={r.cardR}
        onChange={(v) => apply((d) => setRelationCardinality(d as ErDoc, id, r.cardL, v as Relation['cardR']))}
      />
    </View>
  );
}

function Picker({ title, options, value, onChange }: { title: string; options: Record<string, string>; value: string; onChange: (v: string) => void }) {
  const { colors, radius } = useTheme();
  return (
    <View>
      <Text style={[styles.section, { color: colors.labelSecondary }]}>{title}</Text>
      <View style={styles.grid}>
        {Object.entries(options).map(([k, nome]) => (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            style={[
              styles.chip,
              { borderRadius: radius.control + 2, backgroundColor: colors.surface },
              value === k && { borderColor: colors.blue, borderWidth: 1.5 },
            ]}
          >
            <Text style={{ color: value === k ? colors.blue : colors.label, fontSize: 13 }}>{nome}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 13, borderWidth: 1.5, borderColor: 'transparent' },
});
