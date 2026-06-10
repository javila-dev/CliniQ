import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy para archivos privados de MinIO (bucket clinica-media).
 *
 * Problema: MinIO genera URLs presignadas con el hostname INTERNO de Docker
 * (ej. http://minio:9000/...) que el browser no puede resolver.
 * Este proxy corre en el servidor Next.js, que sí está en la misma red Docker.
 *
 * Flujo:
 *  Browser → GET /api/media-proxy?url=<presigned-url-encoded>
 *  Next.js server → fetch(<presigned-url con hostname interno>)
 *  Next.js server → responde con los bytes al browser
 *
 * Solo se usa para archivos del bucket PRIVADO (los que tienen X-Amz-* en la URL).
 * Los archivos del bucket PÚBLICO (clinica-static) se sirven directamente.
 *
 * Variables de entorno relevantes:
 *  MINIO_PUBLIC_FACING_URL  — hostname que el browser ve en la URL (ej. http://localhost:9000)
 *  MINIO_INTERNAL_URL       — hostname que Next.js usa para fetchar  (ej. http://minio:9000)
 */

const MINIO_PUBLIC_FACING = process.env.MINIO_PUBLIC_FACING_URL ?? 'http://localhost:9000'
const MINIO_INTERNAL      = process.env.MINIO_INTERNAL_URL       ?? 'http://minio:9000'

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')
  if (!rawUrl) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  // Validar que sea una URL presignada (v4: X-Amz-*, v2: AWSAccessKeyId)
  const isPresigned = rawUrl.includes('X-Amz-') || rawUrl.includes('x-amz-') || rawUrl.includes('AWSAccessKeyId')
  if (!isPresigned) {
    return new NextResponse('Not a presigned URL — use direct access for public assets', { status: 400 })
  }

  // Reemplazar el hostname público por el interno para que Next.js pueda resolverlo
  // El browser envía la URL con el hostname que él ve; el servidor necesita el interno
  let targetUrl = rawUrl
  if (MINIO_PUBLIC_FACING !== MINIO_INTERNAL) {
    targetUrl = rawUrl.replace(MINIO_PUBLIC_FACING, MINIO_INTERNAL)
  }

  // Validar que sea una URL válida
  try {
    new URL(targetUrl)
  } catch {
    return new NextResponse('Invalid URL', { status: 400 })
  }

  try {
    const response = await fetch(targetUrl, { redirect: 'follow' })

    if (!response.ok) {
      return new NextResponse(
        `MinIO returned ${response.status}: ${response.statusText}`,
        { status: response.status },
      )
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
    const body = await response.arrayBuffer()

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Cachear en el browser por el tiempo de vida de la URL presignada
        // (conservador: 55 min para URLs con TTL de 1h)
        'Cache-Control': 'private, max-age=3300',
      },
    })
  } catch (err) {
    console.error('[media-proxy] fetch error:', err)
    return new NextResponse('Failed to fetch from MinIO', { status: 502 })
  }
}
