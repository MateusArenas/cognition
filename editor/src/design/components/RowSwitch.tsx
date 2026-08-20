import { Switch, StyleSheet, type SwitchProps } from 'react-native';
import { useTheme } from '../useTheme';

// Switch nativo nasce maior que o resto de uma GroupedList (ícones/chevron de 16-20pt) — todo
// toggle dentro de uma Row usa este wrapper (encolhido e centralizado, trilho azul do sistema
// por padrão) em vez do tamanho "solto" que o componente nativo assume sozinho.
export function RowSwitch({ style, trackColor, ...props }: SwitchProps) {
  const { colors } = useTheme();
  return <Switch trackColor={trackColor ?? { true: colors.blue }} style={[styles.toggle, style]} {...props} />;
}

const styles = StyleSheet.create({
  toggle: { alignSelf: 'center', transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] },
});
