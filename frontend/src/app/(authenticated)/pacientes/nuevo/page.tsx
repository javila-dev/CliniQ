'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ShieldCheck, CheckCircle2, Loader2, X, Camera } from 'lucide-react'
import Link from 'next/link'
import { pacientesApi } from '@/lib/api/pacientes'
import { clinicasApi } from '@/lib/api/clinicas'
import { PacienteForm } from '@/components/pacientes/PacienteForm'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { CamaraCaptura } from '@/components/shared/CamaraCaptura'
import type { CreatePacienteRequest } from '@/types/pacientes'

export default function NuevoPacientePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [enrollmentPacienteId, setEnrollmentPacienteId] = useState<string | null>(null)
  const [navigating, setNavigating] = useState(false)

  const { data: wizardConfig } = useQuery({
    queryKey: ['wizard-config'],
    queryFn: () => clinicasApi.wizardConfig.get(),
  })

  const fotoControlObligatoria = wizardConfig?.foto_control_obligatoria ?? false

  const { mutateAsync, isPending } = useMutation({
    mutationFn: pacientesApi.create,
    onSuccess: (paciente) => {
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      if (wizardConfig?.paso_verificacion_facial) {
        setEnrollmentPacienteId(paciente.id)
      } else {
        setNavigating(true)
        router.push(`/pacientes/${paciente.id}`)
      }
    },
  })

  const handleSubmit = async (data: CreatePacienteRequest) => {
    setServerError(null)
    try {
      await mutateAsync(data)
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        Object.values(err?.response?.data ?? {})[0] ||
        'Error al crear el paciente. Verifica los datos.'
      setServerError(String(msg))
    }
  }

  function handleEnrollmentDone() {
    setNavigating(true)
    router.push(`/pacientes/${enrollmentPacienteId}`)
  }

  if (navigating) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Cargando perfil del paciente…</p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Nuevo paciente"
        description="Completa los datos para registrar al paciente"
        action={
          <Button variant="outline" asChild>
            <Link href="/pacientes">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Link>
          </Button>
        }
      />

      <Card className="w-4/5 mx-auto">
        <CardContent className="pt-6">
          {serverError && (
            <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-sm text-destructive">{serverError}</p>
            </div>
          )}
          <PacienteForm
            onSubmit={handleSubmit}
            isLoading={isPending}
            submitLabel="Registrar paciente"
          />
        </CardContent>
      </Card>

      {enrollmentPacienteId && (
        <Dialog
          open
          onOpenChange={(open) => { if (!open && !fotoControlObligatoria) handleEnrollmentDone() }}
        >
          <DialogContent
            className="max-w-sm"
            hideClose={fotoControlObligatoria}
            onEscapeKeyDown={(e) => { if (fotoControlObligatoria) e.preventDefault() }}
            onInteractOutside={(e) => { if (fotoControlObligatoria) e.preventDefault() }}
          >
            <EnrollmentFotoDialog
              pacienteId={enrollmentPacienteId}
              obligatoria={fotoControlObligatoria}
              onDone={handleEnrollmentDone}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function EnrollmentFotoDialog({
  pacienteId,
  obligatoria = false,
  onDone,
}: {
  pacienteId: string
  obligatoria?: boolean
  onDone: () => void
}) {
  const [state, setState] = useState<'camara' | 'uploading' | 'ok' | 'error'>('camara')
  const [enrollErrors, setEnrollErrors]     = useState<string[]>([])
  const [enrollWarnings, setEnrollWarnings] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function subir(file: File) {
    setState('uploading')
    try {
      await pacientesApi.enrollment(pacienteId, file)
      setState('ok')
      setTimeout(onDone, 1500)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { errors?: string[]; warnings?: string[]; error?: string } } }
      const errs  = e?.response?.data?.errors   ?? []
      const warns = e?.response?.data?.warnings ?? []
      if (errs.length > 0 || warns.length > 0) {
        setEnrollErrors(errs)
        setEnrollWarnings(warns)
        setErrorMsg(null)
      } else {
        setErrorMsg(e?.response?.data?.error ?? 'La foto no pudo procesarse. Intenta con otra.')
        setEnrollErrors([])
        setEnrollWarnings([])
      }
      setState('error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Foto de control</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {obligatoria
              ? 'El paciente ya quedó registrado. La foto de control es obligatoria para completar el registro.'
              : 'El paciente ya quedó registrado. Puedes tomar la foto de control ahora o más tarde desde su ficha.'}
          </p>
        </div>
      </div>

      {state === 'camara' && (
        <>
          <CamaraCaptura
            onCaptura={subir}
            onCancelar={obligatoria ? undefined : onDone}
            labelCapturar="Tomar foto de control"
          />
          {!obligatoria && (
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground gap-1.5" onClick={onDone}>
              <X className="h-3.5 w-3.5" />Omitir — tomar la foto luego
            </Button>
          )}
        </>
      )}

      {state === 'uploading' && (
        <div className="flex flex-col items-center gap-2 py-8">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Procesando foto…</p>
        </div>
      )}

      {state === 'ok' && (
        <div className="flex flex-col items-center gap-2 py-8">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-700">Foto de control registrada</p>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-3">
          {(enrollErrors.length > 0 || enrollWarnings.length > 0) && (
            <div className="space-y-1.5">
              {enrollErrors.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2">
                  <span className="text-red-500 shrink-0 mt-0.5 text-sm">✕</span>
                  <p className="text-xs text-red-700">{msg}</p>
                </div>
              ))}
              {enrollWarnings.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                  <span className="text-amber-500 shrink-0 mt-0.5 text-sm">!</span>
                  <p className="text-xs text-amber-700">{msg}</p>
                </div>
              ))}
            </div>
          )}
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2">
              <span className="text-red-500 shrink-0 mt-0.5 text-sm">✕</span>
              <p className="text-xs text-red-700">{errorMsg}</p>
            </div>
          )}
          <Button variant="outline" className="w-full gap-2" onClick={() => setState('camara')}>
            <Camera className="h-4 w-4" />Reintentar
          </Button>
          {!obligatoria && (
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground gap-1.5" onClick={onDone}>
              <X className="h-3.5 w-3.5" />Omitir por ahora
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
