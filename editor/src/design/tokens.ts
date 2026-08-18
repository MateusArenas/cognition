// Ver docs/03-design-system.md e ESPECIFICACAO-APP-RN-EXPO.md §5.1.
export const palette = {
  dark: {
    blue: '#0A84FF', red: '#FF453A', green: '#30D158', orange: '#FF9F0A', indigo: '#5E5CE6',
    bg: '#000000', // fundo do app e das listas agrupadas
    surface: '#1C1C1E', // barras, linhas de lista, campos
    surface2: '#2C2C2E', // preenchimento secundário
    surface3: '#3A3A3C', // trilho de segmented, chips
    separator: 'rgba(84,84,88,0.55)',
    separatorBold: 'rgba(84,84,88,0.80)',
    label: '#FFFFFF',
    labelSecondary: 'rgba(235,235,245,0.62)',
    labelTertiary: 'rgba(235,235,245,0.34)',
  },
  light: {
    blue: '#007AFF', red: '#FF3B30', green: '#34C759', orange: '#FF9500', indigo: '#5856D6',
    bg: '#F2F2F7', surface: '#FFFFFF', surface2: '#FFFFFF', surface3: '#E5E5EA',
    separator: 'rgba(60,60,67,0.24)', separatorBold: 'rgba(60,60,67,0.34)',
    label: '#000000',
    labelSecondary: 'rgba(60,60,67,0.60)',
    labelTertiary: 'rgba(60,60,67,0.32)',
  },
} as const;

export type Scheme = keyof typeof palette;
export type Palette = (typeof palette)[Scheme];

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.8 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.3 },
  body: { fontSize: 17, fontWeight: '400' as const, letterSpacing: -0.2 },
  callout: { fontSize: 16, fontWeight: '400' as const },
  subhead: { fontSize: 15, fontWeight: '400' as const },
  footnote: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { row: 12, card: 14, sheet: 14, pill: 999, control: 9 } as const;

// A curva das sheets do iOS. Use em tudo que desliza.
export const easing = { sheet: [0.32, 0.72, 0, 1] as [number, number, number, number], duration: 500 };
