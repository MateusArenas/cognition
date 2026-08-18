# Editor de Diagramas e Documentos — especificação de construção

Documento único para construir o aplicativo em React Native + Expo. Cobre arquitetura,
sistema de design, camada de domínio, cada tela, escalabilidade e ordem de execução.

O protótipo HTML que acompanha este documento é a referência funcional: comportamento
ambíguo aqui se resolve olhando o protótipo.

---

## 1. O produto em uma página

Um editor de diagramas Mermaid e documentos Markdown, feito para o celular.

**Três tipos de arquivo:**

| Tipo | O que é | Como se edita |
|---|---|---|
| `flow` | Fluxograma | Toque no desenho: formas, cores, conexões, agrupamentos |
| `er` | Modelo relacional | Toque no desenho: tabelas, colunas, cardinalidades |
| `raw` | Os outros 23 tipos do Mermaid | Toque no elemento → edita o trecho de código correspondente |
| `md` | Documento Markdown | Editor estilo Notas, com diagramas Mermaid embutidos e editáveis |

**As três promessas que definem o produto:**

1. **Selecionar é barato.** Tocar num elemento não abre painel — mostra uma barra de ações
   com as cinco coisas que se faz o tempo todo. O painel completo fica a um toque.
2. **Todo elemento é editável, em qualquer tipo de diagrama.** Nos tipos sem modelo visual,
   o toque mapeia para o pedaço exato do código-fonte.
3. **Documento e diagrama são a mesma coisa.** Um bloco ` ```mermaid ` dentro de um
   documento abre no canvas com todas as ferramentas e volta atualizado.

---

## 2. A decisão que define o projeto

Mermaid não tem porta nativa. É um pacote JS que gera SVG via DOM e usa `dagre` para layout.

| | **A. WebView como canvas** | **B. 100% nativo** |
|---|---|---|
| Renderização | mermaid.js dentro de WebView | `react-native-svg` + `@dagrejs/dagre` |
| Cobertura de tipos | 25 tipos, de graça | você reimplementa cada um |
| Esforço | 2–3 dias até renderizar | 3–4 semanas para 2 tipos |
| Arrastar nós livremente | impossível (layout automático) | possível |
| Fidelidade | é o Mermaid de verdade | aproximação que envelhece |

**Escolha o caminho A.** O WebView é um componente burro: desenha e reporta toques. Todo o
resto — barra de ações, painéis, formulários, teclado, arquivos, compartilhamento — é React
Native de verdade. O usuário nunca percebe o WebView porque ele não mostra chrome de
navegador nem recebe entrada de texto.

Vá para o B apenas se arrastar nós manualmente for requisito de negócio. A seção 19 descreve
como, se esse dia chegar.

---

## 3. Setup

```bash
npx create-expo-app@latest editor --template default   # TypeScript + expo-router
cd editor

npx expo install \
  react-native-webview react-native-gesture-handler react-native-reanimated \
  react-native-safe-area-context react-native-screens expo-router \
  expo-asset expo-file-system expo-sharing expo-clipboard expo-document-picker \
  expo-haptics expo-sqlite expo-localization

npm i zustand @gorhom/bottom-sheet react-native-keyboard-controller
npm i -D mermaid vitest @testing-library/react-native
```

`babel.config.js` — o plugin do Reanimated sempre por último:

```js
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
```

`metro.config.js` — o runtime do Mermaid é um asset `.html`:

```js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('html');
module.exports = config;
```

`app.json` — o essencial:

```json
{
  "expo": {
    "userInterfaceStyle": "automatic",
    "assetBundlePatterns": ["**/*"],
    "ios": { "supportsTablet": true },
    "android": { "softwareKeyboardLayoutMode": "resize" }
  }
}
```

`userInterfaceStyle: "automatic"` não é detalhe: o app segue o tema do sistema até o usuário
escolher um, e aí passa a respeitar a escolha. É como o iOS se comporta.

---

## 4. Estrutura de pastas

Organização por feature, com o domínio isolado no centro. A regra que mantém o projeto
escalável: **`domain/` não importa nada de `features/`, `design/` ou `store/`.** É TypeScript
puro, testável sem renderizar nada.

```
src/
  app/                          # rotas (expo-router)
    _layout.tsx                 # providers: gesture, bottom-sheet, tema, teclado
    index.tsx                   # biblioteca de documentos
    doc/[id].tsx                # editor (roteia por tipo)

  design/                       # sistema de design iOS
    tokens.ts                   # cores, tipografia, espaçamento, raios
    ThemeProvider.tsx
    useTheme.ts
    Icon.tsx                    # SF-Symbols-like em SVG
    components/
      NavBar.tsx      Sheet.tsx        GroupedList.tsx   Row.tsx
      Segmented.tsx   ActionBar.tsx    AlertDialog.tsx   Toast.tsx
      Fab.tsx         Chip.tsx         Field.tsx         KeyCaps.tsx

  domain/                       # TypeScript puro, zero dependência de UI
    types.ts
    mermaid/
      shapes.ts   links.ts   cardinality.ts
      serialize.ts   parse.ts
      catalog.ts                # os 25 tipos: nome, keyword, exemplo, explicação
      templates.ts
    markdown/
      render.ts                 # markdown -> árvore/HTML + blocos mermaid com offsets
      blocks.ts                 # localizar, substituir e inserir blocos
      format.ts                 # ações da barra de formatação
    selection.ts                # tipos de seleção e descrição
    mutations/
      flow.ts  er.ts  raw.ts  md.ts

  features/
    diagram/
      DiagramScreen.tsx
      canvas/
        DiagramCanvas.tsx
        runtime.shell.html      # fonte
        runtime.html            # gerado no build (mermaid embutido)
        useRuntimeHtml.ts
        bridge.ts
      ActionBarController.tsx
      inspectors/
        NodeInspector.tsx    EdgeInspector.tsx    TableInspector.tsx
        ColumnInspector.tsx  RelationInspector.tsx  TextInspector.tsx
      composers/
        NodeComposer.tsx     TableComposer.tsx
    code/
      CodeEditor.tsx
      highlight.ts
    document/
      DocumentScreen.tsx
      MarkdownEditor.tsx   MarkdownPreview.tsx
      FormatBar.tsx        MermaidBlock.tsx      Outline.tsx
    gallery/
      GalleryScreen.tsx    TypeInfoSheet.tsx
    ai/
      AiSheet.tsx    useAi.ts    prompt.ts
    library/
      LibraryScreen.tsx    DocCard.tsx

  store/
    useDoc.ts        # documento aberto + seleção + histórico
    useLibrary.ts    # lista de documentos
    useSettings.ts   # tema, preferências
    history.ts       # undo/redo

  services/
    storage.ts   export.ts   share.ts   haptics.ts   ai.ts

  i18n/
    pt-BR.ts   en.ts   index.ts
