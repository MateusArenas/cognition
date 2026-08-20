import { useSettings } from '@/store/useSettings';
import { ConnectionsScreen } from './ConnectionsScreen';
import { LoginScreen } from './LoginScreen';

// Entrada da tab (app/(tabs)/dbclient.tsx) — sem token salvo, mostra login; com token, a lista
// de conexões. Trocar de tela é só re-renderizar: useSettings já persiste o token entre
// aberturas do app (docs/17-db-client.md).
export function DbClientRoot() {
  const token = useSettings((s) => s.dbAuthToken);
  if (!token) return <LoginScreen />;
  return <ConnectionsScreen />;
}
