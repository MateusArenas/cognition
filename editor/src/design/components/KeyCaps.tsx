import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../useTheme';

interface Props {
  keys: string[];
  active: string[];
  onToggle: (key: string) => void;
}

// As teclas PK/FK/UK do inspetor de coluna do ER (§11, tabela de ações da Coluna) —
// pequenos toggles quadrados, monoespaçados.
export function KeyCaps({ keys, active, onToggle }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {keys.map((k) => {
        const on = active.includes(k);
        return (
          <Pressable
            key={k}
            testID={`keycap-${k}`}
            onPress={() => onToggle(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [
              styles.key,
              { backgroundColor: on ? colors.blue : colors.surface3 },
              pressed && { opacity: 0.5 },
            ]}
          >
            <Text style={{ color: on ? '#fff' : colors.labelSecondary, fontSize: 10.5, fontFamily: 'Menlo', fontWeight: on ? '600' : '400' }}>
              {k}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  key: { minWidth: 30, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 6, alignItems: 'center' },
});
