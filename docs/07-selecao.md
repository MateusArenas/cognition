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

**Bug real, achado a partir de um relato do usuário ("clico e fica o azul em volta, mas não
sobe a barra de ações"):** o `id="flowchart-<id>-<n>"` acima está incompleto — na prática o
Mermaid 11 (nem `data-id` está presente nos nós do `templateFlow()`, então cai sempre neste
caminho) gera `id="<renderId>-flowchart-<id>-<n>"`, com `<renderId>` sendo o primeiro argumento
de `mermaid.render(id, code)` (`'mmd' + contador`, nunca reinicia — ver `render()`). `tagTargets()`
só tirava o `"flowchart-"` literal do **começo** da string; como a string de verdade começa com
`"mmd2-flowchart-..."`, nada era removido, e sobrava `sel.id = "mmd2-flowchart-A"` em vez de
`"A"`. O toque continuava acertando o elemento certo (o destaque azul batia geometricamente —
por isso nunca foi visto como bug de seleção, e `npm run verify:canvas` também não pegava,
porque ele só compara `sel.id` contra o próprio `data-sel-key`, nunca contra um id de verdade)
mas o lado RN nunca achava esse id sujo em `doc.nodes` — `ActionBarController` retornava `null`
e a barra de ações contextual nunca abria, pra QUALQUER nó de fluxograma, não só nós recém-
criados. Corrigido trocando `.replace(/^flowchart-/, '')` por `.replace(/^.*?flowchart-/, '')`
(não-guloso — remove tudo até o `"flowchart-"` de verdade, seja qual for o prefixo de render na
frente). `verify-canvas-selection.mjs` ganhou uma checagem específica pra essa classe de bug
(`sel.id` não pode carregar o prefixo `mmd<N>-`) — confirmada revertendo a correção e vendo o
teste falhar antes de reaplicá-la.

## Grupos (subgraph) — mesma Camada 1

`FlowGroup` (id/label/nodes) já existia desde a Etapa 1 mas nunca virou seleção: tocar no
retângulo/rótulo do `subgraph ... end` no canvas não selecionava nada, `Selection` não tinha
`'group'`, e nada em `tagTargets()` marcava `g.cluster`. Pedido do usuário: "queria poder
selecionar o elemento subgraph... porque não consigo mudar o nome dele".

**Formato do id, achado inspecionando o SVG de verdade** (Playwright headless, mesma técnica
já usada nos bugs de Camada 2/3 abaixo — nunca adivinhado): um cluster sai como
`id="mmd2-sgArmazem"` — só o prefixo de render (`'mmd' + contador`, o mesmo `id` que a gente
passa pro `mermaid.render()`) na frente do id de verdade do subgraph, **sem** sufixo numérico
(diferente de nó, que ganha `-<n>`; confirmado com 1 e 2 subgraphs no mesmo render). Como esse
prefixo é gerado por nós mesmos (não uma convenção do Mermaid que possa variar), a extração é
uma âncora simples no começo da string — `.replace(/^mmd\d+-/, '')` — sem precisar do `.*?`
não-guloso que o bug do nó (acima) precisou.

`.cluster` nunca é ancestral de `g.node` no SVG do Mermaid — clusters e nós ficam em grupos
`.clusters`/`.nodes` **irmãos**, não aninhados (confirmado no mesmo diagnóstico), e `.clusters`
é pintado ANTES de `.nodes` no DOM. Então um toque que cai dentro de um nó continua resolvendo
pro nó via `elementFromPoint` + `.closest('[data-sel-key]')`, sem precisar de nenhuma lógica
extra em `handleTap()` — o cluster só responde quando o toque cai numa área do subgraph que
nenhum nó cobre (a faixa de fundo, o rótulo).

Verificado em `scripts/verify-canvas-selection.mjs` (novo caso "Flowchart com subgraph
(grupo)") — o mesmo teste que já pega vazamento de prefixo `mmd<N>-` em nó agora cobre `group`
também. Confirmado revertendo o tagueamento e vendo o caso falhar ("toque não selecionou
nada") antes de reaplicar.

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

**Segundo bug, mais sério, achado no mesmo diagnóstico**: mesmo depois do fix acima, tocar num
estado às vezes selecionava (visualmente) OUTRO estado, ou o destaque azul aparecia bem longe
do que foi tocado — e alguns elementos não selecionavam nada mesmo estando visíveis. Não era
mais sobre `<text>` vs `<foreignObject>`: era o mesmo tipo de ambiguidade de escala do bug 3 em
docs/06-canvas.md — o Mermaid declara `width="100%"` na `<svg>` de vários dos 23 tipos (não só
state) em vez de um px batendo com o `viewBox`, dando à `<svg>` uma escala própria que soma com
a nossa. Como o hit e o destaque são calculados em momentos diferentes (um na hora do render,
outro na hora da seleção), o erro de escala nem sempre é o mesmo nos dois — o que produz
exatamente esse sintoma de "seleciona a coisa errada" ou "não seleciona nada", em vez de um erro
de tamanho consistente. Corrigido na raiz (normalização de `width`/`height` pro `viewBox`,
`screenToSvg`/`fit()` medindo a escala de verdade) — ver docs/06-canvas.md. Verificado com `npm
run verify:canvas` tocando em CADA elemento selecionável de 5 tipos de diagrama (ER, flow,
state, class, sequence), não só amostragem manual.

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
