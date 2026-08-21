# Tabelas — editor de CSV mobile
## Plano técnico para React Native + Expo (rodando no Expo Go)

Documento de planejamento para portar o protótipo HTML (`tabelas.html`) para um app React Native que abre direto no Expo Go, sem development build.

---

## 1. O que vamos construir

Um editor de CSV com a ergonomia do Numbers do iPhone: grade rolável nos dois eixos, cabeçalho de coluna e numeração de linha congelados, seleção de célula com alças de arraste, barra de fórmulas, teclado contextual com operadores e funções, action sheets nativas para operações de linha/coluna, importar/exportar arquivo.

**Não-objetivos do MVP:** múltiplas abas de formatação, gráficos, células mescladas, formatação condicional, colaboração. Ficam no roadmap.

**Restrição de projeto que guia tudo:** precisa abrir no Expo Go. Isso elimina qualquer biblioteca com código nativo próprio (MMKV, keyboard-controller, WatermelonDB) e nos obriga a resolver a grade com o que já vem no cliente Expo Go.

---

## 2. Decisões de arquitetura

| Problema | Decisão | Por quê |
|---|---|---|
| Renderizar milhares de células | `FlashList` vertical de **linhas** dentro de um `ScrollView` horizontal único | Uma célula = uma `View`. Virtualizar as duas dimensões com duas listas aninhadas gera sincronização frágil. Virtualiza-se a vertical (que é onde o volume está) e faz-se janela manual na horizontal só se `colunas > 40`. |
| Cabeçalho e gutter congelados | `translateX`/`translateY` com Reanimated aplicado às células fixas | Evita duas listas espelhadas e o jitter clássico de sincronizar `scrollTo`. É uma transformação na UI thread, não re-renderiza React. |
| Seleção e arraste das alças | Uma única `Animated.View` de overlay posicionada por shared values | Nenhum re-render durante o arraste. O commit no store acontece só no `onEnd`. |
| Edição de célula | **Um** `TextInput` absoluto sobre a célula selecionada | Um `TextInput` por célula mataria a performance e a memória. |
| Hit testing (qual célula está sob o dedo) | Aritmética sobre offsets acumulados de coluna + altura fixa de linha | RN não tem `elementFromPoint`. Prefix sums + busca binária resolvem em O(log n). |
| Estado | Zustand + Immer, store única com slices | Sem Context re-renderizando a árvore toda. Seletores finos por célula. |
| Fórmulas | Módulo puro em TS, sem dependência de React ou RN | Testável com Jest, portável, e já existe pronto no protótipo. |
| Persistência | `expo-file-system` (arquivo `.csv` real) + `AsyncStorage` só para preferências | MMKV não roda no Expo Go. O documento do usuário deve ser um arquivo de verdade, compartilhável. |

---

## 3. O que o Expo Go permite (e o que não)

**Funciona no Expo Go:**
`react-native-reanimated`, `react-native-gesture-handler`, `react-native-screens`, `react-native-safe-area-context`, `react-native-svg`, `@shopify/flash-list`, `@shopify/react-native-skia`, e todos os módulos `expo-*` do SDK (blur, haptics, file-system, document-picker, sharing, clipboard, symbols).

**Não funciona (exige development build):**
`react-native-mmkv`, `react-native-keyboard-controller`, SQLite de terceiros, qualquer lib com pasta `ios/`/`android/` própria fora da lista curada do Expo Go, e o Gesture Handler 3.x (o cliente do Expo Go embute a série 2.x).

**Consequências práticas para nós:**
- Barra de acessórios do teclado: usar `InputAccessoryView` (nativo do RN, só iOS) e, no Android, uma `View` absoluta posicionada pelos eventos `keyboardDidShow`.
- Armazenamento rápido: `AsyncStorage` no lugar de MMKV. Como só guardamos preferências e um autosave debounced, não é gargalo.
- Ícones SF Symbols: `expo-symbols` no iOS, com fallback de `react-native-svg` no Android.

> Versões: no momento em que este plano foi escrito, o SDK atual é o 57 (React Native 0.86). Não fixe versões na mão — sempre `npx expo install <pacote>`, que resolve a versão compatível com o SDK do projeto.

---

## 4. Stack