```

**Por que isso escala.** Cada feature é uma pasta que se pode ler sozinha. O domínio é puro,
então testar a serialização de um fluxograma não exige montar componente nenhum. Os serviços
são fachadas finas: trocar SQLite por outra coisa mexe em um arquivo. E `design/` impede que
cada tela invente o próprio botão.

---

## 5. Sistema de design iOS

### 5.1 Tokens

```ts
// src/design/tokens.ts
export const palette = {
  dark: {
    blue:'#0A84FF', red:'#FF453A', green:'#30D158', orange:'#FF9F0A', indigo:'#5E5CE6',
    bg:'#000000',          // fundo do app e das listas agrupadas
    surface:'#1C1C1E',     // barras, linhas de lista, campos
    surface2:'#2C2C2E',    // preenchimento secundário
    surface3:'#3A3A3C',    // trilho de segmented, chips
    separator:'rgba(84,84,88,0.55)',
    separatorBold:'rgba(84,84,88,0.80)',
    label:'#FFFFFF',
    labelSecondary:'rgba(235,235,245,0.62)',
    labelTertiary:'rgba(235,235,245,0.34)',
  },
  light: {
    blue:'#007AFF', red:'#FF3B30', green:'#34C759', orange:'#FF9500', indigo:'#5856D6',
    bg:'#F2F2F7', surface:'#FFFFFF', surface2:'#FFFFFF', surface3:'#E5E5EA',
    separator:'rgba(60,60,67,0.24)', separatorBold:'rgba(60,60,67,0.34)',
    label:'#000000',
    labelSecondary:'rgba(60,60,67,0.60)',
    labelTertiary:'rgba(60,60,67,0.32)',
  },
} as const;

export const type = {
  largeTitle:{ fontSize:34, fontWeight:'700', letterSpacing:-0.8 },
  title:     { fontSize:22, fontWeight:'700', letterSpacing:-0.4 },
  headline:  { fontSize:17, fontWeight:'600', letterSpacing:-0.3 },
  body:      { fontSize:17, fontWeight:'400', letterSpacing:-0.2 },
  callout:   { fontSize:16, fontWeight:'400' },
  subhead:   { fontSize:15, fontWeight:'400' },
  footnote:  { fontSize:13, fontWeight:'400' },
  caption:   { fontSize:12, fontWeight:'400' },
} as const;

export const space = { xs:4, sm:8, md:12, lg:16, xl:24, xxl:32 } as const;
export const radius = { row:12, card:14, sheet:14, pill:999, control:9 } as const;

// a curva das sheets do iOS. Use em tudo que desliza.
export const easing = { sheet: [0.32, 0.72, 0, 1] as const, duration: 500 };
```

Fonte: não instale nada. `-apple-system` no iOS já é SF Pro; no Android, Roboto. Para
monoespaçada use `Platform.select({ ios:'Menlo', android:'monospace' })`.

### 5.2 Componentes base

Nove componentes cobrem o app inteiro. Construa-os antes de qualquer tela.

**`NavBar`** — 44pt + safe area, título centrado com legenda embaixo, ações em azul à
esquerda e à direita. Fundo `surface` com hairline inferior de 0.5pt.

**`Sheet`** — `@gorhom/bottom-sheet` com `BottomSheetModal`, snaps `['45%','92%']`, grabber
de 36×5, cantos de 14. Fundo `bg`, não `surface` — as linhas agrupadas por dentro é que são
`surface`. Detalhe que faz parecer nativo: **a tela de trás encolhe para 92,5% e ganha canto
arredondado** enquanto a sheet está aberta.

**`GroupedList` + `Row`** — a lista inset do iOS. Cartão de raio 12, separadores só entre
linhas e recuados 16pt à esquerda, altura mínima de 44pt, chevron nas linhas navegáveis.

**`Segmented`** — trilho `surface3`, raio 9, padding 2, pílula selecionada em `surface` com
sombra sutil. Use para Escrever/Ler e para o escopo da IA.

**`ActionBar`** — barra contextual (seção 11).

**`AlertDialog`** — alerta do iOS: 292pt de largura, raio 16, material desfocado, título
centrado 17/600, botões separados por hairline. Dois botões ficam lado a lado; três ou mais,
empilhados. É onde acontece toda edição de valor único.

**`Toast`** — cápsula escura translúcida acima da tab bar, some em 1,9s.

**`Fab`** — 56pt azul preenchido para a ação primária, 48pt material translúcido para as
secundárias.

**`Chip`** — cápsula translúcida com `backdrop-filter` equivalente (`BlurView`).

### 5.3 Regras que separam "parece nativo" de "parece site"

- **Feedback tátil em tudo.** `expo-haptics`: `ImpactFeedbackStyle.Light` ao selecionar,
  `Medium` ao criar, `NotificationFeedbackType.Warning` ao excluir. É metade da sensação.
- **Toque pressionado reduz opacidade**, não muda cor de fundo. `activeOpacity` ~0.45.
- **Alvos de 44pt.** Nada abaixo disso recebe toque.
- **Uma cor de acento só.** Azul do sistema. Vermelho é exclusivo de destrutivo; laranja, de
  estado transitório (modo conexão).
- **Respeite `prefers-reduced-motion`** com `AccessibilityInfo.isReduceMotionEnabled`.

---

## 6. Camada de domínio

### 6.1 Tipos

```ts
// src/domain/types.ts
export type DocKind = 'flow' | 'er' | 'raw' | 'md';

export type ShapeKey =
  | 'rect' | 'round' | 'stadium' | 'subroutine' | 'cylinder' | 'circle'
  | 'doublecirc' | 'rhombus' | 'hexagon' | 'parallel' | 'parallelR'
  | 'trapez' | 'trapezR';

export type LinkKey =
  | 'arrow' | 'open' | 'dotted' | 'dottedO' | 'thick' | 'thickO'
  | 'cross' | 'circleE' | 'bi';

