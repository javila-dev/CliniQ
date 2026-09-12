import { test, expect } from '@playwright/test'

test('admin puede ver la agenda', async ({ page }) => {
  await page.goto('/agenda')
  await expect(page).not.toHaveURL(/\/login/)
})

test('admin ve botón para crear cita', async ({ page }) => {
  await page.goto('/agenda')
  await expect(
    page.getByRole('button', { name: /nueva cita|agregar cita|crear cita/i }),
  ).toBeVisible({ timeout: 10_000 })
})

test('admin ve opción para eliminar cita', async ({ page }) => {
  await page.goto('/agenda')
  // Abrir el menú de una cita si existe alguna — validamos que el botón eliminar está presente
  const primeraCita = page.locator('[data-testid="cita-item"], .cita-card').first()
  const hayCitas = await primeraCita.isVisible().catch(() => false)
  if (!hayCitas) {
    test.skip(true, 'No hay citas en la agenda para verificar opciones de eliminar')
    return
  }
  await primeraCita.click()
  await expect(page.getByRole('button', { name: /eliminar/i })).toBeVisible({ timeout: 5_000 })
})
