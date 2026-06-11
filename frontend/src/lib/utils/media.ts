/**
 * Utilidades para resolver URLs de archivos almacenados en MinIO.
 *
 * Arquitectura de 2 buckets (H29):
 *  - clinica-static (PÚBLICO):  logos, fotos de perfil, assets
 *    → URLs directas sin X-Amz-*, cargables por el browser sin proxy
 *  - clinica-media (PRIVADO): fotos clínicas, consentimientos, check-ins
 *    → URLs presignadas con X-Amz-*, TTL 1h
 *    → El browser no puede resolver el hostname interno de Docker
 *    → Se pasan por /api/media-proxy
 */

/**
 * Resuelve una URL de MinIO para que sea accesible desde el browser.
 *
 *  - URL pública (sin X-Amz-*): se devuelve tal cual.
 *    Cuando H29 esté implementado, estas URLs usarán NEXT_PUBLIC_MINIO_PUBLIC_URL
 *    y no necesitarán proxy.
 *
 *  - URL presignada (con X-Amz-*): se enruta a /api/media-proxy
 *    que fetcha la imagen usando el hostname interno de Docker.
 *
 *  - Ruta relativa (/media/...): se prefija con el origen del backend Django.
 *
 *  - null/undefined: se devuelve null.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null

  // Ruta relativa → prefijo con el origen del backend Django
  if (url.startsWith('/')) {
    const origin = process.env.NEXT_PUBLIC_BACKEND_ORIGIN ?? 'http://localhost:8000'
    return `${origin}${url}`
  }

  // URL presignada de MinIO (bucket privado) → usar proxy Next.js
  // Detecta formato v4 (X-Amz-*) y formato v2 (AWSAccessKeyId + Signature)
  if (url.includes('X-Amz-') || url.includes('x-amz-') || url.includes('AWSAccessKeyId')) {
    return `/api/media-proxy?url=${encodeURIComponent(url)}`
  }

  // URL pública (bucket público, CDN, etc.) → usar directamente
  return url
}

/**
 * Devuelve true si la URL apunta a un archivo del bucket privado (presignada).
 * Útil para mostrar íconos de "archivo protegido".
 */
export function isPrivateMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return url.includes('X-Amz-') || url.includes('x-amz-')
}
