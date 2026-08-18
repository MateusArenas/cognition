# Se um dia for para o nativo — e armadilhas conhecidas

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §19-20.

## Rota nativa (opcional, só se arrastar nós virar requisito)

Três frentes, caso o caminho A ([01-decisao-arquitetura.md](01-decisao-arquitetura.md)) deixe
de bastar:

- **Layout** — `@dagrejs/dagre` roda em JS puro. `react-native-svg` não expõe métrica síncrona
  de nó antes de renderizar; estimar largura (`≈8.2 × caracteres` a 14pt) é mais rápido e erra
  pouco com fonte fixa do que medir com `onLayout` e refazer.
- **Formas** — as 13 viram componentes `react-native-svg` (`<Polygon>`, `<Path>`, `<Rect rx>`).
  `<Marker>` para setas exige `react-native-svg` 13+.
- **Arrastar** — guardar o deslocamento manual no modelo (`node.dx`, `node.dy`), somar depois
  do layout automático para que ele continue valendo nos nós não tocados.

Parser e serializer (já implementados, [04-dominio.md](04-dominio.md)) não mudam — só a
renderização.

## Armadilhas conhecidas

- **`htmlLabels: false` é obrigatório.** Com labels em HTML o SVG tem `<foreignObject>`, que
  `canvas.drawImage` ignora silenciosamente — o PNG sai sem texto.
- **`useMaxWidth: false` também**, senão o Mermaid injeta `max-width` inline e o zoom para de
  funcionar acima de 100%.
- **`mermaid.render` deixa lixo no DOM** em erro de sintaxe — limpar antes de cada render.
- **A ordem dos elementos no SVG segue a do código** — é como as arestas são mapeadas (e, como
  descobrimos ao portar o domínio, também como o `class` precisa ser emitido — ver a nota em
  [04-dominio.md](04-dominio.md)). Mudar a ordem de emissão quebra a seleção sem erro visível.
- **`data-id` nos nós só existe no Mermaid 11** — na 10, derive do `id`.
- **Mudar de tema exige `mermaid.initialize` de novo** — trocar variável de cor não repinta um
  SVG já gerado.
- **`A --> B & C`** não é suportado pelo parser atual — implementar ou avisar no erro.
- **Emoji e acento em identificador** quebram o Mermaid — validar no campo, não no serializer.
- **Chave de seleção com mais de um `:`** — corte no primeiro, sempre (já tratado em
  `domain/selection.ts`).
- **Lookbehind em regex** mata o app em Safari antigo — vale para o renderizador de markdown.
- **Escalar o WebView borra o conteúdo** — zoom acontece dentro dele, nunca na view (ver
  [06-canvas.md](06-canvas.md)).
- **`import * as FileSystem from 'expo-file-system'` (SDK 54+) não funciona em runtime.**
  O import default virou a API nova (`File`/`Directory`/`Paths`); as funções antigas
  (`readAsStringAsync`, `writeAsStringAsync`, `cacheDirectory`...) ainda existem como stub de
  *tipo* — `tsc` não reclama, `expo export` builda sem erro, mas cada chamada **lança em
  runtime** ("This method will throw in runtime", literal na doc do pacote). Isso não aparece
  em nenhuma das verificações automatizadas deste projeto (nenhuma delas executa o app de
  verdade). Import certo: `expo-file-system/legacy`. Já corrigido em
  `useRuntimeHtml.ts` e `services/export.ts` — se qualquer código novo importar
  `expo-file-system` puro, desconfie.
