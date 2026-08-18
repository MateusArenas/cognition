import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Corta as animações de sheet e da barra quando o usuário pediu menos movimento (§5.3, §17).
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (ativo) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      ativo = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
