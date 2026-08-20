import { Injectable } from '@nestjs/common';
import type { TableDetail } from '../catalog/introspect.service';
import { IntrospectService } from '../catalog/introspect.service';

export interface ErdOptions {
  columns?: boolean;
  keysOnly?: boolean;
}

function ident(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_');
}
function typeToken(t: string): string {
  return t.replace(/\s+/g, '_').replace(/[(),]/g, '') || 'unknown';
}

// erDiagram do Mermaid a partir do catálogo — DB-MOBILE.md §3.4/§4.12. Mesma geometria (o
// catálogo) alimenta a tela de Diagrama do app inteiro e a vizinhança de UMA tabela; só muda
// quais tabelas entram no `render()`.
@Injectable()
export class MermaidService {
  constructor(private readonly introspect: IntrospectService) {}

  async wholeSchema(connectionId: string, ownerId: string, opts: ErdOptions = {}): Promise<string> {
    const tables = await this.introspect.tables(connectionId, ownerId);
    const details = await Promise.all(tables.map((t) => this.introspect.tableDetail(connectionId, ownerId, t.name)));
    return this.render(details, opts);
  }

  async neighborhood(connectionId: string, ownerId: string, table: string, depth = 1, opts: ErdOptions = {}): Promise<string> {
    const tables = await this.introspect.tables(connectionId, ownerId);
    const details = await Promise.all(tables.map((t) => this.introspect.tableDetail(connectionId, ownerId, t.name)));
    const byName = new Map(details.map((d) => [d.name, d]));

    const visited = new Set<string>([table]);
    let frontier = [table];
    for (let i = 0; i < Math.max(1, Math.min(depth, 3)); i++) {
      const next: string[] = [];
      for (const name of frontier) {
        const d = byName.get(name);
        if (!d) continue;
        for (const fk of d.foreignKeys) if (!visited.has(fk.refTable)) { visited.add(fk.refTable); next.push(fk.refTable); }
        for (const fk of d.referencedBy) if (!visited.has(fk.table)) { visited.add(fk.table); next.push(fk.table); }
      }
      frontier = next;
      if (!frontier.length) break;
    }

    const subset = [...visited].map((n) => byName.get(n)).filter((d): d is TableDetail => !!d);
    return this.render(subset, opts);
  }

  private render(details: TableDetail[], opts: ErdOptions): string {
    const lines = ['erDiagram'];
    const showColumns = opts.columns !== false;

    for (const t of details) {
      const name = ident(t.name);
      const fkColumns = new Set(t.foreignKeys.flatMap((fk) => fk.columns));
      const cols = opts.keysOnly ? t.columns.filter((c) => c.isPrimaryKey || fkColumns.has(c.name)) : t.columns;
      if (showColumns && cols.length) {
        lines.push(`  ${name} {`);
        for (const c of cols) {
          const key = c.isPrimaryKey ? ' PK' : fkColumns.has(c.name) ? ' FK' : '';
          lines.push(`    ${typeToken(c.type)} ${ident(c.name)}${key}`);
        }
        lines.push('  }');
      } else {
        lines.push(`  ${name} {\n  }`);
      }
    }

    const known = new Set(details.map((d) => d.name));
    for (const t of details) {
      for (const fk of t.foreignKeys) {
        if (!known.has(fk.refTable)) continue;
        lines.push(`  ${ident(t.name)} }o--|| ${ident(fk.refTable)} : "${ident(fk.name)}"`);
      }
    }
    return lines.join('\n');
  }
}