export type Direction = 'TD' | 'TB' | 'LR' | 'BT' | 'RL';
export type ColumnKey = 'PK' | 'FK' | 'UK';

export interface FlowNode  { id: string; label: string; shape: ShapeKey; cls: string | null }
export interface FlowEdge  { id: string; from: string; to: string; label: string; type: LinkKey }
export interface FlowGroup { id: string; label: string; nodes: string[]; direction: Direction | null }
export interface NodeClass { id: string; fill: string | null; stroke: string | null; color: string | null; width: number }

export interface Column   { type: string; name: string; keys: ColumnKey[]; note: string }
export interface Table    { id: string; label: string; cols: Column[] }
export interface Relation {
  id: string; from: string; to: string;
  cardL: '||' | '|o' | '}o' | '}|';
  cardR: '||' | 'o|' | 'o{' | '|{';
  identifying: boolean; label: string;
}

interface Base { id: string; nome: string; criadoEm: number; atualizadoEm: number }

export interface FlowDoc extends Base {
  tipo: 'flow'; direction: Direction;
  nodes: FlowNode[]; edges: FlowEdge[]; groups: FlowGroup[]; classes: NodeClass[];
}
export interface ErDoc extends Base {
  tipo: 'er'; tables: Table[]; relations: Relation[];
}
export interface RawDoc extends Base {
  tipo: 'raw'; kind: string;   // rótulo amigável: "Sequência", "Gantt"
  code: string;
}
export interface MdDoc extends Base {
  tipo: 'md'; md: string;
}
export type Doc = FlowDoc | ErDoc | RawDoc | MdDoc;

export type Selection =
  | { kind: 'node';  id: string }
  | { kind: 'edge';  id: string }
  | { kind: 'table'; id: string }
  | { kind: 'col';   id: string }   // "TABELA#3"
  | { kind: 'rel';   id: string }
  | { kind: 'txt';   id: string };  // "inicio:fim" em offsets de caractere
```

### 6.2 Regra de ouro

**O texto Mermaid nunca é editado por regex durante a interação.** Ele é *derivado* do modelo
(`serialize`) e é *entrada* do modelo (`parse`). No momento em que alguém escrever
"é só um replace para trocar o rótulo", o editor começa a apodrecer.

A única exceção é o tipo `raw`, onde o código *é* o modelo — e aí a manipulação é por offsets
exatos de caractere, nunca por regex de conteúdo.

### 6.3 Serialização

```ts
export function serialize(d: Doc): string {
  switch (d.tipo) {
    case 'md':   return d.md;
    case 'raw':  return d.code;
    case 'er':   return serializeER(d);
    case 'flow': return serializeFlow(d);
  }
}
```

`serializeFlow` emite, nesta ordem: cabeçalho `flowchart <dir>`, nós fora de grupo,
`subgraph` para cada grupo, todas as arestas, `classDef` e `class`.

**A ordem importa e não é estética.** O mapeamento de aresta para modelo usa o índice no DOM,
que segue a ordem do código. Mudar a ordem de emissão quebra a seleção de linhas sem gerar
erro nenhum.

Rótulos sempre entre aspas, com `"` virando `#quot;` e quebra de linha virando `<br/>`.

`serializeER` emite bloco por tabela (`type nome PK "comentário"`) e depois as relações
(`A ||--o{ B : "verbo"`), com `..` no lugar de `--` quando não identificadora.

### 6.4 Parsing

```ts
export function parseMermaid(texto: string, nomeAtual = 'Diagrama'): Doc {
  const linhas = texto.split('\n').map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean);
  if (!linhas.length) throw new Error('Código vazio.');
  if (/^erDiagram\b/i.test(linhas[0]))          return parseER(linhas, nomeAtual);
  if (/^(flowchart|graph)\b/i.test(linhas[0]))  return parseFlow(linhas, nomeAtual);
  return rawDoc(nomeAtual, detectarTipo(linhas[0]), texto);   // nunca lança
}
```

**Não lançar erro em tipo desconhecido é uma decisão de produto**, não uma tolerância: é o
que faz "colar qualquer Mermaid" funcionar, inclusive tipos que a biblioteca ainda nem
suporta.

`parseFlow` precisa cobrir: direção, `subgraph`/`end`, `classDef`, `class`, treze formas de
nó, nove tipos de aresta, rótulo em `|texto|` e na forma `A -- texto --> B`, e encadeamento
`A --> B --> C`. Normalize setas longas (`--->` → `-->`) antes de tokenizar.

`parseER` precisa cobrir: bloco `TABELA { ... }`, linha de coluna `tipo nome [PK,FK] "nota"`,
e relação com as duas cardinalidades de dois caracteres cada.

**Teste que não pode faltar:**

```ts
it.each(TEMPLATES)('round-trip preserva %s', (tpl) => {
  const a = serialize(tpl());
  expect(serialize(parseMermaid(a))).toBe(a);
});
```

Se esse teste passar para os dois tipos visuais e a identidade `serialize(parse(x)) === x`
valer para os 23 tipos `raw`, a camada de domínio está sã.

### 6.5 Catálogo dos 25 tipos

`domain/mermaid/catalog.ts` — uma entrada por tipo:

```ts
export interface TipoDiagrama {
  id: string;
  nome: string;                 // "Sequência"
  grupo: 'Processo e fluxo' | 'Estrutura e arquitetura' | 'Hierarquia' | 'Tempo' | 'Dados e análise';
  kw: string;                   // "sequenceDiagram"
  visual?: boolean;             // só flow e er
  oque: string;                 // uma frase: o que é
  quando: string;               // uma frase: quando usar
  code?: string;                // exemplo pronto
}
```

Cobertura: flowchart, ER, sequência, classes, estados, jornada, kanban, git, C4, arquitetura,
blocos, requisitos, mapa mental, árvore de arquivos, treemap, Ishikawa, Gantt, linha do tempo,
pizza, XY, Sankey, quadrante, radar, Venn e pacote de rede.

ZenUML e Wardley existem no Mermaid mas dependem de plugins fora da biblioteca padrão. **Não
os coloque na galeria** — um card que nunca renderiza é pior que a ausência dele. Uma nota de
rodapé explicando basta.

### 6.6 Mutações

Puras, recebendo e devolvendo `Doc`. Facilita undo, testes e evita mutação acidental
compartilhada.

