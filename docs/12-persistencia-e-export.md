# Persistência, biblioteca, exportar e compartilhar

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §15-16.
> Status: **implementado** (Etapas 13-14) — falta só a miniatura visual da biblioteca
> (pendência conhecida, documentada abaixo).

## Biblioteca

Documento único é protótipo — **biblioteca é produto**. `expo-sqlite` (API assíncrona; MMKV é
mais rápido mas exige development build, não roda no Expo Go, atrasaria o início):

```sql
CREATE TABLE documentos (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT NOT NULL, subtipo TEXT,
  json TEXT NOT NULL, texto_busca TEXT, atualizado_em INTEGER NOT NULL, fixado INTEGER DEFAULT 0
);
CREATE INDEX idx_doc_data ON documentos(atualizado_em DESC);
```

Tela inicial: grade de cartões com miniatura, nome, tipo e data. Busca por nome e conteúdo.
Deslizar para excluir, com desfazer. Salvar com debounce de 600ms **e** sempre que o
`AppState` for para `background`. Miniatura: renderizar o SVG uma vez ao salvar e guardar como
arquivo — regenerar a cada abertura da lista trava a rolagem.

## Exportar e compartilhar

Texto (`.mmd`/`.md`) via `expo-file-system` + `expo-sharing`. PNG gerado no lado web (onde já
existe o SVG e um `<canvas>`), base64 pela ponte — atenção: um diagrama de 40 nós em 3× dá uns
2 MB e trava a UI por meio segundo; mostrar progresso e limitar `scale` a 3. **Bug real:** o PNG
saía com retângulos pretos sólidos cobrindo tabelas de ER (e a seleção ativa) — as camadas
internas de toque/seleção só ficam invisíveis por uma regra CSS que não viaja com a `<svg>`
serializada sozinha. Corrigido em `exportPng()`; detalhe da causa raiz em
[06-canvas.md](06-canvas.md).

No `DiagramScreen`, as saídas moram atrás de um botão só — "Compartilhar" na `NavBar` abre
`ShareSheet` (`features/diagram/ShareSheet.tsx`), que escolhe entre PNG, PDF e código-fonte
antes de chamar `exportarPng`/`exportarPdf`/`exportarTexto`. Não tem mais chip "PNG" solto no
HUD do canvas — o HUD (topo esquerdo) ficou só para enquadrar/zoom (ícone "Ajustar" +
porcentagem + botões +/-, ver [06-canvas.md](06-canvas.md)); desfazer/refazer viraram ícones num
HUD espelhado no topo direito, saindo da `NavBar`.

### PDF — Mermaid e Rabisco, mesmo caminho

Pedido do usuário: PDF pros diagramas Mermaid e, junto, um menu de compartilhar completo pro
Rabisco (que não tinha NENHUMA saída até aqui — nem PNG). `expo-print` (`Print.printToFileAsync`)
gera o PDF a partir de HTML — funciona no Expo Go, sem build nem conta de loja nenhuma, só
recebe um `<svg>...</svg>` embrulhado num HTML mínimo. `exportarPdf(svg, nome)`
(`services/export.ts`) é a MESMA função pras duas telas — a única diferença é de onde vem o
SVG:

- **Diagrama Mermaid**: novo tipo de mensagem no bridge RN↔WebView, `exportSvg`
  (`DiagramCanvas.exportSvg()`, ver [06-canvas.md](06-canvas.md) §8.2) — o runtime
  (`runtime.shell.html`) já limpava o SVG ao vivo pra virar PNG (removendo `.hitlayer`/
  `.sellayer`, que só ficam invisíveis por uma regra CSS que não viaja sozinha, mesmo bug do
  parágrafo acima); essa limpeza virou `cleanSvgString()`, reaproveitada por `exportPng` E pelo
  novo `exportSvg`, que só devolve o texto puro em vez de rasterizar.
