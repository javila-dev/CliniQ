import { test, expect } from '@playwright/test'

test('recepción puede ver la agenda', async ({ page }) => {
  await page.goto('/agenda')
  await expect(page).not.toHaveURL(/\/login/)
})

test('recepción ve botón para crear cita', async ({ page }) => {
  await page.goto('/agenda')
  await expect(
    page.getByRole('button', { name: /nueva cita|agregar cita|crear cita/i }),
  ).toBeVisible({ timeout: 10_000 })
})

test('recepción NO ve botón eliminar cita', async ({ page }) => {
  await page.goto('/agenda')
  const primeraCita = page.locator('[data-testid="cita-item"], .cita-card').first()
  const hayCitas = await primeraCita.isVisible().catch(() => false)
  if (!hayCitas) {
    test.skip(true, 'No hay citas en la agenda')
    return
  }
  await primeraCita.click()
  await expect(page.getByRole('button', { name: /eliminar/i })).not.toBeVisible({ timeout: 5_000 })
})
