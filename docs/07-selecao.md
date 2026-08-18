# Seleção: três camadas e as chaves que a identificam

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §9-10.
> Status: **implementado** (Etapas 1 e 8). Chaves de seleção em
> `editor/src/domain/selection.ts`; as três camadas de detecção, em
> `editor/src/features/diagram/canvas/runtime.shell.html` — rodam dentro do WebView, contra o
> texto Mermaid e o SVG renderizado, sem depender do modelo estruturado (ver a nota no topo
> desse arquivo). `resolveTapSelection` traduz o índice de aresta/relação pro id real do lado
> RN, já que o runtime não tem o `Doc` inteiro, só `code`.

Esta é a parte que mais deu trabalho no protótipo e a que mais quebra em atualização de versão
do Mermaid.

## Camada 1 — modelo (fluxograma)

Nós têm `data-id` (Mermaid 11+) ou `id="flowchart-<id>-<n>"` (10.x) — tratar os dois. Arestas:
a ordem no DOM segue a do código, o índice basta. **Alvos de toque em linha são finos demais
para dedo** — clone cada `<path>` com `stroke-width:26` transparente numa camada de hit.

## Camada 2 — geometria (modelo relacional)

A tabela do ER é uma pilha de retângulos: cabeçalho + uma faixa por coluna.

**Bug real, achado testando seleção de tabela num device de verdade**: a Camada 2 original
tentava achar o `<text>` do nome da tabela e subir pelos ancestrais a partir dali — mas o
Mermaid 11 não desenha nome de tabela/atributo como `<text>` nenhum. Rótulo de entidade e de
coluna saem em `<foreignObject><div><span class="nodeLabel"><p>...` (HTML dentro do SVG, pra
medição de texto melhor), e o contorno da tabela é um `<path>` com efeito "desenhado à mão" —
nunca um `<rect>` simples. A heurística baseada em `<text>`/`<rect>.entityBox` nunca encontrava
nada, então `achou` ficava sempre `0` e a Camada 2 inteira ficava muda: toque em qualquer tabela
não selecionava nada, e a barra de ações contextual nunca subia.

Achado renderizando o runtime de verdade num Chromium headless (Playwright, só como ferramenta
de diagnóstico — não faz parte da suíte de testes do app) e inspecionando o SVG gerado.

**Como funciona agora**, usando âncoras estáveis que o próprio Mermaid já expõe: cada tabela é
um `<g id="...-entity-<NOME>-<n>">` — o nome real da entidade vem embutido no `id`, então basta
casar por regex (`-entity-<NOME>-\d+$`) em vez de tentar reconstruir geometria a partir de
texto. O grupo inteiro cobre a tabela toda → hit `table:<id>` direto do
`getBoundingClientRect()` dele. Dentro do grupo, cada atributo é um `<g class="row-rect-odd">`
ou `<g class="row-rect-even">`, já na ordem visual de cima pra baixo — um hit `col:<tabela>#<i>`
por elemento, sem precisar agrupar por posição de texto. Ver `mapearER()` em
`editor/src/features/diagram/canvas/runtime.shell.html`.

**Lição**: essa camada depende da estrutura interna do SVG que o Mermaid gera, que muda entre
versões maiores da lib — o jeito de verificar que ela ainda funciona é sempre inspecionar o SVG
de verdade (ou testar num device), nunca assumir que `<text>` é onde o rótulo mora.

## Camada 3 — texto (os outros 23 tipos)

Todo elemento editável acaba sendo um pedaço de texto no código-fonte. Para cada `<text>`
**ou `<foreignObject>`** do SVG em ordem de documento: pegar o conteúdo aparado, achar a
primeira ocorrência *ainda não usada* dele no código (resolve textos repetidos), usar a forma
envolvente como alvo quando existir (cartão, barra, caixa do ator — não as letras), criar hit
`txt:<inicio>:<fim>`. Textos **gerados** pelo renderer (eixo do Gantt, percentuais da pizza)
não existem na fonte e não são selecionáveis — documentar isso na interface.

**Bug real, mesma família do da Camada 2**: `mapearTextoGenerico` só varria `<text>` — mas o
Mermaid 11 desenha rótulo de nó em vários dos 23 tipos (state, class, ...) como
`<foreignObject><div><span><p>`, igual ao ER. Resultado: `stateDiagram` renderizava normal, mas
tocar num estado não selecionava nada — só as etiquetas de transição (que continuam saindo em
`<text>`) respondiam. Corrigido igual: `host.querySelectorAll('text, foreignObject')` em vez de
só `'text'` — os dois tipos de elemento respondem a `.textContent`/`.getBoundingClientRect()`
do mesmo jeito, então o resto do algoritmo não precisou mudar.

## Rede de segurança

Se nenhuma camada mapear nada, avisar e apontar para a lista de elementos — falha silenciosa
aqui é o que torna o bug difícil de achar. Expor, na tela de ajuda, a versão do Mermaid
carregada.

**A lista de elementos em si (a aba "Elementos") não existia pra tipo `raw`** — só flow/er
tinham fonte pra ela (o próprio `Doc` estruturado). Tipo `raw` não tem modelo estruturado do
lado RN (§6, é só `{code}`), então quem sabe quais trechos a Camada 3 conseguiu mapear é o
runtime — ele manda `{t:'elements', items:[{id,texto}]}` depois de `mapearTextoGenerico`
(`bridge.ts`), e `DiagramScreen` guarda esse estado por cima do `DiagramCanvas` porque a própria
aba "Elementos" desmonta o canvas ao trocar de aba. Sem isso a aba ficava sempre em "Nenhum
elemento ainda" pra qualquer um dos 23 tipos genéricos — quebrando o requisito de acessibilidade
do §17 ("a lista de elementos não é acessório, é o que torna o app usável com VoiceOver").

## Chaves de seleção

`kind:id`, corte **só no primeiro `:`**:

```ts
const i = chave.indexOf(':');
const kind = chave.slice(0, i);
const id = chave.slice(i + 1);
```

Um `split(':')` ingênuo quebra em `txt:120:134` e em `col:PEDIDO#2` — foi bug real. Já
implementado em `editor/src/domain/selection.ts`.