- **Rabisco**: `domain/rabisco/svg.ts` — `docToSvg(doc)`, um serializer NOVO que espelha
  `Canvas.tsx#ElementView` elemento por elemento (mesma geometria de `domain/rabisco/geom.ts`
  — `elementGeometry`, `bounds`, `dashPattern` — que já alimenta o Skia), só emitindo `<path>`/
  `<text>`/`<g transform="rotate(...)">` em vez de `<Path>`/`<Group>` do react-native-skia.
  Único lugar que sabe desenhar um `RabiscoElement` fora do canvas nativo; é a base de TODO o
  novo menu "Compartilhar" do Rabisco (`features/rabisco/ShareSheet.tsx`, botão na `NavBar`,
  mesmo padrão do diagrama):
  - **Copiar SVG** — direto pro clipboard (`expo-clipboard`, mesmo padrão do "Copiar texto" de
    diagrama), não passa pelo share sheet nativo.
  - **Arquivo SVG** — `exportarTexto(doc)` (já genérica: `domain/exportMeta.ts` já dizia
    `.svg`/`image/svg+xml` pra `tipo: 'rabisco'`, só que antes `serialize()` devolvia um
    comentário Mermaid vazio pra esse caso, nunca SVG de verdade — `serialize()` continua só
    sobre texto Mermaid por contrato, `exportarTexto` que ganhou o desvio pra `docToSvg` quando
    o doc é Rabisco).
  - **Imagem PNG** — sem WebView pra rasterizar (Rabisco é Skia nativo, ver
    [16-rabisco.md](16-rabisco.md)): `exportarRabiscoPng()` pega o MESMO `docToSvg()`,
    `Skia.SVG.MakeFromString` + `Skia.Surface.MakeOffscreen` + `canvas.drawSvg` +
    `encodeToBase64(ImageFormat.PNG)` — tudo síncrono, fora da árvore React, sem depender do
    zoom/pan da tela (sempre enquadra o conteúdo inteiro, como no export SVG).
  - **Arquivo PDF** — `exportarPdf(docToSvg(doc), nome)`, a mesma função do diagrama.

Sem teste de simulador (nenhuma das quatro saídas passa por gesto/WebView) — cobertura é
`domain/rabisco/svg.test.ts` (fill/stroke/rótulo/rotação/escapamento XML/viewBox) mais
`tsc`/`vitest` limpos nas telas.

### Documento Markdown — copiar, .md, PDF (sem PNG)

Mesmo pedido do usuário, terceira tela: `DocumentScreen` ganhou o mesmo botão "Compartilhar"
(`features/document/ShareSheet.tsx`) no lugar do antigo "Exportar" direto — **Copiar texto**
(clipboard), **Arquivo Markdown** (`exportarTexto(doc)`, já existia) e **Arquivo PDF** (novo).

`domain/markdown/toHtml.ts` — `mdToHtml(titulo, nodes)` converte a MESMA árvore `MdNode[]` de
`renderMarkdown()` que já alimenta o modo Ler em RN (`MarkdownPreview.tsx`) pra HTML estático,
espelhando bloco por bloco (heading/parágrafo/lista/tarefa/tabela/citação/código) — mesmo
"geometria uma vez, N saídas" de `domain/rabisco/svg.ts`. `exportarMdPdf(doc)`
(`services/export.ts`) manda esse HTML pro MESMO `printHtmlToPdfFile()` usado pelo PDF de
diagrama/Rabisco (extraído da função `exportarPdf` original pra reaproveitar a parte
genérica). Sem largura/altura fixa aqui — ao contrário do PDF de diagrama (do tamanho exato do
SVG), o de documento pagina sozinho no Letter padrão (612×792), como texto de verdade.

Bloco ` ```mermaid ` embutido sai como bloco de código rotulado ("Diagrama Mermaid"), não como
diagrama renderizado — renderizar de verdade exigiria rodar o mermaid.js (os mesmos ~3.4MB
embutidos em `runtime.html`, ver [06-canvas.md](06-canvas.md)) dentro do HTML que vira o PDF, o
que pesaria a geração e não foi pedido; fica como extensão futura se um documento com diagramas
embutidos precisar sair com eles desenhados de verdade no PDF.

**Sem PNG, deliberadamente.** Diagrama e Rabisco conseguem PNG porque o conteúdo deles JÁ é
SVG (rasterizável via canvas web ou `Skia.SVG.MakeFromString`, ver acima). Um documento
Markdown vira `MdNode[]` → RN puro (`MarkdownPreview.tsx`) ou HTML (pro PDF) — nenhum dos dois
é SVG, então não tem como reaproveitar o mesmo caminho. A forma padrão de virar screenshot em
imagem é `react-native-view-shot`, que tem código nativo e não funciona no Expo Go — trocaria a
restrição dura do projeto (abrir no Expo Go, `docs/01-decisao-arquitetura.md`) por uma imagem
que nem foi pedida com muita ênfase. Não instalado; se um dia for pedido de verdade, as opções
são essa lib (aceitando que quebra Expo Go só pra quem usar esse botão) ou escrever um
layout de texto próprio em SVG (medindo linhas com `matchFont().measureText()`, como
`ShapeLabel` do Rabisco já faz) pra reaproveitar `svgParaPngBase64()` sem dependência nativa
nova — mais trabalho, mas Expo-Go-safe.

## Importar

`expo-document-picker`. iOS não tem UTI para `.mmd` — filtrar pela extensão depois de ler o
nome. `.md`/`.markdown` viram documento; o resto passa por `parseMermaid`
(ver [04-dominio.md](04-dominio.md)).
