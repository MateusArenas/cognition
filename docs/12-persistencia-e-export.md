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
2 MB e trava a UI por meio segundo; mostrar progresso e limitar `scale` a 3.

## Importar

`expo-document-picker`. iOS não tem UTI para `.mmd` — filtrar pela extensão depois de ler o
nome. `.md`/`.markdown` viram documento; o resto passa por `parseMermaid`
(ver [04-dominio.md](04-dominio.md)).
