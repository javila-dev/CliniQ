import type { NextConfig } from 'next'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

const nextConfig: NextConfig = {
  output: 'standalone',
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
  webpack: (config, { dev }) => {
    if (dev) {
      // Polling para file-watching en Docker sobre Windows/WSL2
      // inotify no funciona a través del boundary Docker↔WSL2, el polling lo resuelve
      config.watchOptions = {
        poll: 800,
        aggregateTimeout: 300,
      }
    }
    return config
  },
}

export default nextConfig
