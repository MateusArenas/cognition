import { forwardRef } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/design/useTheme';
import { DiagramCanvas, type DiagramCanvasHandle } from '@/features/diagram/canvas/DiagramCanvas';
import { toRuntimeTokens } from '@/features/diagram/canvas/themeTokens';

// Reaproveita o MESMO runtime WebView dos diagramas Mermaid do resto do app (não um motor novo
// só pro ERD) — só sem seleção/toque, é visualização (DB-MOBILE.md §3.4). `code` já vem pronto
// do backend (`erDiagram ...`), gerado a partir do catálogo real. `ref` repassa o handle
// (exportPng/exportSvg) pra fora — é o que permite o DiagramCard reaproveitar o MESMO caminho
// de exportação PNG/PDF que a tela de Diagrama do documento já usa (services/export.ts).
// `onError` repassa erro de render do mermaid.js (ex.: `erDiagram` sem nenhuma tabela, schema
// vazio) — sem isso o erro do WebView era engolido em silêncio e a tela ficava em branco pra
// sempre, sem spinner nem mensagem (bug real reportado pelo usuário testando ao vivo).
export const MermaidView = forwardRef<DiagramCanvasHandle, { code: string; onError?: (message: string) => void }>(
  function MermaidView({ code, onError }, ref) {
    const { scheme, colors } = useTheme();
    return (
      <View style={{ flex: 1 }}>
        <DiagramCanvas ref={ref} code={code} theme={scheme} tokens={toRuntimeTokens(colors)} sel={null} onTap={() => {}} onError={onError} />
      </View>
    );
  }
);
