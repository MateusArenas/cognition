import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { useTheme } from './useTheme';

interface SheetChromeValue {
  animatedValue: Animated.Value;
  setOpen: (open: boolean) => void;
}

const SheetChromeContext = createContext<SheetChromeValue | null>(null);

// A tela de trás encolhe para 92,5% e ganha canto arredondado enquanto uma sheet está aberta
// (§5.2, detalhe que faz o app "parecer nativo"). RootLayout envolve o <Stack/> com
// <SheetChromeContainer>; cada <Sheet/> aberto/fechado chama setOpen — contagem, não booleano
// simples, porque mais de uma sheet pode empilhar.
export function SheetChromeProvider({ children }: { children: ReactNode }) {
  const openCount = useRef(0);
  const animatedValue = useRef(new Animated.Value(0)).current;
  // Cache num ref, não num hook de estado: setOpen é chamado imperativamente (fora de render)
  // pelo onChange da sheet, então precisa ler o valor atual sem depender de re-render (§17).
  const reducedMotion = useRef(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reducedMotion.current = v; });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { reducedMotion.current = v; });
    return () => sub.remove();
  }, []);

  const setOpen = (open: boolean) => {
    openCount.current = Math.max(0, openCount.current + (open ? 1 : -1));
    Animated.timing(animatedValue, {
      toValue: openCount.current > 0 ? 1 : 0,
      duration: reducedMotion.current ? 0 : 500,
      useNativeDriver: true,
    }).start();
  };

  const value = useMemo(() => ({ animatedValue, setOpen }), [animatedValue]);
  return <SheetChromeContext.Provider value={value}>{children}</SheetChromeContext.Provider>;
}

export function useSheetChrome(): SheetChromeValue {
  const ctx = useContext(SheetChromeContext);
  if (!ctx) throw new Error('useSheetChrome() precisa de um <SheetChromeProvider> por cima na árvore.');
  return ctx;
}

export function SheetChromeContainer({ children }: { children: ReactNode }) {
  const { animatedValue } = useSheetChrome();
  const { colors } = useTheme();
  const scale = animatedValue.interpolate({ inputRange: [0, 1], outputRange: [1, 0.925] });
  const radius = animatedValue.interpolate({ inputRange: [0, 1], outputRange: [0, 14] });
  const translateY = animatedValue.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        transform: [{ scale }, { translateY }],
        borderRadius: radius,
        overflow: 'hidden',
      }}
    >
      {children}
    </Animated.View>
  );
}

// Estado local só para o caso raro de <Sheet/> ser usado sem provider (ex.: teste isolado) —
// vira no-op em vez de lançar, já que o efeito visual é acessório, não funcional.
export function useOptionalSheetChrome(): SheetChromeValue {
  const ctx = useContext(SheetChromeContext);
  const [fallback] = useState<SheetChromeValue>(() => ({
    animatedValue: new Animated.Value(0),
    setOpen: () => {},
  }));
  return ctx ?? fallback;
}
