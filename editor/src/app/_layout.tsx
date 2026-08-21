import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ThemeProvider } from '@/design/ThemeProvider';
import { useTheme } from '@/design/useTheme';
import { SheetChromeProvider, SheetChromeContainer } from '@/design/SheetChrome';
import { ToastProvider } from '@/design/components/Toast';
import { AppGate } from '@/features/app-gate/AppGate';
import { useAuth } from '@/features/auth/AuthContext';
import { I18nProvider } from '@/i18n/I18nProvider';
import { useSettings } from '@/store/useSettings';

// Providers globais: tema, gestos, bottom sheet, teclado, toast, e o "chrome" que encolhe a
// tela por trás de uma sheet aberta (§5.2). Ver docs/03-design-system.md. AppGate é o primeiro
// de todos — segura a splash nativa até checar/aplicar atualização OTA E validar a sessão
// (GET /auth/me, com refresh automático) rodarem, sempre no cold start. Ver
// docs/18-autenticacao.md.
export default function RootLayout() {
  const hydrate = useSettings((state) => state.hydrate);
  useEffect(() => { void hydrate(); }, [hydrate]);
  return (
    <AppGate>
      <ThemeProvider>
        <I18nProvider>
          <RootShell />
        </I18nProvider>
      </ThemeProvider>
    </AppGate>
  );
}

// GestureHandlerRootView é a base de verdade da árvore visual — sem cor de tema aqui, o
// vão revelado atrás do SheetChromeContainer quando ele encolhe (§5.2) mostra o branco
// padrão da janela nativa em vez do fundo escuro, no tema dark. Precisa de um componente à
// parte (não dá pra chamar useTheme() direto em RootLayout) porque o hook só funciona depois
// que o ThemeProvider já envolveu a árvore.
function RootShell() {
  const { colors } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardProvider>
        <BottomSheetModalProvider>
          <ToastProvider>
            <SheetChromeProvider>
              <AppChrome />
            </SheetChromeProvider>
          </ToastProvider>
        </BottomSheetModalProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

// Duas stacks — logada e não-logada — decididas por `status` (features/auth/AuthContext.tsx).
// Enumeração explícita das rotas hoje existentes em vez de mover tudo pra um grupo `(app)`
// novo: mesmo resultado, diff bem menor (nenhum arquivo de rota muda de lugar).
function AppChrome() {
  const { scheme, colors } = useTheme();
  const { status } = useAuth();
  return (
    <SheetChromeContainer>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={status === 'authenticated'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="gallery" />
          <Stack.Screen name="doc/[id]" />
          <Stack.Screen name="db/connection" />
          <Stack.Screen name="db/[id]/index" />
          <Stack.Screen name="db/[id]/[table]" />
        </Stack.Protected>
        <Stack.Protected guard={status !== 'authenticated'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </SheetChromeContainer>
  );
}
