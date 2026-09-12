import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
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
    // ── Setup: hacer login para cada perfil ──────────────────────────────────
    { name: 'setup:admin',       testMatch: /fixtures\/auth\.setup\.admin\.ts/ },
    { name: 'setup:profesional', testMatch: /fixtures\/auth\.setup\.profesional\.ts/ },
    { name: 'setup:recepcion',   testMatch: /fixtures\/auth\.setup\.recepcion\.ts/ },

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
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/admin.json' },
      dependencies: ['setup:admin'],
    },
    {
      name: 'profesional',
      testMatch: /tests\/profesional\/.+\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/profesional.json' },
      dependencies: ['setup:profesional'],
    },
    {
      name: 'recepcion',
      testMatch: /tests\/recepcion\/.+\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/recepcion.json' },
      dependencies: ['setup:recepcion'],
    },
  ],

  outputDir: 'test-results',
})
