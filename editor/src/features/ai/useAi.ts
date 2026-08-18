import { useState } from 'react';
import { pedirMermaid } from '@/services/ai';
import type { Doc } from '@/domain/types';
import { buildPrompt, limparCerca, type Alvo } from './prompt';

type Validador = (code: string) => Promise<{ ok: boolean; message?: string }>;

// A resposta passa pelo mermaid.parse antes de virar diagrama (§14.3). Se não compilar, o
// erro volta pro modelo numa segunda tentativa automática — só então aplica.
export function useAi(validar: Validador) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function pedir(doc: Doc, pedido: string, alvo?: Alvo): Promise<string | null> {
    setLoading(true);
    setErro(null);
    try {
      let saida = limparCerca(await pedirMermaid(buildPrompt(doc, pedido, alvo)));
      let val = await validar(saida);
      if (!val.ok) {
        saida = limparCerca(await pedirMermaid(buildPrompt(doc, pedido, alvo, val.message)));
        val = await validar(saida);
      }
      if (!val.ok) throw new Error('A IA devolveu um Mermaid que não compila:\n' + (val.message || ''));
      return saida;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { pedir, loading, erro };
}
