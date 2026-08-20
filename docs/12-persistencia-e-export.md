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

## Importar

`expo-document-picker`. iOS não tem UTI para `.mmd` — filtrar pela extensão depois de ler o
nome. `.md`/`.markdown` viram documento; o resto passa por `parseMermaid`
(ver [04-dominio.md](04-dominio.md)).
