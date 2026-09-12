import { test, expect } from '@playwright/test'

test('admin accede a cobros', async ({ page }) => {
  await page.goto('/cobros')
  await expect(page).not.toHaveURL(/\/login/)
})

test('admin ve botón anular cobro', async ({ page }) => {
  await page.goto('/cobros')
  const primerCobro = page.locator('[data-testid="cobro-item"], .cobro-row, tbody tr').first()
  const hayCobros = await primerCobro.isVisible().catch(() => false)
  if (!hayCobros) {
    test.skip(true, 'No hay cobros para verificar botón de anular')
    return
  }
  await primerCobro.click()
  await expect(page.getByRole('button', { name: /anular/i })).toBeVisible({ timeout: 5_000 })
})
