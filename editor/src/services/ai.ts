// Cliente do assistente de IA — chama a própria rota de API do app
// (src/app/api/diagrama+api.ts), nunca a Anthropic direto (§14.1).
import Constants from 'expo-constants';

function apiOrigin(): string {
  if (process.env.EXPO_PUBLIC_API_ORIGIN) return process.env.EXPO_PUBLIC_API_ORIGIN;
  const hostUri = Constants.expoConfig?.hostUri; // "192.168.0.10:8081" no dev, com Metro
  if (hostUri) return `http://${hostUri.split(':')[0]}:8081`;
  return '';
}

export async function pedirMermaid(prompt: string): Promise<string> {
  const res = await fetch(`${apiOrigin()}/api/diagrama`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-device-id': Constants.sessionId || 'app' },
    body: JSON.stringify({ prompt }),
  });
  const dados = await res.json();
  if (!res.ok) throw new Error(dados.erro || 'Falha ao falar com a IA.');
  return String(dados.texto || '');
}