```ts
export function renameNode(doc: FlowDoc, de: string, para: string): FlowDoc {
  const d = structuredClone(doc);
  const n = d.nodes.find(x => x.id === de);
  if (!n) return doc;
  n.id = para;
  d.edges.forEach(e => { if (e.from === de) e.from = para; if (e.to === de) e.to = para; });
  d.groups.forEach(g => { const i = g.nodes.indexOf(de); if (i >= 0) g.nodes[i] = para; });
  return d;
}
```

Valide antes de aplicar: `/^[A-Za-z0-9_-]+$/` e ausência de duplicata. Um id inválido chegando
no serializer vira erro de sintaxe do Mermaid, e o usuário vê o diagrama sumir sem entender.

---

## 7. Estado

```ts
// src/store/useDoc.ts
interface DocState {
  doc: Doc;
  sel: Selection | null;
  past: string[];
  future: string[];
  linkMode: { ativo: boolean; de: string | null };
  retornoMd: { docId: string; md: string; ini: number; fim: number } | null;

  apply(fn: (d: Doc) => Doc | void): void;   // empilha undo
  applyLive(fn: (d: Doc) => void): void;     // digitação, não empilha
  commitLive(snapshot: string): void;        // no blur, empilha uma vez
  select(s: Selection | null): void;
  undo(): void;
  redo(): void;
}
```

**O par `applyLive` / `commitLive` não é otimização, é requisito.** Campo de texto dispara
`onChangeText` a cada caractere; empilhar undo por tecla torna o botão inútil. O padrão:
snapshot no `onFocus`, empilha no `onBlur` se mudou.

```ts
export function useLiveField(ler: (d: Doc) => string, escrever: (d: Doc, v: string) => void) {
  const snap = useRef<string | null>(null);
  const { doc, applyLive, commitLive } = useDoc();
  return {
    value: ler(doc),
    onFocus:      () => { snap.current = JSON.stringify(useDoc.getState().doc); },
    onChangeText: (v: string) => applyLive(d => escrever(d, v)),
    onBlur:       () => { if (snap.current) commitLive(snap.current); snap.current = null; },
  };
}
```

O código Mermaid enviado ao canvas é derivado, nunca guardado:

```ts
const code = useMemo(() => serialize(doc), [doc]);
```

Histórico limitado a 80 snapshots. `structuredClone` para o estado, `JSON.stringify` para o
histórico — comparar strings é o que torna barato detectar "mudou de verdade".

---

## 8. O canvas

### 8.1 Runtime offline

O app precisa funcionar em modo avião. O Mermaid minificado tem ~1 MB; embutir num único HTML
é a forma mais confiável de servir isso ao WebView nas duas plataformas.

```js
// scripts/build-runtime.mjs
import fs from 'node:fs';
const mermaid = fs.readFileSync('node_modules/mermaid/dist/mermaid.min.js', 'utf8');
const shell   = fs.readFileSync('src/features/diagram/canvas/runtime.shell.html', 'utf8');
fs.writeFileSync('src/features/diagram/canvas/runtime.html',
  shell.replace('/*__MERMAID__*/', mermaid));
```

```json
{ "scripts": { "runtime": "node scripts/build-runtime.mjs", "start": "npm run runtime && expo start" } }
```

O `runtime.shell.html` contém: config do Mermaid, `render`, mapeamento de toque, desenho da
seleção, e os gestos de pan/zoom. **Nada mais.** Sem sheets, sem formulários, sem export.

```ts
export function useRuntimeHtml() {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const asset = Asset.fromModule(require('./runtime.html'));
      await asset.downloadAsync();
      setHtml(await FileSystem.readAsStringAsync(asset.localUri ?? asset.uri));
    })();
  }, []);
  return html;
}
```

### 8.2 A ponte

```ts
export type ToWeb =
  | { t:'render'; code:string; theme:'dark'|'light'; tokens:Record<string,string> }
  | { t:'select'; sel:Selection | null }
  | { t:'reveal'; fracaoTopo:number }
  | { t:'fit' }
  | { t:'exportPng'; scale:number };

export type FromWeb =
  | { t:'ready' }
  | { t:'tap'; sel:Selection | null; duplo:boolean }
  | { t:'error'; message:string }
  | { t:'png'; base64:string };
```

**RN → WebView usa `injectJavaScript`, não `postMessage`.** Evita a diferença histórica entre
`document.addEventListener('message')` no Android e `window` no iOS.

```tsx
const enviar = (m: ToWeb) =>
  ref.current?.injectJavaScript(`window.__handle(${JSON.stringify(m)}); true;`);
```

O `true;` no fim não é decoração — sem ele o iOS reclama de valor de retorno não serializável.

Web → RN sempre `window.ReactNativeWebView.postMessage(JSON.stringify(...))`.

Props do WebView que economizam depuração:

```tsx
<WebView
  source={{ html, baseUrl:'' }} originWhitelist={['*']}
  scrollEnabled={false} bounces={false} overScrollMode="never"
  javaScriptEnabled domStorageEnabled={false}
  setSupportMultipleWindows={false} androidLayerType="hardware"
  style={{ flex:1, backgroundColor:'transparent' }}
/>
```

- `scrollEnabled={false}` e `bounces={false}` — senão o WebView disputa o gesto.
- Fundo transparente **no style e no `<body>`**. No Android o WebView pinta branco e pisca a
  cada re-render.
- Debounce o `render` em ~120 ms. Cada tecla digitada num rótulo não precisa rodar o dagre.

### 8.3 Tema do diagrama

Passe os tokens de cor na mensagem `render` e monte `themeVariables` do lado web, incluindo
`darkMode: true|false` e `background` com a cor real.

**Não deixe o Mermaid derivar sozinho.** Com `background:'transparent'` e sem `darkMode`, ele
calcula o fundo das faixas de atributo do ER pelo padrão claro e você acaba com cinza-claro
atrás de texto branco.

Use também `themeCSS`, que entra dentro do próprio SVG e por isso **vale no arquivo
exportado**, coisa que CSS externo não faz:

```
.er.entityBox, rect.entityBox        { fill:{surface};  stroke:{separatorBold}; }
.er.attributeBoxOdd                  { fill:{surface2}; stroke:{separatorBold}; }
.er.attributeBoxEven                 { fill:{surface3}; stroke:{separatorBold}; }
.er.entityLabel, .er.attributeLabel  { fill:{label} !important; }
.actor { fill:{surface2}; stroke:{separatorBold}; }
.messageText, .noteText, .labelText  { fill:{label}; }
```

