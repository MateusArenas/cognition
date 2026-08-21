import { recordFatal } from './crashLog';

type ErrorHandler = (error: unknown, isFatal: boolean) => void;
interface GlobalErrorUtils {
  ErrorUtils?: {
    setGlobalHandler: (handler: ErrorHandler) => void;
    getGlobalHandler: () => ErrorHandler;
  };
}

let installed = false;

// Instalado uma vez, o mais cedo possível (topo de app/_layout.tsx, fora de qualquer
// componente) — encadeia no handler global de erro fatal do React Native (o mesmo que
// mostraria a RedBox) sem substituí-lo, só grava ANTES de deixar o comportamento padrão
// acontecer. Ver crashLog.ts — é isto que dá pra investigar o reload sem rastro do terminal
// SSH sem depender de crash log nativo (que nunca existiu, o processo não morre) nem de
// reproduzir o bug num simulador automatizado (nunca consegui digitar de verdade nele).
export function installFatalErrorLogger() {
  if (installed) return;
  installed = true;
  const g = global as unknown as GlobalErrorUtils;
  if (!g.ErrorUtils) return;
  const original = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((error, isFatal) => {
    recordFatal(error, isFatal);
    original(error, isFatal);
  });
}
