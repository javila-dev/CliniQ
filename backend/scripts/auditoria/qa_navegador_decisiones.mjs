// QA en navegador de las decisiones del 15/10/2026: cancelar una cita cobrada y
// cotizaciones de otro profesional en la ficha del paciente.
//
//   1. docker exec cliniq_backend python scripts/auditoria/qa_flujo_critico.py --persistir
//   2. FRONT_URL=http://localhost:3100 PLAYWRIGHT_DIR=<e2e/node_modules> node backend/scripts/auditoria/qa_navegador_decisiones.mjs
//   3. docker exec cliniq_backend python scripts/auditoria/qa_flujo_critico.py --limpiar

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SALIDA = path.join(AQUI, 'salida')
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? path.join(AQUI, '../../../e2e/node_modules'), 'x.js'))
const { chromium } = require('playwright')

const FRONT = process.env.FRONT_URL ?? 'http://localhost:3100'
const API = process.env.API_URL ?? 'http://localhost:8003/api/v1'
const cred = JSON.parse(fs.readFileSync(path.join(SALIDA, 'qa_usuarios.json'), 'utf8'))
const ids = JSON.parse(fs.readFileSync(path.join(SALIDA, 'qa_flujo_ids.json'), 'utf8'))
const CAPTURAS = path.join(SALIDA, 'qa_capturas_decisiones')
fs.mkdirSync(CAPTURAS, { recursive: true })
const resultados = []

async function login(clave) {
  const r = await fetch(`${API}/auth/login/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cred[clave]),
  })
  // El token de renovación viene en la cookie HttpOnly; se inyecta como sesión
  // vieja (localStorage) y el front lo migra a la cookie al cargar.
  const datos = await r.json()
  datos.refresh = (r.headers.get('set-cookie') ?? '').match(/cliniq_refresh=([^;]+)/)?.[1]
  return datos
}

async function api(clave, ruta) {
  const { access, user } = await login(clave)
  return (await fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${access}`, 'X-Clinica-Id': user.clinica_id } })).json()
}

async function sesion(browser, clave) {
  const { access, refresh, user } = await login(clave)
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(({ access, refresh, clinica }) => {
    if (!sessionStorage.getItem('qa-sesion')) {
      sessionStorage.setItem('qa-sesion', '1')
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
      if (clinica) localStorage.setItem('clinica_id', clinica)
    }
    for (const k of Object.keys(localStorage)) if (k.includes('tour')) localStorage.setItem(k, 'done')
  }, { access, refresh, clinica: user.clinica_id })
  return { context, page: await context.newPage() }
}

