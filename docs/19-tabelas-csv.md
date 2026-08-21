# Tabelas — editor de CSV (6º tipo de documento)

> Status: **implementado**. Referências: `tabelas.html` (protótipo funcional completo, a mesma
> função que `editor-mermaid.html` tem pro resto do app) e `plano-editor-csv-expo.md` (plano
> técnico escrito pra um app RN standalone do zero — ver "Desvio do plano de referência" abaixo,
> mesmo espírito do desvio já registrado em `docs/16-rabisco.md`).

Sexto tipo de documento (`csv`, junto de `flow`/`er`/`raw`/`md`/`rabisco`) — uma grade tipo
Numbers: toque numa célula pra selecionar, edita na barra de fórmulas, fórmulas com `SOMA`/
`MÉDIA`/`SE`/etc., redimensionar coluna arrastando a divisa do cabeçalho, importar de arquivo ou
colar texto, exportar escolhendo `,` ou `;`. Pedido do usuário: "quero um editor de csv... que
dá pra importar editar ou começar do zero... aceite dois tipos de formatação... vírgula e ponto
e vírgula... nos mesmos princípios dos meus docs".

## Decisão de arquitetura: nativo RN, não WebView

`docs/01-decisao-arquitetura.md` só escolhe WebView porque "Mermaid não tem porta nativa" — e
diz explicitamente pra ir nativo "se arrastar/manipular geometria livremente for requisito de
negócio". Numa grade de planilha, tocar/arrastar célula por célula É a interação central —
mesma razão que levou o Rabisco a ser Skia nativo em vez de WebView (`docs/16-rabisco.md`). Aqui
nem Skia é necessário (não há desenho livre): `react-native-gesture-handler` +
`react-native-reanimated` (já dependências, já usadas pelo Rabisco) + `@shopify/flash-list`
(dependência nova, `npx expo install`, confirmada Expo-Go-safe) bastam.

## Desvio deliberado do plano de referência

`plano-editor-csv-expo.md` foi escrito pra um app standalone do zero — inventa `create-expo-app`
próprio, store zustand+immer própria, persistência própria, navegação própria. Nada disso foi
portado — o app já tem tudo isso de forma genérica sobre `Doc` (mesmo raciocínio do Rabisco):

- `store/useDoc.ts` (`apply`/`applyLive`/`commitLive`/undo/redo) já funciona pra `CsvDoc` sem
  mudar uma linha — zero código de store novo.
- `services/storage.ts` (SQLite, `json TEXT` = `JSON.stringify(doc)`) já aceita `tipo: 'csv'`
  sem mudança de schema.
- `design/tokens.ts` + os componentes do design system (`Sheet`, `GroupedList`, `Row`,
  `Segmented`, `Field`, `RowSwitch`, `AlertDialog`, `TintedButton`, `Toast`) são o "parece
  nativo" do app — os tokens CSS do protótipo (`--tint`, `--sep`, `--header-fill`) foram só
  referência de valores, não portados como sistema à parte.
- `services/export.ts`/`import.ts` (write+share, document-picker) são o padrão de I/O a seguir,
  não reinventado.

Isso reduziu o escopo real: só faltava a camada de domínio (parser CSV, motor de fórmulas,
mutações), a grade virtualizada com gestos, e a UI de menus/import/export.

## Decisão confirmada com o usuário: uma tabela por documento

O plano de referência modela o arquivo como um "caderno" com várias tabelas (abas). Um `.csv`
de verdade só tem uma tabela — perguntado ao usuário via `AskUserQuestion`, escolhida a opção
mais simples: **sem tira de abas, sem menu de tabela**. `CsvDoc` guarda `cells`/`headerRow`/
`wrap`/`colWidths`/`delimiter` direto (sem indireção `sheets[active]`).

## Domínio — `editor/src/domain/csv/`

`CsvDoc` (em `domain/types.ts`, junto dos outros 5 tipos): `{ tipo: 'csv', cells: string[][],
headerRow, wrap, colWidths: number[], delimiter: ',' | ';' }`. Célula guarda a string CRUA,
exatamente como digitada ("12,90" | "=SOMA(A1:A9)" | "") — mesma regra de ouro do domínio
(`docs/04-dominio.md`): o valor calculado é sempre DERIVADO em render (`evaluateSheet`), nunca
escrito de volta na célula.

- `csv.ts` — `parseCSV`/`toCSV`/`detectDelim` (RFC 4180 à mão, ~30 linhas, sem `papaparse`) +
  `sheetToText(doc, delim)` (fórmulas já calculadas, BOM prefixado quando `;`). Porte quase
  literal do protótipo.
