import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';

export interface TerminalHtmlState {
  html: string | null;
  error: string | null;
}

// Carrega o terminal.html gerado (npm run ssh-terminal) como asset — precisa funcionar offline,
// mesma técnica de features/diagram/canvas/useRuntimeHtml.ts.
export function useTerminalHtml(): TerminalHtmlState {
  const [state, setState] = useState<TerminalHtmlState>({ html: null, error: null });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const asset = Asset.fromModule(require('./terminal.html'));
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        if (!uri) throw new Error('Asset do terminal.html baixou sem uri (localUri e uri vazios).');
        const conteudo = await FileSystem.readAsStringAsync(uri);
        if (!conteudo) throw new Error('terminal.html leu vazio — rode "npm run ssh-terminal" dentro de editor/.');
        if (!cancelado) setState({ html: conteudo, error: null });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[useTerminalHtml] falhou ao carregar o runtime do terminal:', msg);
        if (!cancelado) setState({ html: null, error: msg });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return state;
}
