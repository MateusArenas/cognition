import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useDoc } from '@/store/useDoc';
import { useAutosave } from '@/store/useAutosave';
import { templateER, templateFlow } from '@/domain/mermaid/templates';
import { blankMd } from '@/domain/mermaid/factory';
import { loadDoc } from '@/services/storage';
import { DiagramScreen } from '@/features/diagram/DiagramScreen';
import { DocumentScreen } from '@/features/document/DocumentScreen';

// Rota fina (docs/02-setup-e-estrutura.md): "flow-demo"/"er-demo"/"md-novo" abrem um
// template; "aberto" é usado pela galeria e pelo documento markdown, que já chamaram
// openDoc() antes de navegar; qualquer outro id é carregado da biblioteca (Etapa 13). Salva
// sozinho a partir daqui — ver useAutosave.
export default function DocScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const openDoc = useDoc((s) => s.openDoc);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setPronto(false);
    (async () => {
      if (id === 'er-demo') openDoc(templateER());
      else if (id === 'flow-demo') openDoc(templateFlow());
      else if (id === 'md-novo') openDoc(blankMd('Novo documento', '# Novo documento\n\nComece a escrever…'));
      else if (id !== 'aberto') {
        const salvo = await loadDoc(id);
        if (!cancelado && salvo) openDoc(salvo);
      }
      if (!cancelado) setPronto(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [id, openDoc]);

  useAutosave();
  const doc = useDoc((s) => s.doc);
  if (!pronto) return null;
  return doc.tipo === 'md' ? <DocumentScreen /> : <DiagramScreen />;
}