- `formula.ts` — parser recursivo descendente sem `eval()`: `tokenize`/`evalFormula`/`parseRef`/
  `numval`/`fmtNum`/`colName`/`colIndex`, `FUNCS` (SOMA/MÉDIA/MÍN/MÁX/CONT/ARRED/ABS/INT/RAIZ/
  MULT, nomes PT+EN), `SE`/`IF`. Separador de argumento aceita `,` E `;` (hábito do Excel
  brasileiro) — decimal em FÓRMULA é sempre ponto, já que a vírgula é separador ali dentro; na
  CÉLULA (valor literal), vírgula decimal é aceita via `numval`. `evaluateSheet(cells)` — cache
  por célula + detecção de ciclo (`#CICLO`), erros como string (`#REF!`/`#NOME?`/`#DIV/0!`/
  `#SINTAXE`) pra célula só checar `valor[0] === '#'`. `shiftFormula` desloca referência
  relativa (usado por "preencher para baixo").
- `mutations.ts` — puras, `structuredClone`, mesmo estilo de `mutations/flow.ts`: `setCell`/
  `insertRow`/`insertCol`/`deleteRows`/`deleteCols`/`clearRange`/`fillDown`/`sortBy`/
  `setColWidth`/`toggleWrap`/`toggleHeaderRow`/`setDelimiter`/`pasteRange`. Inserir/apagar linha
  ou coluna nunca deixa a tabela com 0 — vira no-op (mesma proteção do protótipo).
- `geometry.ts` — `colOffsets`/`colAt` (busca binária)/`rowAt`, `ROW_H`/`GUTTER_W`/`HEADER_H`
  fixos. Altura de linha fixa é decisão consciente (mesma do plano de referência §10.1): hit-test
  O(1), congelamento de header/gutter sem medir nada em tempo real.

`domain/mermaid/factory.ts` ganhou `blankCsv(nome?)` (30×8 em branco) e `csvDocFromText(text,
nome, headerRow, delimiter?)` (constrói a partir de texto já lido, detectando separador sozinho)
— mesma casa dos outros `blank*`, apesar do nome do arquivo. `domain/exportMeta.ts` e
`domain/searchText.ts` ganharam um braço `'csv'` cada (o TypeScript aponta sozinho todo switch
exaustivo que falta um braço, ao adicionar `CsvDoc` à união `Doc`).

## Grade — `editor/src/features/csv/`

**Composição**: `Animated.ScrollView` horizontal (rola as colunas) contendo `HeaderRow` (fora da
`FlashList` → não rola verticalmente) + `FlashList` vertical de `GridRow`. Cabeçalho de coluna e
gutter (numeração de linha) ficam "congelados" via `useAnimatedStyle`/`translateX` que anula o
scroll horizontal SÓ neles — o `View` do gutter/canto continua um filho flex NORMAL (ocupa
`GUTTER_W` de espaço de verdade, empurrando as células de dado) e só a PINTURA é deslocada pelo
`transform`; `zIndex`+`elevation` (Android precisa dos dois) garantem que pinta por cima das
células que passam "por baixo". **Confirmado ao vivo no simulador**: rolar horizontal mantém a
coluna de números (1, 2, 3…) perfeitamente parada enquanto A/B/C/D viram E/F/G — o mecanismo
mais arriscado desta feature (porte de um padrão nunca usado antes neste código, adaptado do
plano de referência §10.3) funcionou de primeira.

**`@shopify/flash-list` 2.x**: `estimatedItemSize` não existe mais nessa major (auto-mede) —
diferença descoberta só ao rodar `tsc`, corrigida removendo o prop (o plano de referência foi
escrito pensando numa versão anterior da lib).

**Edição — desvio deliberado do plano de referência**: em vez de um `TextInput` flutuante
posicionado exatamente sobre a célula (exigiria acompanhar scroll horizontal E vertical de uma
`FlashList` virtualizada — matemática frágil de calibrar sem repetidas idas ao simulador), a
edição acontece na **barra de fórmulas** (`FormulaBar.tsx`), sempre visível: um único campo
ligado à célula-âncora da seleção, exatamente onde apps de planilha no celular (Sheets/Excel)
já colocam a superfície principal de edição. Tocar a célula na grade troca a seleção e foca a
barra — mesmo resultado final do protótipo (editar a célula tocada), caminho bem mais robusto.
Usa `useLiveField` (já genérico, `store/useDoc.ts`) — snapshot no foco, `applyLive` a cada
tecla (sem empilhar undo), `commitLive` no blur (UM passo de undo pra edição inteira da célula).