async function ir(page, ruta) {
  await page.goto(`${FRONT}${ruta}`, { waitUntil: 'load', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.waitForTimeout(1200)
  for (const t of ['Omitir', 'Saltar']) {
    const b = page.getByRole('button', { name: t })
    if (await b.count()) await b.first().click().catch(() => {})
  }
}

async function chequeo(page, perfil, nombre, fn) {
  let ok = false
  let detalle = ''
  try {
    const r = await fn(page)
    ok = r.ok
    detalle = r.detalle ?? ''
  } catch (e) {
    detalle = `excepción: ${String(e.message).slice(0, 200)}`
  }
  const archivo = `${perfil}_${nombre.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.jpg`
  await page.screenshot({ path: path.join(CAPTURAS, archivo), type: 'jpeg', quality: 55 }).catch(() => {})
  resultados.push({ perfil, chequeo: nombre, ok, detalle, captura: archivo })
  console.log(`${ok ? 'OK ' : 'XX '} ${perfil.padEnd(13)} ${nombre.padEnd(66)} ${detalle}`)
}

/** Abre el detalle de la cita 2, entra a "Confirmar cita" y registra "Canceló". */
async function intentarCancelar(page) {
  await ir(page, `/agenda?cita=${ids.cita_2}`)
  await page.getByRole('button', { name: /Confirmar cita|Confirmar asistencia/ }).first().click()
  await page.waitForTimeout(800)
  await page.getByRole('dialog').locator('textarea').first().fill('La paciente avisa que viaja y cancela.')
  await page.getByRole('button', { name: /^Canceló$/ }).click()
  await page.waitForTimeout(2000)
}

const browser = await chromium.launch()

// ── Recepción: ve el aviso, pero no puede anular el cobro ─────────────────
{
  const { context, page } = await sesion(browser, 'recepcion')
  await chequeo(page, 'recepcion', 'cancelar cita cobrada: aviso sin opción de anular', async (p) => {
    await intentarCancelar(p)
    const t = (await p.locator('body').innerText()).replace(/\s+/g, ' ')
    const aviso = /Esta cita ya tiene un cobro/.test(t)
    const mantener = /Cancelar y mantener el cobro/.test(t)
    const anular = /Cancelar y anular el cobro/.test(t)
    const explica = /Tu rol no puede anular cobros/.test(t)
    return { ok: aviso && mantener && !anular && explica, detalle: `aviso=${aviso} mantener=${mantener} anular=${anular} explica=${explica}` }
  })
  // No cancela: se cierra con "Volver".
  await page.getByRole('button', { name: 'Volver' }).click().catch(() => {})
  await context.close()
}

// ── Admin: cancela y anula el cobro ───────────────────────────────────────
{
  const { context, page } = await sesion(browser, 'admin')
  await chequeo(page, 'admin', 'cancelar cita cobrada y anular el cobro', async (p) => {
    await intentarCancelar(p)
    const t = (await p.locator('body').innerText()).replace(/\s+/g, ' ')
    if (!/Cancelar y anular el cobro/.test(t)) return { ok: false, detalle: 'sin la opción de anular' }
    await p.screenshot({ path: path.join(CAPTURAS, 'admin_dialogo_cobro.jpg'), type: 'jpeg', quality: 55 })
    await p.getByRole('button', { name: 'Cancelar y anular el cobro' }).click()
    await p.waitForTimeout(2500)
    const cita = await api('admin', `/agenda/citas/${ids.cita_2}/`)
    const cobro = await api('admin', `/cobros/cobros/${ids.cobro_cita_2}/`)
    return { ok: cita.estado === 'cancelada' && cobro.estado === 'anulado', detalle: `cita=${cita.estado} cobro=${cobro.estado}` }
  })
  await context.close()
}

// ── Médica con ventas (solo lo suyo): ve las de Pablo pero no las abre ────
{
  const { context, page } = await sesion(browser, 'medica_ventas')
  await chequeo(page, 'medica_ventas', 'ficha: cotizaciones de otro, sin enlace', async (p) => {
    await ir(p, `/pacientes/${ids.paciente}`)
    await p.getByRole('button', { name: /Cotizaciones/ }).first().click()
    await p.waitForTimeout(1500)
    const dialogo = p.getByRole('dialog').first()
    const t = (await dialogo.innerText()).replace(/\s+/g, ' ')
    const enlaces = await dialogo.locator('a[href^="/cotizaciones/"]:not([href*="/nueva"]), a[href^="/ventas/"]').count()
    const filas = (t.match(/De Pablo/g) ?? []).length
    return { ok: filas >= 2 && enlaces === 0, detalle: `filas "De Pablo"=${filas} enlaces=${enlaces}` }
  })
  await chequeo(page, 'medica_ventas', 'abrir por URL la venta de Pablo: mensaje claro', async (p) => {
    await ir(p, `/ventas/${ids.venta}`)
    const t = (await p.locator('body').innerText()).replace(/\s+/g, ' ')
    const claro = /no puedes abrirla/.test(t)
    return { ok: claro, detalle: claro ? '' : t.slice(0, 160) }
  })
  await context.close()
}

// ── Profesional dueño: sus cotizaciones sí se abren ───────────────────────
{
  const { context, page } = await sesion(browser, 'profesional')
  await chequeo(page, 'profesional', 'ficha: sus propias cotizaciones con enlace', async (p) => {
    await ir(p, `/pacientes/${ids.paciente}`)
    await p.getByRole('button', { name: /Cotizaciones/ }).first().click()
    await p.waitForTimeout(1500)
    const enlaces = await p.getByRole('dialog').first().locator('a[href^="/cotizaciones/"], a[href^="/ventas/"]').count()
    return { ok: enlaces >= 2, detalle: `enlaces=${enlaces}` }
  })
  await context.close()
}

await browser.close()
fs.writeFileSync(path.join(SALIDA, 'qa_navegador_decisiones.json'), JSON.stringify(resultados, null, 1))
console.log(`\n${resultados.length} chequeos, ${resultados.filter((r) => !r.ok).length} fallidos`)
