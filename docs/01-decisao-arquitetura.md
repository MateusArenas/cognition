# A decisão que define o projeto

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §2.

Mermaid não tem porta nativa. É um pacote JS que gera SVG via DOM e usa `dagre` para layout.
Isso força uma escolha logo no início:

| | **A. WebView como canvas** | **B. 100% nativo** |
|---|---|---|
| Renderização | mermaid.js dentro de WebView | `react-native-svg` + `@dagrejs/dagre` |
| Cobertura de tipos | 25 tipos, de graça | você reimplementa cada um |
| Esforço | 2–3 dias até renderizar | 3–4 semanas para 2 tipos |
| Arrastar nós livremente | impossível (layout automático) | possível |
| Fidelidade | é o Mermaid de verdade | aproximação que envelhece |

## Escolha: caminho A

O WebView é um componente burro: desenha e reporta toques. Todo o resto — barra de ações,
painéis, formulários, teclado, arquivos, compartilhamento — é React Native de verdade. O
usuário nunca percebe o WebView porque ele não mostra chrome de navegador nem recebe entrada
de texto.

Vá para o B apenas se arrastar nós manualmente for requisito de negócio. Ver
[14-nativo-e-armadilhas.md](14-nativo-e-armadilhas.md) para como, se esse dia chegar.

Isso implica em toda a arquitetura de camadas descrita em
[02-setup-e-estrutura.md](02-setup-e-estrutura.md) e no fluxo de ponte RN↔WebView em
[06-canvas.md](06-canvas.md) — ver também o diagrama de sequência em
[15-diagramas.md](15-diagramas.md).