**Seleção** não é o `Selection` genérico do domínio (aquele é pra elementos `kind:id` dos
diagramas Mermaid) — estado próprio da tela (`r1,c1,r2,c2`), sempre uma célula única, uma linha
inteira (toque no gutter) ou uma coluna inteira (toque no cabeçalho). **Simplificação
deliberada em relação ao protótipo**: sem arraste de alça pra selecionar um retângulo arbitrário
(o `.handle.br` do protótipo) — a alça de canto é pequena e frágil de acertar num celular real,
e as três formas de seleção suportadas já cobrem os casos reais (fórmula digitada com um
intervalo tipo `A1:C1` não depende de seleção nenhuma na UI; estatísticas/preencher/limpar
funcionam sobre linha ou coluna inteira).

**Redimensionar coluna**: `Gesture.Pan` na alça da divisa do cabeçalho (`HeaderRow.tsx`) — só o
`useSharedValue` muda durante o arrasto, commit no store (`setColWidth`) só no `onEnd`. Mesmo
princípio de "preview local, um único `apply()` no fim do gesto" que todo o Rabisco já usa.

Arquivos: `CsvScreen.tsx` (NavBar + FormulaBar + StatsBar + Grid + Toolbar/KeyboardBar,
esqueleto igual a `RabiscoScreen.tsx`), `Grid.tsx`, `GridRow.tsx`, `Cell.tsx` (`React.memo` com
comparador explícito), `HeaderRow.tsx`, `FormulaBar.tsx`, `KeyboardBar.tsx` (barra de acessório
do teclado: `= + − × ÷ ( ) : ;` e `SOMA/MÉDIA/MÍN/MÁX/SE` — `InputAccessoryView` no iOS
confirmado ao vivo; `View` absoluta reagindo a `Keyboard.addListener('keyboardDidShow', ...)`
no Android, já que `InputAccessoryView` só existe no iOS), `Toolbar.tsx` (barra inferior sempre
visível — Desfazer/Refazer/Linha/Coluna/Ordenar; diferente de `ActionBar`, que é contextual-por-
seleção, outro caso de uso, ver `docs/03-design-system.md`), `StatsBar.tsx` (soma/média/mín/
máx/cont da seleção, só aparece com mais de uma célula), `Menus.tsx` (menu de célula/linha/
coluna/"mais" — `Sheet`+`GroupedList`+`Row`, o padrão da casa pra "action sheet", confirmado
pela pesquisa: não existe um componente `ActionSheet` dedicado no design system),
`ImportSheet.tsx`, `ExportSheet.tsx`.

## Importar / exportar — aceita e produz `,` e `;`

- **Importar** (`ImportSheet.tsx`): duas vias — escolher arquivo (`expo-document-picker`,
  `.csv`/`.txt`/`text/csv`/`text/plain` + o UTI `public.comma-separated-values` pro iOS não
  deixar o arquivo cinza) ou colar texto. `detectDelim` decide sozinho o separador. Encoding:
  tenta UTF-8, se aparecer o caractere de substituição (`�`) refaz como ISO-8859-1 — a armadilha
  nº 1 de CSV brasileiro. Decodificador base64→Latin-1 escrito à mão em ~15 linhas (`atob` não é
  garantido global no runtime Hermes do RN, sem polyfill neste projeto — trazer uma lib só pra
  isso seria peso à toa); verificado com um script Node isolado antes de entrar no app,
  incluindo os casos de padding de 1/2/3 bytes. Também registrado em `services/import.ts`
  (`importarDocumento()` genérico, braço `.csv` — `.txt` fica de fora de propósito ali, pode ser
  Mermaid raw solto, o fallback de sempre; o `ImportSheet` da própria feature aceita `.txt`
  explicitamente, onde o contexto não deixa dúvida).
- **Exportar** (`ExportSheet.tsx`): `Segmented` Vírgula/Ponto e vírgula (default = último
  separador usado), prévia em `Field mono` atualizada ao trocar, "Salvar arquivo"
  (`expo-file-system`+`expo-sharing`, `services/export.ts#exportarCsv`) e "Copiar" (clipboard).
  **Fórmulas exportam já calculadas** — CSV não tem fórmula, `sheetToText` usa `evaluateSheet`,
  nunca a string crua. BOM prefixado quando o separador é `;`, pro Excel abrir com acentuação
  correta sem perguntar encoding.

