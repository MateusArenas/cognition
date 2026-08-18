// Camada 1 de testes de interface: @testing-library/react-native sobre o preset jest-expo.
// Cobre componentes com lógica de decisão — ver docs/13-qualidade-e-testes.md.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/src/**/*.test.tsx'],
  // O bundle "react-native" do lucide-react-native (o que o Metro pega de verdade, via
  // package.json "exports") é ESM puro (.mjs) — o transform do jest-expo só cobre
  // .js/.jsx/.ts/.tsx, então quebra com "Unexpected token 'export'" (Icon.tsx importa de lá,
  // ver docs/03-design-system.md). Mapeia pro build CJS do próprio pacote em vez disso — não
  // precisa de transform nenhum, e é o mesmo código, só empacotado diferente.
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
};
