# Visão geral

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §1.
> Protótipo funcional: [editor-mermaid.html](../editor-mermaid.html) — comportamento ambíguo
> se resolve olhando ele.

Um editor de diagramas Mermaid e documentos Markdown, feito para o celular.

## Os quatro tipos de arquivo

| Tipo | O que é | Como se edita |
|---|---|---|
| `flow` | Fluxograma | Toque no desenho: formas, cores, conexões, agrupamentos |
| `er` | Modelo relacional | Toque no desenho: tabelas, colunas, cardinalidades |
| `raw` | Os outros 23 tipos do Mermaid | Toque no elemento → edita o trecho de código correspondente |
| `md` | Documento Markdown | Editor estilo Notas, com diagramas Mermaid embutidos e editáveis |

## As três promessas que definem o produto

1. **Selecionar é barato.** Tocar num elemento não abre painel — mostra uma barra de ações
   com as cinco coisas que se faz o tempo todo. O painel completo fica a um toque.
2. **Todo elemento é editável, em qualquer tipo de diagrama.** Nos tipos sem modelo visual,
   o toque mapeia para o pedaço exato do código-fonte.
3. **Documento e diagrama são a mesma coisa.** Um bloco ` ```mermaid ` dentro de um documento
   abre no canvas com todas as ferramentas e volta atualizado.

## Onde ir a partir daqui

Comece por [15-diagramas.md](15-diagramas.md) para uma visão em imagem da arquitetura, depois
siga o roteiro do [CLAUDE.md](../CLAUDE.md) na raiz do repo. Para o que já foi construído e o
que falta, veja o [CHECKLIST.md](../CHECKLIST.md).
