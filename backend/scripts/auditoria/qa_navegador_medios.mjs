// QA en navegador de los hallazgos medios: la cola que recibe al primer paciente
// (hook fuera de orden), "Llegó" con check-in apagado (AG-06) y completar la
// atención justo después de escribir (AT-13).
//
//   1. docker exec cliniq_backend python scripts/auditoria/qa_flujo_critico.py --persistir
//   2. FRONT_URL=http://localhost:3100 PLAYWRIGHT_DIR=<e2e/node_modules> node backend/scripts/auditoria/qa_navegador_medios.mjs
//   3. docker exec cliniq_backend python scripts/auditoria/qa_medios_setup.py limpiar
//   4. docker exec cliniq_backend python scripts/auditoria/qa_flujo_critico.py --limpiar

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
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
const CAPTURAS = path.join(SALIDA, 'qa_capturas_medios')
fs.mkdirSync(CAPTURAS, { recursive: true })
const resultados = []

function preparar(modo) {
  execSync(`docker exec cliniq_backend python scripts/auditoria/qa_medios_setup.py ${modo}`, { stdio: 'inherit' })
  return fs.existsSync(path.join(SALIDA, 'qa_medios_estado.json'))
    ? JSON.parse(fs.readFileSync(path.join(SALIDA, 'qa_medios_estado.json'), 'utf8'))
    : {}
}

async function login(clave) {
  const r = await fetch(`${API}/auth/login/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cred[clave]),
  })
  return r.json()
}

async function api(clave, ruta) {
  const { access, user } = await login(clave)
  return (await fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${access}`, 'X-Clinica-Id': user.clinica_id } })).json()
}

async function sesion(browser, clave) {
  const { access, refresh, user } = await login(clave)
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(({ access, refresh, clinica }) => {
    if (!localStorage.getItem('access_token')) {
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
      if (clinica) localStorage.setItem('clinica_id', clinica)
    }
    for (const k of Object.keys(localStorage)) if (k.includes('tour')) localStorage.setItem(k, 'done')
  }, { access, refresh, clinica: user.clinica_id })
  const page = await context.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(String(e.message).slice(0, 200)))
  return { context, page, errores }
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

const texto = async (p) => (await p.locator('body').innerText()).replace(/\s+/g, ' ')
const browser = await chromium.launch()
const citaHoy = await api('profesional', `/agenda/citas/${ids.cita_hoy}/`)
const nombrePaciente = citaHoy.paciente_nombre

// ── Profesional: la cola vacía recibe al primer paciente sin romperse ────────
{
  const s = await sesion(browser, 'profesional')
  await chequeo(s.page, 'profesional', 'cola vacía que recibe al primer paciente', async (p) => {
    preparar('cola_vacia')
    await ir(p, '/atenciones')
    const vacia = /No hay más pacientes/.test(await texto(p))
    preparar('cola_restaurar')
    // La pantalla se actualiza sola cada 30 s.
    let llego = false
    for (let i = 0; i < 25 && !llego; i++) {
      await p.waitForTimeout(2000)
      llego = (await texto(p)).includes(nombrePaciente)
    }
    const roto = /Application error|client-side exception/i.test(await texto(p))
    return {
      ok: vacia && llego && !roto && s.errores.length === 0,
      detalle: `vacía=${vacia} llegó=${llego} roto=${roto} errores=${s.errores.join(' | ')}`,
    }
  })
  await s.context.close()
}

// ── Recepción: "Llegó" con check-in apagado deja la cita en espera (AG-06) ───
{
  const estado = preparar('ag06')
  const s = await sesion(browser, 'recepcion')
  await chequeo(s.page, 'recepcion', 'Llegó con check-in apagado pasa a en espera', async (p) => {
    await ir(p, `/agenda?cita=${estado.cita_ag06}`)
    await p.getByRole('button', { name: /^Llegó$/ }).first().click()
    let cita = null
    for (let i = 0; i < 10; i++) {
      await p.waitForTimeout(1500)
      cita = await api('recepcion', `/agenda/citas/${estado.cita_ag06}/`)
      if (cita.estado === 'en_espera') break
    }
    const listo = /Paciente listo/.test(await texto(p))
    return { ok: cita?.estado === 'en_espera', detalle: `estado=${cita?.estado} "Paciente listo"=${listo}` }
  })
  await s.context.close()
}

// ── Profesional: completar justo después de escribir no pierde el texto (AT-13) ──
{
  const s = await sesion(browser, 'profesional')
  const escrito = `QA AT-13 ${Date.now()}: control sin esperar el autoguardado.`
  await chequeo(s.page, 'profesional', 'completar apenas se escribe guarda el texto', async (p) => {
    await ir(p, `/atenciones/${ids.cita_hoy}`)
    const iniciar = p.getByRole('button', { name: /Iniciar atención/ })
    if (await iniciar.count()) await iniciar.click()
    await p.waitForTimeout(4000)
    const motivo = p.locator('textarea').first()
    await motivo.click()
    await motivo.fill(escrito)
    // Sin esperar los 1,5 s del autoguardado.
    await p.getByRole('button', { name: /Completar/ }).first().click()
    await p.waitForTimeout(1500)
    const bloqueada = /sin contenido/i.test(await texto(p))
    const sesionBtn = p.getByRole('button', { name: /Completar sesión y atención/ })
    if (await sesionBtn.count()) {
      await sesionBtn.click()
      await p.waitForTimeout(2000)
    }
    const confirmar = p.getByRole('dialog').getByRole('button', { name: /terminar|Completar|Confirmar|Sí/i })
    if (await confirmar.count()) await confirmar.last().click()
    await p.waitForURL((u) => u.pathname === '/atenciones', { timeout: 20_000 }).catch(() => {})
    const historias = await api('profesional', `/historia-clinica/historias/?paciente=${ids.paciente}`)
    const notas = await api('profesional', `/historia-clinica/historias/${historias.results[0].id}/notas/`)
    const lista = Array.isArray(notas) ? notas : notas.results ?? []
    const nota = lista.find((n) => n.cita === ids.cita_hoy)
    const cita = await api('profesional', `/agenda/citas/${ids.cita_hoy}/`)
    return {
      ok: !bloqueada && nota?.motivo_consulta === escrito && nota?.estado === 'completada' && cita.estado === 'completada',
      detalle: `bloqueada=${bloqueada} motivo=${JSON.stringify(nota?.motivo_consulta)} nota=${nota?.estado} cita=${cita.estado}`,
    }
  })
  await s.context.close()
}

await browser.close()
fs.writeFileSync(path.join(SALIDA, 'qa_navegador_medios.json'), JSON.stringify(resultados, null, 1))
console.log(`\n${resultados.length} chequeos, ${resultados.filter((r) => !r.ok).length} fallidos`)
