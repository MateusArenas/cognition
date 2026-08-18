# Documentos Markdown

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §13.
> Status: **implementado** (Etapas 11-12) em `editor/src/domain/markdown/` e
> `editor/src/features/document/`.

## O editor

No espírito do Notas: texto grande, sem moldura, sem numeração de linha. `Segmented` no topo
alterna **Escrever** e **Ler**. `TextInput` multiline, 17pt, `lineHeight` 26.

## Barra de formatação

Doze botões numa `ScrollView horizontal` colada ao teclado: Título · Negrito · Itálico · Lista
· Numerada · Tarefa · Citação · Código · Link · Tabela · **Diagrama** · Linha. Cada um age
sobre a seleção (envolver) ou sobre as linhas do cursor (prefixo).

A barra sobre o teclado muda por plataforma: iOS usa `InputAccessoryView`; Android não tem
isso, usa `react-native-keyboard-controller` (`KeyboardStickyView`, já instalado — ver
[02-setup-e-estrutura.md](02-setup-e-estrutura.md)), que também melhora o iOS.

## O renderizador

Escrito do zero em `domain/markdown/render.ts` (a criar) — funciona offline, controla a
extração dos blocos Mermaid, escapa HTML por padrão. **Duas armadilhas de regex:** nada de
lookbehind (mata o app no Safari < 16.4) e proteger os code spans primeiro com sentinela, senão
`**` dentro de crase vira negrito. Saída é uma **árvore de nós** (`MdNode`), não HTML — RN não
tem `dangerouslySetInnerHTML`.

## Diagramas embutidos — a integração

Um bloco ` ```mermaid ` vira, no modo Ler, um cartão com **Editar/Copiar** e o diagrama
renderizado por uma instância pequena do `DiagramCanvas` somente-leitura. Editar salva
`{docId, md, ini, fim}` em `retornoMd` (ver [05-estado.md](05-estado.md)) e abre o canvas via
`parseMermaid`; voltar recorta o `serialize()` atualizado de volta no intervalo `[ini, fim)` —
exatamente o que `domain/mutations/md.ts#replaceRange` já implementa (Etapa 1). Ver o diagrama
de sequência dessa ida-e-volta em [15-diagramas.md](15-diagramas.md).

**Tudo depende do renderizador devolver o offset em caracteres de cada bloco** — testar
`md.slice(ini, fim) === corpo` para cada bloco.

## Detalhes que valem

Caixas de tarefa clicáveis no modo Ler (conta a ocorrência N de `- [ ]`/`- [x]` para saber qual
trocar, com desfazer). Aba Estrutura (títulos + diagramas embutidos, navegável). Aba Markdown
(texto puro). Contagem de palavras e de diagramas na linha de estado.
