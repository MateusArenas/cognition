import { defineConfig } from 'vitest/config';

// Convenção: `.test.ts` = lógica pura, roda aqui (vitest, sem RN). `.test.tsx` = componente,
// roda no jest-expo (ver jest.config.js), porque precisa do ambiente RN.
// Ver docs/13-qualidade-e-testes.md.
export default defineConfig({
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
