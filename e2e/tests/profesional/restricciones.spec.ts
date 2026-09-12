import { test, expect } from '@playwright/test'

test('profesional NO accede a configuración', async ({ page }) => {
  await page.goto('/configuracion')
  await expect(page).not.toHaveURL(/\/configuracion/, { timeout: 8_000 })
})

test('profesional NO accede a cobros', async ({ page }) => {
  await page.goto('/cobros')
  // cobros.ver no está en el perfil profesional — debe redirigir
  await expect(page).not.toHaveURL(/\/cobros/, { timeout: 8_000 })
})

test('profesional NO ve botón para crear citas en agenda', async ({ page }) => {
  await page.goto('/agenda')
  await page.waitForTimeout(2_000)
  await expect(
    page.getByRole('button', { name: /nueva cita|agregar cita|crear cita/i }),
  ).not.toBeVisible()
})