## Biblioteca e Galeria

`app/doc/[id].tsx` ganhou `if (doc.tipo === 'csv') return <CsvScreen/>` e o id especial
`csv-novo` (mesmo padrão de `rabisco-novo`). `GalleryScreen.tsx` ganhou o grupo "Tabelas" com
dois cartões: "Em branco" (`blankCsv`) e "Importar CSV…" (abre o mesmo `ImportSheet` da tela do
editor, direto da galeria — cobre o "dá pra importar" do pedido sem esperar o usuário abrir uma
tabela em branco primeiro). `library.types.csv` novo (`DocCard.tsx` já era genérico).

## Testes

Cobertura completa do domínio (TypeScript puro, sem UI) — `csv.test.ts` (round-trip parse↔toCSV,
aspas escapadas, CRLF, BOM, os 3 separadores), `formula.test.ts` (cada função, intervalo, `,`/`;`
como separador de argumento, decimal célula-vs-fórmula, todos os erros, `evaluateSheet`
cache/ciclo direto e indireto), `geometry.test.ts` (offsets, busca binária, casos de borda),
`mutations.test.ts` (cada mutação pura, proteção contra 0 linhas/colunas), mais testes de
`blankCsv`/`csvDocFromText` (`domain/mermaid/factory.test.ts`) e extensão dos testes existentes
de `exportMeta`/`searchText` com o braço `csv`. Sem RTL/jest pra grade em si — mesmo motivo já
documentado no plano de referência §18 e confirmado pelo precedente do Rabisco ("grade
virtualizada não se testa bem em jsdom"); a grade foi verificada ao vivo no simulador em vez
disso (ver seção anterior).

**Verificado ao vivo no simulador** (iPhone 15 Pro Max, screenshots em cada passo): criar tabela
em branco (30×8, cabeçalho ligado por padrão), tocar célula B2 selecionando e atualizando a
barra de fórmulas, long-press abrindo o menu de célula (Editar/Preencher para baixo/Limpar
conteúdo), "Editar" focando a barra de fórmulas com o `KeyboardBar` (acessório iOS) aparecendo
com todos os operadores/funções, rolar a grade horizontalmente com o gutter permanecendo
perfeitamente parado, "Mais" abrindo o menu da tabela com os switches refletindo o estado real
do documento (cabeçalho ligado, quebra de texto desligada), "Exportar CSV…" mostrando o seletor
de separador e a prévia calculada corretamente.

## Bug real achado depois, ao vivo: grade vazando por baixo da Toolbar

Usuário reportou que os botões da barra inferior (Desfazer/Refazer/Linha/Coluna/Ordenar)
apareciam "por cima" da grade, sobrepondo a última linha visível — "parece bugado". Confirmado
com screenshot: dava pra ver linhas de coluna da grade continuando visualmente dentro da área
da Toolbar. Causa raiz: `flex: 1` sozinho não propaga uma altura confiável através de um
`ScrollView` HORIZONTAL contendo uma `FlashList` VERTICAL por dentro — a `FlashList` não tinha
teto real nenhum, só uma suposição de flex que o `ScrollView` no meio do caminho não repassava
direito, deixando o conteúdo desenhar além da área que a `Toolbar` (um filho flex normal, logo
abaixo) reservava pra si.

Corrigido em `Grid.tsx`: mede a altura real do container com `onLayout` e aplica como número
fixo (`style={{ height }}`) no `Animated.ScrollView` e no `View` de conteúdo — trava um teto de
verdade que a `FlashList` por dentro respeita, em vez de depender de flex propagando através da
fronteira do `ScrollView`. Aproveitado o mesmo pedido pra dar uma cara mais "Apple/iPhone" na
`Toolbar`: virou um painel de vidro fosco (`BlurView`, como o `.bottom{backdrop-filter:blur
(20px)}` do protótipo já pedia) com cantos arredondados no topo e sombra sutil pra cima —
continua um filho flex normal (não `position:absolute`), então a grade automaticamente ganha só
o espaço que sobra, sem precisar de nenhuma medição/repasse de altura entre os dois
componentes. **Confirmado ao vivo**: antes a linha 16 vazava atrás da barra; depois do fix, a
grade para de desenhar limpa antes da linha 15, com corte visual correto acima do painel.

`npx tsc --noEmit` limpo (só o erro pré-existente e não-relacionado de `Canvas.tsx`, já
documentado) e `npx vitest run` verde.
