# Instruções para o GitHub Copilot — Editor de Diagramas (Expo/RN)

## Regra de manutenção (a mais importante — aplique sempre)

Qualquer alteração na estrutura do projeto — pasta nova, arquivo-chave movido/renomeado,
mudança de decisão de arquitetura, dependência nova de peso — **atualiza o(s) doc(s)
correspondente(s) em `docs/` no mesmo commit**, e o `CHECKLIST.md` se o que está pronto/faltando
mudar. Não deixe os docs ficarem para trás do código que você está gerando.

## O que é este projeto

Editor de diagramas Mermaid e documentos Markdown para celular (Expo + React Native +
TypeScript, expo-router). O app fica em `editor/`. Documentação completa: `CLAUDE.md` na raiz
(comece por lá), `docs/*.md` por assunto, `CHECKLIST.md` para o que já foi feito, e
`ESPECIFICACAO-APP-RN-EXPO.md` como fonte de verdade detalhada (código exato).

## Regras não-negociáveis

- **`domain/` (`editor/src/domain/`) é TypeScript puro.** Nunca importa de `features/`,
  `design/` ou `store/`. Testável sem renderizar nada.
- **O texto Mermaid nunca é editado por regex durante a interação.** É derivado do modelo
  (`serialize`) e é entrada do modelo (`parse`). A única exceção é o tipo `raw`, onde o
  código *é* o modelo — e mesmo aí a manipulação é a string inteira ou por offsets exatos de
  caractere, nunca regex de conteúdo. Ver `docs/04-dominio.md`.
- **O WebView do canvas é um componente burro.** Desenha e reporta toques; toda a UI (barra
  de ações, sheets, formulários) é React Native de verdade. RN→WebView usa
  `injectJavaScript`, nunca `postMessage`. Nunca escale a *view* do WebView para dar zoom —
  isso rasteriza o conteúdo; o zoom acontece dentro do documento web. Ver `docs/06-canvas.md`.
- **Chave de seleção é `kind:id`, corte só no primeiro `:`.** Um `split(':')` ingênuo quebra
  chaves como `txt:120:134`. Ver `docs/07-selecao.md`.
- **Nunca embarque chave de API no bundle.** Chamadas de IA passam por um backend próprio.
  Ver `docs/11-assistente-ia.md`.
- **Mutações do domínio são puras**: recebem um `Doc` e devolvem outro, nunca mutam o
  original (`structuredClone` + retorno). Facilita undo e testa sem side effect.

## Como o projeto é construído

Em etapas — ver `CHECKLIST.md` para a etapa atual e o que falta. Não implemente etapas fora de
ordem sem que o usuário peça; cada etapa entrega algo usável antes da próxima.

## Testes

Duas camadas de teste de interface, além dos testes de domínio (vitest, `editor/src/domain/**`):
componente (`@testing-library/react-native` + `jest-expo`, só onde há lógica de decisão) e
E2E com Maestro (`editor/e2e/*.yaml`, poucos fluxos ponta-a-ponta, contra o app mobile
rodando de verdade — não Playwright, que é automação de navegador). Detalhe completo em
`docs/13-qualidade-e-testes.md`.

## Estilo de código

TypeScript estrito. Sem comentários explicando o óbvio — só quando há uma razão não-óbvia
(invariante, workaround, decisão que surpreenderia quem lê). Sem abstração prematura: três
linhas parecidas são melhores que uma abstração cedo demais.