E envolva o render numa rede de segurança: **se falhar com `themeCSS`, tente de novo sem
ele.** Perder a cor customizada é infinitamente melhor que perder o diagrama.

### 8.4 Gestos: deixe dentro do WebView

Tentador: envolver o WebView num `Animated.View` e aplicar pan/pinch com Reanimated.
**Não faça.** Escalar a view rasteriza o conteúdo — o texto vira borrão em qualquer zoom acima
de 1, porque o WebView foi desenhado uma vez e a GPU só estica o bitmap.

O jeito certo é `transform: translate3d(...) scale(...)` num `<div>` **dentro** do documento.
O SVG é vetorial, reescala nítido, e a resposta é imediata porque nada atravessa a ponte.

Gestos implementados no runtime: um dedo arrasta, dois dedos dão zoom, toque seleciona, toque
duplo em elemento abre o painel completo, toque duplo no vazio alterna entre enquadrar tudo e
160%. Detecção de toque duplo: 330 ms e 32 px do toque anterior.

---

## 9. Seleção: três camadas

Esta é a parte que mais deu trabalho no protótipo e a que mais quebra em atualização de
versão do Mermaid. Implemente as três camadas.

### Camada 1 — modelo (fluxograma)

Nós têm `data-id` (Mermaid 11+) ou `id="flowchart-<id>-<n>"` (10.x). Trate os dois.
Arestas: a ordem no DOM segue a do código, então o índice basta.

**Alvos de toque em linha são finos demais para dedo.** Clone cada `<path>` com
`stroke:transparent; stroke-width:26` numa camada de hit. Sem isso, acertar uma aresta no
celular é loteria.

### Camada 2 — geometria (modelo relacional)

A tabela do ER é uma pilha de retângulos: cabeçalho e uma faixa por coluna. Marcar só o grupo
do rótulo deixa o toque valendo **apenas em cima do nome** — foi exatamente o bug do protótipo.

Algoritmo, por tabela:

1. Ache o `<text>` cujo conteúdo normalizado é o nome da tabela.
2. Suba pelos grupos ancestrais **enquanto nenhum outro nome de tabela aparecer dentro**.
   Compare por texto exato, senão `ITEM_PEDIDO` é confundido com `PEDIDO`.
3. Se o grupo resultante não for mais alto que ~1,6× o cabeçalho, reconstrua o contorno
   juntando as formas empilhadas que compartilham a coluna horizontal do cabeçalho.
4. Cubra o retângulo resultante com um hit transparente `table:<id>`.
5. Agrupe os `<text>` abaixo do cabeçalho por altura — **a ordem vertical corresponde à ordem
   das colunas no modelo** — e crie uma faixa `col:<tabela>#<i>` por linha, com a largura toda.

Ordem de empilhamento: cabeçalho seleciona a tabela, faixa seleciona a coluna, e a barra de
ações da coluna tem **Tabela** a um toque. Não dá para ter os dois na mesma área — cada pixel
do corpo *é* uma coluna.

### Camada 3 — texto (os outros 23 tipos)

Todo elemento que alguém quer editar acaba sendo um pedaço de texto no código-fonte.

Para cada `<text>` do SVG, em ordem de documento:

1. Pegue o conteúdo aparado.
2. Ache a primeira ocorrência **ainda não usada** dele no código. A ordem do SVG acompanha de
   perto a do código, então isso resolve textos repetidos.
3. Se existir uma forma envolvendo o texto (cartão, barra, caixa do ator), **use a forma como
   alvo** em vez das letras. É a diferença entre usável e minucioso.
4. Crie um hit `txt:<inicio>:<fim>`.

Editar substitui exatamente aquele intervalo; o resto do código sai byte a byte igual.

Textos **gerados** pelo renderer (rótulos do eixo do Gantt, percentuais calculados da pizza)
não existem na fonte e portanto não são selecionáveis. Documente isso na interface.

### Rede de segurança

Se nenhuma camada mapear nada, avise e aponte para a lista de elementos. **Falha silenciosa
aqui é o que torna o bug difícil de achar.** E exponha, na tela de ajuda, qual versão do
Mermaid carregou — é o dado que explica um tipo recente não desenhar.

---

## 10. Chaves de seleção

Use `kind:id` com **corte no primeiro `:` apenas**:

```ts
const i = chave.indexOf(':');
const kind = chave.slice(0, i);
const id   = chave.slice(i + 1);
```

Um `split(':')` ingênuo quebra em `txt:120:134` e em `col:PEDIDO#2`. Foi bug real.

---

## 11. Barra de ações contextual

O componente que mais define a sensação do app.

**Selecionar não abre painel.** Aparece uma barra acima da tab bar com o elemento identificado
e uma fila horizontal de 5 a 7 ações. Trocar o texto de um nó são dois toques, não cinco.

```
┌──────────────────────────────────────────┐
│ ● n3 · Conferir nota fiscal          [×] │
│ [Texto][Conectar][Forma][Cor][IA][…]     │  ← scroll horizontal
└──────────────────────────────────────────┘
```

Em RN: uma `View` com entrada animada e uma `ScrollView horizontal` com
`showsHorizontalScrollIndicator={false}`. **Não use BottomSheet para isso** — a barra é
persistente e não-modal; transformá-la em sheet reintroduz o custo que ela existe para
eliminar.

Ações por tipo de seleção:

| Seleção | Ações |
|---|---|
| Nó | Texto · Conectar · Forma · Cor · Duplicar · IA · Excluir · Editar |
| Ligação | Rótulo · Inverter · Traço · IA · Excluir · Editar |
| Tabela | Colunas · Nome · Relacionar · Duplicar · IA · Excluir · Editar |
| Coluna | Nome · Tipo · Comentário · IA · Tabela · Excluir · Editar |
| Relação | Verbo · Cardinalidade · Inverter · IA · Excluir · Editar |
| Texto (raw) | Texto · Duplicar linha · IA · Código · Excluir linha · Editar |
| Modo conexão | "saindo de X — toque no destino" + Cancelar |

**Forma, Cor, Colunas e Cardinalidade abrem o painel completo já rolado até a seção certa.**
Guarde a posição de cada seção com `onLayout` e chame `scrollTo`. Sem isso o usuário abre o
painel e tem que procurar.

### Três superfícies, em peso crescente

