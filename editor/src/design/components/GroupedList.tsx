import { Children, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../useTheme';

interface Props {
  children: ReactNode;
}

// A lista inset agrupada do iOS: cartão de raio 12, separadores só entre linhas, recuados
// 16pt à esquerda (§5.2).
export function GroupedList({ children }: Props) {
  const { colors, radius } = useTheme();
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.row }]}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 ? <View style={[styles.separator, { backgroundColor: colors.separator }]} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
});
