import { createContext } from 'react';

// `Field` usa isso pra saber se está dentro de um `Sheet` (BottomSheetModal) — nesse caso
// precisa trocar o TextInput por BottomSheetTextInput (ver Field.tsx) pro teclado funcionar.
export const InsideSheetContext = createContext(false);
