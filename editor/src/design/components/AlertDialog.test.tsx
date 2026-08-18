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

test('3+ botões empilham (stacked) e cada um dispara o próprio onPress', () => {
  // Regressão: os 3 botões de "Adicionar etapa" (NodeComposer) renderizavam com altura zero —
  // flex:1 (== flexBasis:0%) num container column de altura automática zera a altura antes de
  // ter espaço extra pra distribuir (ver AlertDialog.tsx). RTL não mede layout real, então este
  // teste não pega o colapso visual em si, mas garante que os 3 continuam no DOM e clicáveis.
  const continuar = jest.fn();
  const adicionar = jest.fn();
  render(
    <ThemeProvider>
      <AlertDialog
        visible
        title="Adicionar etapa"
        buttons={[
          { label: 'Cancelar', role: 'cancel', onPress: () => {} },
          { label: 'Adicionar e continuar', onPress: continuar },
          { label: 'Adicionar', role: 'primary', onPress: adicionar },
        ]}
        onRequestClose={() => {}}
      />
    </ThemeProvider>
  );

  expect(screen.getByText('Cancelar')).toBeTruthy();
  fireEvent.press(screen.getByText('Adicionar e continuar'));
  expect(continuar).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByText('Adicionar'));
  expect(adicionar).toHaveBeenCalledTimes(1);
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
