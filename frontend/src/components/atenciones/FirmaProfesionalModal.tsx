'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Eye, FileSignature, Loader2, PenLine, ShieldAlert, UserX } from 'lucide-react'
import { authApi } from '@/lib/api/auth'
import { firmaProfesionalApi, type ResultadoFirmaProfesional } from '@/lib/api/firmaProfesional'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CapturaFirmaProfesional } from '@/components/firma/CapturaFirmaProfesional'
import { formatDate } from '@/lib/utils'
import type { Cita } from '@/types/agenda'

/** La cita tiene consentimientos que el paciente ya firmó y esperan la firma del profesional. */
export function citaRequiereFirmaProfesional(cita: Pick<Cita, 'consentimiento_info'>): boolean {
  return (cita.consentimiento_info?.consentimientos ?? []).some(
    c => c.vigente && c.requiere_firma_profesional && !c.firmado_profesional,
  )
}

/** El backend rechazó iniciar la atención porque falta la firma del profesional. */
export function esErrorFirmaProfesional(err: unknown): boolean {
  return (err as { response?: { data?: { code?: string } } })?.response?.data?.code === 'FIRMA_PROFESIONAL_REQUERIDA'
}

interface FirmaProfesionalModalProps {
  /** Cita a firmar; null = cerrado. */
  citaId: string | null
  pacienteNombre?: string
  onClose: () => void
  /** Todos los documentos quedaron firmados: continuar con el inicio de la atención. */
  onFirmado: () => void
}

function VisorDocumento({ citaId, documento, onClose }: {
  citaId: string
  documento: { id: string; nombre: string } | null
  onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!documento) return
    let objectUrl: string | null = null
    setUrl(null)
    setError(false)
    firmaProfesionalApi.documentoPendiente(citaId, documento.id)
      .then(blob => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) })
      .catch(() => setError(true))
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [citaId, documento])

  return (
    <Dialog open={!!documento} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{documento?.nombre}</DialogTitle>
          <DialogDescription>
            Contenido del consentimiento. La firma del paciente aparecerá en el PDF final, junto con la tuya.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 rounded-lg border bg-muted/40 overflow-hidden">
          {error ? (
            <div className="h-full flex items-center justify-center text-sm text-destructive">No se pudo cargar el documento.</div>
          ) : url ? (
            <iframe src={url} title={documento?.nombre} className="w-full h-full" />
          ) : (
            <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function FirmaProfesionalModal({ citaId, pacienteNombre, onClose, onFirmado }: FirmaProfesionalModalProps) {
  const qc = useQueryClient()
  const setUser = useAuthStore(s => s.setUser)
  const [cargandoFirma, setCargandoFirma] = useState(false)
  const [tp, setTp] = useState('')
  const [documentoAbierto, setDocumentoAbierto] = useState<{ id: string; nombre: string } | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['firma-profesional', citaId],
    queryFn: () => firmaProfesionalApi.pendientesCita(citaId!),
    enabled: !!citaId,
  })

  useEffect(() => {
    if (!citaId) { setCargandoFirma(false); setTp('') }
  }, [citaId])

  const guardarTp = useMutation({
    mutationFn: () => authApi.updateMeProfesional({ registro_profesional: tp.trim() }),
    onSuccess: updated => { setUser(updated); refetch() },
  })

  const firmar = useMutation({
    mutationFn: () => firmaProfesionalApi.firmarCita(citaId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['citas'] })
      qc.invalidateQueries({ queryKey: ['firma-profesional', citaId] })
      onFirmado()
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['citas'] })
      refetch()
    },
  })

  const errorFirma = (firmar.error as { response?: { data?: ResultadoFirmaProfesional & { error?: string } } } | null)
    ?.response?.data?.error

  const motivo = data?.motivo
  const documentos = data?.documentos ?? []

  return (
      <Dialog open={!!citaId} onOpenChange={open => { if (!open && !firmar.isPending) onClose() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${motivo ? 'bg-red-50' : 'bg-violet-50'}`}>
                {motivo
                  ? <ShieldAlert className="h-5 w-5 text-red-600" />
                  : <FileSignature className="h-5 w-5 text-violet-700" />}
              </div>
              <div>
                <DialogTitle>Vas a firmar como profesional tratante</DialogTitle>
                <DialogDescription className="mt-0.5">
                  Consentimientos de {pacienteNombre ?? 'este paciente'} pendientes de tu firma.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {isLoading || !data ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4">
              {documentos.length > 0 ? (
                <ul className="divide-y rounded-lg border">
                  {documentos.map(d => (
                    <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                      <FileSignature className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{d.nombre}</p>
                        {d.fecha_firma_paciente && (
                          <p className="text-xs text-muted-foreground">Firmado por el paciente el {formatDate(d.fecha_firma_paciente)}</p>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setDocumentoAbierto(d)}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> Ver documento
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No hay documentos pendientes de tu firma.</p>
              )}

              {/* Estado B: no puede firmar */}
              {motivo && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 space-y-3">
                  <p className="flex items-start gap-2 text-sm font-medium text-red-800">
                    {motivo.code === 'PROFESIONAL_NO_ASIGNADO'
                      ? <UserX className="h-4 w-4 mt-0.5 shrink-0" />
                      : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                    {motivo.error}
                  </p>

                  {motivo.code === 'SIN_FIRMA' && (
                    cargandoFirma ? (
                      <div className="rounded-lg bg-white p-3">
                        <CapturaFirmaProfesional onGuardada={() => { setCargandoFirma(false); refetch() }} />
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="bg-white" onClick={() => setCargandoFirma(true)}>
                        <PenLine className="h-3.5 w-3.5 mr-1.5" /> Cargar mi firma ahora
                      </Button>
                    )
                  )}

                  {motivo.code === 'SIN_TP' && (
                    <div className="flex gap-2">
                      <Input
                        className="bg-white"
                        placeholder="Número de tarjeta profesional"
                        value={tp}
                        onChange={e => setTp(e.target.value)}
                      />
                      <Button size="sm" disabled={!tp.trim() || guardarTp.isPending} onClick={() => guardarTp.mutate()}>
                        {guardarTp.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Estado A: vista previa de lo que se va a estampar */}
              {!motivo && documentos.length > 0 && (
                <div className="rounded-lg bg-muted/50 px-3 py-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Así aparecerá en los documentos</p>
                  <div className="flex items-center gap-4">
                    {data.profesional.firma_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={data.profesional.firma_url} alt="Tu firma" className="h-14 max-w-[160px] object-contain rounded bg-white border px-2" />
                    )}
                    <div className="text-sm">
                      <p className="font-medium">{data.profesional.nombre}</p>
                      {data.profesional.registro_profesional && documentos.some(d => d.requiere_tp) && (
                        <p className="text-muted-foreground">Tarjeta profesional: {data.profesional.registro_profesional}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Al firmar confirmas que informaste al paciente sobre el procedimiento, sus riesgos, beneficios y alternativas.
                  </p>
                </div>
              )}

              {errorFirma && (
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {errorFirma}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={onClose} disabled={firmar.isPending}>Cancelar</Button>
            {data && documentos.length === 0 ? (
              <Button onClick={onFirmado}>Comenzar atención</Button>
            ) : (
              <Button onClick={() => firmar.mutate()} disabled={!data || !!motivo || firmar.isPending}>
                {firmar.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Firmar y comenzar atención
              </Button>
            )}
          </DialogFooter>

          {citaId && (
            <VisorDocumento citaId={citaId} documento={documentoAbierto} onClose={() => setDocumentoAbierto(null)} />
          )}
        </DialogContent>
      </Dialog>
  )
}
