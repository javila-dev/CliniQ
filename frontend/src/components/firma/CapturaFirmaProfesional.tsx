'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, Loader2, Monitor, RefreshCw, Smartphone, Upload } from 'lucide-react'
import { authApi } from '@/lib/api/auth'
import { firmaProfesionalApi } from '@/lib/api/firmaProfesional'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { LienzoFirma, type LienzoFirmaHandle } from '@/components/firma/LienzoFirma'
import { cn } from '@/lib/utils'

type Modo = 'lienzo' | 'movil' | 'archivo'

function dataUrlAArchivo(dataUrl: string): File {
  const [cabecera, base64] = dataUrl.split(',')
  const tipo = cabecera.match(/data:(.*);base64/)?.[1] ?? 'image/png'
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  return new File([bytes], 'firma.png', { type: tipo })
}

function useSegundosRestantes(expiraEn: string | null) {
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    if (!expiraEn) return
    const calcular = () => setSegundos(Math.max(0, Math.round((new Date(expiraEn).getTime() - Date.now()) / 1000)))
    calcular()
    const id = setInterval(calcular, 1000)
    return () => clearInterval(id)
  }, [expiraEn])
  return segundos
}

function PanelMovil({ onRecibida }: { onRecibida: () => void }) {
  const crear = useMutation({ mutationFn: firmaProfesionalApi.crearCaptura })
  const captura = crear.data
  const segundos = useSegundosRestantes(captura?.expira_en ?? null)

  // Genera el QR al abrir la pestaña.
  const { mutate } = crear
  useEffect(() => { mutate() }, [mutate])

  const { data: estado } = useQuery({
    queryKey: ['captura-firma', captura?.token],
    queryFn: () => firmaProfesionalApi.estadoCaptura(captura!.token),
    enabled: !!captura,
    refetchInterval: q => (q.state.data?.estado && q.state.data.estado !== 'pendiente' ? false : 2000),
  })

  const recibida = estado?.estado === 'completado'
  const vencido = estado?.estado === 'vencido' || (!!captura && segundos === 0 && !recibida)

  const notificado = useRef(false)
  useEffect(() => {
    if (recibida && !notificado.current) {
      notificado.current = true
      onRecibida()
    }
  }, [recibida, onRecibida])

  if (recibida) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <p className="font-semibold text-sm">Firma recibida desde el celular</p>
        {estado?.firma_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={estado.firma_url} alt="Firma recibida" className="max-h-20 object-contain" />
        )}
      </div>
    )
  }

  if (crear.isPending || !captura) {
    return (
      <div className="flex justify-center py-12">
        {crear.isError
          ? <p className="text-sm text-destructive">No se pudo generar el código QR. Intenta de nuevo.</p>
          : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
      </div>
    )
  }

  const url = `${window.location.origin}${captura.ruta}`
  return (
    <div className="flex flex-col sm:flex-row items-center gap-5 py-2">
      <div className={cn('rounded-xl border bg-white p-3 shrink-0', vencido && 'opacity-30')}>
        <QRCodeSVG value={url} size={168} />
      </div>
      <div className="space-y-3 text-sm">
        <ol className="list-decimal pl-4 space-y-1 text-gray-700">
          <li>Escanea el código con la cámara de tu celular.</li>
          <li>Dibuja tu firma con el dedo y toca <strong>Guardar firma</strong>.</li>
          <li>Esta pantalla se actualiza sola cuando llegue.</li>
        </ol>
        {vencido ? (
          <Button size="sm" variant="outline" onClick={() => { notificado.current = false; mutate() }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Generar nuevo código
          </Button>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Esperando la firma… el código vence en {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}
          </p>
        )}
      </div>
    </div>
  )
}

interface CapturaFirmaProfesionalProps {
  /** Se llama cuando la firma quedó guardada en el perfil. */
  onGuardada?: () => void
  className?: string
}

/** Cargar la firma del profesional: dibujada aquí, desde el celular por QR o subiendo una imagen. */
export function CapturaFirmaProfesional({ onGuardada, className }: CapturaFirmaProfesionalProps) {
  const setUser = useAuthStore(s => s.setUser)
  const [modo, setModo] = useState<Modo>('lienzo')
  const [vacio, setVacio] = useState(true)
  const lienzoRef = useRef<LienzoFirmaHandle>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  const guardar = useMutation({
    mutationFn: (archivo: File) => authApi.updateMeProfesional({ firma_digital: archivo }),
    onSuccess: updated => {
      setUser(updated)
      lienzoRef.current?.limpiar()
      onGuardada?.()
    },
  })

  const refrescarUsuario = useCallback(async () => {
    setUser(await authApi.me())
    onGuardada?.()
  }, [setUser, onGuardada])

  const guardarLienzo = () => {
    const png = lienzoRef.current?.obtenerPng()
    if (png) guardar.mutate(dataUrlAArchivo(png))
  }

  const opciones: { modo: Modo; label: string; icon: typeof Monitor }[] = [
    { modo: 'lienzo', label: 'Dibujar aquí', icon: Monitor },
    { modo: 'movil', label: 'Desde mi celular', icon: Smartphone },
    { modo: 'archivo', label: 'Subir imagen', icon: Upload },
  ]

  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {opciones.map(o => {
          const Icon = o.icon
          return (
            <button
              key={o.modo}
              type="button"
              onClick={() => setModo(o.modo)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                modo === o.modo ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {o.label}
            </button>
          )
        })}
      </div>

      {modo === 'lienzo' && (
        <div className="space-y-3">
          <LienzoFirma ref={lienzoRef} onCambio={setVacio} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => lienzoRef.current?.limpiar()}>
              Limpiar
            </Button>
            <Button type="button" size="sm" disabled={vacio || guardar.isPending} onClick={guardarLienzo}>
              {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Guardar firma
            </Button>
          </div>
        </div>
      )}

      {modo === 'movil' && <PanelMovil onRecibida={refrescarUsuario} />}

      {modo === 'archivo' && (
        <div
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-6 cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => archivoRef.current?.click()}
        >
          {guardar.isPending
            ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            : <Upload className="h-5 w-5 text-muted-foreground" />}
          <p className="text-xs font-medium text-gray-700 mt-2">Seleccionar imagen de la firma</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">PNG, JPEG o WEBP · mejor con fondo blanco o transparente</p>
          <input
            ref={archivoRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={e => {
              const archivo = e.target.files?.[0]
              if (archivo) guardar.mutate(archivo)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {guardar.isError && <p className="text-xs text-destructive">No se pudo guardar la firma. Intenta de nuevo.</p>}
    </div>
  )
}
