import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import { Field } from '@/design/components/Field';
import { useTheme } from '@/design/useTheme';

interface Props extends ComponentProps<typeof Field> {
  label: string;
}

// `Field` (design system) não tem rótulo embutido — mesmo wrapper local que
// features/dbclient/screens/FormField.tsx já usa, evita repetir Text+View em cada tela nova.
// `style` passa pro Field (o input em si), não pro wrapper — mesmo comportamento do dbclient.
export function FormField({ label, style, ...rest }: Props) {
  const { colors, space, type } = useTheme();
  return (
    <View style={{ marginBottom: space.sm }}>
      <Text style={[{ color: colors.labelSecondary, marginBottom: 4 }, type.footnote]}>{label}</Text>
      <Field style={style} {...rest} />
    </View>
  );
}
