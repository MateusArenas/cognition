---
applyTo: "editor/src/domain/**"
---

# Camada de domínio — regra de ouro

Este código é TypeScript puro. Nunca importe de `features/`, `design/` ou `store/` — se você
está tentado a importar algo de React Native aqui, o código pertence a outra pasta.

**O texto Mermaid nunca é editado por regex durante a interação.** Ele é *derivado* do modelo
por `serialize()` e é *entrada* do modelo via `parse()`. Se a tarefa parece "é só um replace
para trocar isso no texto", pare — a mudança certa é no modelo (`Doc`), não no texto.

A única exceção é o tipo `raw` (`RawDoc.code`), onde o código *é* o modelo: aí a manipulação é
a string inteira (`setCode`) ou por offsets exatos de caractere (como em `mutations/md.ts`,
`replaceRange`), nunca um replace de conteúdo por regex.

Mutações (`mutations/*.ts`) são funções puras: recebem um `Doc` e devolvem outro
(`structuredClone` + alteração + retorno), nunca mutam o argumento.

A ordem de emissão em `serialize.ts` não é estética — o mapeamento de arestas e a ordem dos
alvos em `class ...` dependem dela para sobreviver a um round-trip `serialize → parse →
serialize`. Ver a nota em `docs/04-dominio.md` sobre o bug real que isso já causou aqui.

Qualquer mudança de comportamento aqui é testada com round-trip
(`serialize(parseMermaid(serialize(x))) === serialize(x)`), não só com asserts pontuais — ver
os arquivos `*.test.ts` já existentes nesta pasta como modelo.

Detalhe completo: `docs/04-dominio.md` e `ESPECIFICACAO-APP-RN-EXPO.md` §6.
