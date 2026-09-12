import { test, expect } from '@playwright/test'

test('agenda carga y muestra la vista de calendario', async ({ page }) => {
  await page.goto('/agenda')

  // Debe mostrar la página sin redirigir a login
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: /agenda/i })).toBeVisible({ timeout: 10_000 })
})

test('agenda muestra botón para crear cita', async ({ page }) => {
  await page.goto('/agenda')

  await expect(
    page.getByRole('button', { name: /nueva cita|agregar cita|crear cita/i }),
  ).toBeVisible({ timeout: 10_000 })
})
