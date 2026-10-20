// QA en navegador de la sesión sin tokens en localStorage (16/10/2026).
//
//   1. docker exec cliniq_backend python scripts/auditoria/qa_sesion_setup.py crear
//   2. FRONT_URL=http://localhost:3100 PLAYWRIGHT_DIR=<e2e/node_modules> node backend/scripts/auditoria/qa_navegador_sesion.mjs
//   3. docker exec cliniq_backend python scripts/auditoria/qa_sesion_setup.py borrar

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
const superadmin = JSON.parse(fs.readFileSync(path.join(SALIDA, 'qa_superadmin.json'), 'utf8'))
const CAPTURAS = path.join(SALIDA, 'qa_capturas_sesion')
fs.mkdirSync(CAPTURAS, { recursive: true })
const resultados = []
const TOKENS_VIEJOS = ['access_token', 'refresh_token', 'original_access_token', 'original_refresh_token']

async function chequeo(page, nombre, fn) {
  let ok = false
  let detalle = ''
  try {
    const r = await fn(page)
    ok = r.ok
    detalle = r.detalle ?? ''
  } catch (e) {
    detalle = `excepción: ${String(e.message).slice(0, 200)}`
  }
  const archivo = `${nombre.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.jpg`
  await page.screenshot({ path: path.join(CAPTURAS, archivo), type: 'jpeg', quality: 55 }).catch(() => {})
  resultados.push({ chequeo: nombre, ok, detalle, captura: archivo })
  console.log(`${ok ? 'OK ' : 'XX '} ${nombre.padEnd(72)} ${detalle}`)
}

async function esperar(page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

async function loginPorPantalla(page, { email, password }) {
  await page.goto(`${FRONT}/login`, { waitUntil: 'load', timeout: 60_000 })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
  await esperar(page)
}

const tokensEnStorage = (page) =>
  page.evaluate((claves) => claves.filter((c) => localStorage.getItem(c) !== null), TOKENS_VIEJOS)

const cookieSesion = async (context) => (await context.cookies()).find((c) => c.name === 'cliniq_refresh')

const browser = await chromium.launch()

// ── 1. Login, recarga y cierre de sesión ─────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await loginPorPantalla(page, cred.admin)

  await chequeo(page, 'login: sin tokens en localStorage y cookie HttpOnly', async (p) => {
    const enStorage = await tokensEnStorage(p)
    const cookie = await cookieSesion(context)
    const visibleParaJs = await p.evaluate(() => document.cookie.includes('cliniq_refresh'))
    return {
      ok: enStorage.length === 0 && Boolean(cookie?.httpOnly) && !visibleParaJs,
      detalle: `storage=${JSON.stringify(enStorage)} httpOnly=${cookie?.httpOnly} sameSite=${cookie?.sameSite} js_la_ve=${visibleParaJs}`,
    }
  })

  await chequeo(page, 'recargar la página mantiene la sesión', async (p) => {
    await p.reload({ waitUntil: 'load' })
    await esperar(p)
    const url = new URL(p.url()).pathname
    return { ok: !url.startsWith('/login'), detalle: `url=${url}` }
  })

  await chequeo(page, 'varias pestañas que abren a la vez siguen con sesión', async () => {
    // Como al restaurar el navegador: todas renuevan el token al mismo tiempo.
    for (let ronda = 0; ronda < 2; ronda++) {
      const pestanas = await Promise.all(Array.from({ length: 5 }, () => context.newPage()))
      await Promise.all(pestanas.map((t) => t.goto(`${FRONT}/agenda`, { waitUntil: 'load', timeout: 60_000 })))
      await Promise.all(pestanas.map(esperar))
      const enLogin = pestanas.filter((t) => new URL(t.url()).pathname.startsWith('/login')).length
      await Promise.all(pestanas.map((t) => t.close()))
      if (enLogin) return { ok: false, detalle: `ronda ${ronda + 1}: ${enLogin} de 5 pestañas terminaron en el login` }
    }
    await page.reload({ waitUntil: 'load' })
    await esperar(page)
    const sigue = !new URL(page.url()).pathname.startsWith('/login')
    return { ok: sigue, detalle: `2 rondas de 5 pestañas, la original sigue=${sigue}` }
  })

  await chequeo(page, 'cerrar sesión en una pestaña cierra las demás', async (p) => {
    const otra = await context.newPage()
    await otra.goto(`${FRONT}/pacientes`, { waitUntil: 'load', timeout: 60_000 })
    await esperar(otra)
    await otra.getByText('Cerrar sesión').first().click()
    await otra.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 20_000 })
    await p.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 15_000 }).catch(() => {})
    const ruta = new URL(p.url()).pathname
    await otra.close()
    // Se vuelve a entrar para el chequeo siguiente.
    await loginPorPantalla(p, cred.admin)
    return { ok: ruta.startsWith('/login'), detalle: `la otra pestaña quedó en ${ruta}` }
  })

  const cookieAntes = (await cookieSesion(context))?.value
  await chequeo(page, 'cerrar sesión borra la cookie y revoca el token', async (p) => {
    await p.getByText('Cerrar sesión').first().click()
    await p.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 20_000 })
    const cookie = await cookieSesion(context)
    const r = await fetch(`${API}/auth/refresh/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: cookieAntes }),
    })
    await p.reload({ waitUntil: 'load' })
    await esperar(p)
    const sigueEnLogin = new URL(p.url()).pathname.startsWith('/login')
    return {
      ok: !cookie && r.status === 401 && sigueEnLogin,
      detalle: `cookie=${Boolean(cookie)} token_viejo=${r.status} en_login=${sigueEnLogin}`,
    }
  })
  await context.close()
}

// ── 2. Sesión abierta con la versión anterior (token en localStorage) ─────
{
  const r = await fetch(`${API}/auth/login/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cred.recepcion),
  })
  const { user } = await r.json()
  const refresh = (r.headers.get('set-cookie') ?? '').match(/cliniq_refresh=([^;]+)/)?.[1]
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(({ refresh, clinica }) => {
    if (!sessionStorage.getItem('qa-init')) {
      sessionStorage.setItem('qa-init', '1')
      localStorage.setItem('refresh_token', refresh)
      localStorage.setItem('access_token', 'token-viejo-vencido')
      localStorage.setItem('clinica_id', clinica)
    }
  }, { refresh, clinica: user.clinica_id })
  const page = await context.newPage()
  await chequeo(page, 'sesión vieja: se migra a la cookie sin volver a iniciar sesión', async (p) => {
    await p.goto(`${FRONT}/dashboard`, { waitUntil: 'load', timeout: 60_000 })
    await esperar(p)
    const url = new URL(p.url()).pathname
    const enStorage = await tokensEnStorage(p)
    const cookie = await cookieSesion(context)
    return {
      ok: !url.startsWith('/login') && enStorage.length === 0 && Boolean(cookie?.httpOnly),
      detalle: `url=${url} storage=${JSON.stringify(enStorage)} cookie=${Boolean(cookie)}`,
    }
  })
  await context.close()
}

