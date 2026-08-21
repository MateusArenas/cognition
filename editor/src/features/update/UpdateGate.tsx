import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Updates from 'expo-updates';

const CHECK_TIMEOUT_MS = 4000;
const FETCH_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// Checa se há uma atualização OTA e, se houver, baixa e recarrega — assim o app já abre com o
// JS mais recente quando há rede, sem o usuário precisar reinstalar nada. Expo Go e build de
// dev não suportam expo-updates (a API lança erro), então pulam a checagem — mesmo caminho do
// catch abaixo, nunca trava a abertura do app.
//
// Função pura, sem tocar na splash nativa — quem segura/libera a splash é `AppGate.tsx`, que
// roda ESTA checagem em paralelo com o bootstrap de autenticação e só libera a splash quando as
// DUAS terminarem. Antes esta função mexia na splash sozinha (`preventAutoHideAsync`/
// `hideAsync` aqui dentro); com dois "seguradores" de splash independentes rodando ao mesmo
// tempo, o primeiro a terminar já escondia a splash antes do outro acabar — tela em branco
// piscando por um instante (bug real, corrigido concentrando o controle da splash num lugar só).
export async function checkAndApplyUpdate(): Promise<void> {
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
