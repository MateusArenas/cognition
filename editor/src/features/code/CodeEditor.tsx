import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useTheme } from '@/design/useTheme';
import { tokenize, type Token, type TokenType } from './highlight';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const COLORS: Record<'dark' | 'light', Record<TokenType, string>> = {
  dark: { com: '#6E7681', str: '#7BD88F', card: '#64D2FF', op: '#64D2FF', kw: '#FF7AB2', num: '#FF9F0A', br: '#8E8E93', pun: '#9CA3AF', text: '#FFFFFF' },
  light: { com: '#8A8F98', str: '#1E7F35', card: '#0062CC', op: '#0062CC', kw: '#A036C4', num: '#B35A00', br: '#6E6E73', pun: '#6B7280', text: '#000000' },
};

interface Props {
  code: string;
  onChangeText: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  editable?: boolean;
  /** Altura da CodeKeyboardBar — reservada como padding extra no fim do conteúdo rolável. */
  bottomInset?: number;
  /** Tokenizador alternativo (ex.: SQL do console de banco) — default é o de Mermaid. */
  tokenizer?: (code: string) => Token[];
  /** Paleta alternativa, casada com o tokenizador acima — default é COLORS (Mermaid). */
  palette?: Record<'dark' | 'light', Record<TokenType, string>>;
}

// Técnica de sobreposição: um <Text> colorido embaixo e um <TextInput> transparente por cima,
// com só o cursor visível (§12). Funciona só se as duas caixas tiverem exatamente a mesma
// métrica — por isso `metrics` é compartilhado entre as duas, nunca duplicado. `tokenizer`/
// `palette` são plugáveis (default Mermaid) pra reaproveitar esta MESMA sobreposição — e todo
// o trabalho de teclado/scroll já resolvido abaixo — no console SQL livre (dbclient/lib/
// sql-highlight.ts), em vez de duplicar o componente inteiro por uma troca de linguagem.
export function CodeEditor({ code, onChangeText, onFocus, onBlur, editable = true, bottomInset = 0, tokenizer = tokenize, palette: paletteProp }: Props) {
  const { colors, scheme } = useTheme();
  const tokens = useMemo(() => tokenizer(code), [code, tokenizer]);
  const palette = (paletteProp ?? COLORS)[scheme];

  // `height` é o valor animado (negativo quando o teclado está aberto) que a própria lib
  // reporta em iOS E Android de forma normalizada (useResizeMode força adjustResize no
  // Android por baixo dos panos) — é a MESMA fonte que qualquer outra barra colada ao teclado
  // no app usaria, então não tem jeito de desincronizar. Ver "Bug real" abaixo.
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const spacerAnimatedStyle = useAnimatedStyle(() => ({
    height: -keyboardHeight.value + bottomInset,
  }));

  return (
    // Sem borda e sem cartão arredondado de propósito — pedido do usuário ("não quero borda
    // por volta do código"). O fundo (colors.surface) é o mesmo do container em DiagramScreen,
    // pra ficar tudo uma superfície só, sem costura de cor nenhuma.
    <View style={[styles.wrap, { backgroundColor: colors.surface }]}>
      {/* Bug real: rolar dava a impressão de escrolar, mas o texto colorido ficava parado —
          o <Text> de realce e o TextInput eram irmãos soltos; o TextInput rolava por conta
          própria (scroll nativo dele, invisível já que o texto dele é transparente) sem mexer
          no <Text> absoluto por baixo, que sempre desenhava a partir do topo do wrap. Corrigido
          pondo os dois dentro do MESMO ScrollView (scrollEnabled=false no TextInput, ele só
          cresce com o conteúdo) — como sobem juntos como uma unidade só, nunca mais desalinham. */}
      {/* Bug real: com o teclado aberto, não dava pra rolar o bastante — as últimas linhas do
          código ficavam presas atrás do teclado/toolbar, mesmo rolando manualmente (reportado
          pelo usuário: "ainda tampando texto... tem que dar pra escrolar mais"). Três causas
          empilhadas, cada uma corrigida por vez até sobrar só a certa: (1) o ScrollView não
          tinha `style` próprio — sem `flex:1`, sua altura não acompanhava o encolhimento pelo
          teclado; (2) `editArea` tinha `flex:1` dentro do ScrollView, o que trunca a altura na
          do viewport em vez de abraçar o conteúdo; (3) a tentativa de compensar com
          `KeyboardAvoidingView` (`behavior="padding"`) + `keyboardVerticalOffset` é receita de
          iOS — no Android o app já usa `softwareKeyboardLayoutMode: "resize"` (app.json), que
          redimensiona a JANELA sozinho; empilhar `behavior="padding"` por cima disso
          compensaria a altura do teclado DUAS vezes nesse SO. E mesmo só no iOS, ainda sobrava
          sobreposição residual: a CodeKeyboardBar cola no teclado via `KeyboardStickyView`, que
          é um `transform` — não reflui layout, então a altura que ela reserva como irmã comum
          no flex nunca bate no pixel com onde ela termina depois de deslizar.
          Corrigido tirando o `KeyboardAvoidingView` de vez e colocando um spacer animado
          (`Animated.View`, altura ligada direto ao valor animado de altura do teclado via
          `useReanimatedKeyboardAnimation` — mesma lib, já normalizado pra iOS e Android por
          baixo dos panos) como ÚLTIMO filho DENTRO do ScrollView, depois do `editArea` — mais
          `bottomInset` (altura real da CodeKeyboardBar) por cima. Tentativa anterior animava
          `contentContainerStyle` direto num `Animated.ScrollView`, mas isso quebra em runtime
          ("attempted to set the key `current`... immutable and frozen") — Reanimated não trata
          `contentContainerStyle` do jeito que trata `style`; um spacer é o jeito seguro e restrito
          de fazer isso. Não depende de nenhuma suposição de frame/posição de tela: sempre sobra
          exatamente teclado+barra de espaço em branco depois da última linha, nos dois sistemas.
          Verificado no simulador iOS com scrollToEnd() forçado depois do teclado assentar: a
          última linha de verdade ("class G,K sistema") fica visível com folga acima da barra. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always">
        <View style={styles.editArea}>
          <Text style={[StyleSheet.absoluteFill, metrics, styles.hl]} allowFontScaling={false}>
            {tokens.map((t, i) => (
              <Text key={i} style={{ color: palette[t.type], fontStyle: t.type === 'com' ? 'italic' : 'normal', fontWeight: t.type === 'kw' ? '600' : '400' }}>
                {t.text}
              </Text>
            ))}
            {'\n'}
          </Text>
          <TextInput
            value={code}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            editable={editable}
            multiline
            scrollEnabled={false}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            allowFontScaling={false}
            style={[metrics, styles.input, { color: 'transparent' }]}
          />
        </View>
        <Animated.View style={spacerAnimatedStyle} />
      </ScrollView>
    </View>
  );
}

const metrics = {
  fontFamily: monoFont,
  fontSize: 13.5,
  lineHeight: 21.9,
  letterSpacing: 0,
  padding: 14,
};

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  editArea: {},
  hl: { pointerEvents: 'none' },
  input: { textAlignVertical: 'top' },
});
