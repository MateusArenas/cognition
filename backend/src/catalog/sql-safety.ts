// Console SQL livre (pedido do usuário, Etapa DB2) — a ÚNICA exceção controlada à "REGRA DE
// PROJETO" do DB-MOBILE.md ("nada que o usuário digita vira SQL"). A regra continua valendo
// pra tudo mais no app (filtros/ordenação/mutações sempre pelo builder); aqui o usuário PEDE
// pra digitar SQL de verdade, então a proteção muda de forma: por padrão só aceita LEITURA (um
// `SELECT`/`WITH` só, sem ponto-e-vírgula extra, sem palavra de escrita em lugar nenhum da
// string — inclusive dentro de uma CTE gravável tipo `WITH t AS (DELETE FROM x RETURNING *)
// SELECT...`, por isso o filtro de palavra varre a string inteira, não só o primeiro token).
//
// `opts.allowWrite` — segundo pedido do usuário — libera `INSERT`/`UPDATE`/`DELETE` como
// instrução única de topo (não mais como palavra proibida em lugar nenhum da string), mas os
// comandos estruturais/administrativos continuam SEMPRE bloqueados, com ou sem o toggle: eles
// alteram schema ou servidor inteiro, não "os dados de uma tabela", que é o que o usuário pediu
// pra liberar. `allowWrite` só chega aqui vindo da aba Consulta com o toggle ligado — o
// controller/introspect.service.ts ainda cruzam isso com `connection.readOnly` antes de
// executar (defesa em profundidade: o toggle da tela não sobrepõe a conexão marcada como
// somente leitura).
//
// Heurística por regex, não um parser de SQL de verdade — pode rejeitar uma consulta legítima
// que só MENCIONE uma dessas palavras dentro de uma string literal (ex.: `WHERE nota = 'insert
// aqui'`); errar pro lado de rejeitar é a escolha certa aqui, não o contrário.
const ALWAYS_BLOCKED = [
  'drop', 'alter', 'truncate', 'create', 'grant', 'revoke',
  'replace', 'merge', 'call', 'exec', 'execute', 'vacuum', 'attach', 'detach', 'pragma',
];
const WRITE_DML = ['insert', 'update', 'delete'];

export interface SqlSafetyOptions {
  allowWrite?: boolean;
}

export interface SqlSafetyResult {
  ok: boolean;
  reason?: string;
  hasJoin: boolean;
  table?: string;
  isWrite?: boolean;
}

export function checkReadOnlySql(sqlRaw: string, opts: SqlSafetyOptions = {}): SqlSafetyResult {
  const sql = sqlRaw.trim();
  if (!sql) return { ok: false, reason: 'Consulta vazia.', hasJoin: false };

  const withoutTrailing = sql.replace(/;+\s*$/, '');
  if (withoutTrailing.includes(';')) {
    return { ok: false, reason: 'Só uma instrução por consulta — remova o ";" no meio.', hasJoin: false };
  }

  const firstWord = (/^\s*(\w+)/.exec(withoutTrailing)?.[1] || '').toLowerCase();
  const isWrite = WRITE_DML.includes(firstWord);
  const allowedFirstWords = opts.allowWrite ? ['select', 'with', ...WRITE_DML] : ['select', 'with'];
  if (!allowedFirstWords.includes(firstWord)) {
    const reason = opts.allowWrite
      ? 'Comece a consulta com SELECT, WITH, INSERT, UPDATE ou DELETE.'
      : 'O console só executa leitura — comece a consulta com SELECT (ou WITH). Ligue "Permitir alterar dados" para rodar INSERT/UPDATE/DELETE.';
    return { ok: false, reason, hasJoin: false };
  }

  const lower = withoutTrailing.toLowerCase();
  const blockedKeywords = opts.allowWrite ? ALWAYS_BLOCKED : [...ALWAYS_BLOCKED, ...WRITE_DML];
  for (const kw of blockedKeywords) {
    if (new RegExp(`\\b${kw}\\b`).test(lower)) {
      return { ok: false, reason: `A palavra "${kw.toUpperCase()}" não é permitida no console.`, hasJoin: false };
    }
  }

  const hasJoin = /\bjoin\b/.test(lower);
  const tableMatch =
    /\bfrom\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i.exec(withoutTrailing) ||
    /\bupdate\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i.exec(withoutTrailing) ||
    /\binsert\s+into\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i.exec(withoutTrailing);
  const table = !hasJoin && tableMatch ? tableMatch[1] : undefined;
  return { ok: true, hasJoin, table, isWrite };
}
