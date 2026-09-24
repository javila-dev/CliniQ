/**
 * Capturas de pantalla para los artículos del centro de ayuda.
 *
 * Corre contra la clínica ficticia «Clínica Aurora» que crea
 * `python manage.py seed_demo_ayuda`. Ninguna captura debe salir de una clínica
 * real: el contenido de ayuda es global y lo ve cualquier cliente.
 *
 * Las imágenes se escriben en `capturas-out/<slug-del-articulo>/` y de ahí se
 * copian a `frontend/public/img/ayuda/`, que es lo que referencia el Markdown.
 */
import { test, expect, type Page, type APIRequestContext, type Locator } from '@playwright/test'

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:8000'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'AuroraDemo2026*'
const SALIDA = 'capturas-out'

const CUENTAS = {
  admin: 'aurora.admin@demo.cliniq.co',
  recepcion: 'aurora.recepcion@demo.cliniq.co',
  profesional: 'aurora.profesional@demo.cliniq.co',
}

interface Sesion {
  token: string
  /** El backend exige este header en casi todos los endpoints. */
  headers: Record<string, string>
}

/** Deja la sesión iniciada en localStorage, igual que hace el login real. */
async function entrar(page: Page, request: APIRequestContext, email: string): Promise<Sesion> {
  const res = await request.post(`${BACKEND}/api/v1/auth/login/`, {
    data: { email, password: PASSWORD },
  })
  expect(res.ok(), `login falló para ${email}: ${await res.text()}`).toBeTruthy()
  const { access, refresh, user } = await res.json()

  await page.goto('/login')
  await page.evaluate(
    ({ access, refresh, clinica }) => {
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
      if (clinica) localStorage.setItem('clinica_id', clinica)
    },
    { access, refresh, clinica: user?.clinica_id ?? null },
  )
  return {
    token: access,
    headers: {
      Authorization: `Bearer ${access}`,
      'X-Clinica-Id': user?.clinica_id ?? '',
    },
  }
}

interface OpcionesCaptura {
  /** Elemento a capturar. Sin él se captura la ventana. */
  target?: Locator
  /** Recorta la altura para que la imagen no arrastre espacio vacío. */
  alto?: number
}

async function capturar(page: Page, slug: string, nombre: string, opciones: OpcionesCaptura = {}) {
  await page.waitForTimeout(500)
  const path = `${SALIDA}/${slug}/${nombre}.png`
  const { target, alto } = opciones

  if (!alto) {
    await (target ?? page).screenshot({ path })
    return
  }

  const caja = target ? await target.boundingBox() : null
  const ventana = page.viewportSize()!
  await page.screenshot({
    path,
    clip: caja
      ? { x: caja.x, y: caja.y, width: caja.width, height: Math.min(alto, caja.height) }
      : { x: 0, y: 0, width: ventana.width, height: Math.min(alto, ventana.height) },
  })
}

/** El diálogo abierto (Radix monta uno por vez). */
function dialogo(page: Page) {
  return page.getByRole('dialog').last()
}

// ── Agendar una cita ────────────────────────────────────────────────────────

test('agendar una cita', async ({ page, request }) => {
  const slug = 'agendar-una-cita'
  await entrar(page, request, CUENTAS.recepcion)
  await page.goto('/agenda')

  await page.getByRole('button', { name: 'Nueva cita' }).click()
  const modal = dialogo(page)
  await expect(modal.getByRole('heading', { name: 'Nueva cita' })).toBeVisible()

  // 1. Buscar al paciente: el desplegable con el resultado.
  await modal.getByPlaceholder('Buscar paciente por nombre o documento...').fill('Mariana')
  await expect(modal.getByText('Mariana Salgado Ríos')).toBeVisible()
  await capturar(page, slug, '01-buscar-paciente', { target: modal, alto: 320 })

  // 2. Tipo de cita: aparece al elegir paciente.
  await modal.getByText('Mariana Salgado Ríos').first().click()
  await expect(modal.getByText('Tipo de cita')).toBeVisible()
  await capturar(page, slug, '02-tipo-de-cita', { target: modal })
})

// ── Cola de atención ────────────────────────────────────────────────────────

test('cola de atención', async ({ page, request }) => {
  const slug = 'como-funciona-la-cola-de-atencion'
  await entrar(page, request, CUENTAS.profesional)
  await page.goto('/atenciones')

  await expect(page.getByText('Cola de espera')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Iniciar' })).toBeVisible()
  await capturar(page, slug, '01-cola-de-espera', { alto: 760 })
})

// ── Asistente de inicio de atención ─────────────────────────────────────────

test('asistente de inicio de atención', async ({ page, request }) => {
  const slug = 'asistente-de-inicio-de-atencion'
  const { headers } = await entrar(page, request, CUENTAS.recepcion)

  // Cita confirmada de hoy, por API, para no depender del scroll del calendario.
  const res = await request.get(`${BACKEND}/api/v1/agenda/citas/?estado=confirmada`, {
    headers,
  })
  expect(res.ok(), `no se pudieron listar las citas: ${await res.text()}`).toBeTruthy()
  const citas = (await res.json()).results ?? []
  expect(citas.length, 'la clínica demo no tiene citas confirmadas hoy').toBeGreaterThan(0)

  await page.goto(`/agenda?cita=${citas[0].id}`)
  await page.getByRole('button', { name: 'Registrar llegada' }).click()

  const modal = dialogo(page)
  await expect(modal.getByRole('heading', { name: /Iniciar atención/ })).toBeVisible()
  await expect(modal.getByRole('button', { name: /Enviar código/ })).toBeVisible()
  await capturar(page, slug, '01-paso-llegada', { target: modal, alto: 360 })

  // El recorrido de pasos se revela al pasar el cursor sobre el indicador de puntos.
  await modal.locator('button:has(> div.rounded-full)').first().hover()
  await expect(modal.getByText('Consentimiento')).toBeVisible()
  await capturar(page, slug, '02-pasos-del-asistente', { target: modal, alto: 470 })
})

// ── Registrar un pago ───────────────────────────────────────────────────────

test('registrar un pago', async ({ page, request }) => {
  const slug = 'registrar-un-pago'
  const { headers } = await entrar(page, request, CUENTAS.admin)

  const res = await request.get(`${BACKEND}/api/v1/cartera/`, { headers })
  expect(res.ok(), `no se pudo listar la cartera: ${await res.text()}`).toBeTruthy()
  const carteras = (await res.json()).results ?? []
  expect(carteras.length, 'la clínica demo no tiene cartera').toBeGreaterThan(0)

  // 1. El plan de cuotas, con la mora a la vista.
  await page.goto(`/cartera/${carteras[0].id}`)
  await expect(page.getByText('Cuotas y pagos')).toBeVisible()
  await capturar(page, slug, '01-cuotas-de-la-cartera', { alto: 700 })

  // 2. El formulario de pago sobre la cuota vencida.
  await page.getByRole('button', { name: 'Registrar pago' }).first().click()
  const modal = dialogo(page)
  await expect(modal.getByRole('heading', { name: 'Registrar pago' })).toBeVisible()
  await capturar(page, slug, '02-formulario-de-pago', { target: modal })
})
