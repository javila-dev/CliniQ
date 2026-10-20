// Recorre todas las pantallas con cada usuario QA y registra lo que falla en silencio.
//
//   1. docker exec cliniq_backend python scripts/auditoria/qa_roles_seed.py
//   2. PLAYWRIGHT_DIR=<ruta a e2e/node_modules> node backend/scripts/auditoria/qa_recorrido_roles.mjs [perfil...]
//
// Por pantalla guarda: a dónde terminó (redirecciones), respuestas de la API con
// error, errores de consola y de la página, avisos (toasts) y textos de "sin
// permiso" o de error. Además el menú lateral que ve cada perfil.
// Salida: salida/qa_recorrido.json y capturas en salida/qa_capturas/.

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SALIDA = path.join(AQUI, 'salida')
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? path.join(AQUI, '../../../e2e/node_modules'), 'x.js'))
const { chromium } = require('playwright')

const FRONT = process.env.FRONT_URL ?? 'http://localhost:3000'
const API = process.env.API_URL ?? 'http://localhost:8003/api/v1'
const credenciales = JSON.parse(fs.readFileSync(path.join(SALIDA, 'qa_usuarios.json'), 'utf8'))
const ids = JSON.parse(fs.readFileSync(path.join(SALIDA, 'qa_ids.json'), 'utf8'))

const RUTAS = [
  '/dashboard', '/agenda', '/atenciones', `/atenciones/${ids.cita_a}`, `/atenciones/${ids.cita_b}`,
  '/pacientes', '/pacientes/nuevo', `/pacientes/${ids.paciente}`, `/pacientes/${ids.paciente}/editar`,
  `/pacientes/${ids.paciente}/historia`,
  '/seguimiento', '/cotizaciones', '/cotizaciones/nueva', `/cotizaciones/${ids.cotizacion_a}`, `/cotizaciones/${ids.cotizacion_b}`,
  '/autorizaciones', '/ventas', `/ventas/${ids.venta_a}`, `/ventas/${ids.venta_b}`,
  '/cartera', `/cartera/${ids.cartera}`, '/consentimientos', '/ingresos', '/cobros',
  '/resultados', '/resultados/egresos', '/resultados/caja',
  '/catalogo', '/inventario', `/inventario/${ids.insumo}`, '/compras', '/compras/nueva', `/compras/${ids.orden}`,
  '/proveedores', '/colaboradores', '/equipo', '/equipo/personal', '/perfil', '/ayuda',
  '/preparar-clinica', '/puesta-en-marcha',
  '/configuracion', '/configuracion/clinica', '/configuracion/sedes', '/configuracion/usuarios', '/configuracion/roles',
  '/configuracion/agenda', '/configuracion/atencion', '/configuracion/biometria', '/configuracion/cajas',
  '/configuracion/campanas', '/configuracion/comercial', '/configuracion/consentimientos',
  `/configuracion/consentimientos/${ids.plantilla}/campos`, '/configuracion/consentimientos/nuevo',
  '/configuracion/formas-pago', '/configuracion/grupos-atencion', '/configuracion/historia-clinica',
  '/configuracion/log-acciones', '/configuracion/plan', '/configuracion/plantillas-ordenes',
  '/configuracion/procedimientos', `/configuracion/procedimientos/${ids.procedimiento}`,
  '/configuracion/recepcion', '/configuracion/recordatorios',
  '/configuracion/servicios', '/configuracion/tratamientos', '/configuracion/whatsapp', '/configuracion/whatsapp/consumo',
  '/console',
]

const SIN_PERMISO = /no tienes (permiso|acceso)|sin permiso|acceso (denegado|restringido)|no tienes los permisos|no autorizado/i
const ERROR_UI = /algo sali[oó] mal|application error|error al cargar|no se pudo cargar|unhandled runtime error|ocurri[oó] un error/i

