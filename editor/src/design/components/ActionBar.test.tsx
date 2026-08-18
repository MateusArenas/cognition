/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../ThemeProvider';
import { ActionBar, type ActionBarItem } from './ActionBar';

// Em produção, o Stack do expo-router (via react-native-screens) provê o SafeAreaProvider —
// aqui, fora dele, precisa simular (ActionBar usa useSafeAreaInsets pro respiro do home
// indicator do iPhone, ver docs/08-barra-de-acoes.md).
const insetsIniciais = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

function setup(items: ActionBarItem[], onClose = jest.fn()) {
  render(
    <SafeAreaProvider initialMetrics={insetsIniciais}>
      <ThemeProvider>
        <ActionBar title="n3 · Conferir nota fiscal" items={items} onClose={onClose} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  return onClose;
}

test('cada ação dispara o próprio onPress, não o de outra', () => {
  const texto = jest.fn();
  const excluir = jest.fn();
  setup([
    { key: 'texto', icon: 'check', label: 'Texto', onPress: texto },
    { key: 'excluir', icon: 'trash', label: 'Excluir', onPress: excluir, destructive: true },
  ]);

  fireEvent.press(screen.getByText('Excluir'));
  expect(excluir).toHaveBeenCalledTimes(1);
  expect(texto).not.toHaveBeenCalled();
});

test('o botão de fechar chama onClose', () => {
  const onClose = setup([{ key: 'texto', icon: 'check', label: 'Texto', onPress: jest.fn() }]);
  fireEvent.press(screen.getByLabelText('Cancelar seleção'));
  expect(onClose).toHaveBeenCalledTimes(1);
});
