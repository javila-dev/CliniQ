'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { registroPublicoApi } from '@/lib/api/clinicas'

type State = 'loading' | 'success' | 'error'

export default function VerificarClinicaPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [state, setState] = useState<State>('loading')
  const [errorMsg, setErrorMsg] = useState<string>('')

  useEffect(() => {
    if (!token) return

    registroPublicoApi.verificarRegistro(token)
      .then((data) => {
        if (data.invite_token) {
          // Redirigir directo a crear contraseña — sin pasar por login
          router.replace(`/recuperar-contrasena?token=${data.invite_token}`)
        } else {
          setState('success')
        }
      })
      .catch((err) => {
        const msg =
          err?.response?.data?.error ||
          'El enlace no es válido o ya fue utilizado.'
        setErrorMsg(msg)
        setState('error')
      })
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1118] px-4">
      <div className="w-full max-w-sm text-center space-y-6">

        <div className="flex justify-center mb-2">
          <Image src="/imagotipo cliniq.png" alt="CliniQ" width={160} height={160} className="object-contain brightness-[1.15]" />
        </div>

        {state === 'loading' && (
          <>
            <Loader2 className="h-10 w-10 text-rose-400 animate-spin mx-auto" />
            <p className="text-white/60 text-sm">Verificando tu correo...</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/10 ring-4 ring-emerald-500/20 mx-auto">
              <CheckCircle2 className="h-9 w-9 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white">¡Correo verificado!</h1>
              <p className="text-white/50 text-sm leading-relaxed">
                Tu clínica fue creada exitosamente. Te enviamos un correo para que crees tu contraseña e ingreses al sistema.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => router.replace('/login')}
            >
              Ir al inicio de sesión
            </Button>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10 ring-4 ring-destructive/20 mx-auto">
              <XCircle className="h-9 w-9 text-red-400" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white">Enlace inválido</h1>
              <p className="text-white/50 text-sm leading-relaxed">{errorMsg}</p>
            </div>
            <Link href="/registro-clinica">
              <Button variant="outline" className="w-full">
                Volver al registro
              </Button>
            </Link>
          </>
        )}

      </div>
    </div>
  )
}
