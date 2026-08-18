import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { saveDoc } from '@/services/storage';
import { useDoc } from './useDoc';

// Salva com debounce de 600ms após cada mudança e sempre que o AppState for para background
// (§15). Chamado uma vez, na tela de editor (doc/[id].tsx) — não na biblioteca, onde o
// `doc` do store ainda não é necessariamente "o documento aberto de verdade".
export function useAutosave() {
  const doc = useDoc((s) => s.doc);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveDoc(doc).catch(() => {});
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [doc]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') saveDoc(useDoc.getState().doc).catch(() => {});
    });
    return () => sub.remove();
  }, []);
}
