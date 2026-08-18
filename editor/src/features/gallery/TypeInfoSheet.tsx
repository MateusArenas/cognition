import { forwardRef } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { StyleSheet, Text, View } from 'react-native';
import { Sheet } from '@/design/components/Sheet';
import { useTheme } from '@/design/useTheme';
import type { TipoDiagrama } from '@/domain/mermaid/catalog';

interface Props {
  tipo: TipoDiagrama | null;
}

export const TypeInfoSheet = forwardRef<BottomSheetModal, Props>(function TypeInfoSheet({ tipo }, ref) {
  const { colors, radius } = useTheme();
  if (!tipo) return <Sheet ref={ref} title="" children={null} />;

  return (
    <Sheet ref={ref} title={tipo.nome} tag={tipo.kw}>
      <View style={{ gap: 16 }}>
        <View>
          <Text style={[styles.label, { color: colors.blue }]}>O QUE É</Text>
          <Text style={[styles.body, { color: colors.label }]}>{tipo.oque}</Text>
        </View>
        <View>
          <Text style={[styles.label, { color: colors.blue }]}>QUANDO USAR</Text>
          <Text style={[styles.body, { color: colors.label }]}>{tipo.quando}</Text>
        </View>
        {tipo.visual ? (
          <View style={[styles.badge, { backgroundColor: colors.surface, borderRadius: radius.control }]}>
            <Text style={{ color: colors.green, fontSize: 13 }}>Editável tocando no desenho — os outros tipos editam pelo código.</Text>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
});

const styles = StyleSheet.create({
  label: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.4, marginBottom: 4 },
  body: { fontSize: 14.5, lineHeight: 20 },
  badge: { padding: 12 },
});
