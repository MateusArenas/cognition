# O canvas

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §8.
> Status: **implementado** (Etapas 3-4) em `editor/src/features/diagram/canvas/`.

## Runtime offline

O app precisa funcionar em modo avião. O Mermaid minificado (~3,4 MB) é embutido num único
HTML via `scripts/build-runtime.mjs`, que substitui o placeholder de script no
`runtime.shell.html` e gera `runtime.html` (não versionado). O `runtime.shell.html` contém só:
config do Mermaid, `render`, mapeamento de toque, desenho da seleção, gestos de pan/zoom —
**nada de sheets, formulários ou export**, isso é tudo React Native.

### O bug mais sério do projeto — e por que nenhuma verificação automatizada o pegou

Por várias etapas deste projeto, o canvas renderizava a UI toda normal (barra, chips, FABs) mas
o **diagrama em si nunca aparecia** — tudo preto. `tsc`, os testes, e `expo export` nas duas
plataformas sempre passaram limpos, porque nenhum deles executa o WebView de verdade. Só
apareceu testando num simulador real.

Causa raiz, em `scripts/build-runtime.mjs`: `shell.replace('/*__MERMAID__*/', mermaid)` usa
`String.prototype.replace` com uma **string** como segundo argumento — e o JavaScript trata
`$&`, `` $` ``, `$'`, `$$`, `$1`-`$99` como tokens especiais *dentro do valor de substituição*,
mesmo quando a busca é uma string simples, não uma regex. O `mermaid.min.js` tem inúmeras
ocorrências de `$&` (é o idioma padrão pra escapar regex: `x.replace(/.../g, '\\$&')`), então
cada uma virou "reinsira o trecho buscado aqui" — o placeholder voltando a aparecer espalhado
por dentro do próprio bundle, sem gerar nenhum erro de sintaxe, só deixando `window.mermaid`
indefinido silenciosamente.

Havia um **segundo bug empilhado no mesmo lugar**: o comentário de documentação no topo do
`runtime.shell.html` citava o placeholder por extenso, numa frase, *antes* da tag `<script>`
real no arquivo — e como `.replace()` sem `/g` troca só a primeira ocorrência, a substituição
ia parar dentro do comentário (inerte) e a tag `<script>` real ficava com o placeholder intacto.

A correção: passar uma **função** como segundo argumento (`shell.replace('...', () => mermaid)`)
— funções não são varridas em busca de tokens `$`, o valor de retorno entra literal — e tirar a
menção literal ao placeholder do texto do comentário. Confirmado com screenshot real num
simulador iOS: fluxograma e ER renderizando com cores, formas, subgrafos e cardinalidade
corretos. Ver `scripts/build-runtime.mjs`.

**A lição que fica**: ao gerar texto grande/arbitrário com `String.replace(busca, string)`,
sempre considere se o *conteúdo* que está sendo inserido pode conter `$`. Prefira `() => valor`
como segundo argumento por padrão — é estritamente mais seguro e não tem custo.

## A ponte

```ts
export type ToWeb =
  | { t:'render'; code:string; theme:'dark'|'light'; tokens:Record<string,string> }
  | { t:'select'; sel:Selection | null }
  | { t:'reveal'; fracaoTopo:number }
  | { t:'fit' }
  | { t:'zoomBy'; factor:number }
  | { t:'exportPng'; scale:number };

export type FromWeb =
  | { t:'ready' }
  | { t:'tap'; sel:Selection | null; duplo:boolean }
  | { t:'error'; message:string }
  | { t:'png'; base64:string }
  | { t:'zoom'; k:number };
```

`zoomBy`/`zoom` são o par dos botões +/- do HUD (`DiagramScreen`): RN manda o fator
(`0.8`/`1.25`, mesmo clamp 0.12–4 do gesto de pinça), o runtime aplica centrado no meio do
`viewport` (não há ponto de toque pra centralizar, diferente do pinça) e devolve `view.k` — a
porcentagem que o HUD mostra (`Math.round(k*100)+'%'`) vem só desse relatório, tanto do gesto
quanto dos botões quanto do `fit()`, nunca calculada duas vezes no lado RN. `applyView()`
agenda o `postToRN({t:'zoom',...})` num `requestAnimationFrame` — sem isso, `pointermove` do
gesto de pinça dispararia um `postMessage` por evento, não por frame.

