# Editor de código com realce

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §12.
> Status: **implementado** (Etapa 5) em `editor/src/features/code/`.

Nenhuma biblioteca — CodeMirror pesa mais que o app. **Técnica de sobreposição:** um `<Text>`
colorido embaixo e um `TextInput` transparente por cima, com só o cursor visível.

**Funciona só se as duas caixas tiverem exatamente a mesma métrica** (`fontFamily`, `fontSize`,
`lineHeight`, `padding`, `letterSpacing`, `allowFontScaling={false}` nos dois). Se o
tokenizador não devolver o texto byte a byte idêntico, o alinhamento desmonta — precisa de
teste dedicado (ver [13-qualidade-e-testes.md](13-qualidade-e-testes.md)).

## Tokenizador

Sete classes, numa única regex com grupos nomeados, longest-first: comentário (`%%...`),
string (`"..."`), cardinalidade, operador, palavra-chave (~80 termos fechados), número,
delimitador. Cores diferentes por tema (dark/light) — ver a tabela completa na spec §12.

No tipo `raw`, o código aplica sozinho com debounce de 420ms. **Se durante a digitação o texto
passar a começar com `flowchart` ou `erDiagram`, o documento se converte para o modo visual
automaticamente** — um caminho só, nas duas direções, usando `parseMermaid` de
[04-dominio.md](04-dominio.md).

**Bug real: focar o `TextInput` e o teclado só sobrepunha o editor, sem encolher nada**
(reportado pelo usuário: "ajuste a tela como avoid keyboard... ta bugando fica sobrepondo").
`CodeEditor` é um `TextInput` multiline `flex:1` sem nenhum tratamento de teclado próprio — a
aba "Código" (`DiagramScreen`) só o envolvia numa `View` comum. Corrigido trocando essa `View`
por `KeyboardAvoidingView` (`react-native-keyboard-controller` — a mesma lib já usada no
editor de markdown, `behavior="padding"`) — a área disponível encolhe pra caber acima do
teclado, e o cursor fica visível dentro dela.

**Bug real: rolar dava a impressão de escrolar, mas o texto colorido ficava parado no lugar**
(reportado pelo usuário: "ta escrolando mas o texto nao desce junto"). O `<Text>` de realce e o
`TextInput` eram irmãos soltos dentro do `wrap` — o `TextInput` (multiline, scroll nativo
ligado por padrão) rolava por conta própria quando o código passava do tamanho da tela, mas o
`<Text>` absoluto por baixo (o que o usuário efetivamente enxerga, já que o texto do
`TextInput` é transparente) nunca se movia, sempre desenhado a partir do topo do `wrap`.
Corrigido pondo os dois dentro do mesmo `ScrollView` (`scrollEnabled={false}` no `TextInput` —
ele só cresce com o conteúdo, sem rolar por conta própria) — como sobem e descem juntos como
uma unidade só, nunca mais desalinham.

## Barra colada ao teclado

`CodeKeyboardBar` (`features/code/CodeKeyboardBar.tsx`) — desfazer/refazer (mesma ação do HUD
do canvas, [06-canvas.md](06-canvas.md)) e Confirmar, que só chama `Keyboard.dismiss()`: isso já
tira o foco do `TextInput` (cursor some) e dispara o `onBlur` existente (`commitCode`), sem
precisar de ref pro editor. Colada ao teclado com `KeyboardStickyView`, mesmo padrão já usado
na barra de formatação do editor de markdown ([10-markdown.md](10-markdown.md)). Os três botões
são só ícone (`undo`/`redo`/`check`, 22pt) — a primeira versão tinha rótulo "Confirmar" ao lado
do ícone; o usuário pediu só ícone, e um tamanho não tão compacto quanto a segunda versão
tinha ficado.

Visual: cápsula flutuante com `BlurView` (mesma linguagem do `Chip`/`ActionBar`, §5.2) — não
uma barra full-bleed colada nas bordas. Margem de 2pt uniforme no `wrap` (ajustada depois de
grandes demais na primeira versão), cantos arredondados (`radius.card`), sombra sutil no `wrap`
(não no `BlurView` — `overflow:'hidden'` do blur cortaria a própria sombra, por isso a sombra
mora num `View` externo sem clip e o blur com raio+clip fica num filho por dentro).

**Bug real: a barra ficava longe demais do teclado** (reportado pelo usuário: "a toolbar ainda
está muito longe do keyboard"). `KeyboardStickyView` sozinho já cola sem gap nenhum — o
afastamento vinha inteiro de um `marginBottom: insets.bottom` no `wrap`, aplicado igual com o
teclado aberto OU fechado. Fechado isso está certo (o home indicator ocupa esse espaço físico);
aberto, o próprio teclado já vai até o fim da tela — não sobra `insets.bottom` nenhum ali, só
empurrava a barra pra longe à toa. Corrigido com o prop `offset` do `KeyboardStickyView`
(`{closed: -insets.bottom, opened: 0}`) — `insets.bottom` só entra quando fechado; aberto, a
barra cola direto no teclado, só com a margem fixa de 2pt do `wrap`.

**Bug real: a barra cobria a última linha visível do editor.** `KeyboardAvoidingView`
(`behavior="padding"`) só sabe compensar a altura do TECLADO — não tem ideia de que
`CodeKeyboardBar` existe flutuando por cima dele, com altura própria. Corrigido medindo a
altura real da barra via `onLayout` (guardada em `DiagramScreen`) e passando como
`keyboardVerticalOffset` no `KeyboardAvoidingView` do editor — matematicamente equivalente a
somar essa altura à do teclado no cálculo de padding da lib (`relativeKeyboardHeight = keyboard
+ keyboardVerticalOffset` quando a view vai até o fim da tela), mesmo o prop tecnicamente
significar "distância do topo da tela" na documentação da lib. Detalhe fino: `onLayout` não
inclui a própria `marginBottom` do elemento — sem somar isso também, a compensação ficava
subestimada bem por pouco (a última linha aparecia cortada atrás da barra).

**Bug real: borda azul de foco e costura de cor entre o editor e o fundo por trás do
teclado** (pedido do usuário: "não quero borda por volta do código" + "quero que o fundo atrás
do keyboard seja a mesma cor do fundo do código"). `CodeEditor` tinha um `wrap` em cartão —
`borderRadius`, `borderWidth`, e borda azul quando focado — pedido removido por completo (sem
cartão, sem borda, só a cor de fundo `colors.surface` preenchendo tudo). A "costura" vinha de
`CodeKeyboardBar` ser um `BlurView` — o que aparece por trás do blur é o que estiver
*fisicamente atrás dele na tela*, e antes isso era o `colors.bg` (preto) do `root` do
`DiagramScreen`, diferente do `colors.surface` (cinza escuro) do editor logo acima. Corrigido
envolvendo o editor **e** a `CodeKeyboardBar` juntos numa `View` com `backgroundColor:
colors.surface` — agora o blur revela a mesma cor de fundo do código, sem salto visível.