```bash
npx create-expo-app tabelas --template blank-typescript
cd tabelas

npx expo install expo-router react-native-safe-area-context react-native-screens \
  react-native-gesture-handler react-native-reanimated \
  @shopify/flash-list expo-blur expo-haptics expo-file-system \
  expo-document-picker expo-sharing expo-clipboard expo-symbols \
  @react-native-async-storage/async-storage

npm i zustand immer
npm i -D jest jest-expo @types/jest
```

`babel.config.js` — o plugin do Reanimated tem que ser o último:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'], // Reanimated 4+; nas versões 3.x é 'react-native-reanimated/plugin'
  };
};
```

---

## 5. Estrutura de pastas

```
app/
  _layout.tsx              Stack do expo-router + GestureHandlerRootView
  index.tsx                Lista de documentos recentes
  sheet/[id].tsx           Tela do editor
src/
  core/                    ← TypeScript puro, zero import de react-native
    csv.ts                 parseCSV, toCSV, detectDelim
    formula.ts             tokenize, evalFormula, FUNCS
    numbers.ts             numval, fmtNum (locale pt-BR)
    refs.ts                colName, colIndex, parseRef
    types.ts
  store/
    sheetStore.ts          documento, seleção, edição
    history.ts             undo/redo
    prefs.ts               tema, separador padrão
  grid/
    Grid.tsx               orquestra ScrollView h + FlashList v
    Row.tsx                memo, uma linha inteira
    Cell.tsx               memo, célula única
    HeaderRow.tsx          A, B, C… + alças de redimensionar
    Gutter.tsx             1, 2, 3… congelado
    SelectionOverlay.tsx   moldura + alças
    CellEditor.tsx         TextInput flutuante
    geometry.ts            prefix sums, hit test, célula ↔ pixel
  ui/                      componentes com cara de iOS
    NavBar.tsx  ActionSheet.tsx  Sheet.tsx  Segmented.tsx
    Switch.tsx  Toast.tsx  KeyboardBar.tsx
  theme/
    tokens.ts              cores, tipografia, espaçamento
    useTheme.ts            claro/escuro via useColorScheme
  io/
    importCsv.ts  exportCsv.ts  storage.ts
```

A regra que mais importa: **nada dentro de `src/core/` importa React ou React Native.** É o que permite testar o motor de fórmulas em milissegundos e reaproveitar o código já escrito no protótipo HTML.

---

## 6. Modelo de dados

```ts
// src/core/types.ts
export type CellRaw = string;              // "12,90" | "=SOMA(A1:A9)" | ""

export type Table = {
  id: string;
  name: string;
  cells: CellRaw[][];                      // [linha][coluna], sempre retangular
  headerRow: boolean;                      // 1ª linha é cabeçalho
  colWidths: number[];                     // px por coluna
};

export type Doc = {
  fileName: string;                        // "estoque.csv"
  fileUri?: string;                        // onde salvar (documentDirectory)
  delimiter: ',' | ';' | '\t';
  tables: Table[];
  activeTable: number;
};

export type Sel = { r1: number; c1: number; r2: number; c2: number };
```

**Decisão importante:** a célula guarda a *string crua*, exatamente como digitada. Valor calculado, tipo e formatação são derivados em tempo de render, com cache. Isso mantém o CSV como fonte da verdade e o round-trip import→export sem perdas.

---

## 7. Store

```ts
// src/store/sheetStore.ts
import { create } from 'zustand';
import { produce } from 'immer';

type State = {
  doc: Doc;
  sel: Sel;
  editing: { r: number; c: number } | null;
  past: string[];
  future: string[];
};

type Actions = {
  setCell(r: number, c: number, v: string): void;
  setSel(sel: Sel): void;
  insertRow(at: number): void;
  insertCol(at: number): void;
  deleteRows(a: number, b: number): void;
  deleteCols(a: number, b: number): void;
  sortBy(col: number, dir: 1 | -1): void;
  fillDown(): void;
  undo(): void;
  redo(): void;
};

