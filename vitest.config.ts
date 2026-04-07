import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Scope: only modules that already have test coverage. As each remaining
      // module (discover/pick/sign/register/verify) gets its own .spec.ts, add
      // it here. Tracked: ATT-318 (harden public npm repos).
      include: ['src/policy/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/policy/types.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 95,
        statements: 100,
      },
    },
  },
})
