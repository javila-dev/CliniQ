// QA en navegador del flujo crítico (cotización → agenda → atención) con los perfiles QA.
//
//   1. docker exec cliniq_backend python scripts/auditoria/qa_flujo_critico.py --persistir
//   2. FRONT_URL=http://localhost:3100 PLAYWRIGHT_DIR=<e2e/node_modules> node backend/scripts/auditoria/qa_navegador_flujo.mjs
//   3. docker exec cliniq_backend python scripts/auditoria/qa_flujo_critico.py --limpiar
//
// Cada perfil hace lo que haría en la clínica sobre los datos del paso 1 y se
// revisa lo que ve: textos, botones habilitados o no, errores de la API y de la
// consola. Salida: salida/qa_navegador_flujo.json y capturas en salida/qa_capturas_flujo/.

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
const CAPTURAS = path.join(SALIDA, 'qa_capturas_flujo')
fs.mkdirSync(CAPTURAS, { recursive: true })

const resultados = []

async function sesion(browser, clave) {
  const r = await fetch(`${API}/auth/login/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cred[clave]),
  })
  if (!r.ok) throw new Error(`login ${clave}: ${r.status}`)
  const { access, refresh, user } = await r.json()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(({ access, refresh, clinica }) => {
    if (!localStorage.getItem('access_token')) {
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
      if (clinica) localStorage.setItem('clinica_id', clinica)
    }
    // Sin tours de bienvenida: tapan la pantalla en las capturas.
    for (const k of Object.keys(localStorage)) if (k.includes('tour')) localStorage.setItem(k, 'done')
  }, { access, refresh, clinica: user.clinica_id })
  const page = await context.newPage()
  const errores = []
  page.on('response', async (res) => {
    if (!res.url().startsWith(API) || res.status() < 400 || res.status() === 401) return
    let cuerpo = ''
    try { cuerpo = (await res.text()).slice(0, 200) } catch {}
    errores.push(`${res.request().method()} ${res.url().slice(API.length).split('?')[0]} ${res.status()} ${cuerpo}`)
  })
  page.on('pageerror', (e) => errores.push(`JS: ${String(e.message).slice(0, 200)}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`consola: ${m.text().slice(0, 200)}`) })
  return { page, context, errores }
}

