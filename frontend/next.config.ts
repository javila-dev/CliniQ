import type { NextConfig } from 'next'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
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
