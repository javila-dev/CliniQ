/**
 * Capturas de pantalla para el landing público (marketing).
 *
 * Corre contra la clínica ficticia «Clínica Aurora» que crea
 * `python manage.py seed_demo_ayuda`. Igual que las capturas de ayuda: nunca
 * mostrar datos de una clínica real en material de marketing.
 *
 * Salida: `capturas-out/landing/<nombre>.png`.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

import { BACKEND, abrirSesionEnNavegador, loginApi } from '../fixtures/sesion'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'AuroraDemo2026*'
const SALIDA = 'capturas-out/landing'

const CUENTAS = {
  admin: 'aurora.admin@demo.cliniq.co',
  recepcion: 'aurora.recepcion@demo.cliniq.co',
  profesional: 'aurora.profesional@demo.cliniq.co',
}

async function entrar(page: Page, request: APIRequestContext, email: string) {
  const { access, refresh, clinicaId } = await loginApi(request, email, PASSWORD)
  await abrirSesionEnNavegador(page, refresh, clinicaId)
  return {
    headers: {
      Authorization: `Bearer ${access}`,
      'X-Clinica-Id': clinicaId ?? '',
    },
  }
}

test('dashboard', async ({ page, request }) => {
  await entrar(page, request, CUENTAS.admin)
  await page.goto('/dashboard')
  await expect(page.getByText('Buenos días')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${SALIDA}/dashboard.png` })
})

test('agenda semana', async ({ page, request }) => {
  await entrar(page, request, CUENTAS.recepcion)
  await page.goto('/agenda')
  await expect(page.getByText('Mariana Salgado')).toBeVisible()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${SALIDA}/agenda.png` })
})

test('pacientes', async ({ page, request }) => {
  await entrar(page, request, CUENTAS.admin)
  await page.goto('/pacientes')
  await expect(page.getByText('5 pacientes registrados')).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SALIDA}/pacientes.png` })
})

test('cartera', async ({ page, request }) => {
  const { headers } = await entrar(page, request, CUENTAS.admin)
  const res = await request.get(`${BACKEND}/api/v1/cartera/`, { headers })
  expect(res.ok()).toBeTruthy()
  const carteras = (await res.json()).results ?? []
  expect(carteras.length).toBeGreaterThan(0)

  await page.goto(`/cartera/${carteras[0].id}`)
  await expect(page.getByText('Cuotas y pagos')).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SALIDA}/cartera.png` })
})

test('atenciones cola', async ({ page, request }) => {
  await entrar(page, request, CUENTAS.profesional)
  await page.goto('/atenciones')
  await expect(page.getByText('Cola de espera')).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SALIDA}/atenciones.png` })
})

test('landing completo', async ({ page }) => {
  await page.goto('/landing')
  await expect(page.getByRole('heading', { name: /Toda tu clínica, de la cita al cobro/ })).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SALIDA}/landing-full.png`, fullPage: true })
})
