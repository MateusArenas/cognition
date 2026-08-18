/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../ThemeProvider';
import { KeyCaps } from './KeyCaps';

test('chamar onToggle com a chave tocada', () => {
  const onToggle = jest.fn();
  render(
    <ThemeProvider>
      <KeyCaps keys={['PK', 'FK', 'UK']} active={['PK']} onToggle={onToggle} />
    </ThemeProvider>
  );

  fireEvent.press(screen.getByText('FK'));
  expect(onToggle).toHaveBeenCalledWith('FK');
});

test('marca só as chaves ativas como selecionadas', () => {
  render(
    <ThemeProvider>
      <KeyCaps keys={['PK', 'FK']} active={['PK']} onToggle={() => {}} />
    </ThemeProvider>
  );

  expect(screen.getByTestId('keycap-PK').props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByTestId('keycap-FK').props.accessibilityState).toMatchObject({ selected: false });
});
