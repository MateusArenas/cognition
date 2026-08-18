import { Asset } from 'expo-asset';
// O import default de 'expo-file-system' (SDK 54+) é a API nova (File/Directory/Paths) — as
// funções antigas (readAsStringAsync etc.) ainda existem só como stub de tipo que "throws em
// runtime". A implementação de verdade da API antiga mora em 'expo-file-system/legacy'.
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';

export interface RuntimeHtmlState {
  html: string | null;
  error: string | null;
}

// Carrega o runtime.html gerado (npm run runtime) como asset — precisa funcionar offline,
// então lê o conteúdo do arquivo em vez de apontar a WebView para uma URL (docs/06-canvas.md).
// Se isso falhar silenciosamente, o canvas fica em branco pra sempre sem nenhuma pista — por
// isso o erro é capturado e logado, não só engolido.
export function useRuntimeHtml(): RuntimeHtmlState {
  const [state, setState] = useState<RuntimeHtmlState>({ html: null, error: null });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const asset = Asset.fromModule(require('./runtime.html'));
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        if (!uri) throw new Error('Asset do runtime.html baixou sem uri (localUri e uri vazios).');
        const conteudo = await FileSystem.readAsStringAsync(uri);
        if (!conteudo) throw new Error('runtime.html leu vazio — rode "npm run runtime" dentro de editor/.');
        if (!cancelado) setState({ html: conteudo, error: null });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[useRuntimeHtml] falhou ao carregar o runtime do canvas:', msg);
        if (!cancelado) setState({ html: null, error: msg });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return state;
}
