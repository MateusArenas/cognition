import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { forwardRef, useContext, useState } from 'react';
import { Platform, StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { useTheme } from '../useTheme';
import { InsideSheetContext } from './insideSheetContext';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

interface Props extends TextInputProps {
  mono?: boolean;
}

// Campo de texto do protótipo (`.fld`): fundo surface, raio 11, borda azul no foco (§5.2, §12).
// Dentro de um Sheet (BottomSheetModal), vira BottomSheetTextInput em vez de TextInput puro —
// é como a lib fica sabendo que ESTE input pediu foco, pra deslocar o sheet e não deixar o
// teclado cobri-lo (bug real: com TextInput puro, o Sheet nunca sabia de nada, o teclado só
// aparecia por cima). Fora de um Sheet (AlertDialog, busca da Biblioteca), continua TextInput
// normal — BottomSheetTextInput lança fora do contexto do gorhom.
export const Field = forwardRef<TextInput, Props>(function Field({ mono, style, onFocus, onBlur, ...rest }, ref) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  const insideSheet = useContext(InsideSheetContext);
  const Comp = insideSheet ? BottomSheetTextInput : TextInput;

  return (
    <Comp
      ref={ref as never}
      placeholderTextColor={colors.labelTertiary}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.field,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.control + 2,
          color: colors.label,
          borderColor: focused ? colors.blue : 'transparent',
          fontFamily: mono ? monoFont : undefined,
          fontSize: mono ? 15 : 17,
        },
        style,
      ]}
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  field: { paddingVertical: 12, paddingHorizontal: 14, fontSize: 17, borderWidth: 1.5 },
});
