import { NextResponse, type NextRequest } from 'next/server'
import { APP_URL, DOMINIOS_SEPARADOS, HOST_SITIO, HOSTS_ALIAS_SITIO, SITIO_URL } from '@/lib/dominios'

// Reparte las rutas entre el sitio público y la app (docs/plan-separacion-dominios.md).
// Sin los dos dominios configurados no hace nada.

// Páginas del sitio público. Lo demás se manda a la app con la misma ruta.
const PAGINAS_SITIO = ['/registro-clinica', '/terminos', '/privacidad']

// Lo único de la API que usa el sitio: el alta de la clínica (con sus planes),
// los reportes de CSP y la versión del build (DetectorNuevaVersion).
const API_SITIO = ['/proxy/v1/registro-clinica/', '/proxy/v1/core/csp-reporte', '/api/version']

// robots.txt, sitemap.xml, imágenes y fuentes de public/.
const ARCHIVO = /\.(txt|xml|png|jpe?g|svg|webp|gif|ico|woff2?|webmanifest|pdf|mp4)$/i

const ROBOTS_APP = 'User-agent: *\nDisallow: /\n'

function sitio(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const ruta = pathname.replace(/\/+$/, '') || '/'

  if (ruta === '/') {
    const landing = request.nextUrl.clone()
    landing.pathname = '/landing'
    return NextResponse.rewrite(landing)
  }
  if (ruta === '/landing') return NextResponse.redirect(`${SITIO_URL}/${search}`, 308)
  if (PAGINAS_SITIO.includes(ruta) || ARCHIVO.test(pathname)) return NextResponse.next()
  if (API_SITIO.some((prefijo) => pathname.startsWith(prefijo))) return NextResponse.next()
  if (pathname.startsWith('/proxy/') || pathname.startsWith('/api/')) {
    return new NextResponse(null, { status: 404 })
  }
  return NextResponse.redirect(`${APP_URL}${pathname}${search}`, 308)
}

export function middleware(request: NextRequest) {
  if (!DOMINIOS_SEPARADOS) return NextResponse.next()

  const host = (request.headers.get('host') || '').toLowerCase()
  const { pathname, search } = request.nextUrl

  if (HOSTS_ALIAS_SITIO.includes(host)) return NextResponse.redirect(`${SITIO_URL}${pathname}${search}`, 308)
  if (host === HOST_SITIO) return sitio(request)

  // La app (o la IP / la red interna): igual que siempre, pero sin indexar.
  // El landing y el registro viejos llevan al sitio público.
  const ruta = pathname.replace(/\/+$/, '') || '/'
  if (ruta === '/landing') return NextResponse.redirect(`${SITIO_URL}/${search}`, 308)
  if (PAGINAS_SITIO.includes(ruta)) return NextResponse.redirect(`${SITIO_URL}${ruta}${search}`, 308)
  if (ruta === '/robots.txt') {
    return new NextResponse(ROBOTS_APP, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  if (ruta === '/sitemap.xml') return new NextResponse(null, { status: 404 })

  const respuesta = NextResponse.next()
  respuesta.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return respuesta
}

export const config = {
  // Los estáticos del build no pasan por aquí: se sirven igual en los dos dominios.
  matcher: ['/((?!_next/static|_next/image).*)'],
}
