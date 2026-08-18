import { useEffect, useState } from 'react';
import { AlertDialog } from '@/design/components/AlertDialog';
import { Field } from '@/design/components/Field';
import { useDoc } from '@/store/useDoc';
import { addTable } from '@/domain/mutations/er';
import { hapticCreate } from '@/services/haptics';
import type { ErDoc } from '@/domain/types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function TableComposer({ visible, onClose }: Props) {
  const apply = useDoc((s) => s.apply);
  const select = useDoc((s) => s.select);
  const [nome, setNome] = useState('');

  useEffect(() => {
    if (visible) setNome('');
  }, [visible]);

  function criar() {
    const id = nome.trim().toUpperCase().replace(/\s+/g, '_');
    if (!id) return;
    hapticCreate();
    apply((d) => addTable(d as ErDoc, id));
    select({ kind: 'table', id });
    onClose();
  }

  return (
    <AlertDialog
      visible={visible}
      title="Nova tabela"
      onRequestClose={onClose}
      buttons={[
        { label: 'Cancelar', role: 'cancel', onPress: onClose },
        { label: 'Adicionar', role: 'primary', onPress: criar },
      ]}
    >
      <Field mono value={nome} onChangeText={setNome} placeholder="NOME_DA_TABELA" autoFocus autoCapitalize="characters" />
    </AlertDialog>
  );
}