export const useSheet = create<State & Actions>((set, get) => ({
  /* ... */
  setCell: (r, c, v) => set(produce((s: State) => {
    pushHistory(s);
    s.doc.tables[s.doc.activeTable].cells[r][c] = v;
    invalidateFrom(r, c);            // limpa o cache de cálculo dependente
  })),
}));
```

**Regra de seletor:** a célula assina só o que consome.

```ts
// dentro de Cell.tsx
const raw = useSheet(s => s.doc.tables[s.doc.activeTable].cells[r][c]);
```

Nunca `useSheet(s => s.doc)` em componente de célula — isso re-renderiza a grade inteira a cada tecla.

A seleção **não** vive no store do Zustand durante o arraste. Ela vive em shared values do Reanimated e só é escrita no store no `onEnd` do gesto. Se a seleção fosse estado React, cada pixel de arraste dispararia um render da árvore.

---

## 8. Motor de fórmulas

Parser recursivo descendente, sem `eval`. Gramática:

```
cmp     := add (('=' | '<' | '>' | '<=' | '>=' | '<>') add)*
add     := mul (('+' | '-' | '&') mul)*
mul     := unary (('*' | '/') unary)*
unary   := '-' unary | power
power   := primary ('^' unary)?
primary := número | texto | ref | ref ':' ref | FUNC '(' args ')' | '(' cmp ')'
```

Funções do MVP: `SOMA/SUM`, `MÉDIA/AVERAGE`, `MIN`, `MAX`, `CONT/COUNT`, `ARRED/ROUND`, `ABS`, `INT`, `RAIZ/SQRT`, `MULT/PRODUCT`, `SE/IF`.

Detalhes que evitam bug depois:

- **Separador de argumentos:** aceitar `,` e `;`. Usuário brasileiro digita `;` por hábito do Excel.
- **Decimal em fórmula é ponto.** `=1.5*2`, não `=1,5*2` — porque a vírgula já é separador. Na *célula* (valor literal), vírgula decimal é aceita e convertida por `numval`.
- **Ciclo:** um `Set` de células em visita. Se reentrar, devolve `#CICLO` em vez de estourar a pilha.
- **Cache:** `Map<"r:c", valor>` invalidado por edição. Sem grafo de dependências no MVP — invalidar tudo e recalcular só o que está visível é suficiente até ~50k células.
- **Erros como strings** (`#REF!`, `#NOME?`, `#DIV/0!`, `#NÚM!`, `#CICLO`) para que a célula só precise checar `valor[0] === '#'` e pintar de vermelho.

Este módulo já está escrito e testado no protótipo — `tokenize`, `evalFormula`, `parseRef`, `numval`, `fmtNum` copiam quase sem alteração para `src/core/`. Só troque `throw new Error("#X")` por um tipo `FormulaError` para o TypeScript ficar honesto.

---

## 9. CSV: entrada e saída

**Parser próprio, não `papaparse`.** O parser RFC 4180 do protótipo tem ~30 linhas, trata aspas duplas escapadas, e evita 40 KB de bundle. Papaparse só se precisar de streaming de arquivos gigantes.

**Detecção de separador:** contar `,`, `;` e tab fora de aspas na primeira linha não vazia. Exportações de ERP brasileiro quase sempre vêm com `;`.

**Encoding.** É a armadilha número um com CSV no Brasil: muito arquivo sai em ISO-8859-1 e vira `Ã§Ã£o` se lido como UTF-8.

```ts
import { File } from 'expo-file-system';

export async function readCsv(uri: string) {
  const file = new File(uri);
  let text = await file.text();                    // tenta UTF-8
  if (text.includes('\uFFFD')) {                   // caractere de substituição = encoding errado
    const bytes = await file.bytes();
    text = latin1Decode(bytes);                    // fallback ISO-8859-1
  }
  return text.replace(/^\uFEFF/, '');              // remove BOM
}
```

**Importar:**

```ts
const res = await DocumentPicker.getDocumentAsync({
  type: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values', 'text/plain'],
  copyToCacheDirectory: true,
});
```
No iOS o filtro por MIME às vezes deixa o `.csv` cinza no Files; incluir o UTI `public.comma-separated-values` resolve.

**Exportar:** gravar em `Paths.document`, depois `Sharing.shareAsync(uri, { UTI: 'public.comma-separated-values', mimeType: 'text/csv' })` — abre a share sheet nativa (Salvar em Arquivos, WhatsApp, Mail). Se o separador escolhido for `;`, prefixar BOM `\uFEFF` para o Excel abrir com acentuação correta.

