// QA en navegador de las cabeceras de seguridad y la CSP del front (16/10/2026).
// Recorre las pantallas principales y junta lo que la CSP bloquea (aplicada) o
// bloquearía (solo reporte).
//
//   FRONT_URL=http://localhost:3100 PLAYWRIGHT_DIR=<e2e/node_modules> node backend/scripts/auditoria/qa_navegador_csp.mjs

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SALIDA = path.join(AQUI, 'salida')
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? path.join(AQUI, '../../../e2e/node_modules'), 'x.js'))
const { chromium } = require('playwright')

const FRONT = process.env.FRONT_URL ?? 'http://localhost:3100'
const cred = JSON.parse(fs.readFileSync(path.join(SALIDA, 'qa_usuarios.json'), 'utf8'))
const RUTAS = [
  '/dashboard', '/agenda', '/pacientes', '/atenciones', '/cotizaciones', '/ventas', '/seguimiento',
  '/cartera', '/caja', '/inventario', '/reportes', '/consentimientos', '/protocolos', '/equipo/personal',
  '/configuracion/clinica', '/configuracion/whatsapp', '/ayuda',
]
const CABECERAS = [
  'content-security-policy', 'content-security-policy-report-only', 'x-frame-options',
  'x-content-type-options', 'referrer-policy', 'permissions-policy', 'x-powered-by',
]

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript(() => {
  for (const k of Object.keys(localStorage)) if (k.includes('tour')) localStorage.setItem(k, 'done')
})
const page = await context.newPage()
const avisos = []
let ruta = '/login'
page.on('console', (m) => {
  const t = m.text()
  if (/Content Security Policy/i.test(t)) avisos.push({ ruta, soloReporte: /\[Report Only\]|report-only/i.test(t), texto: t.slice(0, 260) })
})
const errores = []
page.on('pageerror', (e) => errores.push(`${ruta}: ${String(e.message).slice(0, 160)}`))

const respuesta = await page.goto(`${FRONT}/login`, { waitUntil: 'load', timeout: 90_000 })
const cab = respuesta.headers()
console.log('Cabeceras de /login:')
for (const c of CABECERAS) console.log(`  ${c}: ${cab[c] ?? '(no está)'}`)

await page.waitForTimeout(2500) // botón de Google
await page.locator('#email').fill(cred.admin.email)
await page.locator('#password').fill(cred.admin.password)
await page.locator('button[type="submit"]').first().click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })

for (const r of RUTAS) {
  ruta = r
  await page.goto(`${FRONT}${r}`, { waitUntil: 'load', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const actual = new URL(page.url()).pathname
  console.log(`${actual === r ? 'OK ' : '-> '} ${r}${actual === r ? '' : ` (quedó en ${actual})`}`)
}

await browser.close()
const aplicados = avisos.filter((a) => !a.soloReporte)
const reportes = avisos.filter((a) => a.soloReporte)
console.log(`\nBloqueos de la CSP aplicada: ${aplicados.length}`)
for (const a of aplicados) console.log(`  ${a.ruta}: ${a.texto}`)
console.log(`Avisos de la CSP en solo reporte: ${reportes.length}`)
for (const a of reportes) console.log(`  ${a.ruta}: ${a.texto}`)
console.log(`Errores de página: ${errores.length}`)
for (const e of errores) console.log(`  ${e}`)
fs.writeFileSync(path.join(SALIDA, 'qa_navegador_csp.json'), JSON.stringify({ cabeceras: cab, avisos, errores }, null, 1))