1. **Barra contextual** — não-modal, para o que se faz o tempo todo.
2. **Alerta** — um valor só: texto do nó, rótulo, nome da tabela.
3. **Bottom sheet** — muitos controles: formas, cores, colunas, cardinalidade.

### Criação encadeada

O botão **+** não cria um nó genérico. Abre um compositor com campo de texto, seis formas
comuns, e três botões: Cancelar, **Adicionar e continuar**, Adicionar. O "continuar" cria o
nó, liga ao anterior e reabre o compositor apontando para o novo.

Dá para montar um fluxo de doze etapas sem sair do teclado. **É a única coisa no editor que
muda a produtividade em ordem de grandeza. Porte com prioridade.**

### Destrutivo

Confirma em alerta com botão vermelho **e** o toast depois diz que dá para desfazer. As duas
coisas juntas, não uma ou outra.

---

## 12. Editor de código com realce

Nenhuma biblioteca: CodeMirror pesa mais que o app.

**Técnica de sobreposição:** um `<Text>` colorido embaixo e um `TextInput` transparente por
cima, com só o cursor visível.

```tsx
<View style={s.wrap}>
  <Text style={[s.base, s.hl]} allowFontScaling={false}>{tokens.map(renderToken)}</Text>
  <TextInput
    style={[s.base, s.input]} value={code} onChangeText={setCode}
    multiline autoCapitalize="none" autoCorrect={false} spellCheck={false}
    allowFontScaling={false}
  />
</View>
// s.input: { color:'transparent' } no Android, e no iOS a mesma coisa; caretHidden={false}
```

**Funciona só se as duas caixas tiverem exatamente a mesma métrica:** `fontFamily`,
`fontSize`, `lineHeight`, `padding`, `letterSpacing`, e `allowFontScaling={false}` nos dois.
Se o tokenizador não devolver o texto byte a byte idêntico, o alinhamento desmonta — escreva
um teste para isso.

Tokenizador: sete classes, numa única regex com grupos nomeados, longest-first.

| Classe | Regra | Cor escuro / claro |
|---|---|---|
| comentário | `%%...` até o fim da linha | `#6E7681` / `#8A8F98`, itálico |
| string | `"..."` | `#7BD88F` / `#1E7F35` |
| cardinalidade | `[\|}o][\|o{](--|\.\.)[\|o{][\|o{]?` | `#64D2FF` / `#0062CC` |
| operador | `<?[-=.]{2,}[>xo]?` | idem cardinalidade |
| palavra-chave | lista fechada dos ~80 termos | `#FF7AB2` / `#A036C4`, 600 |
| número | `\b\d+(\.\d+)?\b` | `#FF9F0A` / `#B35A00` |
| delimitador | `[\[\]{}()]` e `[:,;\|@#]` | `#8E8E93` / `#6E6E73` |

No tipo `raw`, o código aplica sozinho com debounce de 420 ms. E se durante a digitação o
texto passar a começar com `flowchart` ou `erDiagram`, **o documento se converte para o modo
visual automaticamente**. Um caminho só, nas duas direções.

---

## 13. Documentos Markdown

### 13.1 O editor

No espírito do Notas: texto grande, sem moldura, sem numeração de linha. Um `Segmented` no
topo alterna **Escrever** e **Ler**.

`TextInput` multiline, 17pt, `lineHeight` 26, padding 18, fundo transparente, sem borda.

### 13.2 A barra de formatação

Doze botões numa `ScrollView horizontal`, colada ao teclado:

Título · Negrito · Itálico · Lista · Numerada · Tarefa · Citação · Código · Link · Tabela ·
**Diagrama** · Linha

Cada um age sobre a seleção (envolver) ou sobre as linhas do cursor (prefixo), como no Notas.
"Título" cicla `# → ## → ### → nenhum` na linha atual.

**A barra sobre o teclado é a parte que muda mais entre plataformas.**

- iOS: `InputAccessoryView` com `inputAccessoryViewID` no `TextInput`. É o caminho nativo e o
  que se comporta certo com o teclado interativo.
- Android: `InputAccessoryView` não existe. Use `react-native-keyboard-controller`
  (`KeyboardStickyView`), que também melhora o iOS.

Esconda a tab bar enquanto o campo está focado.

### 13.3 O renderizador

Escreva o seu, em `domain/markdown/render.ts`. Motivos: funciona offline, você controla a
extração dos blocos Mermaid, e escapa HTML por padrão.

Cobertura mínima: títulos até H4, negrito, itálico, riscado, `==destaque==`, código inline e
em bloco, links, imagens, citações, listas aninhadas por indentação, listas de tarefa,
tabelas com alinhamento e régua horizontal.

Duas armadilhas de regex:

- **Nada de lookbehind.** Safari abaixo de 16.4 lança `SyntaxError` na análise do script, e o
  app inteiro morre. Use grupo de captura: `/(^|[\s(])([*_])([^*_\n]+?)\2(?=$|[\s.,;:!?)])/`.
- **Proteja os code spans primeiro**, substituindo por sentinela, e restaure no fim. Senão
  `**` dentro de crase vira negrito.

Saída: em RN não há `dangerouslySetInnerHTML`. O renderizador deve devolver uma **árvore de
nós**, não HTML, e um componente mapeia nó → componente RN:

```ts
export type MdNode =
  | { t:'heading'; nivel:1|2|3|4; filhos:Inline[] }
  | { t:'paragraph'; filhos:Inline[] }
  | { t:'list'; ordenada:boolean; itens:MdItem[] }
  | { t:'quote'; filhos:MdNode[] }
  | { t:'code'; lang:string; corpo:string }
  | { t:'mermaid'; corpo:string; ini:number; fim:number }   // offsets no markdown
  | { t:'table'; cabecalho:Inline[][]; linhas:Inline[][][]; alinhamento:('left'|'center'|'right')[] }
  | { t:'hr' };
```

### 13.4 Diagramas embutidos — a integração

Um bloco ` ```mermaid ` vira, no modo Ler, um cartão com cabeçalho **Editar / Copiar** e o
diagrama renderizado por uma instância pequena do `DiagramCanvas` em modo somente-leitura.

Tocando em **Editar**:

```ts
function editarBloco(bloco: { corpo:string; ini:number; fim:number }) {
  useDoc.setState({ retornoMd: { docId: doc.id, md: doc.md, ini: bloco.ini, fim: bloco.fim } });
  abrirDoc(parseMermaid(bloco.corpo, doc.nome));
}

