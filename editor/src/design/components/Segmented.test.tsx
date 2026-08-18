/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../ThemeProvider';
import { Segmented } from './Segmented';

const OPTIONS = [
  { value: 'edit', label: 'Escrever' },
  { value: 'read', label: 'Ler' },
];

test('chamar onChange com o value da opção tocada', () => {
  const onChange = jest.fn();
  render(
    <ThemeProvider>
      <Segmented options={OPTIONS} value="edit" onChange={onChange} />
    </ThemeProvider>
  );

  fireEvent.press(screen.getByText('Ler'));
  expect(onChange).toHaveBeenCalledWith('read');
});

test('marca a opção atual como selecionada para acessibilidade', () => {
  render(
    <ThemeProvider>
      <Segmented options={OPTIONS} value="read" onChange={() => {}} />
    </ThemeProvider>
  );

  expect(screen.getByTestId('segmented-read').props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByTestId('segmented-edit').props.accessibilityState).toMatchObject({ selected: false });
});
