'use client'

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        // Red de seguridad: un guardado que falla sin que la pantalla lo maneje
        // (sin onError) avisa en vez de fallar en silencio. Las mutaciones que
        // muestran el error por su cuenta (try/catch con mutateAsync) llevan
        // meta.errorManejado.
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if (mutation.options.onError || mutation.meta?.errorManejado) return
            toast.error('No se pudo guardar', mensajeDeError(error))
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60, // 1 min
            retry: 1,
          },
        },
      })
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
