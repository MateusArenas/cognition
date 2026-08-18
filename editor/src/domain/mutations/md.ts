// Mutações do documento Markdown. replaceRange é a base da ida-e-volta
// documento<->diagrama (§13.4): substitui exatamente o intervalo [ini, fim).
import type { MdDoc } from '../types';

export function setMarkdown(doc: MdDoc, md: string): MdDoc {
  return { ...doc, md };
}

export function replaceRange(doc: MdDoc, ini: number, fim: number, texto: string): MdDoc {
  const md = doc.md.slice(0, ini) + texto + doc.md.slice(fim);
  return { ...doc, md };
}
