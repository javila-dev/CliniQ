import { test, expect } from '@playwright/test'

test('admin accede a configuración', async ({ page }) => {
  await page.goto('/configuracion')
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page).not.toHaveURL(/\/dashboard/)
})

test('admin ve la sección de usuarios en configuración', async ({ page }) => {
  await page.goto('/configuracion')
  await expect(page.getByRole('link', { name: /usuarios|equipo|colaboradores/i }).first()).toBeVisible({ timeout: 10_000 })
})

test('admin ve la sección de roles en configuración', async ({ page }) => {
  await page.goto('/configuracion')
  await expect(page.getByRole('link', { name: /roles/i }).first()).toBeVisible({ timeout: 10_000 })
})