**RN → WebView usa `injectJavaScript`, não `postMessage`** (evita a diferença histórica
Android/iOS). O `true;` no fim do script injetado não é decoração — sem ele o iOS reclama de
retorno não serializável. **Web → RN sempre `window.ReactNativeWebView.postMessage(...)`.**

Ver o diagrama de sequência dessa troca em [15-diagramas.md](15-diagramas.md).

**Bug real encontrado e corrigido: diagrama renderiza mas fica invisível na primeira
abertura.** `fit()` roda assim que o primeiro `render()` termina, mas nesse instante o
`viewport` do WebView às vezes ainda não terminou seu próprio layout interno —
`clientWidth`/`clientHeight` chegam `0`. A conta de enquadramento então produz um `view.x`
enorme e negativo (não um erro, um número válido, só errado), empurrando o diagrama pra fora
da tela — a UI ao redor (barra, chips, FABs) aparece normal, só o desenho em si some. Corrigido
esperando o viewport ter tamanho de verdade (retry via `requestAnimationFrame`, até 60
tentativas) antes de calcular o enquadramento — ver `fit()` em `runtime.shell.html`.

**Bug real encontrado e corrigido: a seleção azul aparecia na posição errada.** Dois problemas
diferentes, achados em sequência — o primeiro foi consertado mas não era a causa raiz; o
segundo era.

1. **Resize do WebView sem reencaixe** (correção real, mas insuficiente sozinha). Selecionar
   algo faz a `ActionBar` aparecer embaixo da tela, encolhendo a área do canvas — o WebView é
   redimensionado pelo RN. `fit()` só rodava uma vez, na carga inicial, e nada reagia a esse
   redimensionamento depois. Corrigido com um `ResizeObserver` no `#viewport` que, sempre que o
   WebView muda de tamanho de verdade (debounce de 60ms), reencaixa a transform **e** reconstrói
   os hits e a seleção (`fit()` + `tagTargets()` + `drawSelection()`, não só a transform
   sozinha — mesma sequência que uma remontagem completa faria). Isso corrige um problema real
   (hits/seleção ficarem presos ao tamanho antigo do viewport), mas **não era o bug que o
   usuário via** — só reduzia a chance dele aparecer.

2. **A causa raiz de verdade, achada só com números de device real** (headless Chromium nunca
   reproduziu isso — só WebKit/WKWebView tem esse comportamento): `currentSVG.getScreenCTM()`
   devolve a TRANSLAÇÃO de `#stage` corretamente, mas **ignora a ESCALA** (`view.k`) sempre que
   ela vem de um `transform:scale()` CSS num ancestral HTML da `<svg>` — um limite conhecido do
   WebKit, não uma race/timing. Toda conversão tela→SVG que passava por
   `getScreenCTM().inverse()` (`mapearER`, `mapearTextoGenerico`, `drawSelection` — Camadas 2/3
   de seleção) saía com o tamanho errado sempre que `view.k !== 1`, ou seja, sempre que o
   diagrama não está a 100% de zoom — o caso comum, já que `fit()` quase sempre encolhe pra
   caber na tela. O toque em si (`document.elementFromPoint`) nunca foi afetado — não passa por
   CTM nenhum, é hit-test nativo do browser — por isso "o clique tava certo" mas o traçado da
   seleção não.

   Confirmado com log real: `view.k=0.575`, mas a largura convertida via CTM saía igual à
   largura em pixels de tela (i.e., como se o CTM achasse escala=1). Corrigido trocando a
   dependência de `getScreenCTM()` por uma conversão manual usando `view.x/y/k` (são as
   variáveis que a própria `applyView()` usa pra montar a transform) — essa primeira versão do
   `screenToSvg` ainda tinha o bug 3 abaixo escondido, corrigida de vez depois.

3. **Terceira rodada, achada testando stateDiagram** (docs/07-selecao.md): o Mermaid às vezes
   declara `width="100%"` na `<svg>` em vez de um valor em px batendo com o `viewBox` — o ER
   usa px explícito, por isso o bug 2 nunca revelou este aqui. Isso dá à própria `<svg>` uma
   escala intrínseca própria (resolvida pelo layout CSS de `#host`, independente do nosso
   `view.k`) — as duas escalas **compõem** em vez de uma substituir a outra, e nem `fit()` nem
   a v1 do `screenToSvg` esperavam por uma segunda escala. Ao contrário do bug 2, este
   reproduz igual em Chromium headless — não é peculiaridade do WebKit, é aritmética: Mermaid
   larga uma ambiguidade de escala, e o runtime confiava demais que `width`/`height` sempre
   bate com o `viewBox` (só bate por coincidência nos diagramas mais simples, como o ER).
   Corrigido em duas frentes, redundantes de propósito: `applyRendered()` agora normaliza
   `width`/`height` da `<svg>` pro `viewBox` exato assim que renderiza (elimina a segunda
   escala na raiz — todo diagrama passa a se comportar como o ER, que já batia 1:1), e
   `screenToSvg`/`fit()` passaram a medir a relação de verdade entre pixel de tela e unidade de
   viewBox via `getBoundingClientRect()` contra `viewBox.baseVal` — não depende mais de saber
   se há uma ou duas escalas em jogo, funciona de qualquer jeito. Ver `screenToSvg()` e `fit()`
   em `runtime.shell.html`.