Fórmulas são exportadas **calculadas**, com decimal ponto — CSV não tem fórmula.

---

## 10. A grade — a parte difícil

### 10.1 Geometria

```ts
// src/grid/geometry.ts
export const ROW_H = 44;      // altura fixa: base de todo o cálculo
export const GUTTER_W = 44;
export const HEADER_H = 32;

export function colOffsets(widths: number[]) {   // memoizar
  const off = [0];
  for (let i = 0; i < widths.length; i++) off.push(off[i] + widths[i]);
  return off;                                    // off[c] = x da coluna c
}

export function colAt(x: number, off: number[]) {   // busca binária
  let lo = 0, hi = off.length - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; off[m] <= x ? lo = m : hi = m - 1; }
  return lo;
}

export const rowAt = (y: number) => Math.max(0, Math.floor(y / ROW_H));
```

Altura de linha fixa é uma decisão consciente: dá hit test O(1) na vertical, `estimatedItemSize` exato na FlashList, e overlay de seleção posicionado por multiplicação. Altura variável (texto com quebra) vira um problema de layout inteiro — fica fora do MVP.

### 10.2 Composição

```tsx
<GestureHandlerRootView style={{ flex: 1 }}>
  <Animated.ScrollView
    horizontal
    ref={hRef}
    onScroll={hScrollHandler}          // atualiza scrollX (shared value)
    scrollEventThrottle={16}
    bounces={false}
    contentContainerStyle={{ width: totalWidth + GUTTER_W }}
  >
    <View>
      <HeaderRow />                    {/* fora da lista → fixo na vertical */}
      <FlashList
        data={rows}
        renderItem={({ index }) => <Row r={index} />}
        estimatedItemSize={ROW_H}
        onScroll={vScrollHandler}      // atualiza scrollY
        extraData={renderEpoch}
      />
      <SelectionOverlay />             {/* absoluto, dentro do content */}
      <CellEditor />
    </View>
  </Animated.ScrollView>
</GestureHandlerRootView>
```

### 10.3 O truque das células congeladas

A `FlashList` vertical está *dentro* do `ScrollView` horizontal, então tudo rola junto na horizontal — inclusive o gutter, que deveria ficar parado. A solução é desfazer a translação apenas nas células fixas:

```tsx
// Gutter dentro de Row.tsx
const gutterStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: scrollX.value }],   // anula o scroll horizontal
}));

<Animated.View style={[styles.gutter, gutterStyle]}>
  <Text style={styles.gutterText}>{r + 1}</Text>
</Animated.View>
```

O cabeçalho de coluna já fica fixo na vertical por estar fora da lista; o canto (célula A0) recebe o mesmo `translateX`. Resultado: header e gutter congelados sem nenhuma sincronização de duas listas, e tudo rodando na UI thread.

**Cuidado conhecido:** o gutter precisa de `zIndex` maior que as células e, no Android, de `elevation` — `zIndex` sozinho não garante ordem lá.

### 10.4 Janela horizontal (só se precisar)

Se o arquivo tiver muitas colunas, cada `Row` renderizando 120 `View`s trava. A partir de ~40 colunas, derive um intervalo visível a partir do `scrollX`:

```ts
const [range, setRange] = useState({ from: 0, to: 20 });
useAnimatedReaction(
  () => Math.floor(scrollX.value / 100),
  (bucket, prev) => { if (bucket !== prev) runOnJS(setRange)(computeRange(bucket)); }
);
```
O bucket de 100px evita `setState` a cada frame. Renderize `from-3` até `to+3` de folga e um espaçador de largura equivalente às colunas puladas, para o scroll não pular.

### 10.5 Redimensionar coluna

Largura por coluna já está no modelo (`colWidths`), então tudo que falta é o gesto. A alça é uma `View` de 20 px sobre a divisa direita de cada cabeçalho — invisível até ser tocada, com alvo bem maior que a linha de 1 px que ela representa.

