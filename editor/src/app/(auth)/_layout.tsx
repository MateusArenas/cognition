import { Stack } from 'expo-router';

// Sem isso, o grupo `(auth)` não vira um navigator próprio — o Stack raiz (app/_layout.tsx)
// só consegue referenciar `(auth)` como UMA tela via `<Stack.Screen name="(auth)" />` porque
// `(tabs)` já tem seu próprio _layout (Tabs); sem um _layout aqui, expo-router trata os 4
// arquivos como filhos soltos, não um grupo colapsável — aviso real visto rodando o app:
// "[Layout children]: No route named "(auth)" exists in nested children".
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