function voltarParaDocumento() {
  const r = useDoc.getState().retornoMd!;
  const md = r.md.slice(0, r.ini) + serialize(useDoc.getState().doc) + r.md.slice(r.fim);
  useDoc.setState({ retornoMd: null });
  abrirDoc({ ...docOriginal, md });
}
```

**Tudo depende do renderizador devolver o offset em caracteres de cada bloco.** Rastreie-os
acumulando o comprimento das linhas durante a análise, e escreva um teste que confira
`md.slice(ini, fim) === corpo` para cada bloco.

Enquanto `retornoMd` estiver preenchido, mostre um chip persistente **Voltar ao documento**
sobre o canvas.

### 13.5 Detalhes que valem

- **Caixas de tarefa clicáveis no modo Ler**, marcando o `[ ]` correspondente na fonte, com
  desfazer. Conte a ocorrência N de `- [ ]`/`- [x]` para saber qual trocar.
- Aba **Estrutura**: títulos com recuo por nível e diagramas embutidos. Tocar num título leva
  o cursor até lá; tocar num diagrama abre no canvas.
- Aba **Markdown**: texto puro, para colar algo pronto ou levar embora.
- Contagem de palavras e de diagramas na linha de estado.

---

## 14. Assistente de IA

### 14.1 A regra inegociável

**Nunca embarque chave de API no app.** Qualquer um extrai a chave de um bundle React Native
em minutos. A chamada vai para um backend seu, que guarda a chave e aplica limite de uso.

Com Expo Router você já tem rotas de API:

```ts
// src/app/api/diagrama+api.ts
export async function POST(req: Request) {
  const { prompt } = await req.json();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role:'user', content: prompt }],
    }),
  });
  return Response.json(await r.json());
}
```

Aplique no backend: limite por dispositivo, tamanho máximo de entrada, e timeout.

### 14.2 Escopo

Dois caminhos de entrada: botão no canvas (escopo = diagrama inteiro) e ação **IA** na barra
contextual (escopo = elemento selecionado). Um `Segmented` alterna entre os dois; a segunda
opção só aparece se houver seleção.

Com escopo no elemento, o pedido inclui a identificação exata do alvo e a ordem de não tocar
no resto:

```
Altere APENAS o nó de id `n3` (texto atual: "Conferir nota fiscal").
Todo o resto do código deve sair idêntico, linha por linha.
```

### 14.3 Validação antes de aplicar

**A resposta passa pelo `mermaid.parse` antes de virar diagrama.** Se não compilar, o erro
volta para o modelo numa segunda tentativa automática. Só então se aplica — e sempre via
`apply`, para que o desfazer reverta num toque.

```ts
let saida = await pedir(codigo, pedido, alvo);
let erro  = await validar(saida);
if (erro) { saida = await pedir(codigo, pedido, alvo, erro); erro = await validar(saida); }
if (erro) throw new Error('A IA devolveu um Mermaid que não compila:\n' + erro);
aplicar(saida);
```

Sem isso, uma resposta ruim quebra o diagrama sem volta.

### 14.4 Sugestões contextuais

Chips que mudam conforme a seleção: numa ligação, "Inverter o sentido"; numa tabela,
"Adicionar campos de auditoria"; numa coluna, "Sugerir um tipo melhor". Reduz o custo de
começar a escrever, que é onde a maioria desiste.

---

## 15. Persistência e biblioteca

Documento único é protótipo. **Biblioteca é produto.**

```sql
CREATE TABLE documentos (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  tipo          TEXT NOT NULL,          -- flow | er | raw | md
  subtipo       TEXT,                   -- "Sequência", "Gantt"
  json          TEXT NOT NULL,          -- o Doc serializado
  texto_busca   TEXT,                   -- rótulos e conteúdo, para busca
  atualizado_em INTEGER NOT NULL,
  fixado        INTEGER DEFAULT 0
);
CREATE INDEX idx_doc_data ON documentos(atualizado_em DESC);
```

`expo-sqlite` com a API assíncrona. MMKV é mais rápido mas exige development build — não roda
no Expo Go, o que atrasa o início.

**Tela inicial:** grade de cartões com miniatura, nome, tipo e data. Busca por nome e
conteúdo. Deslizar para excluir, com desfazer. Novo documento abre a galeria.

Salve com debounce de 600 ms após cada mudança **e** sempre que o `AppState` for para
`background`.

Miniatura: renderize o SVG uma vez ao salvar e guarde como arquivo em `documentDirectory`.
Regenerar a cada abertura da lista trava a rolagem.

---

## 16. Exportar e compartilhar

```ts
export async function exportarTexto(doc: Doc) {
  const ext = doc.tipo === 'md' ? '.md' : '.mmd';
  const uri = FileSystem.cacheDirectory + slug(doc.nome) + ext;
  await FileSystem.writeAsStringAsync(uri, serialize(doc));
  await Sharing.shareAsync(uri, { mimeType: doc.tipo === 'md' ? 'text/markdown' : 'text/plain' });
}
```

**PNG:** gere no lado web, onde já existe o SVG e um `<canvas>`, e devolva base64 pela ponte.
Escreva com `FileSystem.writeAsStringAsync(uri, base64, { encoding:'base64' })`.

Base64 de PNG grande atravessando a ponte é lento — um diagrama de 40 nós em 3× dá uns 2 MB e
trava a UI por meio segundo. Mostre progresso e limite `scale` a 3.

**Importar:** `expo-document-picker`. O iOS não tem UTI para `.mmd`, então filtre pela
extensão depois de ler o nome. `.md` e `.markdown` viram documento; o resto passa pelo
`parseMermaid`.

---

## 17. Acessibilidade e qualidade

- `accessibilityLabel` em todo botão só de ícone. Os da barra contextual e da barra de
  formatação são os mais críticos.
- `accessibilityRole="button"` e estados (`selected`, `disabled`).
- Alvos de 44pt.
- Contraste: os pares de token já atendem AA; se criar cor nova, verifique.
- **Dynamic Type**: deixe `allowFontScaling` ligado em toda a interface. Desligue **apenas**
  nas duas camadas sobrepostas do editor de código, onde escala diferente quebra o alinhamento.
- `AccessibilityInfo.isReduceMotionEnabled` corta as animações de sheet e da barra.
- O canvas é um WebView: forneça a lista de elementos como caminho alternativo de navegação.
  Não é acessório — é o que torna o app usável com VoiceOver.

---

## 18. Testes

Priorize o domínio, que é onde o valor está e onde testar é barato.

```
domain/mermaid/serialize.test.ts   round-trip dos templates visuais
domain/mermaid/parse.test.ts       cada forma, cada tipo de aresta, subgraph, classDef
domain/mermaid/catalog.test.ts     todo template começa pela própria keyword
domain/markdown/render.test.ts     offsets dos blocos: md.slice(ini,fim) === corpo
domain/markdown/format.test.ts     cada ação da barra é idempotente ao ser aplicada duas vezes
features/code/highlight.test.ts    o tokenizador devolve o texto byte a byte
store/history.test.ts              digitar não empilha; blur empilha uma vez
```

O teste de identidade do realce é o que impede o alinhamento das duas camadas de quebrar
silenciosamente.

Para as telas, `@testing-library/react-native` no que tem lógica: barra contextual mostra as
ações certas por tipo de seleção, e o compositor encadeia.

---

## 19. Se um dia for para o nativo

Vale só se arrastar nós virar requisito. Três frentes:

**Layout** — `@dagrejs/dagre` roda em JS puro, sem DOM. O ponto delicado é que ele precisa do
tamanho do nó *antes* de renderizar, e `react-native-svg` não expõe métrica síncrona.
Estime (`largura ≈ 8.2 × caracteres` para 14pt, quebrando em ~22 por linha) ou renderize
invisível, meça com `onLayout` e refaça o layout. Estimar é mais rápido e erra pouco com
fonte fixa.

**Formas** — as treze viram componentes `react-native-svg`. Diamante e hexágono são
`<Polygon>`, cilindro é `<Path>` com dois arcos, o resto é `<Rect rx>`. Reserve um dia.
`<Marker>` para as setas exige `react-native-svg` 13+.

**Arrastar** — aqui o nativo brilha. Guarde o deslocamento manual no modelo (`node.dx`,
`node.dy`) e some depois do layout, para que o automático continue valendo nos nós não tocados.

Parser e serializer não mudam. Só a renderização.

---

## 20. Armadilhas conhecidas

- **`htmlLabels: false` é obrigatório.** Com labels em HTML o SVG contém `<foreignObject>`,
  que `canvas.drawImage` ignora silenciosamente — o PNG sai sem texto nenhum.
- **`useMaxWidth: false` também**, senão o Mermaid injeta `max-width` inline e o zoom para de
  funcionar acima de 100%.
- **`mermaid.render` deixa lixo no DOM** em erro de sintaxe. Limpe antes de cada render.
- **A ordem dos elementos no SVG segue a do código.** É como as arestas são mapeadas. Mudar a
  ordem de emissão no serializer quebra a seleção sem erro visível.
- **`data-id` nos nós só existe no Mermaid 11.** Na 10 derive do `id`.
- **Mudar de tema exige `mermaid.initialize` de novo.** Trocar variável de cor não repinta um
  SVG já gerado.
- **`A --> B & C`** não é suportado pelo parser do protótipo. Ou implemente, ou avise no erro.
- **Emoji e acento em identificador** quebram o Mermaid. Valide no campo, não no serializer.
- **Chave de seleção com mais de um `:`** — corte no primeiro, sempre.
- **Lookbehind em regex** mata o app em Safari antigo.
- **Escalar o WebView borra o conteúdo.** Zoom acontece dentro dele.

---

## 21. Ordem de construção

Cada passo entrega algo que dá para usar, o que ajuda a decidir onde gastar o resto do tempo.

| # | Entrega | Dias |
|---|---|---|
| 1 | Domínio: tipos, serialize, parse, catálogo, testes de round-trip. Sem UI. | 1,5 |
| 2 | Design system: tokens, tema, os nove componentes base. | 2 |
| 3 | `runtime.html` + `DiagramCanvas` renderizando um template fixo. | 0,5 |
| 4 | Ponte de toque: tocar num nó e ver o id numa `Text`. | 0,5 |
| 5 | Store zustand + aba de código com realce. **Aqui já é usável por quem sabe Mermaid.** | 1,5 |
| 6 | Barra contextual + alertas + compositor encadeado. | 2 |
| 7 | Inspetores de nó e aresta. | 1,5 |
| 8 | Camadas 2 e 3 de seleção: ER geométrico e texto genérico. | 2 |
| 9 | Inspetores de tabela, coluna e relação. | 1,5 |
| 10 | Galeria dos 25 tipos com explicação. | 1 |
| 11 | Documentos Markdown: editor, barra, renderizador. | 3 |
| 12 | Diagramas embutidos e a ida e volta. | 1,5 |
| 13 | Biblioteca com SQLite, busca e miniaturas. | 2 |
| 14 | Exportar, compartilhar, importar. | 1 |
| 15 | IA com backend próprio. | 1,5 |
| 16 | Acessibilidade, Dynamic Type, reduced motion, polimento. | 2 |

Do passo 5 em diante existe um produto. Os passos 6 e 12 são os que os usuários vão citar
quando falarem bem do app.

---

## 22. Checklist de entrega

- [ ] `serialize → parse → serialize` idêntico nos templates visuais (teste automatizado)
- [ ] Identidade preservada nos 23 tipos em modo `raw`
- [ ] Offsets dos blocos Mermaid batem com o recorte do markdown
- [ ] Tokenizador do realce devolve o texto byte a byte
- [ ] Renderiza sem rede (avião ligado)
- [ ] Undo/redo não empilha por tecla digitada
- [ ] Elemento selecionado fica visível acima da sheet
- [ ] Teclado não cobre o campo em foco, iOS e Android
- [ ] Erro de sintaxe mostra a mensagem e mantém o último diagrama válido
- [ ] PNG exportado contém o texto dos nós
- [ ] Tema segue o sistema até o usuário escolher, e aí persiste
- [ ] Faixas de atributo do ER legíveis nos dois temas, inclusive no arquivo exportado
- [ ] Toque em aresta funciona com o dedo, não só com mouse
- [ ] Toque em qualquer coluna do ER seleciona aquela coluna
- [ ] Toque em elemento funciona nos 25 tipos
- [ ] Diagrama editado a partir de um documento volta para o bloco certo
- [ ] Nenhuma chave de API no bundle
- [ ] VoiceOver navega o app inteiro, canvas incluso
- [ ] Documento sobrevive a fechar e reabrir
- [ ] Rotação reajusta o enquadramento