```tsx
// dentro de HeaderRow.tsx
const w = useSharedValue(widths[c]);

const resize = Gesture.Pan()
  .hitSlop({ left: 10, right: 10 })
  .activeOffsetX([-4, 4])                  // não deixa o ScrollView roubar o gesto
  .onBegin(() => { runOnJS(Haptics.selectionAsync)(); })
  .onUpdate(e => {
    'worklet';
    w.value = Math.max(48, Math.min(560, startW.value + e.translationX));
  })
  .onEnd(() => { runOnJS(commitWidth)(c, w.value); });
```

Durante o arraste, **só o shared value muda** — a coluna acompanha o dedo na UI thread e o store só é tocado no `onEnd`. Como o `Row` lê a largura de um contexto animado, nenhuma célula re-renderiza no meio do gesto.

O que muda em cascata quando uma largura muda: `colOffsets` precisa ser recalculado (memoize com `useMemo` sobre `widths`), a largura total do `contentContainerStyle` do ScrollView horizontal, e o overlay de seleção. Todos derivam dos mesmos offsets, então é um ponto só.

**Ajustar ao conteúdo:** RN não tem `canvas.measureText`. Duas saídas — a barata é estimar por contagem de caracteres (`nChars * 8.2 + 24` para SF 15pt) e refinar com um fator por tipo de conteúdo; a exata é `Text.measure` ou renderizar fora da tela e ler o `onLayout`, o que custa um frame. Para "ajustar todas as colunas" num arquivo grande, a estimativa é a escolha certa: erra alguns pixels e roda instantâneo.

**Alternativa ao redimensionar:** quebra de texto. Um toggle por tabela que muda `numberOfLines` de 1 para 3 e deixa a linha crescer. Isso quebra a premissa de altura fixa da seção 10.1 — se for para o MVP, mantenha alturas fixas em dois valores (44 e 88 px) em vez de altura livre, para não perder o hit test O(1) nem o `estimatedItemSize`.

---

## 11. Seleção e gestos

```tsx
const tap = Gesture.Tap().onEnd(e => {
  'worklet';
  const c = colAt(e.x + scrollX.value - GUTTER_W, offsets);
  const r = rowAt(e.y + scrollY.value - HEADER_H);
  runOnJS(select)(r, c);
});

const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(/* → beginEdit */);
const longPress = Gesture.LongPress().minDuration(450).onStart(/* → action sheet */);

const dragHandle = Gesture.Pan()
  .onUpdate(e => { 'worklet'; selR2.value = rowAt(...); selC2.value = colAt(...); })
  .onEnd(() => { runOnJS(commitSelection)(selR2.value, selC2.value); });

const composed = Gesture.Exclusive(doubleTap, tap, longPress);
```

- `Gesture.Exclusive` garante que o toque duplo não dispare o simples antes.
- No pan das alças, use `.activeOffsetX([-8, 8])` para o `ScrollView` pai não roubar o gesto.
- `Haptics.selectionAsync()` ao trocar de célula e `impactAsync(Light)` ao abrir menu de contexto. É metade da sensação "app da Apple".

A moldura de seleção é uma `Animated.View` cujo estilo deriva dos shared values:

```ts
const boxStyle = useAnimatedStyle(() => ({
  left: GUTTER_W + offsets[Math.min(selC1.value, selC2.value)],
  top: HEADER_H + Math.min(selR1.value, selR2.value) * ROW_H,
  width: /* soma das larguras no intervalo */,
  height: (Math.abs(selR2.value - selR1.value) + 1) * ROW_H,
}));
```

---

## 12. Edição e barra de teclado

Um único `TextInput` absoluto, montado só quando `editing !== null`:

```tsx
<TextInput
  value={draft}
  onChangeText={setDraft}
  autoFocus
  blurOnSubmit={false}
  onSubmitEditing={() => commit('down')}
  inputAccessoryViewID="cellbar"      // iOS
  keyboardType="default"
  style={[styles.editor, { left, top, width, height: ROW_H }]}
/>

{Platform.OS === 'ios' && (
  <InputAccessoryView nativeID="cellbar">
    <KeyboardBar onInsert={insertAtCursor} onDone={commit} onCancel={cancel} />
  </InputAccessoryView>
)}
```

