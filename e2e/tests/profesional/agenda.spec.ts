import { test, expect } from '@playwright/test'

test('profesional puede ver la agenda', async ({ page }) => {
  await page.goto('/agenda')
  await expect(page).not.toHaveURL(/\/login/)
})

test('profesional NO ve botón para crear cita', async ({ page }) => {
  await page.goto('/agenda')
  await page.waitForTimeout(2_000) // esperar render completo
  await expect(
    page.getByRole('button', { name: /nueva cita|agregar cita|crear cita/i }),
  ).not.toBeVisible()
})