// ── 3. Suplantación del superadmin ───────────────────────────────────────
{
  const admin = await (await fetch(`${API}/auth/login/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cred.admin),
  })).json()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(({ clinica }) => {
    // Lo que deja "Entrar como clínica" en la consola.
    localStorage.setItem('superadmin-clinica-activa', JSON.stringify({ state: { clinicaActiva: { id: clinica, nombre: 'QA', logo: null } }, version: 0 }))
    for (const k of Object.keys(localStorage)) if (k.includes('tour')) localStorage.setItem(k, 'done')
  }, { clinica: admin.user.clinica_id })
  const page = await context.newPage()
  await loginPorPantalla(page, superadmin)

  await chequeo(page, 'suplantar: entra como el usuario sin guardar tokens', async (p) => {
    await p.goto(`${FRONT}/equipo/personal`, { waitUntil: 'load', timeout: 60_000 })
    await esperar(p)
    const menu = 'button[aria-haspopup="menu"]'
    const fila = p.locator('div').filter({ hasText: admin.user.email }).filter({ has: p.locator(menu) }).last()
    await fila.locator(menu).first().click()
    await p.getByText('Ingresar como este usuario').click()
    await p.waitForURL((u) => u.pathname.startsWith('/dashboard'), { timeout: 30_000 })
    await esperar(p)
    const banner = await p.getByText('Estás viendo la sesión de').count()
    const enStorage = await tokensEnStorage(p)
    return { ok: banner > 0 && enStorage.length === 0, detalle: `banner=${banner > 0} storage=${JSON.stringify(enStorage)}` }
  })

  await chequeo(page, 'recargar durante la suplantación vuelve al superadmin', async (p) => {
    await p.reload({ waitUntil: 'load' })
    await esperar(p)
    const banner = await p.getByText('Estás viendo la sesión de').count()
    const url = new URL(p.url()).pathname
    const yo = (await p.getByText('Superadministrador').count()) > 0 ? 'superadmin' : 'otro'
    // Para el chequeo siguiente se vuelve a entrar como el usuario.
    await p.goto(`${FRONT}/equipo/personal`, { waitUntil: 'load', timeout: 60_000 })
    await esperar(p)
    const menu = 'button[aria-haspopup="menu"]'
    const fila = p.locator('div').filter({ hasText: admin.user.email }).filter({ has: p.locator(menu) }).last()
    await fila.locator(menu).first().click()
    await p.getByText('Ingresar como este usuario').click()
    await p.waitForURL((u) => u.pathname.startsWith('/dashboard'), { timeout: 30_000 })
    await esperar(p)
    return { ok: banner === 0 && !url.startsWith('/login') && yo === 'superadmin', detalle: `banner=${banner > 0} url=${url} sesión=${yo}` }
  })

  await chequeo(page, 'salir de la suplantación vuelve al superadmin', async (p) => {
    // El "Salir" del aviso de suplantación, no el de la barra de la clínica.
    await p.locator('div').filter({ hasText: 'Estás viendo la sesión de' }).getByRole('button', { name: /Salir/ }).last().click()
    await esperar(p)
    const banner = await p.getByText('Estás viendo la sesión de').count()
    const url = new URL(p.url()).pathname
    return { ok: banner === 0 && !url.startsWith('/login'), detalle: `banner=${banner > 0} url=${url}` }
  })
  await context.close()
}

await browser.close()
fs.writeFileSync(path.join(SALIDA, 'qa_navegador_sesion.json'), JSON.stringify(resultados, null, 1))
console.log(`\n${resultados.length} chequeos, ${resultados.filter((r) => !r.ok).length} fallidos`)