A `KeyboardBar` é a assinatura do app: uma faixa rolável com `= + − × ÷ ( ) : ;` e teclas de função (`SOMA`, `MÉDIA`, `MÍN`, `MÁX`, `SE`) que inserem `SOMA(` já com o `=` prefixado, mais setas de navegação e um botão OK preenchido. Digitar `=SOMA(B2:B9)` no teclado padrão do iPhone exige trocar de plano de teclas três vezes; com a barra, é um toque.

No Android não existe `InputAccessoryView`. Renderize a mesma barra como `View` absoluta e desloque-a com a altura vinda de `Keyboard.addListener('keyboardDidShow', e => e.endCoordinates.height)`. Configure `android:windowSoftInputMode="adjustResize"` no `app.json`.

**Fluxo de commit:** `onSubmitEditing` → grava no store → move a seleção uma linha para baixo → mantém o foco (entrada contínua de dados, como no Numbers). `Escape`/Cancelar descarta o rascunho sem tocar no store.

---

## 13. Design system

`src/theme/tokens.ts` — tokens claros e escuros lado a lado, resolvidos por `useColorScheme()`:

```ts
export const light = {
  bg: '#F2F2F7',        surface: '#FFFFFF',    surface2: '#F7F7F9',
  headerFill: '#EFEFF2', separator: 'rgba(60,60,67,0.20)',
  label: '#000000',     label2: 'rgba(60,60,67,0.62)', label3: 'rgba(60,60,67,0.34)',
  tint: '#007AFF',      tintSoft: 'rgba(0,122,255,0.13)',
  green: '#248A3D',     greenFill: 'rgba(52,199,89,0.16)',
  red: '#D70015',
};
export const dark = { bg: '#000000', surface: '#1C1C1E', tint: '#0A84FF', /* ... */ };
```

Tipografia — a fonte do sistema já é a SF no iOS, não empacote nada:

| Papel | Tamanho | Peso |
|---|---|---|
| Título da navbar | 17 | 600 |
| Nome do arquivo (subtítulo) | 11 | 400 |
| Conteúdo de célula | 15 | 400 |
| Cabeçalho de coluna / gutter | 12 | 500 |
| Célula de cabeçalho da tabela | 15 | 600 |

Números usam `fontVariant: ['tabular-nums']` e alinhamento à direita — colunas de valor ficam com as casas decimais alinhadas, que é o detalhe que faz uma planilha parecer profissional. (No Android o suporte a `fontVariant` é irregular; se não pegar, use `fontFamily: 'monospace'` só nas células numéricas ou aceite a diferença.)

Outros elementos com cara de iOS:
- Navbar e toolbar com `BlurView` (`intensity={80}`, `tint` conforme o tema) e separador de 0,5 px.
- Action sheets: grupo arredondado de 14 px + botão "Cancelar" separado, ação destrutiva em vermelho — replicar o `UIAlertController`, não usar `Alert.alert`, que não permite o título contextual que queremos ("Coluna C").
- Modais com `presentation: 'modal'` no `Stack.Screen` do expo-router: no iOS vira o card empilhado nativo com gesto de arrastar para fechar.
- Alvos de toque de 44 pt. Célula com 44 px de altura não é coincidência.

---

## 14. Persistência

```ts
// autosave debounced
useEffect(() => {
  const t = setTimeout(() => saveDoc(doc), 800);
  return () => clearTimeout(t);
}, [doc]);
```

- Documento → arquivo `.csv` em `Paths.document/tabelas/{id}.csv`. É o formato do usuário, não um blob interno.
- Metadados que o CSV não guarda (nome da tabela, larguras de coluna, flag de cabeçalho) → `{id}.meta.json` ao lado.
- Preferências globais → `AsyncStorage`.
- `AppState` mudando para `background` força um save imediato.

---

## 15. Undo/redo

Snapshot da tabela ativa serializada, pilha limitada a 60 níveis. Para planilhas até algumas dezenas de milhares de células, `JSON.stringify` é rápido o bastante e o código cabe em 20 linhas — o custo de manter um sistema de patches (command pattern) só se paga em arquivos muito maiores.

Se o profiling mostrar travada em arquivos grandes, o próximo passo é `patches` do Immer (`produceWithPatches`), que dá undo granular quase de graça.

---

## 16. Metas de performance

