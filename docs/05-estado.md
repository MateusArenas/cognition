# Estado

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §7.
> Status: **implementado** (Etapa 5) em `editor/src/store/`.

`useDoc` (zustand) guarda o documento aberto, a seleção, o histórico de undo/redo e o modo de
conexão (criar aresta tocando em dois nós).

## Preferências — `useSettings`

`useSettings` guarda `language` (`pt-BR`, `en` ou `es`) e `themeMode` (`auto`, `light`, `dark`).
O valor inicial do idioma vem de `expo-localization.getLocales()` e a escolha posterior é
persistida via `expo-sqlite/kv-store`, portanto funciona no Expo Go. O store hidrata uma vez no
`RootLayout`; falhar a leitura não bloqueia o editor, que conserva idioma do aparelho e tema
automático. `ThemeProvider` e `I18nProvider` observam o mesmo store, por isso a troca em Ajustes
é imediata e continua válida ao reabrir o app.

```ts
interface DocState {
  doc: Doc;
  sel: Selection | null;
  past: string[];
  future: string[];
  linkMode: { ativo: boolean; de: string | null };
  retornoMd: { docId: string; md: string; ini: number; fim: number } | null;

  apply(fn: (d: Doc) => Doc | void): void;   // empilha undo
  applyLive(fn: (d: Doc) => void): void;     // digitação, não empilha
  commitLive(snapshot: string): void;        // no blur, empilha uma vez
  select(s: Selection | null): void;
  undo(): void;
  redo(): void;
}
```

## `applyLive` / `commitLive` não é otimização, é requisito

Campo de texto dispara `onChangeText` a cada caractere; empilhar undo por tecla torna o botão
inútil. O padrão: snapshot no `onFocus`, empilha no `onBlur` se mudou (código do hook
`useLiveField` na spec §7).

O código Mermaid enviado ao canvas é sempre derivado, nunca guardado:

```ts
const code = useMemo(() => serialize(doc), [doc]);
```

Histórico limitado a 80 snapshots. `structuredClone` para o estado, `JSON.stringify` para o
histórico — comparar strings é o que torna barato detectar "mudou de verdade". As mutações
puras de `domain/mutations/*.ts` (ver [04-dominio.md](04-dominio.md)) são o que `apply`/
`applyLive` chamam por dentro.
