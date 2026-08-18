/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../ThemeProvider';
import { AlertDialog } from './AlertDialog';

test('o botão certo dispara o próprio onPress', () => {
  const cancelar = jest.fn();
  const excluir = jest.fn();
  render(
    <ThemeProvider>
      <AlertDialog
        visible
        title="Excluir nó?"
        buttons={[
          { label: 'Cancelar', onPress: cancelar, role: 'cancel' },
          { label: 'Excluir', onPress: excluir, role: 'destructive' },
        ]}
        onRequestClose={() => {}}
      />
    </ThemeProvider>
  );

  fireEvent.press(screen.getByText('Excluir'));
  expect(excluir).toHaveBeenCalledTimes(1);
  expect(cancelar).not.toHaveBeenCalled();
});

test('tocar fora (scrim) chama onRequestClose', () => {
  const onRequestClose = jest.fn();
  render(
    <ThemeProvider>
      <AlertDialog visible title="Título" buttons={[{ label: 'OK', onPress: () => {} }]} onRequestClose={onRequestClose} />
    </ThemeProvider>
  );

  fireEvent.press(screen.getByTestId('alert-scrim'));
  expect(onRequestClose).toHaveBeenCalledTimes(1);
});