| Métrica | Alvo | Como medir |
|---|---|---|
| Scroll com 5.000 linhas | 60 fps | Perf Monitor do dev menu, aba JS/UI |
| Tempo até a primeira célula editável | < 400 ms com 1.000 linhas | `performance.now()` no `onLoad` |
| Latência de toque → seleção pintada | < 50 ms | Gesto na UI thread; se passar, algo virou `runOnJS` |
| Recalcular 1.000 fórmulas | < 100 ms | benchmark direto em `src/core` |

Checklist ao revisar PR de grade:
- `Cell` e `Row` estão em `React.memo` com comparador explícito?
- Algum seletor do Zustand devolve objeto novo a cada chamada? (usar `useShallow`)
- Estilos criados dentro do render? Extrair para `StyleSheet.create`.
- Algum `useAnimatedStyle` lendo estado React em vez de shared value?

---

## 17. Plano de build — 16 etapas

Cada etapa tem um critério de pronto verificável no Expo Go.

**Fundação**
1. **Projeto e navegação.** `create-expo-app` + expo-router com duas telas, Reanimated e Gesture Handler configurados. *Pronto:* app abre no Expo Go, navega entre lista e editor, sem warning de Babel.
2. **`src/core` portado.** `csv.ts`, `formula.ts`, `numbers.ts`, `refs.ts` copiados do protótipo, tipados. *Pronto:* `npm test` verde com casos de vírgula decimal, aspas, `;` como separador, `#CICLO` e `#DIV/0!`.
3. **Store.** Zustand + Immer com documento de exemplo e ações de célula/linha/coluna. *Pronto:* um botão de teste altera uma célula e a UI provisória reflete.

**Grade**
4. **Geometria.** `geometry.ts` com offsets, `colAt`, `rowAt` e testes. *Pronto:* testes cobrindo bordas (x=0, última coluna, além do fim).
5. **Grade estática.** ScrollView horizontal + FlashList de linhas, células de texto sem interação. *Pronto:* 1.000 linhas × 10 colunas rolam a 60 fps no aparelho físico.
6. **Header e gutter congelados + redimensionar coluna.** Truque do `translateX`; alça de arraste na divisa do cabeçalho. *Pronto:* rolar nos dois eixos mantém A/B/C no topo e 1/2/3 na esquerda sem tremer no iOS e no Android, e arrastar a divisa da coluna A alarga a coluna acompanhando o dedo a 60 fps.
7. **Seleção.** Tap seleciona, overlay com moldura e alças. *Pronto:* toque em qualquer célula acerta a célula certa, inclusive com scroll aplicado.
8. **Arraste de intervalo.** Pan na alça inferior direita. *Pronto:* arrastar sobre 200 células mantém 60 fps e não dispara render React durante o gesto.

**Edição**
9. **Editor de célula.** TextInput flutuante, commit por Enter, cancelamento por Escape. *Pronto:* entrada contínua descendo a coluna sem fechar o teclado.
10. **Barra de fórmulas.** Referência da seleção + conteúdo cru + entrar em edição pelo toque na barra.
11. **Barra do teclado.** `InputAccessoryView` no iOS, barra absoluta no Android. *Pronto:* `=SOMA(B2:B9)` digitado sem trocar de plano de teclas.
12. **Cálculo.** Fórmulas resolvidas na render, cache, erros em vermelho, números à direita. *Pronto:* editar B2 atualiza D2 e o total geral na mesma frame.

**Operações e arquivo**
13. **Menus contextuais.** Long press em célula, cabeçalho de coluna e número de linha; action sheets com inserir, apagar, ordenar, limpar, preencher para baixo. *Pronto:* todas as ações passam pelo histórico.
14. **Undo/redo + estatísticas.** Barra com Soma/Média/Mín/Máx/Contagem para seleção múltipla.
15. **Importar e exportar.** Document picker, detecção de separador, fallback de encoding, share sheet, BOM para `;`. *Pronto:* CSV exportado de ERP com `;` e acento abre correto, edita e volta para o Excel intacto.
16. **Acabamento.** Modo escuro, hápticos, blur nas barras, estados vazios, ícone e splash. *Pronto:* revisão lado a lado com o Numbers em espaçamento, pesos de fonte e timing das animações.

Sugestão de ritmo: 1–3 num dia, 4–8 é a semana pesada (a grade é ~50% do esforço total), 9–12 mais um bloco, 13–16 fecham.

