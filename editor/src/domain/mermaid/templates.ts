// Modelos prontos usados pela galeria (Etapa 10) e pelos testes de round-trip.
import type { ErDoc, FlowDoc, MdDoc } from '../types';
import { uid } from '../id';
import { blankER, blankFlow, blankMd } from './factory';
import { serialize } from './serialize';

export function templateFlow(): FlowDoc {
  const d = blankFlow('Recebimento de carga');
  d.direction = 'TD';
  d.classes = [
    { id: 'inicio', fill: '#34C75926', stroke: '#34C759', color: null, width: 2 },
    { id: 'decisao', fill: '#FF950026', stroke: '#FF9500', color: null, width: 2 },
    { id: 'erro', fill: '#FF3B3026', stroke: '#FF3B30', color: null, width: 2 },
    { id: 'sistema', fill: '#007AFF26', stroke: '#007AFF', color: null, width: 2 },
  ];
  d.nodes = [
    { id: 'A', label: 'Chegada do veículo', shape: 'stadium', cls: 'inicio' },
    { id: 'B', label: 'Conferir nota fiscal', shape: 'round', cls: null },
    { id: 'C', label: 'Nota confere?', shape: 'rhombus', cls: 'decisao' },
    { id: 'D', label: 'Registrar divergência', shape: 'round', cls: 'erro' },
    { id: 'E', label: 'Descarregar paletes', shape: 'round', cls: null },
    { id: 'F', label: 'Ler etiqueta\n(DataMatrix)', shape: 'parallel', cls: null },
    { id: 'G', label: 'Gerar volume no WCS', shape: 'subroutine', cls: 'sistema' },
    { id: 'H', label: 'Endereço disponível?', shape: 'rhombus', cls: 'decisao' },
    { id: 'I', label: 'Alocar em pulmão', shape: 'round', cls: null },
    { id: 'J', label: 'Fila de espera', shape: 'cylinder', cls: null },
    { id: 'K', label: 'Confirmar entrada\nno WMS', shape: 'round', cls: 'sistema' },
    { id: 'L', label: 'Fim', shape: 'doublecirc', cls: 'inicio' },
  ];
  d.groups = [
    { id: 'sgDoca', label: 'Doca', nodes: ['A', 'B', 'C', 'D', 'E'], direction: null },
    { id: 'sgArmazem', label: 'Armazém', nodes: ['F', 'G', 'H', 'I', 'J', 'K'], direction: null },
  ];
  d.edges = [
    { id: uid('e'), from: 'A', to: 'B', label: '', type: 'arrow' },
    { id: uid('e'), from: 'B', to: 'C', label: '', type: 'arrow' },
    { id: uid('e'), from: 'C', to: 'D', label: 'não', type: 'arrow' },
    { id: uid('e'), from: 'D', to: 'B', label: 'reconferir', type: 'dotted' },
    { id: uid('e'), from: 'C', to: 'E', label: 'sim', type: 'arrow' },
    { id: uid('e'), from: 'E', to: 'F', label: '', type: 'arrow' },
    { id: uid('e'), from: 'F', to: 'G', label: '', type: 'arrow' },
    { id: uid('e'), from: 'G', to: 'H', label: '', type: 'arrow' },
    { id: uid('e'), from: 'H', to: 'I', label: 'sim', type: 'arrow' },
    { id: uid('e'), from: 'H', to: 'J', label: 'não', type: 'arrow' },
    { id: uid('e'), from: 'J', to: 'H', label: 'retry 5 min', type: 'dotted' },
    { id: uid('e'), from: 'I', to: 'K', label: '', type: 'arrow' },
    { id: uid('e'), from: 'K', to: 'L', label: '', type: 'thick' },
  ];
  return d;
}

export function templateER(): ErDoc {
  const d = blankER('Estoque e pedidos');
  d.tables = [
    {
      id: 'CLIENTE', label: 'CLIENTE',
      cols: [
        { type: 'uuid', name: 'id', keys: ['PK'], note: '' },
        { type: 'varchar', name: 'razao_social', keys: [], note: '' },
        { type: 'varchar', name: 'cnpj', keys: ['UK'], note: 'somente dígitos' },
      ],
    },
    {
      id: 'PEDIDO', label: 'PEDIDO',
      cols: [
        { type: 'uuid', name: 'id', keys: ['PK'], note: '' },
        { type: 'uuid', name: 'cliente_id', keys: ['FK'], note: '' },
        { type: 'varchar', name: 'numero', keys: ['UK'], note: 'nº do WMS' },
      ],
    },
    {
      id: 'ITEM_PEDIDO', label: 'ITEM_PEDIDO',
      cols: [
        { type: 'uuid', name: 'id', keys: ['PK'], note: '' },
        { type: 'uuid', name: 'pedido_id', keys: ['FK'], note: '' },
        { type: 'uuid', name: 'produto_id', keys: ['FK'], note: '' },
      ],
    },
    {
      id: 'PRODUTO', label: 'PRODUTO',
      cols: [
        { type: 'uuid', name: 'id', keys: ['PK'], note: '' },
        { type: 'varchar', name: 'sku', keys: ['UK'], note: '' },
      ],
    },
  ];
  d.relations = [
    { id: uid('r'), from: 'CLIENTE', to: 'PEDIDO', cardL: '||', cardR: 'o{', identifying: true, label: 'faz' },
    { id: uid('r'), from: 'PEDIDO', to: 'ITEM_PEDIDO', cardL: '||', cardR: '|{', identifying: true, label: 'contém' },
    { id: uid('r'), from: 'PRODUTO', to: 'ITEM_PEDIDO', cardL: '||', cardR: 'o{', identifying: false, label: 'é pedido em' },
  ];
  return d;
}

// Mesmo tema "Recebimento de carga" dos outros dois modelos — mostra a ida-e-volta
// documento↔diagrama (§13.4) já com um exemplo de verdade, não um bloco vazio. O card
// "Documento" da galeria abre este; "Em branco" usa blankMd() puro.
export function templateMd(): MdDoc {
  const linhas = [
    '# Recebimento de carga',
    '',
    'Documento de referência do fluxo de entrada no armazém. Toque em **Editar** no diagrama',
    'abaixo para ajustá-lo no canvas — ao voltar, o texto aqui atualiza sozinho.',
    '',
    '## Fluxo',
    '',
    '```mermaid',
    serialize(templateFlow()),
    '```',
    '',
    '## Regras',
    '',
    '| Situação | Ação | Responsável |',
    '| --- | --- | --- |',
    '| Nota confere | Liberar descarga | Conferente |',
    '| Divergência de quantidade | Registrar e reconferir | Supervisor |',
    '',
    '## Pendências',
    '',
    '- [x] Definir o layout da etiqueta',
    '- [ ] Fechar o contrato de leitura DataMatrix',
    '- [ ] Validar o tempo de resposta da fila',
    '',
    '> Divergência de nota bloqueia a descarga. Sem exceção.',
    '',
  ];
  return blankMd('Especificação de recebimento', linhas.join('\n'));
}
