import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { forwardRef, useContext, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useI18n } from '@/i18n/I18nProvider';
import { Icon } from '../Icon';
import { useTheme } from '../useTheme';
import { InsideSheetContext } from './insideSheetContext';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

interface Props extends TextInputProps {
  mono?: boolean;
  // Mostra o "olhinho" (§ senha) que alterna a visibilidade do texto em vez de sempre ocultar —
  // substitui `secureTextEntry` fixo: o campo controla a ocultação internamente, começando
  // oculto (`secureTextEntry` recebido é ignorado quando este prop está ligado).
  secureToggle?: boolean;
}

// Campo de texto do protótipo (`.fld`): fundo surface, raio 11, borda azul no foco (§5.2, §12).
// Dentro de um Sheet (BottomSheetModal), vira BottomSheetTextInput em vez de TextInput puro —
// é como a lib fica sabendo que ESTE input pediu foco, pra deslocar o sheet e não deixar o
// teclado cobri-lo (bug real: com TextInput puro, o Sheet nunca sabia de nada, o teclado só
// aparecia por cima). Fora de um Sheet (AlertDialog, busca da Biblioteca), continua TextInput
// normal — BottomSheetTextInput lança fora do contexto do gorhom.
export const Field = forwardRef<TextInput, Props>(function Field(
  { mono, style, onFocus, onBlur, secureToggle, secureTextEntry, ...rest },
  ref,
) {
  const { colors, radius } = useTheme();
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const insideSheet = useContext(InsideSheetContext);
  const Comp = insideSheet ? BottomSheetTextInput : TextInput;

  const input = (
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
      secureTextEntry={secureToggle ? !revealed : secureTextEntry}
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
        secureToggle && styles.fieldWithToggle,
        style,
      ]}
      {...rest}
    />
  );

  if (!secureToggle) return input;

  return (
    <View style={styles.wrap}>
      {input}
      <Pressable
        onPress={() => setRevealed((v) => !v)}
        hitSlop={8}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityLabel={revealed ? t('common.hidePassword') : t('common.showPassword')}
      >
        <Icon name={revealed ? 'eyeOff' : 'eye'} size={20} color={colors.labelTertiary} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  field: { paddingVertical: 12, paddingHorizontal: 14, fontSize: 17, borderWidth: 1.5 },
  fieldWithToggle: { paddingRight: 44 },
  wrap: { justifyContent: 'center' },
  toggle: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center', padding: 4 },
});
