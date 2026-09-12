import { test, expect } from '@playwright/test'

// Este test corre SIN sesión guardada — valida el flujo real de login
test.use({ storageState: { cookies: [], origins: [] } })

test('login exitoso redirige al dashboard o agenda', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveTitle(/CliniQ/i)

  // Usamos #email y #password para evitar ambigüedad con el form de recuperación
  // que también está en el DOM (slider oculto)
  await page.locator('#email').fill(process.env.TEST_EMAIL_ADMIN ?? '')
  await page.locator('#password').fill(process.env.TEST_PASSWORD_ADMIN ?? '')
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })
})

test('credenciales incorrectas muestran error', async ({ page }) => {
  await page.goto('/login')

  await page.locator('#email').fill('noexiste@test.com')
  await page.locator('#password').fill('wrongpassword')
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page.getByText(/credenciales incorrectas/i)).toBeVisible({ timeout: 8_000 })
})
