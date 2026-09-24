import type { NextConfig } from 'next'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

const nextConfig: NextConfig = {
  output: 'standalone',
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
