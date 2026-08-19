# Barra de ações contextual

> Fonte completa: [ESPECIFICACAO-APP-RN-EXPO.md](../ESPECIFICACAO-APP-RN-EXPO.md) §11.
> Status: **implementado** (Etapas 6-7, 9) em
> `editor/src/features/diagram/ActionBarController.tsx` + `inspectors/` + `composers/`.
> Flow Maestro da Camada 2 ainda pendente — precisa de simulador/dev build, indisponível neste
> ambiente (ver [13-qualidade-e-testes.md](13-qualidade-e-testes.md)).

O componente que mais define a sensação do app. **Selecionar não abre painel** — aparece uma
barra acima da tab bar com o elemento identificado e 5-7 ações em fila horizontal. Trocar o
texto de um nó são dois toques, não cinco.

Em RN: uma `View` com entrada animada + `ScrollView horizontal`
(`showsHorizontalScrollIndicator={false}`). **Não usar BottomSheet aqui** — a barra é
persistente e não-modal; virar sheet reintroduz o custo que ela existe para eliminar.

**Bug real: selecionar algo dava um zoom out no diagrama.** A barra nascia como um irmão de
flex normal, embaixo do `canvasArea` — aparecer/sumir encolhia/crescia o WebView de verdade, e
cada mudança de tamanho disparava o `ResizeObserver` do runtime, que reencaixa (`fit()`) o
diagrama pro novo tamanho — mudando o zoom sozinho toda vez que algo era selecionado (docs/06-
canvas.md tem o detalhe do lado do runtime). Corrigido tornando `ActionBar`
(`design/components/ActionBar.tsx`) um overlay `position:'absolute'` — flutua sobre o canvas
em vez de empurrá-lo, então o WebView nunca muda de tamanho por causa dela. Os FABs do canvas
(IA/Adicionar) somam a altura real da barra (reportada via `onLayout`, guardada em
`DiagramScreen`) ao próprio deslocamento de baixo só enquanto há seleção — senão ficariam
escondidos atrás dela.

**Bug real: trocar de aba (Diagrama/Elementos/Código) com um inspetor aberto deixava a sheet
flutuando por cima do conteúdo errado** (reportado pelo usuário: "ta indo pra tab e ficando
aberto"). Corrigido em duas partes: `ActionBarController` agora fecha o próprio inspetor
(`inspectorRef.current?.dismiss()`) sempre que `sel` vira `null` — cobre trocar de aba, tocar
em vazio e cancelar na `ActionBar`, não só o caso específico de trocar de aba; e o `onChange`
do `Segmented` de abas, em `DiagramScreen`, virou `handleTabChange()`, que soma `select(null)`
(fecha `ActionBar` + inspetor) e `dismiss()` explícito no `ShareSheet`/`AiSheet` (que não
dependem de seleção nenhuma) antes de trocar de aba.

## Ações por tipo de seleção

| Seleção | Ações |
|---|---|
| Nó | Texto · Conectar · Forma · Cor · Grupo · Duplicar · IA · Excluir · Editar |
| Ligação | Rótulo · Inverter · Traço · IA · Excluir · Editar |
| Grupo (subgraph) | Nome · Nós · IA · Excluir · Editar |
| Tabela | Colunas · Nome · Relacionar · Duplicar · IA · Excluir · Editar |
| Coluna | Nome · Tipo · Comentário · IA · Tabela · Excluir · Editar |
| Relação | Verbo · Cardinalidade · Inverter · IA · Excluir · Editar |
| Texto (raw) | Texto · Duplicar linha · IA · Código · Excluir linha · Editar |
| Modo conexão | "saindo de X — toque no destino" + Cancelar |

**Forma, Cor, Grupo, Colunas e Cardinalidade abrem o painel completo já rolado até a seção
certa** — guardar a posição de cada seção com `onLayout` e chamar `scrollTo`.

**Grupo, na barra do nó, e Nós, na barra do grupo, abrem o MESMO painel do nó/grupo** — não
existe inspetor próprio de "atribuir nó a grupo"; é só mais uma seção do `NodeInspector`
(chips com os grupos existentes + campo pra criar um novo, que já atribui o nó selecionado
nele) e do `GroupInspector` (lista de nós do grupo, com botão de tirar, mais chips dos nós de
fora pra adicionar).

## Três superfícies, em peso crescente

1. **Barra contextual** — não-modal, para o que se faz o tempo todo.
2. **Alerta** — um valor só: texto do nó, rótulo, nome da tabela.
3. **Bottom sheet** — muitos controles: formas, cores, colunas, cardinalidade.

## Criação encadeada

O botão **+** abre um compositor: campo de texto, seis formas comuns, três botões (Cancelar,
**Adicionar e continuar**, Adicionar). "Continuar" cria o nó, liga ao anterior e reabre o
compositor apontando para o novo — dá para montar um fluxo de doze etapas sem sair do teclado.
**É a única coisa no editor que muda a produtividade em ordem de grandeza. Porte com
prioridade.**

## Destrutivo

Confirma em alerta com botão vermelho **e** o toast depois diz que dá para desfazer — as duas
coisas juntas, não uma ou outra.
