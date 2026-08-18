import { describe, expect, it } from 'vitest';
import { addRelation, addTable, duplicateTable, invertRelation } from './er';
import { blankER } from '../mermaid/factory';

function withTables() {
  let d = blankER('t');
  d = addTable(d, 'A');
  d = addTable(d, 'B');
  d = addRelation(d, { from: 'A', to: 'B', cardL: '||', cardR: 'o{', identifying: true, label: 'tem' });
  return d;
}

describe('mutations/er', () => {
  it('duplicateTable cria uma tabela com id livre', () => {
    const d = withTables();
    const r = duplicateTable(d, 'A');
    expect(r.tables).toHaveLength(3);
    expect(r.tables[2].id).toBe('A_2');
  });

  it('invertRelation troca from/to e espelha a cardinalidade', () => {
    const d = withTables();
    const r = invertRelation(d, d.relations[0].id);
    expect(r.relations[0].from).toBe('B');
    expect(r.relations[0].to).toBe('A');
    // ||--o{ (1 pra zero-ou-N) invertido é }o--|| (zero-ou-N pra 1)
    expect(r.relations[0].cardL).toBe('}o');
    expect(r.relations[0].cardR).toBe('||');
  });

  it('invertRelation duas vezes volta ao estado original', () => {
    const d = withTables();
    const r = invertRelation(invertRelation(d, d.relations[0].id), d.relations[0].id);
    expect(r.relations[0]).toEqual(d.relations[0]);
  });
});
