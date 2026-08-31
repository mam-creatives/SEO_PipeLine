import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/cli/**', 'src/providers/**/fixtures/**'],
      reporter: ['text', 'html'],
      // Dış denetim bulgusu (2026-08-31) — kapsam ölçülüyordu ama hiç zorunlu tutulmuyordu.
      // testing.md'nin %80 asgari politikasıyla eşleşir; şu an fiili kapsam 89/85/90/89 —
      // eşik altına düşmeyi engeller, mevcut sağlıklı seviyeyi zorlamaz.
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
})