---

## 18. Testes

O valor está concentrado em `src/core` — lógica pura, determinística, sem mock:

```ts
describe('evalFormula', () => {
  const g = (r: number, c: number) => [[1, 2, 3], [10, 20, 30]][r][c];
  it('resolve intervalo', () => expect(evalFormula('SOMA(A1:C1)', g)).toBe(6));
  it('respeita ; como separador', () => expect(evalFormula('SE(A1>0;10;20)', g)).toBe(10));
  it('erro de divisão', () => expect(() => evalFormula('1/0', g)).toThrow('#DIV/0!'));
});

describe('parseCSV', () => {
  it('aspas com separador dentro', () =>
    expect(parseCSV('a;"b;c"', ';')).toEqual([['a', 'b;c']]));
});
```

Corpus de regressão: junte 5 CSVs reais e feios (exportação de ERP com `;`, arquivo com CRLF, arquivo latin1, arquivo com coluna a menos em algumas linhas, arquivo com aspas escapadas) e rode round-trip `parse → serialize → parse` comparando estruturas.

Teste de UI só nos fluxos críticos (importar, editar, exportar) com `@testing-library/react-native`, se sobrar tempo. Grade virtualizada não se testa bem em jsdom — vale mais o teste manual no aparelho.

---

## 19. Riscos

| Risco | Sinal de alerta | Plano B |
|---|---|---|
| Grade travando em arquivos grandes | fps < 45 com 5k linhas no aparelho médio | Janela horizontal (10.4); se persistir, migrar a grade para Skia `Canvas` — funciona no Expo Go e é o caminho que apps de planilha sérios seguem |
| `zIndex` do gutter quebrado no Android | gutter some atrás das células | `elevation` + reordenar a árvore |
| Barra de teclado no Android | barra atrás do teclado ou pulando | `keyboardDidShow` + `adjustResize`; se ficar ruim, aceitar barra fixa no rodapé sem seguir o teclado |
| Arquivo latin1 | acentos quebrados na importação | Detecção por `\uFFFD` + fallback (seção 9) |
| Precisar de MMKV/keyboard-controller | performance de persistência ou teclado inaceitável | Aí sim `npx expo prebuild` e development build — o app inteiro continua funcionando, perde só o "abre no Expo Go" |

Vale explicitar: rodar no Expo Go é uma restrição de *distribuição de testes*, não de arquitetura. Nenhuma decisão deste plano fica errada se um dia você migrar para development build; só abrem opções novas.

---

## 20. Depois do MVP

- Congelar N primeiras linhas/colunas.
- Buscar e substituir com destaque na grade.
- Formatação de célula: moeda, porcentagem, data, casas decimais.
- Gráfico simples (barras/linha) sobre o intervalo selecionado, com Skia.
- Múltiplas tabelas por arquivo exportando para `.xlsx` (aí entra a `xlsx` em JS puro).
- iPad: layout de duas colunas, atalhos de teclado físico, arrastar e soltar arquivo.
- Ações do menu de contexto do iOS 26 e Live Activities para importações longas — ambos exigem checar o suporte no SDK vigente.

---

## Referência rápida do protótipo

O arquivo `tabelas.html` que acompanha este plano é executável e serve como especificação viva de comportamento. O que dele vai direto para o app:

| Do protótipo | Para |
|---|---|
| `parseCSV`, `toCSV`, `detectDelim` | `src/core/csv.ts` |
| `tokenize`, `evalFormula`, `FUNCS`, `parseRef` | `src/core/formula.ts` |
| `numval`, `fmtNum`, `colName`, `colIndex` | `src/core/numbers.ts`, `src/core/refs.ts` |
| Lista de teclas da barra de fórmulas | `src/ui/KeyboardBar.tsx` |
| Itens dos action sheets de linha/coluna/célula | `src/ui/ActionSheet.tsx` |
| Paleta e escala tipográfica do CSS | `src/theme/tokens.ts` |

O que **não** transfere e precisa ser reescrito: layout da grade (tabela HTML com `position: sticky` não existe em RN), hit test (`elementFromPoint` → aritmética), e o posicionamento do editor (offsets do DOM → geometria calculada).
