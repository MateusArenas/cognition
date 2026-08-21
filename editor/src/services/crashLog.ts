import Storage from 'expo-sqlite/kv-store';

const KEY = 'app.lastFatalError.v1';

export interface FatalRecord {
  message: string;
  stack?: string;
  isFatal: boolean;
  at: string;
}

// SÍNCRONO de propósito: um erro fatal pode matar o contexto JS logo em seguida (é exatamente o
// "reload sem rastro" relatado no terminal SSH — o processo nativo continua vivo, só o JS reinicia),
// então uma escrita assíncrona (Storage.setItem) pode nunca terminar. setItemSync é a única
// garantia real de que o registro sobrevive até o próximo boot.
export function recordFatal(error: unknown, isFatal: boolean) {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const record: FatalRecord = { message, stack, isFatal, at: new Date().toISOString() };
    Storage.setItemSync(KEY, JSON.stringify(record));
  } catch {
    // registrar o erro não pode, ele mesmo, lançar outro erro
  }
}

// Lê e limpa — cada erro só é mostrado uma vez, no boot seguinte ao que ele aconteceu.
export function consumeLastFatal(): FatalRecord | null {
  try {
    const raw = Storage.getItemSync(KEY);
    if (!raw) return null;
    Storage.removeItemSync(KEY);
    return JSON.parse(raw) as FatalRecord;
  } catch {
    return null;
  }
}
