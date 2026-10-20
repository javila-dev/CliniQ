import type { NextConfig } from 'next'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

// ── Cabeceras de seguridad ────────────────────────────────────────────────
// Se calculan en `next build` con las NEXT_PUBLIC_* de .env.production.
const DEV = process.env.NODE_ENV !== 'production'
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'
const origen = (url?: string) => {
  try {
    return url ? new URL(url).origin : ''
  } catch {
    return '' // ruta relativa (/proxy/v1): mismo dominio
  }
}
const DOCUMENSO = origen(process.env.NEXT_PUBLIC_DOCUMENSO_URL)

// Lo que la app carga de afuera: el login con Google, el SDK de Facebook (conectar
// el número de WhatsApp), el worker de pdf.js, Documenso embebido y los videos
// de la ayuda. Los archivos de MinIO pasan por /api/media-proxy (mismo dominio).
const CSP_COMPLETA = [
  "default-src 'self'",
  // Next mete scripts en línea al hidratar; sin nonces hace falta 'unsafe-inline'.
  `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ''} https://accounts.google.com https://connect.facebook.net https://unpkg.com`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${origen(API)} https://accounts.google.com https://*.facebook.com https://unpkg.com${DEV ? ' ws:' : ''}`,
  `frame-src 'self' blob: ${DOCUMENSO} https://accounts.google.com https://*.facebook.com https://www.youtube-nocookie.com https://player.vimeo.com`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `report-uri ${API}/core/csp-reporte/`,
]
  .map((d) => d.replace(/\s+/g, ' ').trim())
  .join('; ')

// Lo que se aplica ya: no cargar plugins, no cambiar la base de las URLs ni
// mandar formularios a otro sitio, y (salvo el autorregistro) nadie puede meter
// la app en un iframe ajeno. El resto de CSP_COMPLETA va en "solo reporte" hasta
// revisar los reportes (log `cliniq.csp` del backend) y pasarla a aplicada.
const CSP_APLICADA = "object-src 'none'; base-uri 'self'; form-action 'self'"

const CABECERAS_SEGURIDAD = [
  { key: 'Content-Security-Policy-Report-Only', value: CSP_COMPLETA },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Cámara: fotos de la atención y del check-in. Lo demás no se usa.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
  ...(DEV ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]),
]

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Rutas viejas de Configuración. El redirect() dentro de la página no siempre
  // se aplicaba bajo el layout de Configuración y dejaba la pantalla en blanco.
  async redirects() {
    return [
      { source: '/configuracion/historia-clinica', destination: '/configuracion/atencion', permanent: false },
      { source: '/configuracion/recordatorios', destination: '/configuracion/agenda', permanent: false },
      { source: '/configuracion/seguimiento', destination: '/configuracion/comercial', permanent: false },
      { source: '/configuracion/cartera', destination: '/configuracion/comercial#cotizaciones', permanent: false },
      { source: '/configuracion/servicios', destination: '/catalogo?tab=procedimientos', permanent: false },
      { source: '/configuracion/tratamientos', destination: '/catalogo?tab=tratamientos', permanent: false },
      { source: '/configuracion/procedimientos', destination: '/catalogo?tab=procedimientos', permanent: false },
    ]
  },
  async headers() {
    return [
      // /proxy/* es la API: el backend pone sus propias cabeceras.
      { source: '/:path((?!proxy/).*)', headers: CABECERAS_SEGURIDAD },
      {
        // El formulario público de autorregistro se puede insertar en el sitio
        // web de la clínica; el resto de la app no.
        source: '/:path((?!proxy/|registro/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: `${CSP_APLICADA}; frame-ancestors 'self'` },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      { source: '/registro/:token*', headers: [{ key: 'Content-Security-Policy', value: CSP_APLICADA }] },
    ]
  },
  // `dev` corre en Webpack (ver package.json), no en Turbopack: su watcher nativo
  // no detecta cambios en el volumen montado de Docker en Windows (bug conocido de
  // Next 15 - vercel/next.js#68255), ni con `watchOptions.pollIntervalMs` abajo.
  // Este bloque queda listo para cuando se resuelva río arriba.
  experimental: {
    turbo: {
      resolveAlias: {
        // pdfjs intenta resolver el paquete nativo de Node aun en rutas cliente.
        // En el navegador usa Canvas API, así que este módulo vacío equivale al
        // alias `canvas: false` de la configuración Webpack.
        canvas: './src/lib/canvas-stub.ts',
      },
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },
  // inotify no funciona a través del boundary Docker↔Windows; el polling lo resuelve.
  // Se traduce a `webpack.watchOptions.poll` automáticamente (build/webpack-config.js).
  ...(process.env.NEXT_DEV_POLLING === 'true' && {
    watchOptions: { pollIntervalMs: 800 },
  }),
  images: {
    remotePatterns: [
      { protocol: 'http',  hostname: '**' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  // Evita el 308 (slash final -> sin slash) en cada request. No cambia el
  // routing de las paginas, solo desactiva el redirect automatico. El slash
  // que Django exige se garantiza con el "/" forzado en el destino del rewrite.
  skipTrailingSlashRedirect: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async rewrites() {
    return [
      {
        // Django (DRF) exige slash final. Next.js descarta el slash al capturar
        // :path*, asi que lo forzamos en el destino para que Django no de 404.
        source: '/proxy/:path*',
        destination: `${BACKEND_URL}/api/:path*/`,
      },
    ]
  },
  webpack: (config) => {
    // SVGs como componentes React (necesario para MapaCorporal interactivo)
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    })

    // react-pdf worker — evitar que webpack intente procesar el worker de pdfjs
    config.resolve.alias['canvas'] = false

    return config
  },
}

export default nextConfig
