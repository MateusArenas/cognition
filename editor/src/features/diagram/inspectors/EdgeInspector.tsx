import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/design/useTheme';
import { useDoc } from '@/store/useDoc';
import { useI18n } from '@/i18n/I18nProvider';
import { LINKS } from '@/domain/mermaid/links';
import { setEdgeType } from '@/domain/mutations/flow';
import type { FlowDoc, LinkKey } from '@/domain/types';

interface Props {
  id: string;
}

export function EdgeInspector({ id }: Props) {
  const { colors, radius } = useTheme();
  const { t } = useI18n();
  const doc = useDoc((s) => s.doc) as FlowDoc;
  const apply = useDoc((s) => s.apply);
  const e = doc.edges.find((x) => x.id === id);
  if (!e) return null;

  return (
    <View>
      <Text style={[styles.section, { color: colors.labelSecondary }]}>{t('diagram.inspectorStroke')}</Text>
      <View style={styles.grid}>
        {(Object.keys(LINKS) as LinkKey[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => apply((d) => setEdgeType(d as FlowDoc, id, k))}
            style={[
              styles.chip,
              { borderRadius: radius.control + 2, backgroundColor: colors.surface },
              e.type === k && { borderColor: colors.blue, borderWidth: 1.5 },
            ]}
          >
            <Text style={{ color: e.type === k ? colors.blue : colors.label, fontSize: 13 }}>{LINKS[k].nome}</Text>
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
