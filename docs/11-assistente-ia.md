# Assistente de IA

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §14.
> Status: **implementado** (Etapa 15) — `editor/src/app/api/diagrama+api.ts`,
> `editor/src/services/ai.ts`, `editor/src/features/ai/`. Precisa de `ANTHROPIC_API_KEY` no
> ambiente do servidor pra funcionar de verdade; sem isso a rota devolve um 500 claro em vez
> de falhar silenciosamente.

## Regra inegociável

**Nunca embarque chave de API no app.** Qualquer um extrai a chave de um bundle React Native em
minutos. A chamada vai para um backend próprio (rota de API do Expo Router,
`src/app/api/diagrama+api.ts`), que guarda a chave e aplica limite de uso por dispositivo,
tamanho máximo de entrada e timeout.

## Escopo

Dois caminhos de entrada: botão no canvas (escopo = diagrama inteiro) e ação **IA** na barra
contextual (escopo = elemento selecionado, com a identificação exata do alvo e a ordem de não
tocar no resto).

## Validação antes de aplicar

**A resposta passa pelo `mermaid.parse` antes de virar diagrama.** Se não compilar, o erro
volta para o modelo numa segunda tentativa automática; só então se aplica, sempre via `apply`
(ver [05-estado.md](05-estado.md)) para que o desfazer reverta num toque. Sem isso, uma
resposta ruim quebra o diagrama sem volta.

## Sugestões contextuais

Chips que mudam conforme a seleção — numa ligação, "Inverter o sentido"; numa tabela,
"Adicionar campos de auditoria". Reduz o custo de começar a escrever.

## Como a validação de verdade funciona aqui

O `mermaid.parse` que valida a resposta da IA (§14.3) só existe dentro do WebView — é lá que o
Mermaid de verdade está carregado (ver [06-canvas.md](06-canvas.md)). Por isso a ponte
RN↔WebView ganhou um message type a mais além dos 5 do spec original:
`{t:'validate', code, reqId}` / `{t:'validated', reqId, ok, message?}` — `reqId` correlaciona
pedido e resposta porque uma validação pode acontecer enquanto outro `render` está em voo.
`DiagramCanvas#validate(code)` expõe isso como uma Promise; `useAi` chama isso, não
reimplementa um parser.
