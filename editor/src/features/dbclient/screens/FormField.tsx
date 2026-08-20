import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import { Field } from '@/design/components/Field';
import { useTheme } from '@/design/useTheme';

interface Props extends ComponentProps<typeof Field> {
  label: string;
}

// `Field` (design system) não tem rótulo embutido — é só o TextInput estilizado (§5.2). Como
// ConnectionFormScreen precisa de MUITOS campos rotulados (host/porta/usuário/senha/...), este
// wrapper local evita repetir o mesmo <Text> + <View> em toda tela nova do dbclient.
export function FormField({ label, style, ...rest }: Props) {
  const { colors, space, type } = useTheme();
  return (
    <View style={{ marginBottom: space.sm }}>
      <Text style={[{ color: colors.labelSecondary, marginBottom: 4 }, type.footnote]}>{label}</Text>
      <Field style={style} {...rest} />
    </View>
  );
}
