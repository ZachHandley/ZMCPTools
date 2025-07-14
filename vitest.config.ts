import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.d.ts'],
      include: ['zmcp-agent-wrapper-lib.cjs'],
      all: true,
      100: true,
      lines: 100,
      functions: 100,
      branches: 100,
      statements: 100
    }
  }
});