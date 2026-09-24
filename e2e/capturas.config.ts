import { defineConfig, devices } from '@playwright/test'

/**
 * Configuración aparte de la de tests: esto no valida nada, solo toma las
 * capturas que ilustran los artículos del centro de ayuda.
 *
 *   docker compose --profile e2e run --rm playwright \
 *     sh -c "npx playwright test -c capturas.config.ts"
 *
 * Requisito previo: `python manage.py seed_demo_ayuda` en el backend, que crea
 * la clínica ficticia y su agenda del día.
 */
export default defineConfig({
  testDir: './capturas',
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://frontend:3000',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    // Pantalla nítida en monitores retina sin disparar el peso del archivo,
    // porque se capturan elementos y no la pantalla completa.
    deviceScaleFactor: 2,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    // Sin animaciones a medio camino en las capturas.
    reducedMotion: 'reduce',
    screenshot: 'off',
    video: 'off',
  },

  outputDir: 'test-results-capturas',
})
