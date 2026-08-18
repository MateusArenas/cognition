# Camada de domínio

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §6.
> Status: **implementado** (Etapa 1) em `editor/src/domain/`.

## A regra de ouro

**O texto Mermaid nunca é editado por regex durante a interação.** Ele é *derivado* do modelo
(`serialize`) e é *entrada* do modelo (`parse`). No momento em que alguém escrever "é só um
replace para trocar o rótulo", o editor começa a apodrecer.

A única exceção é o tipo `raw`, onde o código *é* o modelo — a manipulação é a string inteira,
nunca um replace de conteúdo.

Ver o diagrama desse ciclo em [15-diagramas.md](15-diagramas.md).

## O que existe hoje

```
editor/src/domain/
  types.ts                 Doc, FlowDoc, ErDoc, RawDoc, MdDoc, Selection — igual à spec §6.1
  id.ts                    uid()/newDocId(), gerador de ids curtos
  mermaid/
    shapes.ts               as 13 formas de nó (abre/fecha)
    links.ts                os 9 tipos de aresta (abre/fecha) + mapa operador -> tipo
    cardinality.ts           rótulos das cardinalidades do ER
    factory.ts               blankFlow/blankER/blankRaw/blankMd
    serialize.ts             modelo -> texto Mermaid (serializeFlow, serializeER)
    parse.ts                 texto -> modelo (parseFlow, parseER, parseMermaid, dispatcher)
    catalog.ts                os 25 tipos: nome, keyword, grupo, exemplo, explicação
    templates.ts              templateFlow()/templateER(), usados na galeria e nos testes
  selection.ts              chaves "kind:id", corte só no primeiro ":" — ver 07-selecao.md
  mutations/
    flow.ts  er.ts  raw.ts  md.ts     mutações puras: recebem e devolvem Doc, nunca mutam
```

Testes de round-trip em `editor/src/domain/mermaid/*.test.ts` (vitest —
`npm test` dentro de `editor/`):

- `serialize.test.ts` — `serialize(parse(serialize(tpl())))` idêntico para os templates visuais
  e para qualquer texto `raw`.
- `parse.test.ts` — cada uma das 13 formas, cada uma das 9 arestas, subgraph, classDef/class.
- `catalog.test.ts` — os 25 tipos existem, ids únicos, todo exemplo começa pela própria
  keyword, ZenUML/Wardley ficam de fora.

## Uma armadilha real que apareceu ao portar isso

A ordem dos ids na linha `class A,B,... nomeDaClasse` não pode depender da ordem bruta do
array `nodes` — depende de qual nó foi criado primeiro em memória, que muda depois de um
`parse`. A correção foi fazer `class` usar a mesma ordem de emissão textual que os `subgraph`
já usam (nós fora de grupo primeiro, depois cada grupo na sua ordem), não a ordem do array.
Sem isso, `serialize(parse(serialize(x))) !== serialize(x)` mesmo sem nenhuma mudança real —
exatamente o tipo de instabilidade que a spec já alertava para as arestas (§6.3: "a ordem
importa e não é estética"), só que ninguém tinha pensado no `class`. Ver
`editor/src/domain/mermaid/serialize.ts`.

## Catálogo dos 25 tipos

`domain/mermaid/catalog.ts` cobre: flowchart, ER, sequência, classes, estados, jornada,
kanban, git, C4, arquitetura, blocos, requisitos, mapa mental, árvore de arquivos, treemap,
Ishikawa, Gantt, linha do tempo, pizza, XY, Sankey, quadrante, radar, Venn e pacote de rede.

ZenUML e Wardley existem no Mermaid mas dependem de plugins fora da biblioteca padrão —
**não entram na galeria** (um card que nunca renderiza é pior que a ausência dele).

## O que falta (etapas seguintes)

Mutações mais ricas conforme a UI passa a precisar delas (Etapa 6+), e a integração com o
canvas de verdade — ver [06-canvas.md](06-canvas.md) e [07-selecao.md](07-selecao.md).