async function ir(page, ruta) {
  await page.goto(`${FRONT}${ruta}`, { waitUntil: 'load', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.waitForTimeout(1200)
  // Cerrar tours que aparezcan igual.
  for (const t of ['Omitir', 'Saltar']) {
    const b = page.getByRole('button', { name: t })
    if (await b.count()) await b.first().click().catch(() => {})
  }
}

/** Registra un chequeo: ok + detalle + captura. */
async function chequeo(s, perfil, nombre, fn) {
  const antes = s.errores.length
  let ok = false
  let detalle = ''
  try {
    const r = await fn(s.page)
    ok = r === true || r?.ok === true
    detalle = typeof r === 'object' && r ? (r.detalle ?? '') : ''
  } catch (e) {
    detalle = `excepción: ${String(e.message).slice(0, 200)}`
  }
  const archivo = `${perfil}_${nombre.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.jpg`
  await s.page.screenshot({ path: path.join(CAPTURAS, archivo), type: 'jpeg', quality: 50 }).catch(() => {})
  const errores = s.errores.slice(antes)
  resultados.push({ perfil, chequeo: nombre, ok, detalle, errores, captura: archivo, url: new URL(s.page.url()).pathname })
  console.log(`${ok ? 'OK ' : 'XX '} ${perfil.padEnd(12)} ${nombre.padEnd(70)} ${detalle}${errores.length ? ` · ${errores.length} errores API/JS` : ''}`)
}

const texto = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const habilitado = async (page, nombre) => {
  const b = page.getByRole('button', { name: nombre })
  if (!(await b.count())) return null
  return await b.first().isEnabled()
}

const browser = await chromium.launch()

// ── Profesional: cotización por autorizar, su agenda, su atención ──────────
{
  const s = await sesion(browser, 'profesional')
  await chequeo(s, 'profesional', 'cotización por autorizar muestra el aviso y bloquea PDF/Enviar', async (p) => {
    await ir(p, `/cotizaciones/${ids.por_autorizar}`)
    const t = await texto(p)
    const aviso = /autoriza/i.test(t)
    const enviar = await habilitado(p, /Enviar/i)
    const pdf = await habilitado(p, /PDF/i)
    return { ok: aviso && enviar !== true && pdf !== true, detalle: `aviso=${aviso} enviar=${enviar} pdf=${pdf}` }
  })
  await chequeo(s, 'profesional', 'dashboard: Mis citas de hoy con la paciente', async (p) => {
    await ir(p, '/dashboard')
    const t = await texto(p)
    return { ok: /Mis citas de hoy/.test(t) && /Laura/.test(t), detalle: `mis=${/Mis citas de hoy/.test(t)} laura=${/Laura/.test(t)}` }
  })
  await chequeo(s, 'profesional', 'agenda: solo la suya, sin selector de profesionales', async (p) => {
    await ir(p, '/agenda')
    const t = await texto(p)
    return { ok: !/Todos los profesionales/.test(t), detalle: `selector=${/Todos los profesionales/.test(t)} laura=${/Laura/.test(t)}` }
  })
  await chequeo(s, 'profesional', 'atenciones: la paciente en la cola de espera', async (p) => {
    await ir(p, '/atenciones')
    const t = await texto(p)
    return { ok: /Laura/.test(t), detalle: `laura=${/Laura/.test(t)}` }
  })
  await chequeo(s, 'profesional', 'abrir la atención de la cita en espera', async (p) => {
    await ir(p, `/atenciones/${ids.cita_hoy}`)
    const t = await texto(p)
    return { ok: !/No se pudo cargar/.test(t) && /Laura/.test(t), detalle: t.slice(0, 160) }
  })
  await chequeo(s, 'profesional', 'venta: sesiones del paquete visibles', async (p) => {
    await ir(p, `/ventas/${ids.venta}`)
    const t = await texto(p)
    return { ok: /sesi/i.test(t) && !/No se pudo/.test(t), detalle: t.match(/\d+\s*(de|\/)\s*\d+[^.]{0,40}/)?.[0] ?? '' }
  })
  await s.context.close()
}

// ── Admin: bandeja de autorizaciones ──────────────────────────────────────
{
  const s = await sesion(browser, 'admin')
  await chequeo(s, 'admin', 'autorizaciones: la solicitud está en "Por decidir"', async (p) => {
    await ir(p, '/autorizaciones')
    const t = await texto(p)
    return { ok: /Laura/.test(t) && /Autorizar/i.test(t), detalle: `laura=${/Laura/.test(t)}` }
  })
  await chequeo(s, 'admin', 'la cotización muestra la decisión al admin', async (p) => {
    await ir(p, `/cotizaciones/${ids.por_autorizar}`)
    const t = await texto(p)
    return { ok: /Autorizar/i.test(t) && /Rechazar/i.test(t), detalle: '' }
  })
  await s.context.close()
}

// ── Recepción: agenda del día, detalle de la cita, Nueva cita del paquete ──
{
  const s = await sesion(browser, 'recepcion')
  await chequeo(s, 'recepcion', 'agenda del día muestra la cita de la paciente', async (p) => {
    await ir(p, '/agenda')
    const t = await texto(p)
    return { ok: /Laura/.test(t), detalle: `laura=${/Laura/.test(t)}` }
  })
  await chequeo(s, 'recepcion', 'detalle de la cita (en espera)', async (p) => {
    await ir(p, `/agenda?cita=${ids.cita_hoy}`)
    const t = await texto(p)
    return { ok: /espera/i.test(t), detalle: t.match(/En espera[^.]{0,40}/i)?.[0] ?? '' }
  })
  await chequeo(s, 'recepcion', 'Nueva cita desde la venta: agendar el procedimiento vendido', async (p) => {
    await ir(p, `/ventas/${ids.venta}`)
    // Botón de agendar en el panel de sesiones.
    const agendar = p.getByRole('button', { name: /Agendar/i })
    if (!(await agendar.count())) return { ok: false, detalle: 'sin botón Agendar en la venta' }
    // El último "Agendar" suele ser el del procedimiento suelto (segundo ítem).
    await agendar.last().click()
    await p.waitForTimeout(2000)
    const dialogo = p.getByRole('dialog')
    const sedePrecargada = !(await dialogo.getByText('Seleccionar sede').count())
    // Como la recepcionista: elegir sede y profesional.
    if (!sedePrecargada) {
      await dialogo.getByText('Seleccionar sede').click()
      await p.keyboard.press('Enter')
      await p.waitForTimeout(1200)
    }
    await dialogo.getByText(/Seleccionar profesional/).click()
    await p.waitForTimeout(800)
    await p.keyboard.type('Pablo'); await p.waitForTimeout(500); await p.getByText('Pablo Profesional Qa').last().click({ force: true })
    await p.waitForTimeout(2500)
    const t = (await dialogo.first().innerText()).replace(/\s+/g, ' ')
    const errorDuracion = /no tiene duraci/i.test(t)
    return {
      ok: !errorDuracion && !/Selecciona profesional para ver/.test(t),
      detalle: `sede precargada=${sedePrecargada} · ${errorDuracion ? 'SlotPicker: "El item no tiene duración configurada"' : (t.match(/Horario disponible.{0,80}/)?.[0] ?? '')}`,
    }
  })
  await chequeo(s, 'recepcion', 'ficha de la paciente', async (p) => {
    await ir(p, `/pacientes/${ids.paciente}`)
    const t = await texto(p)
    return { ok: /Laura/.test(t) && !/Ocurrió un error|No se pudo/.test(t), detalle: '' }
  })
  await s.context.close()
}

// ── Esteticista: no ve la agenda de Pablo, sí el historial de la paciente ──
{
  const s = await sesion(browser, 'esteticista')
  await chequeo(s, 'esteticista', 'su agenda no muestra la cita de Pablo', async (p) => {
    await ir(p, '/agenda')
    const t = await texto(p)
    return { ok: !/Laura/.test(t), detalle: `laura=${/Laura/.test(t)}` }
  })
  await chequeo(s, 'esteticista', 'ficha de la paciente (sin crear ni cotizar)', async (p) => {
    await ir(p, `/pacientes/${ids.paciente}`)
    const t = await texto(p)
    const cotizar = /Nueva cotización/.test(t)
    return { ok: /Laura/.test(t) && !cotizar, detalle: `nueva cotización visible=${cotizar}` }
  })
  await s.context.close()
}

// ── Cajera y gerencia: cartera de la venta ─────────────────────────────────
for (const [perfil, debeCobrar] of [['cajera', true], ['gerencia', false]]) {
  const s = await sesion(browser, perfil)
  await chequeo(s, perfil, `cartera de la venta: ${debeCobrar ? 'puede' : 'no puede'} registrar pago`, async (p) => {
    await ir(p, `/cartera/${ids.cartera}`)
    const t = await texto(p)
    const boton = /Registrar pago|Cobrar/.test(t)
    return { ok: boton === debeCobrar && /Laura|Plan de pagos/.test(t), detalle: `botón cobrar=${boton}` }
  })
  await s.context.close()
}

// ── Asesora (otra sede): no ve la venta de la sede A en sus listados ──────
{
  const s = await sesion(browser, 'asesora')
  await chequeo(s, 'asesora', 'ventas: la venta de la otra sede no aparece', async (p) => {
    await ir(p, '/ventas')
    const t = await texto(p)
    return { ok: !/Laura QA/.test(t), detalle: `aparece=${/Laura QA/.test(t)}` }
  })
  await s.context.close()
}

// ── Profesional: atiende y cierra la atención (al final: cambia el estado) ──
{
  const s = await sesion(browser, 'profesional')
  await chequeo(s, 'profesional', 'iniciar, documentar y completar la atención', async (p) => {
    await ir(p, `/atenciones/${ids.cita_hoy}`)
    const iniciar = p.getByRole('button', { name: /Iniciar atención/ })
    if (await iniciar.count()) await iniciar.click()
    await p.waitForTimeout(4000)
    const motivo = p.locator('textarea').first()
    await motivo.click()
    await motivo.fill('Control QA: flacidez abdominal, sesión 1.')
    await p.waitForTimeout(2500) // autoguardado
    await p.getByRole('button', { name: /Completar/ }).first().click()
    await p.waitForTimeout(1500)
    // Sesión de tratamiento: primero "Procedimientos realizados", luego la confirmación.
    const sesionBtn = p.getByRole('button', { name: /Completar sesión y atención/ })
    if (await sesionBtn.count()) {
      await sesionBtn.click()
      await p.waitForTimeout(2000)
    }
    const confirmar = p.getByRole('dialog').getByRole('button', { name: /terminar|Completar|Confirmar|Sí/i })
    if (await confirmar.count()) await confirmar.last().click()
    await p.waitForURL((u) => u.pathname === '/atenciones', { timeout: 20_000 }).catch(() => {})
    const r = await fetch(`${API}/auth/login/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cred.profesional),
    })
    const { access, user } = await r.json()
    const cita = await (await fetch(`${API}/agenda/citas/${ids.cita_hoy}/`, {
      headers: { Authorization: `Bearer ${access}`, 'X-Clinica-Id': user.clinica_id },
    })).json()
    return { ok: cita.estado === 'completada', detalle: `estado=${cita.estado} url=${new URL(p.url()).pathname}` }
  })
  await s.context.close()
}

await browser.close()
fs.writeFileSync(path.join(SALIDA, 'qa_navegador_flujo.json'), JSON.stringify(resultados, null, 1))
console.log(`\n${resultados.length} chequeos, ${resultados.filter((r) => !r.ok).length} fallidos`)
