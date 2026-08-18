// Monta o pedido pra IA e limpa a resposta (§14.2) — pura, testável sem rede nenhuma.
import { serialize } from '@/domain/mermaid/serialize';
import type { Doc } from '@/domain/types';

export interface Alvo {
  descricao: string; // ex.: 'o nó de id `n3` (texto atual: "Conferir nota fiscal")'
}

export function buildPrompt(doc: Doc, pedido: string, alvo?: Alvo, erroAnterior?: string): string {
  const code = serialize(doc);
  const partes = [
    'Você edita diagramas Mermaid. Responda APENAS com o código Mermaid resultante — sem crase, sem explicação, sem texto ao redor.',
    `Código atual:\n${code}`,
  ];
  if (alvo) {
    partes.push(`Altere APENAS ${alvo.descricao}. Todo o resto do código deve sair idêntico, linha por linha.`);
  }
  partes.push(`Pedido: ${pedido}`);
  if (erroAnterior) {
    partes.push(`A tentativa anterior não compilou no Mermaid. Erro:\n${erroAnterior}\nCorrija e responda de novo, só com o código.`);
  }
  return partes.join('\n\n');
}

// A IA às vezes devolve ```mermaid ... ``` mesmo pedindo pra não — tira a cerca se vier, em
// vez de deixar isso quebrar o parse.
export function limparCerca(texto: string): string {
  const m = /^```[\w-]*\n([\s\S]*?)\n?```$/.exec(texto.trim());
  return (m ? m[1] : texto).trim();
}
