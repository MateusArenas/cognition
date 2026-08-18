import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../useTheme';

export interface SegmentOption {
  value: string;
  label: string;
}

interface Props {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
}

// Trilho surface3, raio 9, padding 2, pílula selecionada em surface com sombra sutil (§5.2).
// Usado em Escrever/Ler e no escopo da IA.
export function Segmented({ options, value, onChange }: Props) {
  const { colors, radius, type } = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: colors.surface3, borderRadius: radius.control }]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            testID={`segmented-${opt.value}`}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.pill,
              { borderRadius: radius.control - 2 },
              selected && { backgroundColor: colors.surface, ...styles.shadow },
            ]}
          >
            <Text style={[{ color: colors.label }, type.subhead, { fontWeight: '500' }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 2, gap: 2 },
  pill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 6 },
  shadow: {
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
