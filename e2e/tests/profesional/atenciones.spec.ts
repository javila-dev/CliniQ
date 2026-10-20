import { test, expect } from '../../fixtures/sesion'

test('profesional accede a atenciones', async ({ page }) => {
  await page.goto('/atenciones')
  await expect(page).not.toHaveURL(/\/login/)
})
