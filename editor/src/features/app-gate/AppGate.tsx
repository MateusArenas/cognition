import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, type ReactNode } from 'react';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { checkAndApplyUpdate } from '@/features/update/UpdateGate';

void SplashScreen.preventAutoHideAsync();

// Único dono da splash nativa do app inteiro — roda a checagem de atualização OTA e o
// bootstrap de autenticação (SecureStore + GET /auth/me, com refresh automático) EM PARALELO,
// e só libera a splash quando as duas terminarem, sempre no cold start (é por isso que
// `bootstrapped` mora aqui, não em algum estado persistido — tem que rodar de novo toda vez que
// o app é instanciado, nunca ficar "lembrado" de uma vez anterior).
function Bootstrap({ children }: { children: ReactNode }) {
  const { bootstrap } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([checkAndApplyUpdate(), bootstrap()]).finally(() => {
      if (cancelled) return;
      setReady(true);
      void SplashScreen.hideAsync();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma vez só, no cold start.
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}

export function AppGate({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Bootstrap>{children}</Bootstrap>
    </AuthProvider>
  );
}
