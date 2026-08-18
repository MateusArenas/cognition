# Documentos Markdown

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §13.
> Status: **implementado** em `editor/src/domain/markdown/` e
> `editor/src/features/document/`. Chegava até aqui sem ponto de entrada na UI — corrigido
> nesta sessão, ver "Como chegar aqui" abaixo.

## Como chegar aqui

Até esta sessão, o editor de documento inteiro (renderizador, barra de formatação, ida-e-volta
com diagrama) existia e funcionava, mas **não tinha nenhum jeito de criar um documento a partir
da UI** — só existia uma rota de debug (`doc/md-novo`) que nada na tela levava a. A Galeria
(`GalleryScreen`) só oferecia os 25 tipos de diagrama Mermaid.

Corrigido com uma seção "Documentos" no topo da Galeria (mesma ideia do protótipo
`editor-mermaid.html`, que já tinha essa seção): **Documento** (`templateMd()` — mesmo tema
"Recebimento de carga" dos outros dois modelos, já com um diagrama embutido de verdade, pra
mostrar a ida-e-volta funcionando desde o primeiro toque) e **Em branco** (`blankMd()` puro). A
rota de debug ganhou uma irmã, `doc/md-demo`, que abre `templateMd()` diretamente — útil pra
testar sem precisar navegar pela Galeria.

## O editor

No espírito do Notas: texto grande, sem moldura, sem numeração de linha. `Segmented` no topo
alterna **Escrever** e **Ler**. `TextInput` multiline, 17pt, `lineHeight` 26.

## Barra de formatação

Doze botões numa `ScrollView horizontal` colada ao teclado (`KeyboardStickyView`, de
`react-native-keyboard-controller` — a mesma lib nas duas plataformas, não
`InputAccessoryView`): Título · Negrito · Itálico · Lista · Numerada · Tarefa · Citação ·
Código · Link · Tabela · **Diagrama** · Linha. Cada um age sobre a seleção (envolver) ou sobre
as linhas do cursor (prefixo) — `domain/markdown/format.ts`, com teste de vitest por ação.

**Bug real: sem respiro do home indicator quando o teclado está fechado.** Mesma classe do bug
já documentado em [03-design-system.md](03-design-system.md) pra `ActionBar`/`Sheet` — todo
componente ancorado no fundo da tela precisa somar `useSafeAreaInsets().bottom`. Corrigido no
`contentContainerStyle` do `ScrollView` horizontal.

## O renderizador

Escrito do zero em `domain/markdown/render.ts` — funciona offline, controla a extração dos
blocos Mermaid, escapa HTML por padrão. **Duas armadilhas de regex:** nada de lookbehind (mata
o app no Safari < 16.4) e proteger os code spans primeiro com sentinela, senão `**` dentro de
crase vira negrito. Saída é uma **árvore de nós** (`MdNode`), não HTML — RN não tem
`dangerouslySetInnerHTML`. Modo Ler é `ScrollView` de verdade (18pt de respiro, igual ao
editor) — sem isso, achado nesta sessão, um documento mais alto que a tela ficava cortado e sem
jeito de rolar até o fim.

## Diagramas embutidos — a integração

Um bloco ` ```mermaid ` vira, no modo Ler, um cartão com **Editar/Copiar** e o diagrama
renderizado por uma instância pequena do `DiagramCanvas` somente-leitura (cada bloco embutido é
o seu próprio WebView — documento com muitos diagramas custa memória proporcional; aceitável
pelo escopo atual, reavaliar se virar problema real). Editar salva `{doc, ini, fim}` em
`retornoMd` (ver [05-estado.md](05-estado.md)) e abre o canvas via `parseMermaid`; voltar
recorta o `serialize()` atualizado de volta no intervalo `[ini, fim)` do `md` **capturado no
momento do toque em Editar** (não o mais recente — evita corromper o documento se algo mudar
enquanto o canvas está aberto). Ver o diagrama de sequência dessa ida-e-volta em
[15-diagramas.md](15-diagramas.md).

**Tudo depende do renderizador devolver o offset em caracteres de cada bloco** — testado em
`render.test.ts`: `md.slice(ini, fim) === corpo` pra bloco mermaid, e o mesmo princípio agora
vale pra título (`ini`, ver abaixo).

## Aba Estrutura (Outline)

**Dois bugs reais, achados testando de verdade nesta sessão** (o recurso nunca tinha sido
exercitado — nem visualmente, nem por teste):

1. `MdNode` do tipo `heading` não guardava onde a linha começa no documento — só `nivel` e
   `filhos`. `Outline.tsx` tentava rastrear um offset acumulado que nunca era, de fato,
   incrementado; todo título calculava offset `0`, então tocar em **qualquer** título da
   Estrutura pulava pro início do documento, não pro título tocado. Corrigido adicionando `ini`
   ao nó `heading` (o `render.ts` já tinha o offset da linha disponível, só não estava sendo
   usado) — testado em `render.test.ts`.
2. Mesmo com o offset certo, nada acontecia visualmente: `DocumentScreen` guardava a seleção
   (`selection` state, usada pela barra de formatação) mas nunca repassava esse estado de volta
   pro `<MarkdownEditor selection={...}>` — o campo ficava sempre **não controlado**, então
   `setSelection()` vindo da Estrutura (ou de uma ação da barra de formatação) nunca movia o
   cursor visível. Corrigido passando `selection={selection}` pro `TextInput`.

## Detalhes que valem

Caixas de tarefa clicáveis no modo Ler (conta a ocorrência N de `- [ ]`/`- [x]` para saber qual
trocar, com desfazer). Aba Estrutura (títulos + diagramas embutidos, navegável — ver bugs
acima). Contagem de palavras e de diagramas na linha de estado.
