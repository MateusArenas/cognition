import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../useReducedMotion';

interface ToastContextValue {
  show: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() precisa de um <ToastProvider> por cima na árvore.');
  return ctx;
}

const DURATION = 1900;

// Cápsula escura translúcida acima da tab bar, some em 1,9s (§5.2). Ex.: "Excluído — desfazer"
// depois de uma ação destrutiva (§11).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const show = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(text);
      const dur = reducedMotion ? 0 : 250;
      Animated.timing(opacity, { toValue: 1, duration: dur, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: dur, useNativeDriver: true }).start(() => setMessage(null));
      }, DURATION);
    },
    [opacity, reducedMotion]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { bottom: 96 + insets.bottom, opacity }]}
        >
          <Text style={styles.text}>{message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(28,28,30,0.86)',
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  text: { color: '#fff', fontSize: 15, fontWeight: '500' },
});
