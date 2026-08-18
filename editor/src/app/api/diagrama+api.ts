// Rota de API do Expo Router — roda no servidor, nunca no bundle do app (§14.1: nunca
// embarque chave de API no app; qualquer um extrai a chave de um bundle RN em minutos).
// Precisa de ANTHROPIC_API_KEY no ambiente do servidor (não no app).
const MODELO = 'claude-sonnet-5';
const MAX_ENTRADA = 8000;
const TIMEOUT_MS = 30000;

// Limite por dispositivo — em memória, então reseta a cada deploy/restart do servidor. É um
// ponto de partida, não uma solução de produção (precisaria de um store compartilhado tipo
// Redis atrás de mais de uma instância).
const USO_POR_DISPOSITIVO = new Map<string, { contagem: number; janelaInicio: number }>();
const JANELA_MS = 60 * 60 * 1000;
const LIMITE_POR_JANELA = 30;

function limiteExcedido(deviceId: string): boolean {
  const agora = Date.now();
  const atual = USO_POR_DISPOSITIVO.get(deviceId);
  if (!atual || agora - atual.janelaInicio > JANELA_MS) {
    USO_POR_DISPOSITIVO.set(deviceId, { contagem: 1, janelaInicio: agora });
    return false;
  }
  atual.contagem++;
  return atual.contagem > LIMITE_POR_JANELA;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ erro: 'Servidor sem ANTHROPIC_API_KEY configurada.' }, { status: 500 });
  }

  const deviceId = req.headers.get('x-device-id') || 'desconhecido';
  if (limiteExcedido(deviceId)) {
    return Response.json({ erro: 'Limite de pedidos por hora atingido — tente de novo mais tarde.' }, { status: 429 });
  }

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ erro: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const prompt = (body.prompt || '').trim();
  if (!prompt) return Response.json({ erro: 'Prompt vazio.' }, { status: 400 });
  if (prompt.length > MAX_ENTRADA) return Response.json({ erro: `Prompt maior que ${MAX_ENTRADA} caracteres.` }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!r.ok) {
      const texto = await r.text();
      return Response.json({ erro: `A API da IA recusou o pedido (${r.status}).`, detalhe: texto }, { status: 502 });
    }

    const dados = await r.json();
    const texto = dados?.content?.[0]?.text ?? '';
    return Response.json({ texto });
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError';
    return Response.json({ erro: abortado ? 'A IA demorou demais pra responder.' : 'Falha ao falar com a IA.' }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }
}
