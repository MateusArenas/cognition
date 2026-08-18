// Catálogo dos 25 tipos de diagrama Mermaid cobertos pelo editor.
// Ver ESPECIFICACAO-APP-RN-EXPO.md §6.5. ZenUML e Wardley ficam de fora de propósito
// (dependem de plugins fora da lib padrão do Mermaid — um card que nunca renderiza é
// pior que a ausência dele).

export type GrupoTipo = 'Processo e fluxo' | 'Estrutura e arquitetura' | 'Hierarquia' | 'Tempo' | 'Dados e análise';

export interface TipoDiagrama {
  id: string;
  nome: string;
  grupo: GrupoTipo;
  kw: string; // "sequenceDiagram"
  visual?: boolean; // só flow e er
  oque: string;
  quando: string;
  code?: string;
}

export const TIPOS: TipoDiagrama[] = [
  // --- Processo e fluxo ---
  {
    id: 'flow', nome: 'Fluxograma', grupo: 'Processo e fluxo', kw: 'flowchart', visual: true,
    oque: 'Caixas ligadas por setas. É o tipo mais usado e o mais flexível do Mermaid.',
    quando: 'Passo a passo de um processo, árvore de decisão, fluxo de uma tela.',
  },
  {
    id: 'state', nome: 'Estados', grupo: 'Processo e fluxo', kw: 'stateDiagram-v2',
    oque: 'Os estados possíveis de algo e o que faz sair de um para outro.',
    quando: 'Ciclo de vida de um pedido, máquina de estados, fluxo de aprovação.',
    code: 'stateDiagram-v2\n    [*] --> Aberto\n    Aberto --> Separando: liberar\n    Separando --> Conferencia: fim da separação\n    Conferencia --> Separando: divergência\n    Conferencia --> Expedido: conferido\n    Expedido --> [*]\n    Aberto --> Cancelado: cancelar\n    Cancelado --> [*]',
  },
  {
    id: 'seq', nome: 'Sequência', grupo: 'Processo e fluxo', kw: 'sequenceDiagram',
    oque: 'Quem conversa com quem, na ordem do tempo. O tempo corre de cima para baixo.',
    quando: 'Chamada de API, fluxo de autenticação, troca de mensagens entre sistemas.',
    code: 'sequenceDiagram\n    autonumber\n    participant A as App\n    participant G as Gateway\n    A->>G: POST /pedidos\n    G-->>A: 201 Created',
  },
  {
    id: 'journey', nome: 'Jornada', grupo: 'Processo e fluxo', kw: 'journey',
    oque: 'Os passos de uma pessoa num processo, cada um com uma nota de satisfação de 1 a 5.',
    quando: 'Mapear onde o usuário sofre. Ótimo para achar o ponto de atrito.',
    code: 'journey\n    title Jornada do separador no turno\n    section Início do turno\n      Login no coletor: 4: Separador\n      Receber missão: 5: Separador',
  },
  {
    id: 'kanban', nome: 'Kanban', grupo: 'Processo e fluxo', kw: 'kanban',
    oque: 'Um quadro de colunas com cartões, igual ao do Trello ou Jira.',
    quando: 'Foto do andamento de um sprint dentro da documentação.',
    code: 'kanban\n    Backlog\n        [Revisar regra de FEFO]\n    Fazendo\n        [Explosão de caixa PTW]',
  },
  {
    id: 'git', nome: 'Git', grupo: 'Processo e fluxo', kw: 'gitGraph',
    oque: 'Commits, branches e merges desenhados como o histórico do repositório.',
    quando: 'Explicar a estratégia de branch do time ou o fluxo de release.',
    code: 'gitGraph\n    commit id: "setup"\n    branch develop\n    checkout develop\n    commit id: "api"\n    checkout main\n    merge develop',
  },
  // --- Estrutura e arquitetura ---
  {
    id: 'er', nome: 'Relacional', grupo: 'Estrutura e arquitetura', kw: 'erDiagram', visual: true,
    oque: 'Tabelas com suas colunas e as relações entre elas, com cardinalidade.',
    quando: 'Modelar um banco de dados antes de escrever a migration.',
  },
  {
    id: 'class', nome: 'Classes', grupo: 'Estrutura e arquitetura', kw: 'classDiagram',
    oque: 'Classes com atributos, métodos e como herdam ou se compõem. É UML.',
    quando: 'Explicar o desenho de um módulo orientado a objetos ou um domínio.',
    code: 'classDiagram\n    class Pedido {\n        +string id\n        +adicionarItem(item) void\n    }\n    class ItemPedido {\n        +string id\n    }\n    Pedido "1" *-- "1..*" ItemPedido',
  },
  {
    id: 'c4', nome: 'C4', grupo: 'Estrutura e arquitetura', kw: 'C4Context',
    oque: 'Arquitetura em camadas de zoom: contexto, contêiner, componente. Mostra pessoas e sistemas externos.',
    quando: 'Documentar como o seu sistema se encaixa no resto do mundo.',
    code: 'C4Context\n    title Contexto do sistema\n    Person(operador, "Operador", "Usa o sistema")\n    System(sys, "Sistema", "Faz o trabalho")\n    Rel(operador, sys, "Usa")',
  },
  {
    id: 'arch', nome: 'Arquitetura', grupo: 'Estrutura e arquitetura', kw: 'architecture-beta',
    oque: 'Serviços de infra com ícones prontos de servidor, banco, disco e nuvem.',
    quando: 'Desenhar a topologia de deploy: o que roda onde e conversa com quem.',
    code: 'architecture-beta\n    group producao(cloud)[Producao]\n    service api(server)[API] in producao\n    service banco(database)[Banco] in producao\n    api:R -- L:banco',
  },
  {
    id: 'block', nome: 'Blocos', grupo: 'Estrutura e arquitetura', kw: 'block-beta',
    oque: 'Blocos numa grade que você controla, em vez de deixar o layout automático decidir.',
    quando: 'Quando o fluxograma insiste em posicionar as caixas do jeito errado.',
    code: 'block-beta\n    columns 3\n    doca["Doca"] armazem["Armazém"] expedicao["Expedição"]\n    doca --> armazem\n    armazem --> expedicao',
  },
  {
    id: 'req', nome: 'Requisitos', grupo: 'Estrutura e arquitetura', kw: 'requirementDiagram',
    oque: 'Requisitos formais com id, risco e método de verificação, ligados a quem os satisfaz.',
    quando: 'Especificação contratual, rastreabilidade, auditoria.',
    code: 'requirementDiagram\n    requirement req_a {\n        id: RF-01\n        text: descricao\n        risk: high\n        verifymethod: test\n    }',
  },
  // --- Hierarquia ---
  {
    id: 'mind', nome: 'Mapa mental', grupo: 'Hierarquia', kw: 'mindmap',
    oque: 'Um assunto no centro e ramos saindo dele. A indentação define os níveis.',
    quando: 'Organizar ideias no começo, montar escopo, resumir um domínio.',
    code: 'mindmap\n  root((Sistema))\n    Recebimento\n      Conferência\n    Expedição\n      Romaneio',
  },
  {
    id: 'tree', nome: 'Árvore de arquivos', grupo: 'Hierarquia', kw: 'treeView-beta',
    oque: 'Hierarquia no formato de árvore de pastas, com recuo definindo os níveis.',
    quando: 'Documentar a estrutura de um projeto ou um menu de navegação.',
    code: 'treeView-beta\n    "src"\n        "modules"\n            "estoque"\n        "main.ts"\n    "package.json"',
  },
  {
    id: 'treemap', nome: 'Treemap', grupo: 'Hierarquia', kw: 'treemap-beta',
    oque: 'Retângulos aninhados com tamanho proporcional ao valor.',
    quando: 'Mostrar onde está concentrado o volume: ocupação, custo, tamanho de arquivo.',
    code: 'treemap-beta\n"Armazém"\n    "Picking"\n        "Corredor A": 120\n        "Corredor B": 95',
  },
  {
    id: 'ishikawa', nome: 'Ishikawa', grupo: 'Hierarquia', kw: 'ishikawa-beta',
    oque: 'Espinha de peixe. O problema fica na cabeça e as causas se organizam em categorias.',
    quando: 'Post-mortem de incidente, análise de causa raiz, retrospectiva.',
    code: 'ishikawa-beta\n    Separação atrasada\n        Infraestrutura\n            Wi-Fi instável\n        Processo\n            Reabastecimento tardio',
  },
  // --- Tempo ---
  {
    id: 'gantt', nome: 'Gantt', grupo: 'Tempo', kw: 'gantt',
    oque: 'Barras de tarefa numa linha do tempo, com dependências e marcos.',
    quando: 'Cronograma de projeto, plano de implantação, previsão de entrega.',
    code: 'gantt\n    title Implantação\n    dateFormat YYYY-MM-DD\n    section Especificação\n    Levantamento :done, a1, 2026-03-02, 10d',
  },
  {
    id: 'timeline', nome: 'Linha do tempo', grupo: 'Tempo', kw: 'timeline',
    oque: 'Eventos em ordem cronológica, agrupados por fase.',
    quando: 'Roadmap, histórico do produto, retrospectiva do que aconteceu quando.',
    code: 'timeline\n    title Roadmap\n    section Descoberta\n        Semana 1 : Levantamento',
  },
  // --- Dados e análise ---
  {
    id: 'pie', nome: 'Pizza', grupo: 'Dados e análise', kw: 'pie',
    oque: 'Fatias proporcionais de um todo.',
    quando: 'Poucas categorias, entre duas e oito, que somam cem por cento.',
    code: 'pie title Ocupação\n    "Picking ocupado" : 42\n    "Livre" : 20',
  },
  {
    id: 'xy', nome: 'Barras e linhas', grupo: 'Dados e análise', kw: 'xychart-beta',
    oque: 'Gráfico com eixo X e Y. Aceita barras, linha, ou as duas sobrepostas.',
    quando: 'Série temporal, comparação de meses, evolução de um indicador.',
    code: 'xychart-beta\n    title "Volumes por mês"\n    x-axis [jan, fev, mar]\n    y-axis "Volumes" 0 --> 12000\n    bar [5200, 6100, 7400]',
  },
  {
    id: 'sankey', nome: 'Sankey', grupo: 'Dados e análise', kw: 'sankey-beta',
    oque: 'Fluxo em que a espessura da faixa é proporcional à quantidade.',
    quando: 'Ver onde o volume se perde: funil de conversão, quebra de estoque, orçamento.',
    code: 'sankey-beta\n    Recebido,Conferido,1200\n    Recebido,Divergencia,80',
  },
  {
    id: 'quadrant', nome: 'Quadrante', grupo: 'Dados e análise', kw: 'quadrantChart',
    oque: 'Matriz de dois eixos dividida em quatro quadrantes nomeados.',
    quando: 'Priorizar backlog por esforço e impacto, matriz de risco, análise competitiva.',
    code: 'quadrantChart\n    title Priorização\n    x-axis Baixo esforço --> Alto esforço\n    y-axis Baixo impacto --> Alto impacto\n    quadrant-1 Planejar',
  },
  {
    id: 'radar', nome: 'Radar', grupo: 'Dados e análise', kw: 'radar-beta',
    oque: 'Vários eixos saindo do centro, com uma ou mais curvas comparadas.',
    quando: 'Comparar hoje contra a meta em vários critérios: maturidade, skills, KPIs.',
    code: 'radar-beta\n    title Maturidade\n    axis a["Documentação"], b["Testes"]\n    curve atual["Hoje"]{60, 45}\n    max 100\n    min 0',
  },
  {
    id: 'venn', nome: 'Venn', grupo: 'Dados e análise', kw: 'venn-beta',
    oque: 'Círculos que se sobrepõem para mostrar o que é comum entre grupos.',
    quando: 'Responsabilidades compartilhadas, sobreposição de público, comparação de features.',
    code: 'venn-beta\n    set A["Backend"]\n    set B["Operação"]\n    union A,B',
  },
  {
    id: 'packet', nome: 'Pacote de rede', grupo: 'Dados e análise', kw: 'packet-beta',
    oque: 'Cada faixa de bits de um pacote desenhada em escala.',
    quando: 'Documentar cabeçalho de protocolo ou formato binário de mensagem.',
    code: 'packet-beta\n    0-15: "Porta de origem"\n    16-31: "Porta de destino"',
  },
];

export const GRUPOS: GrupoTipo[] = ['Processo e fluxo', 'Estrutura e arquitetura', 'Hierarquia', 'Tempo', 'Dados e análise'];

export function tipoById(id: string): TipoDiagrama | undefined {
  return TIPOS.find((t) => t.id === id);
}

export function detectarTipo(primeiraLinha: string): string {
  const p = String(primeiraLinha || '').trim().split(/[\s{]/)[0];
  const t = TIPOS.find((x) => x.kw.toLowerCase() === p.toLowerCase());
  return t ? t.nome : p || 'Código Mermaid';
}
