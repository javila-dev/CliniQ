import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

/**
 * Devuelve el ID del build que está sirviendo este contenedor.
 *
 * Lo usa <DetectorNuevaVersion/> para saber si hubo un deploy mientras la
 * pestaña seguía abierta con el JS viejo. `.next/BUILD_ID` lo escribe
 * `next build` y existe también en la salida standalone (el server lo lee
 * al arrancar), así que siempre corresponde al código que está corriendo.
 */

export const dynamic = 'force-dynamic'

let buildId: string | null = null

function leerBuildId(): string {
  if (buildId === null) {
    try {
      buildId = readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim()
    } catch {
      buildId = 'desconocido'
    }
  }
  return buildId
}

export function GET() {
  return NextResponse.json(
    { buildId: leerBuildId() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