Bugs 1-2 diagnosticados ao vivo rodando o Expo Go real num simulador iOS (bug 2 não reproduz em
Chromium headless) com instrumentação temporária (`postToRN` reportando geometria real pro
Metro) — removida depois de confirmado; sem simulador/device à mão,
`window.__handle({t:'tap', sel:{...}})` disparado por um `setTimeout` no próprio runtime simula
o toque sem precisar de touch real (útil já que `xcrun simctl` não tem comando de tap). O bug 3
foi achado e confirmado inteiramente em Chromium headless — ver `npm run verify:canvas`
(docs/13-qualidade-e-testes.md), que agora cobre os 5 tipos de diagrama relevantes de forma
permanente, não só um teste avulso de sessão.

**Diagnóstico se o canvas ficar em branco/escuro**: `DiagramCanvas` agora distingue 3 estados
visíveis em vez de só sumir — (1) `useRuntimeHtml` falhou ao carregar o asset (mostra o erro
capturado — antes era engolido em silêncio, essa é a causa mais provável de "tudo escuro sem
nada"), (2) o WebView carregou mas nunca mandou `ready` em 8s (aviso na tela — indica erro de
JS *dentro* do WebView; olhe o console do Metro/Xcode/Logcat), (3) o WebView deu erro de
carregamento (`onError`/`onHttpError`, agora tratados). Ver `useRuntimeHtml.ts` e
`DiagramCanvas.tsx`.

**Extensão em relação ao spec original**: além dos 5 tipos de `ToWeb`/4 de `FromWeb` do §8.2,
a implementação real tem `{t:'validate', code, reqId}` / `{t:'validated', reqId, ok, message?}`
— usados pela validação da IA antes de aplicar (§14.3, ver
[11-assistente-ia.md](11-assistente-ia.md)), porque o único `mermaid.parse` de verdade
disponível no app é o que já está carregado aqui dentro — e `{t:'zoomBy', factor}` /
`{t:'zoom', k}`, os botões de zoom do HUD (ver acima).

Props do WebView que economizam depuração: `scrollEnabled={false}`, `bounces={false}` (senão
disputa o gesto com o pan/zoom interno), fundo transparente **no style e no `<body>`** (Android
pinta branco e pisca a cada re-render), `htmlLabels:false` e `useMaxWidth:false` na config do
Mermaid (ver armadilhas em [14-nativo-e-armadilhas.md](14-nativo-e-armadilhas.md)). Debounce o
`render` em ~120ms.

## Tema do diagrama

Os tokens de cor vão na mensagem `render`; `themeVariables` (incluindo `darkMode` e
`background` reais) é montado do lado web — não deixar o Mermaid derivar sozinho, ou as faixas
de atributo do ER saem erradas num dos dois temas. `themeCSS` entra dentro do próprio SVG e por
isso **vale no arquivo exportado**. Envolva o render numa rede de segurança: se falhar com
`themeCSS`, tente de novo sem ele.

## Gestos: dentro do WebView, não fora

**Não** envolva o WebView num `Animated.View` com pan/pinch do Reanimated — escalar a *view*
rasteriza o conteúdo (o WebView foi desenhado uma vez, a GPU só estica o bitmap; texto vira
borrão). O jeito certo é `transform: translate3d(...) scale(...)` num `<div>` **dentro** do
documento — o SVG é vetorial, reescala nítido, e a resposta é imediata porque nada atravessa a
ponte.

Gestos do runtime: um dedo arrasta, dois dedos zoom, toque seleciona, toque duplo em elemento
abre o painel completo, toque duplo no vazio alterna enquadrar-tudo / 160%. Detecção de toque
duplo: 330ms e 32px do toque anterior.
