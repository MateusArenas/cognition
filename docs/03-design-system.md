# Sistema de design iOS

> Fonte completa (tokens exatos, código dos componentes): [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §5.
> Status: **implementado** (Etapa 2) em `editor/src/design/`.

## Tokens

Paleta de cores do sistema iOS (dark e light), tipografia (`largeTitle` a `caption`),
espaçamento (`xs` a `xxl`), raios (`row`, `card`, `sheet`, `pill`, `control`) e a curva de
easing das sheets do iOS (`cubic-bezier(.32,.72,0,1)`, 500ms). Tudo em
`editor/src/design/tokens.ts` — código exato na spec §5.1.

Fonte: não instale nada. `-apple-system` no iOS já é SF Pro; no Android, Roboto. Monoespaçada:
`Platform.select({ ios:'Menlo', android:'monospace' })`.

## Os nove componentes base

Cobrem o app inteiro — construir antes de qualquer tela.

| Componente | Papel |
|---|---|
| `NavBar` | 44pt + safe area, título centrado, ações em azul |
| `Sheet` | `@gorhom/bottom-sheet`, snaps `['45%','92%']`, tela de trás encolhe para 92,5% |
| `GroupedList` + `Row` | lista inset do iOS, raio 12, separadores recuados 16pt |
| `Segmented` | trilho + pílula selecionada, usado em Escrever/Ler e no escopo da IA |
| `ActionBar` | barra contextual — ver [08-barra-de-acoes.md](08-barra-de-acoes.md) |
| `AlertDialog` | alerta do iOS, onde acontece toda edição de valor único |
| `Toast` | cápsula translúcida, some em 1,9s |
| `Fab` | 56pt azul (ação primária), 48pt translúcido (secundárias) |
| `Chip` | cápsula translúcida com blur |

## Regras que separam "parece nativo" de "parece site"

- **Feedback tátil em tudo** (`expo-haptics`): `Light` ao selecionar, `Medium` ao criar,
  `Warning` ao excluir.
- **Toque pressionado reduz opacidade** (~0.45), não muda cor de fundo.
- **Alvos de 44pt.** Nada abaixo disso recebe toque.
- **Uma cor de acento só** — azul do sistema. Vermelho é exclusivo de destrutivo; laranja, de
  estado transitório.
- **Respeite `prefers-reduced-motion`** via `AccessibilityInfo.isReduceMotionEnabled`.
- **Todo componente ancorado no fundo da tela soma `useSafeAreaInsets().bottom` ao próprio
  padding** (`react-native-safe-area-context` — funciona porque o `Stack` do expo-router, via
  react-native-screens, provê o `SafeAreaProvider` sozinho por trás de cada tela; não precisa
  um explícito no `RootLayout`). Sem isso, no iPhone sem botão físico o conteúdo cola no home
  indicator — bug real achado testando `ActionBar` e `Sheet` num device de verdade, corrigido
  nas duas (mais `NavBar`/`Toast`, que já faziam isso certo). Testar um componente assim
  isolado precisa envolver o `render()` num `<SafeAreaProvider initialMetrics={...}>` — ver
  `ActionBar.test.tsx`.
- **Regra irmã, só nas duas telas dentro da tab bar** (`Biblioteca`/`Ajustes`, ver
  "Navegação" abaixo): o padding de baixo é `useBottomTabBarHeight()`
  (`@react-navigation/bottom-tabs`), não `useSafeAreaInsets().bottom` sozinho — a tab bar é
  `position:'absolute'`, flutuando por cima do conteúdo, então esse hook já devolve a altura
  real (barra + safe area) certa pra somar ao `ScrollView`/FAB da tela. Nas telas empilhadas
  por cima (`gallery`, `doc/[id]`) a tab bar nem existe, então elas continuam com
  `useSafeAreaInsets().bottom` puro, sem mudança nenhuma.

Ver também [13-qualidade-e-testes.md](13-qualidade-e-testes.md) para acessibilidade e Dynamic Type.

**Bug real: fundo branco atrás da sheet no tema escuro.** O efeito "tela encolhe atrás da
sheet aberta" (`SheetChromeContainer`, acima) tira o `View` animado de baixo da escala 100% —
o vão revelado nessa borda mostra o que estiver *atrás* dele, não o que está dentro. Sem cor de
fundo temática no `GestureHandlerRootView` (a base de tudo, em `app/_layout.tsx`), esse vão
mostrava o branco padrão da janela nativa mesmo no tema escuro. Corrigido dando
`backgroundColor: colors.bg` pro `GestureHandlerRootView` — precisou de um componente próprio
(`RootShell`) porque `useTheme()` só funciona dentro do `ThemeProvider`, e `RootLayout` em si
está fora dele até renderizar os filhos.

## Ícones

Vêm de `lucide-react-native` (não mais desenhados à mão) — SVG puro sobre `react-native-svg`
(a mesma base já usada pelo canvas), sem plugin nativo nenhum, então funciona sem build extra
no Expo Go/iOS/Android. Verificado com `npx expo export` nas duas plataformas antes de trocar.

`Icon.tsx` mapeia cada `IconName` do app pro ícone lucide mais próximo do desenho do protótipo
(`editor-mermaid.html`, registro `ICO` por volta da linha 675) — ex.: `menu` (círculo com 3
pontinhos, usado como indicador de seleção da `ActionBar`) vira `CircleEllipsis`, não
`Ellipsis` (que não tem o círculo). Pra ícone que o protótipo não tem (`chevronRight`,
`minus`), usa o equivalente óbvio do lucide direto. Registro pequeno de propósito, igual antes:
só entra ícone que uma feature real usa — ver `editor/src/design/Icon.tsx`.

**Bug real: um ícone por significado, não um ícone reaproveitado por preguiça.** A primeira
integração do lucide só trocou o componente que desenha o ícone — os `icon:` de cada ação de
`ActionBarController.tsx` continuaram os mesmos de antes, todos genéricos (`check` reaproveitado
em 13 ações sem relação nenhuma entre si — Texto, todas as IA, Rótulo, Nome, Tipo, Comentário,
Verbo; `menu` em 5; `plus` em 5). Ficou parecendo um app com 4 ícones. Corrigido dando a cada
ação da barra contextual (nó/ligação/tabela/coluna/relação/texto) e da `FormatBar` de markdown
um ícone específico do seu significado (`pencil` pra qualquer prompt de editar texto, `spark`
só pra IA, `link` pra Conectar/Relacionar, `copy` pra Duplicar, `shapes`/`palette`/`sliders`
pra Forma/Cor/Traço, `type`/`comment` pra Tipo/Comentário de coluna, `cardinality` pra
Cardinalidade, `swap` pra Inverter, `columns`/`heading`/`bold`/`italic`/`list`/`listOrdered`/
`listChecks`/`quote`/`flow` pra `FormatBar`, espelhando o `MD_BOTOES` do protótipo). Repetição
só sobrevive onde o significado é, de fato, o mesmo em todo lugar — `trash` (Excluir), `spark`
(IA), `chevronRight` (Editar → abre o inspetor completo).

**Armadilha de teste**: o build "react-native" que o pacote expõe via `package.json#exports` é
ESM puro (`.mjs`), e o transform do `jest-expo` só cobre `.js/.jsx/.ts/.tsx` — sem ajuste,
qualquer teste que importe algo com `Icon` quebra com `Unexpected token 'export'`. Corrigido
mapeando `lucide-react-native` pro próprio build CJS do pacote via `moduleNameMapper` em
`jest.config.js`, em vez de mexer em `transform`/`transformIgnorePatterns` (mais simples e não
arrisca destransformar outra coisa).

## Navegação (tab bar)

`app/(tabs)/_layout.tsx` — duas abas, **Biblioteca** e **Ajustes** (`features/settings/`, nova:
por enquanto só o seletor de tema, ver abaixo). Grupo `(tabs)` do expo-router: não aparece na
URL, então a rota da Biblioteca continua sendo `/`. `Galeria` e o editor (`doc/[id]`) ficam
*fora* do grupo, empilhados pelo `Stack` raiz por cima — cobrem a tab bar inteira ao navegar
pra lá, sem configuração extra (é o comportamento padrão de um `Stack` por cima de um
navegador de tabs).

Visual: `tabBarStyle` com `position:'absolute'` + fundo transparente, `tabBarBackground` uma
`BlurView` — mesma cápsula translúcida do `Chip`/`ActionBar` (§5.2), não a barra opaca padrão
do React Navigation. Como consequência direta de ser `absolute`, ela flutua *por cima* do
conteúdo em vez de empurrá-lo — todo o conteúdo das duas telas precisa somar
`useBottomTabBarHeight()` ao próprio padding de baixo (ver a regra irmã, acima) ou fica
escondido atrás da barra. Achado testando a `LibraryScreen`: o FAB "+" (que já era
`position:'absolute', bottom:16`, de antes da tab bar existir) ficava embaixo da barra nova —
corrigido somando `useBottomTabBarHeight()` ao `bottom`.

**Efeito colateral achado no `Toast`** (global, montado no `RootLayout`, fora de qualquer
navegador de tabs — não dá pra chamar `useBottomTabBarHeight()` lá dentro, ele lança fora de
uma tela de tab): seu deslocamento fixo de baixo (`96 + insets.bottom`) foi calibrado pra
limpar só o FAB antigo; com o FAB subindo pra cima da tab bar na Biblioteca, o toast passou a
cair *atrás* do FAB. Corrigido subindo o deslocamento fixo (`136 + insets.bottom`) — folga extra
nas telas empilhadas sem tab bar, mas sem colisão em lugar nenhum. Ver `Toast.tsx`.

## O que existe hoje

```
editor/src/design/
  tokens.ts          palette (dark/light), type, space, radius, easing — porta exata do §5.1
  ThemeProvider.tsx   segue o sistema até o usuário escolher (mode: 'auto'|'light'|'dark');
                      a persistência da escolha chega com store/useSettings.ts (Etapa 16) —
                      a aba Ajustes já troca o tema ao vivo, só não sobrevive a fechar o app
  useTheme.ts         hook — lança se usado fora do provider
  Icon.tsx            ícones do lucide-react-native — registro pequeno, cresce por feature
  SheetChrome.tsx      o efeito "tela encolhe atrás da sheet aberta" — Provider + Container,
                       plugado no RootLayout; Sheet chama useSheetChrome().setOpen()
  components/
    NavBar Row GroupedList Segmented          — puramente visuais, sem teste de componente
    Chip Fab Field KeyCaps                    — idem, exceto KeyCaps (tem toggle, tem teste)
    ActionBar AlertDialog Sheet Toast         — têm lógica de decisão real
```

Testes de componente (Camada 1, `npm run test:rn` dentro de `editor/`) em
`Segmented.test.tsx`, `KeyCaps.test.tsx`, `ActionBar.test.tsx`, `AlertDialog.test.tsx` — só
onde há ramificação de comportamento, conforme a regra de
[13-qualidade-e-testes.md](13-qualidade-e-testes.md). `LibraryScreen` (em
`features/library/`) foi restilizado com `NavBar`/`GroupedList`/`Row` reais como prova de
que o sistema funciona ponta a ponta — a tela de verdade (grade, busca, SQLite) é Etapa 13.

**`ActionBar` aqui é só o shell visual** (cabeçalho + fila de ações) — a lógica de qual ação
aparece por tipo de seleção é da Etapa 6, em
`features/diagram/ActionBarController.tsx` (ver
[08-barra-de-acoes.md](08-barra-de-acoes.md)).
