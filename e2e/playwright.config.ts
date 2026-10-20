import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  // Un solo worker: la sesión es única por usuario (un login cierra la anterior)
  // y cada test sigue la cadena de tokens del anterior (ver fixtures/sesion.ts).
  workers: 1,
  retries: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://frontend:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    // ── Tests sin sesión (login form) ────────────────────────────────────────
    {
      name: 'login',
      testMatch: /tests\/login\.spec\.ts/,
      use: { storageState: { cookies: [], origins: [] } },
    },

    // ── Tests por perfil ─────────────────────────────────────────────────────
    {
      name: 'admin',
      testMatch: /tests\/admin\/.+\.spec\.ts/,
      // La sesión la abre fixtures/sesion.ts según el nombre del proyecto.
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'profesional',
      testMatch: /tests\/profesional\/.+\.spec\.ts/,
      // La sesión la abre fixtures/sesion.ts según el nombre del proyecto.
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'recepcion',
      testMatch: /tests\/recepcion\/.+\.spec\.ts/,
      // La sesión la abre fixtures/sesion.ts según el nombre del proyecto.
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'test-results',
})
