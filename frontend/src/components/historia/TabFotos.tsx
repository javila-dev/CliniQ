'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Upload, ImageOff, Loader2 } from 'lucide-react'
import { resolveMediaUrl } from '@/lib/utils/media'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SubirFotosModal } from './SubirFotosModal'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { formatDate } from '@/lib/utils'
import type { HistoriaClinica, NotaClinica } from '@/types/historia'

interface TabFotosProps {
  historia: HistoriaClinica
  notas: NotaClinica[]
  modoAtencion?: boolean
}

const TIPO_COLOR: Record<string, string> = {
  antes: 'bg-blue-100 text-blue-700',
  durante: 'bg-amber-100 text-amber-700',
  despues: 'bg-green-100 text-green-700',
  control: 'bg-purple-100 text-purple-700',
  referencia: 'bg-gray-100 text-gray-700',
}

export function TabFotos({ historia, notas, modoAtencion = false }: TabFotosProps) {
  const [notaParaFoto, setNotaParaFoto] = useState<string | null>(null)
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null)

  const { data: galeria, isLoading } = useQuery({
    queryKey: ['galeria', historia.id],
    queryFn: () => historiaClinicaApi.historias.galeria(historia.id),
  })

  // Agrupar fotos por sesión (cita)
  const sesionesPorCita = galeria?.fotos.reduce<Record<string, typeof galeria.fotos>>((acc, foto) => {
    const key = foto.cita
    if (!acc[key]) acc[key] = []
    acc[key].push(foto)
    return acc
  }, {}) ?? {}

  const sesiones = Object.entries(sesionesPorCita).sort(
    ([, a], [, b]) => new Date(b[0].cita_fecha).getTime() - new Date(a[0].cita_fecha).getTime()
  )

  // Encontrar una nota disponible para adjuntar fotos (la más reciente)
  const notaReciente = notas[0]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {galeria ? `${galeria.total} foto${galeria.total !== 1 ? 's' : ''} en total` : ''}
        </p>
        {notaReciente && (
          <Button size="sm" variant="outline" onClick={() => setNotaParaFoto(notaReciente.id)}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Agregar fotos
          </Button>
        )}
      </div>

      {/* Contador por tipo */}
      {galeria && galeria.total > 0 && (
        <div className="flex gap-2 flex-wrap">
          {galeria.por_tipo.antes > 0 && (
            <Badge variant="secondary" className="text-xs">Antes: {galeria.por_tipo.antes}</Badge>
          )}
          {galeria.por_tipo.durante > 0 && (
            <Badge variant="secondary" className="text-xs">Durante: {galeria.por_tipo.durante}</Badge>
          )}
          {galeria.por_tipo.despues > 0 && (
            <Badge variant="secondary" className="text-xs">Después: {galeria.por_tipo.despues}</Badge>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sesiones.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <ImageOff className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sin fotos registradas</p>
          {notaReciente && (
            <Button size="sm" variant="ghost" className="mt-3" onClick={() => setNotaParaFoto(notaReciente.id)}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Agregar la primera foto
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {sesiones.map(([citaId, fotos]) => {
            const primeraFoto = fotos[0]
            return (
              <div key={citaId} className={modoAtencion ? 'rounded-lg border p-4 space-y-3' : 'space-y-2'}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{formatDate(primeraFoto.cita_fecha)}</p>
                    <p className="text-xs text-muted-foreground">{primeraFoto.servicio_nombre} · {fotos.length} foto{fotos.length !== 1 ? 's' : ''}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      const notaDeCita = notas.find((n) => n.cita === citaId)
                      if (notaDeCita) setNotaParaFoto(notaDeCita.id)
                    }}
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Agregar
                  </Button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {fotos.map((foto) => (
                    <div
                      key={foto.id}
                      className="relative aspect-square rounded-md overflow-hidden bg-muted cursor-pointer group"
                      onClick={() => setFotoAmpliada(resolveMediaUrl(foto.url_firmada))}
                    >
                      <img
                        src={resolveMediaUrl(foto.url_firmada) ?? ''}
                        alt={foto.descripcion ?? foto.tipo}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${TIPO_COLOR[foto.tipo] ?? 'bg-gray-100 text-gray-700'}`}>
                          {foto.tipo}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox simple */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFotoAmpliada(null)}
        >
          <img
            src={fotoAmpliada}
            alt="Foto ampliada"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Modal subir fotos */}
      {notaParaFoto && (
        <SubirFotosModal
          open={Boolean(notaParaFoto)}
          onOpenChange={(open) => { if (!open) setNotaParaFoto(null) }}
          notaId={notaParaFoto}
          historiaId={historia.id}
        />
      )}
    </div>
  )
}
