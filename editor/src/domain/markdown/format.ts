// Ações da barra de formatação (§13.2) — cada uma age sobre a seleção (envolver) ou sobre as
// linhas do cursor (prefixo), como no Notas. Toda ação devolve o texto novo e onde a seleção
// deve ficar depois, pra aplicar duas vezes seguidas desfazer a primeira (idempotência —
// docs/13-qualidade-e-testes.md).
export interface EditResult {
  text: string;
  selStart: number;
  selEnd: number;
}

export function toggleWrap(text: string, ini: number, fim: number, marker: string): EditResult {
  const antes = text.slice(Math.max(0, ini - marker.length), ini);
  const depois = text.slice(fim, fim + marker.length);
  if (antes === marker && depois === marker) {
    return {
      text: text.slice(0, ini - marker.length) + text.slice(ini, fim) + text.slice(fim + marker.length),
      selStart: ini - marker.length,
      selEnd: fim - marker.length,
    };
  }
  const dentro = text.slice(ini, fim);
  if (dentro.length >= marker.length * 2 && dentro.startsWith(marker) && dentro.endsWith(marker)) {
    const miolo = dentro.slice(marker.length, dentro.length - marker.length);
    return { text: text.slice(0, ini) + miolo + text.slice(fim), selStart: ini, selEnd: ini + miolo.length };
  }
  return {
    text: text.slice(0, ini) + marker + dentro + marker + text.slice(fim),
    selStart: ini + marker.length,
    selEnd: fim + marker.length,
  };
}

function linhaEmVolta(text: string, ini: number, fim: number) {
  const linhaIni = text.lastIndexOf('\n', ini - 1) + 1;
  let linhaFim = text.indexOf('\n', fim);
  if (linhaFim < 0) linhaFim = text.length;
  return { linhaIni, linhaFim };
}

export function toggleLinePrefix(text: string, ini: number, fim: number, prefix: string): EditResult {
  const { linhaIni, linhaFim } = linhaEmVolta(text, ini, fim);
  const bloco = text.slice(linhaIni, linhaFim);
  const linhas = bloco.split('\n');
  const naoVazias = linhas.filter((l) => l.trim() !== '');
  const todasTemPrefixo = naoVazias.length > 0 && naoVazias.every((l) => l.startsWith(prefix));
  const novasLinhas = todasTemPrefixo
    ? linhas.map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : l))
    : linhas.map((l) => (l.trim() === '' ? l : prefix + l));
  const novoBloco = novasLinhas.join('\n');
  const delta = novoBloco.length - bloco.length;
  return {
    text: text.slice(0, linhaIni) + novoBloco + text.slice(linhaFim),
    selStart: Math.max(linhaIni, ini + (todasTemPrefixo ? -prefix.length : prefix.length)),
    selEnd: fim + delta,
  };
}

const TASK_RE = /^- \[([ xX])\] /;

export function toggleTask(text: string, ini: number, fim: number): EditResult {
  const { linhaIni, linhaFim } = linhaEmVolta(text, ini, fim);
  const linha = text.slice(linhaIni, linhaFim);
  const m = TASK_RE.exec(linha);
  if (m) {
    const resto = linha.slice(m[0].length);
    return { text: text.slice(0, linhaIni) + resto + text.slice(linhaFim), selStart: ini - m[0].length, selEnd: fim - m[0].length };
  }
  return { text: text.slice(0, linhaIni) + '- [ ] ' + linha + text.slice(linhaFim), selStart: ini + 6, selEnd: fim + 6 };
}

export function cycleHeading(text: string, cursor: number): EditResult {
  const { linhaIni, linhaFim } = linhaEmVolta(text, cursor, cursor);
  const linha = text.slice(linhaIni, linhaFim);
  const m = /^(#{1,4}) /.exec(linha);
  const nivel = m ? m[1].length : 0;
  const novoNivel = nivel >= 4 ? 0 : nivel + 1;
  const semPrefixo = m ? linha.slice(m[0].length) : linha;
  const novaLinha = novoNivel === 0 ? semPrefixo : '#'.repeat(novoNivel) + ' ' + semPrefixo;
  const novoCursor = linhaIni + novaLinha.length;
  return { text: text.slice(0, linhaIni) + novaLinha + text.slice(linhaFim), selStart: novoCursor, selEnd: novoCursor };
}

export function insertLink(text: string, ini: number, fim: number): EditResult {
  const dentro = text.slice(ini, fim) || 'link';
  const inserted = `[${dentro}](url)`;
  return {
    text: text.slice(0, ini) + inserted + text.slice(fim),
    selStart: ini + dentro.length + 3,
    selEnd: ini + dentro.length + 6,
  };
}

export function insertAt(text: string, pos: number, insercao: string): EditResult {
  return { text: text.slice(0, pos) + insercao + text.slice(pos), selStart: pos + insercao.length, selEnd: pos + insercao.length };
}

export const TABELA_MODELO = '\n| Coluna 1 | Coluna 2 |\n| --- | --- |\n| valor | valor |\n';
export const REGUA = '\n---\n';
