'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Embedded Signup de Meta en modo Coexistence (el número sigue en la app de
// WhatsApp Business). Abre el popup con FB.login y junta dos cosas que Meta
// entrega por separado: el `code` (callback de FB.login) y los IDs de la
// cuenta (postMessage con type WA_EMBEDDED_SIGNUP). El `code` vence rápido y
// es de un solo uso: quien use el hook debe canjearlo apenas llegue.

const SDK_URL = 'https://connect.facebook.net/es_LA/sdk.js'
const GRAPH_VERSION = 'v22.0'
const ESPERA_SESION_MS = 5000

export const EVENTO_COEXISTENCE = 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'

export interface ResultadoEmbeddedSignup {
  evento: string
  code: string
  waba_id: string
  phone_number_id: string
  business_id: string
}

interface SesionMeta {
  evento: string
  waba_id: string
  phone_number_id: string
  business_id: string
}

interface FBLoginResponse {
  authResponse?: { code?: string } | null
  status?: string
}

interface FacebookSdk {
  init: (opts: Record<string, unknown>) => void
  login: (cb: (res: FBLoginResponse) => void, opts: Record<string, unknown>) => void
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

let cargaSdk: Promise<FacebookSdk> | null = null

function cargarSdk(appId: string): Promise<FacebookSdk> {
  if (cargaSdk) return cargaSdk
  cargaSdk = new Promise((resolve, reject) => {
    if (window.FB) {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION })
      resolve(window.FB)
      return
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION })
      resolve(window.FB!)
    }
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onerror = () => {
      cargaSdk = null
      reject(new Error('No se pudo cargar la ventana de Meta. Revisa tu conexión o desactiva bloqueadores de anuncios.'))
    }
    document.body.appendChild(script)
  })
  return cargaSdk
}

export class EmbeddedSignupCancelado extends Error {}

export function useEmbeddedSignup({ appId, configId }: { appId: string; configId: string }) {
  const sesion = useRef<SesionMeta | null>(null)
  const [abriendo, setAbriendo] = useState(false)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      let host = ''
      try {
        host = new URL(event.origin).hostname
      } catch {
        return
      }
      if (!/(^|\.)facebook\.com$/.test(host)) return
      let data: { type?: string; event?: string; data?: Record<string, string> }
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return
      sesion.current = {
        evento: data.event ?? '',
        waba_id: data.data?.waba_id ?? '',
        phone_number_id: data.data?.phone_number_id ?? '',
        business_id: data.data?.business_id ?? '',
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  /** Abre el popup y resuelve con el resultado; rechaza con
   *  EmbeddedSignupCancelado si la clínica cierra o cancela. */
  const abrir = useCallback(async (): Promise<ResultadoEmbeddedSignup> => {
    setAbriendo(true)
    sesion.current = null
    try {
      const FB = await cargarSdk(appId)
      const code = await new Promise<string>((resolve, reject) => {
        FB.login(
          (res) => {
            const c = res.authResponse?.code
            if (c) resolve(c)
            else reject(new EmbeddedSignupCancelado('Cerraste la ventana de Meta antes de terminar.'))
          },
          {
            config_id: configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
          },
        )
      })

      // El postMessage con los IDs suele llegar antes que el callback, pero no siempre.
      const inicio = Date.now()
      while (!sesion.current?.waba_id && Date.now() - inicio < ESPERA_SESION_MS) {
        await new Promise((r) => setTimeout(r, 200))
      }
      const s = sesion.current as SesionMeta | null
      if (s?.evento === 'CANCEL') {
        throw new EmbeddedSignupCancelado('Cerraste la ventana de Meta antes de terminar.')
      }
      if (!s?.waba_id) {
        throw new Error('Meta no devolvió los datos de tu cuenta de WhatsApp. Intenta de nuevo.')
      }
      return { code, ...s }
    } finally {
      setAbriendo(false)
    }
  }, [appId, configId])

  return { abrir, abriendo }
}
