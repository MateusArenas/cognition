// Tipo raw: o código É o modelo. A manipulação é sempre a string inteira ou por offsets
// exatos de caractere — nunca por regex de conteúdo (a exceção da regra de ouro, §6.2).
import type { RawDoc, Selection } from '../types';

export function setCode(doc: RawDoc, code: string): RawDoc {
  return { ...doc, code };
}

export interface TextSpan {
  ini: number;
  fim: number;
  texto: string;
  linhaIni: number;
  linhaFim: number;
  linha: string;
}

// Extrai o trecho e a linha em volta de uma seleção `txt:<ini>:<fim>` — base de "Texto",
// "Duplicar linha" e "Excluir linha" na barra de ações (§11, §9 camada 3).
export function textSpanAt(doc: RawDoc, sel: Selection | null): TextSpan | null {
  if (!sel || sel.kind !== 'txt') return null;
  const [iniStr, fimStr] = sel.id.split(':');
  const ini = Number(iniStr), fim = Number(fimStr);
  const code = doc.code || '';
  if (!(ini >= 0 && fim <= code.length && fim > ini)) return null;
  const linhaIni = code.lastIndexOf('\n', ini - 1) + 1;
  let linhaFim = code.indexOf('\n', fim);
  if (linhaFim < 0) linhaFim = code.length;
  return { ini, fim, texto: code.slice(ini, fim), linhaIni, linhaFim, linha: code.slice(linhaIni, linhaFim) };
}

export function replaceTextSpan(doc: RawDoc, span: TextSpan, novo: string): RawDoc {
  const code = doc.code || '';
  return { ...doc, code: code.slice(0, span.ini) + novo + code.slice(span.fim) };
}

export function duplicateLine(doc: RawDoc, span: TextSpan): RawDoc {
  const code = doc.code || '';
  return { ...doc, code: code.slice(0, span.linhaFim) + '\n' + span.linha + code.slice(span.linhaFim) };
}

export function removeLine(doc: RawDoc, span: TextSpan): RawDoc {
  const code = doc.code || '';
  let fim = span.linhaFim;
  if (code.charAt(fim) === '\n') fim++;
  return { ...doc, code: code.slice(0, span.linhaIni) + code.slice(fim) };
}