async function login(clave) {
  const { email, password } = credenciales[clave]
  const r = await fetch(`${API}/auth/login/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  })
  if (!r.ok) throw new Error(`login ${clave}: ${r.status} ${await r.text()}`)
  // El token de renovación viene en la cookie HttpOnly; se inyecta como sesión
  // vieja (localStorage) y el front lo migra a la cookie al cargar.
  const datos = await r.json()
  datos.refresh = (r.headers.get('set-cookie') ?? '').match(/cliniq_refresh=([^;]+)/)?.[1]
  return datos
}

/** Espera a que la API quede quieta (las consultas con polling no bloquean). */
async function esperarQuietud(page, enVuelo, maxMs = 25_000) {
  const inicio = Date.now()
  let quieto = 0
  while (Date.now() - inicio < maxMs) {
    await page.waitForTimeout(250)
    quieto = enVuelo.size === 0 ? quieto + 250 : 0
    if (quieto >= 1500) return
  }
}

async function recorrer(browser, clave) {
  const { access, refresh, user } = await login(clave)
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(({ access, refresh, clinica }) => {
    if (!sessionStorage.getItem('qa-sesion')) {
      sessionStorage.setItem('qa-sesion', '1')
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
      if (clinica) localStorage.setItem('clinica_id', clinica)
    }
  }, { access, refresh, clinica: user.clinica_id })
  const page = await context.newPage()
  const enVuelo = new Set()
  let actual = null
  const registrar = (tipo, dato) => actual && actual[tipo].push(dato)

  page.on('request', (req) => { if (req.url().startsWith(API)) enVuelo.add(req) })
  page.on('requestfinished', (req) => enVuelo.delete(req))
  page.on('requestfailed', (req) => {
    enVuelo.delete(req)
    if (req.url().startsWith(API) && !/aborted/i.test(req.failure()?.errorText ?? '')) {
      registrar('api', { metodo: req.method(), url: req.url().slice(API.length), status: 'falló', cuerpo: req.failure()?.errorText })
    }
  })
  page.on('response', async (res) => {
    if (!res.url().startsWith(API) || res.status() < 400) return
    let cuerpo = ''
    try { cuerpo = (await res.text()).slice(0, 300) } catch {}
    registrar('api', { metodo: res.request().method(), url: res.url().slice(API.length), status: res.status(), cuerpo })
  })
  page.on('console', (m) => { if (m.type() === 'error') registrar('consola', m.text().slice(0, 300)) })
  page.on('pageerror', (e) => registrar('pagina', String(e.message).slice(0, 300)))

  const resultado = { perfil: clave, email: user.email, permisos: user.permissions ?? [], menu: [], aterrizaje: null, rutas: [] }

  // Aterrizaje después del login y menú lateral visible.
  await page.goto(`${FRONT}/login`, { waitUntil: 'load', timeout: 120_000 })
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }).catch(() => {})
  await esperarQuietud(page, enVuelo)
  resultado.aterrizaje = new URL(page.url()).pathname
  await page.waitForTimeout(1500)
  resultado.aterrizaje = new URL(page.url()).pathname
  resultado.menu = await page.$$eval('aside a[href], nav a[href]', (as) =>
    [...new Set(as.map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('/')))]).catch((e) => [`error: ${e.message}`])

  fs.mkdirSync(path.join(SALIDA, 'qa_capturas', clave), { recursive: true })
  for (const ruta of RUTAS) {
    actual = { ruta, api: [], consola: [], pagina: [], avisos: [], final: null, textoSinPermiso: null, textoError: null, ms: 0 }
    const t0 = Date.now()
    try {
      await page.goto(`${FRONT}${ruta}`, { waitUntil: 'load', timeout: 120_000 })
      await esperarQuietud(page, enVuelo)
      await page.waitForTimeout(600)
    } catch (e) {
      actual.pagina.push(`navegación: ${String(e.message).slice(0, 200)}`)
    }
    actual.ms = Date.now() - t0
    // Una redirección tardía (guardas de permiso) destruye el contexto: se
    // espera a que la URL se asiente y se vuelve a leer.
    for (let intento = 0; intento < 4; intento++) {
      try {
        actual.final = new URL(page.url()).pathname
        const texto = await page.locator('body').innerText({ timeout: 5_000 })
        actual.textoSinPermiso = texto.match(SIN_PERMISO)?.[0] ?? null
        actual.textoError = texto.match(ERROR_UI)?.[0] ?? null
        actual.avisos = await page.$$eval('[data-sonner-toast]', (ts) => ts.map((t) => t.innerText.replace(/\s+/g, ' ').trim()))
        actual.titulo = await page.$$eval('main h1, h1', (hs) => hs.map((h) => h.innerText.trim()).filter(Boolean)[0] ?? null)
        actual.vacio = texto.trim().length < 40
        break
      } catch {
        await page.waitForTimeout(1500)
        await esperarQuietud(page, enVuelo, 10_000)
      }
    }
    const archivo = ruta.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'raiz'
    await page.screenshot({ path: path.join(SALIDA, 'qa_capturas', clave, `${archivo}.jpg`), type: 'jpeg', quality: 45 }).catch(() => {})
    resultado.rutas.push(actual)
    process.stdout.write(`${clave} ${ruta} -> ${actual.final} api=${actual.api.length} err=${actual.consola.length + actual.pagina.length} ${actual.ms}ms\n`)
  }
  actual = null
  await context.close()
  return resultado
}

const perfiles = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(credenciales)
const browser = await chromium.launch()
const archivo = path.join(SALIDA, 'qa_recorrido.json')
const todos = fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, 'utf8')) : {}
const CONCURRENCIA = Number(process.env.CONCURRENCIA ?? 3)
const cola = [...perfiles]
await Promise.all(Array.from({ length: CONCURRENCIA }, async () => {
  while (cola.length) {
    const clave = cola.shift()
    try {
      todos[clave] = await recorrer(browser, clave)
    } catch (e) {
      todos[clave] = { perfil: clave, error: String(e) }
      console.error(clave, e)
    }
    fs.writeFileSync(archivo, JSON.stringify(todos, null, 1))
  }
}))
await browser.close()
