import { test, expect } from '@playwright/test'

test('recepción NO accede a configuración (redirige)', async ({ page }) => {
  await page.goto('/configuracion')
  // Debe redirigir fuera de /configuracion — al dashboard u otra ruta permitida
  await expect(page).not.toHaveURL(/\/configuracion/, { timeout: 8_000 })
})

test('recepción NO ve sección de usuarios en el nav', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByRole('link', { name: /^usuarios$/i })).not.toBeVisible()
})

test('recepción NO ve sección de roles en el nav', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByRole('link', { name: /^roles$/i })).not.toBeVisible()
})
