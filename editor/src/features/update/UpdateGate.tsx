import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { useEffect, useState, type ReactNode } from 'react';

void SplashScreen.preventAutoHideAsync();

const CHECK_TIMEOUT_MS = 4000;
const FETCH_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function checkAndApplyUpdate(): Promise<void> {
  const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (__DEV__ || inExpoGo) return;
  try {
    const result = await withTimeout(Updates.checkForUpdateAsync(), CHECK_TIMEOUT_MS);
    if (!result.isAvailable) return;
    await withTimeout(Updates.fetchUpdateAsync(), FETCH_TIMEOUT_MS);
    await Updates.reloadAsync();
  } catch {
    // Sem rede, timeout, ou expo-updates ainda não configurado (sem projeto EAS ligado) —
    // segue com a versão já embarcada em vez de travar a abertura do app.
  }
}

// Segura a splash nativa (config em app.json/expo-splash-screen) até checar se há uma
// atualização OTA e, se houver, baixá-la e recarregar — assim o app já abre com o JS mais
// recente quando há rede, sem o usuário precisar reinstalar nada. Expo Go e build de dev não
// suportam expo-updates (a API lança erro), então pulam a checagem e liberam a tela na hora —
// mesmo caminho de erro do catch acima, o app nunca fica preso na splash.
export function UpdateGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkAndApplyUpdate().finally(() => {
      if (cancelled) return;
      setReady(true);
      void SplashScreen.hideAsync();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
