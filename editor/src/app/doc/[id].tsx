import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useDoc } from '@/store/useDoc';
import { useAutosave } from '@/store/useAutosave';
import { templateER, templateFlow, templateMd } from '@/domain/mermaid/templates';
import { blankCsv, blankMd, blankRabisco } from '@/domain/mermaid/factory';
import { loadDoc } from '@/services/storage';
import { CsvScreen } from '@/features/csv/CsvScreen';
import { DiagramScreen } from '@/features/diagram/DiagramScreen';
import { DocumentScreen } from '@/features/document/DocumentScreen';
import { RabiscoScreen } from '@/features/rabisco/RabiscoScreen';

// Rota fina (docs/02-setup-e-estrutura.md): "flow-demo"/"er-demo"/"md-novo"/"md-demo"/
// "rabisco-novo" abrem um template; "aberto" é usado pela galeria e pelo documento markdown,
// que já chamaram openDoc() antes de navegar; qualquer outro id é carregado da biblioteca
// (Etapa 13). Salva sozinho a partir daqui — ver useAutosave.
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
      else if (id === 'md-demo') openDoc(templateMd());
      else if (id === 'rabisco-novo') openDoc(blankRabisco('Novo rabisco'));
      else if (id === 'csv-novo') openDoc(blankCsv('Nova tabela'));
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
  if (doc.tipo === 'md') return <DocumentScreen />;
  if (doc.tipo === 'rabisco') return <RabiscoScreen />;
  if (doc.tipo === 'csv') return <CsvScreen />;
  return <DiagramScreen />;
}
