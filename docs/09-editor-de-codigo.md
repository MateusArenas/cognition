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
