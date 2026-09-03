'use client'

import { useEffect, useRef } from 'react'

const GSI_SRC = 'https://accounts.google.com/gsi/client'
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

let gsiPromise: Promise<void> | null = null

function loadGsi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.google?.accounts?.id) return Promise.resolve()
  if (gsiPromise) return gsiPromise

  gsiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('gsi-load-failed')))
      return
    }
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('gsi-load-failed'))
    document.head.appendChild(script)
  })
  return gsiPromise
}

interface Props {
  onCredential: (credential: string) => void
  onError?: (message: string) => void
}

/**
 * Botón "Continuar con Google" (Google Identity Services). Devuelve el ID token
 * en `onCredential`; el backend lo verifica en POST /auth/google/. No se renderiza
 * nada si NEXT_PUBLIC_GOOGLE_CLIENT_ID no está configurado.
 */
export function GoogleSignInButton({ onCredential, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onCredentialRef = useRef(onCredential)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onCredentialRef.current = onCredential
    onErrorRef.current = onError
  })

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false

    loadGsi()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.accounts?.id) return

        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response: { credential?: string }) => {
            if (response?.credential) onCredentialRef.current(response.credential)
          },
        })
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.round(containerRef.current.getBoundingClientRect().width) || 320,
          locale: 'es',
        })
      })
      .catch(() => {
        onErrorRef.current?.('No pudimos cargar el inicio de sesión con Google.')
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!CLIENT_ID) return null

  return <div ref={containerRef} className="flex justify-center [color-scheme:light]" />
}
