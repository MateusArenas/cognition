// Console SQL livre (pedido do usuário, Etapa DB2) — a ÚNICA exceção controlada à "REGRA DE
// PROJETO" do DB-MOBILE.md ("nada que o usuário digita vira SQL"). A regra continua valendo
// pra tudo mais no app (filtros/ordenação/mutações sempre pelo builder); aqui o usuário PEDE
// pra digitar SQL de verdade, então a proteção muda de forma: só aceita LEITURA (um `SELECT`/
// `WITH` só, sem ponto-e-vírgula extra, sem palavra de escrita em lugar nenhum da string —
// inclusive dentro de uma CTE gravável tipo `WITH t AS (DELETE FROM x RETURNING *) SELECT...`,
// por isso o filtro de palavra varre a string inteira, não só o primeiro token).
// Heurística por regex, não um parser de SQL de verdade — pode rejeitar uma consulta legítima
// que só MENCIONE uma dessas palavras dentro de uma string literal (ex.: `WHERE nota = 'insert
// aqui'`); errar pro lado de rejeitar é a escolha certa aqui, não o contrário.
const WRITE_KEYWORDS = [
  'insert', 'update', 'delete', 'drop', 'alter', 'truncate', 'create', 'grant', 'revoke',
  'replace', 'merge', 'call', 'exec', 'execute', 'vacuum', 'attach', 'detach', 'pragma',
];

export interface SqlSafetyResult {
  ok: boolean;
  reason?: string;
  hasJoin: boolean;
  table?: string;
}

export function checkReadOnlySql(sqlRaw: string): SqlSafetyResult {
  const sql = sqlRaw.trim();
  if (!sql) return { ok: false, reason: 'Consulta vazia.', hasJoin: false };

  const withoutTrailing = sql.replace(/;+\s*$/, '');
  if (withoutTrailing.includes(';')) {
    return { ok: false, reason: 'Só uma instrução por consulta — remova o ";" no meio.', hasJoin: false };
  }

  const firstWord = (/^\s*(\w+)/.exec(withoutTrailing)?.[1] || '').toLowerCase();
  if (firstWord !== 'select' && firstWord !== 'with') {
    return { ok: false, reason: 'O console só executa leitura — comece a consulta com SELECT (ou WITH).', hasJoin: false };
  }

  const lower = withoutTrailing.toLowerCase();
  for (const kw of WRITE_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`).test(lower)) {
      return { ok: false, reason: `A palavra "${kw.toUpperCase()}" não é permitida no console (só leitura).`, hasJoin: false };
    }
  }

  const hasJoin = /\bjoin\b/.test(lower);
  const tableMatch = /\bfrom\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i.exec(withoutTrailing);
  const table = !hasJoin && tableMatch ? tableMatch[1] : undefined;
  return { ok: true, hasJoin, table };
}
