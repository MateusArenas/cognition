import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/design/useTheme';
import { ROW_H, ROW_H_WRAP } from '@/domain/csv/geometry';

interface Props {
  text: string;
  width: number;
  isNum: boolean;
  isErr: boolean;
  isHeader: boolean;
  selected: boolean;
  inRange: boolean;
  wrap: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

function CellImpl({ text, width, isNum, isErr, isHeader, selected, inRange, wrap, onPress, onLongPress }: Props) {
  const { colors } = useTheme();
  // Célula vazia/sem seleção fica TRANSPARENTE — deixa o fundo (preto de verdade no escuro) do
  // Grid aparecer, só as linhas divisórias (borderColor) marcam a grade. Preencher toda célula
  // com `colors.surface` (cinza médio) cobria a tela inteira de um bloco cinza uniforme — nada
  // parecido com o visual "linhas sobre fundo" que Numbers/planilhas da Apple usam; cor de
  // preenchimento fica reservada só pros estados que realmente importam (selecionado, dentro do
  // intervalo, cabeçalho), pedido do usuário depois de ver o resultado ao vivo.
  const bg = selected ? colors.blue + '33' : inRange ? colors.blue + '1A' : isHeader ? colors.green + '1F' : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.cell,
        {
          width,
          height: wrap ? ROW_H_WRAP : ROW_H,
          backgroundColor: bg,
          borderColor: colors.separator,
        },
      ]}
    >
      <Text
        numberOfLines={wrap ? 3 : 1}
        style={[
          styles.text,
          {
            color: isErr ? colors.red : colors.label,
            textAlign: isNum && !isHeader ? 'right' : 'left',
            fontWeight: isHeader ? '600' : '400',
          },
          isNum ? styles.tabular : null,
        ]}
      >
        {text}
      </Text>
    </Pressable>
  );
}

function propsEqual(a: Props, b: Props): boolean {
  return (
    a.text === b.text &&
    a.width === b.width &&
    a.isNum === b.isNum &&
    a.isErr === b.isErr &&
    a.isHeader === b.isHeader &&
    a.selected === b.selected &&
    a.inRange === b.inRange &&
    a.wrap === b.wrap
  );
}

export const Cell = memo(CellImpl, propsEqual);

const styles = StyleSheet.create({
  cell: { justifyContent: 'center', paddingHorizontal: 8, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  text: { fontSize: 14.5, letterSpacing: -0.1 },
  tabular: { fontVariant: ['tabular-nums'] },
});
