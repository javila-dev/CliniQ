'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Clock, Check, ChevronLeft, Save, ImageIcon, Upload, Trash2, Loader2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { clinicasApi } from '@/lib/api/clinicas'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { resolveMediaUrl } from '@/lib/utils/media'

const INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60]

const schema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  nit: z.string().optional(),
  telefono: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function ClinicaConfigPage() {
  const { user } = useAuthStore()
  const clinicaId = user?.clinica_id
  const qc = useQueryClient()
  const isAdmin = hasPermission(user, PERM.CLINICAS_EDITAR)

  const { data: clinica, isLoading } = useQuery({
    queryKey: ['clinica', clinicaId],
    queryFn: () => clinicasApi.get(clinicaId!),
    enabled: !!clinicaId,
  })

  // ── Formulario de datos generales ──
  const { register, handleSubmit, reset, formState: { errors, isDirty: isFormDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (clinica) {
      reset({
        nombre: clinica.nombre ?? '',
        nit: clinica.nit ?? '',
        telefono: clinica.telefono ?? '',
      })
    }
  }, [clinica, reset])

  const updateMutation = useMutation({
    mutationFn: (data: FormData) => clinicasApi.update(clinicaId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinica', clinicaId] })
    },
  })

  // ── Frecuencia de turnos ──
  const [selectedInterval, setSelectedInterval] = useState<number>(15)

  useEffect(() => {
    if (clinica?.slot_interval_min) setSelectedInterval(clinica.slot_interval_min)
  }, [clinica])

  const intervalMutation = useMutation({
    mutationFn: (value: number) => clinicasApi.update(clinicaId!, { slot_interval_min: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinica', clinicaId] })
      qc.invalidateQueries({ queryKey: ['slot_interval', clinicaId] })
    },
  })

  const isIntervalDirty = clinica?.slot_interval_min !== selectedInterval

  // ── Logo ──
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  const logoMutation = useMutation({
    mutationFn: (file: File) => clinicasApi.subirLogo(clinicaId!, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinica', clinicaId] })
      setLogoError(null)
    },
    onError: () => setLogoError('No se pudo subir el logo. Intenta de nuevo.'),
  })

  const eliminarLogoMutation = useMutation({
    mutationFn: () => clinicasApi.eliminarLogo(clinicaId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinica', clinicaId] }),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('El archivo supera los 2 MB permitidos.')
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setLogoError('Solo se permiten archivos PNG, JPG o WebP.')
      return
    }
    setLogoError(null)
    logoMutation.mutate(file)
    e.target.value = ''
  }

  if (!user) return null

  if (!clinicaId) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="General" />
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
          No tienes una clínica asignada.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="General" description="Datos e información de tu clínica." backHref="/configuracion" />

      {/* ── Logo ── */}
      <div className="rounded-xl border bg-white p-6 space-y-4">
        <p className="text-sm font-semibold text-gray-800">Logo de la clínica</p>

        <div className="flex items-center gap-5">
          {/* Preview */}
          <div className="h-24 w-40 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 relative">
            {logoMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : clinica?.logo ? (
              <Image
                src={resolveMediaUrl(clinica.logo)!}
                alt={clinica.nombre ?? 'Logo'}
                fill
                className="object-contain p-2"
                unoptimized
              />
            ) : (
              <ImageIcon className="h-8 w-8 text-gray-300" />
            )}
          </div>

          {/* Acciones */}
          {isAdmin && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={logoMutation.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  {clinica?.logo ? 'Cambiar logo' : 'Subir logo'}
                </Button>
                {clinica?.logo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={eliminarLogoMutation.isPending}
                    className="text-destructive hover:text-destructive hover:bg-destructive/5"
                    onClick={() => {
                      if (confirm('¿Eliminar el logo de la clínica?')) eliminarLogoMutation.mutate()
                    }}
                  >
                    {eliminarLogoMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                    Eliminar
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG o WebP · máx. 2 MB · fondo transparente recomendado</p>
              {logoError && <p className="text-xs text-destructive">{logoError}</p>}
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* ── Datos de la clínica ── */}
      <form
        onSubmit={handleSubmit((data) => updateMutation.mutate(data))}
        className="rounded-xl border bg-white p-6 space-y-5"
      >
        <p className="text-sm font-semibold text-gray-800">Datos de la clínica</p>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
                <div className="h-9 w-full rounded-lg bg-gray-100 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nombre" className="text-xs text-gray-500">Nombre de la clínica</Label>
              <Input
                id="nombre"
                {...register('nombre')}
                disabled={!isAdmin}
                placeholder="Ej. Clínica Estética Bella"
              />
              {errors.nombre && (
                <p className="text-xs text-red-500">{errors.nombre.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="nit" className="text-xs text-gray-500">NIT</Label>
                <Input
                  id="nit"
                  {...register('nit')}
                  disabled={!isAdmin}
                  placeholder="Ej. 901234567-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="telefono" className="text-xs text-gray-500">Teléfono</Label>
                <Input
                  id="telefono"
                  {...register('telefono')}
                  disabled={!isAdmin}
                  placeholder="Ej. 3001234567"
                />
              </div>
            </div>
          </div>
        )}

        {updateMutation.isError && (
          <p className="text-sm text-red-500">Error al guardar. Intenta de nuevo.</p>
        )}

        {isAdmin && (
          <div className="flex items-center gap-3 pt-1 border-t">
            <Button
              type="submit"
              disabled={!isFormDirty || updateMutation.isPending}
              className="gap-1.5"
            >
              {updateMutation.isPending ? 'Guardando…' : (
                <><Save className="h-4 w-4" /> Guardar cambios</>
              )}
            </Button>
            {updateMutation.isSuccess && !isFormDirty && (
              <span className="text-sm text-emerald-600 font-medium">Guardado correctamente</span>
            )}
          </div>
        )}
      </form>

      {/* ── Frecuencia de turnos ── */}
      <div className="rounded-xl border bg-white p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Clock className="h-4 w-4 text-gray-400" />
            Frecuencia de turnos
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Define cada cuántos minutos se ofrecen opciones de cita al consultar disponibilidad.
          </p>
        </div>

        {isLoading ? (
          <div className="flex gap-2 flex-wrap">
            {INTERVAL_OPTIONS.map(v => (
              <div key={v} className="h-10 w-16 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div>
            <Label className="text-xs text-gray-400 mb-2 block">Minutos entre turnos</Label>
            <div className="flex gap-2 flex-wrap">
              {INTERVAL_OPTIONS.map(v => (
                <button
                  key={v}
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => setSelectedInterval(v)}
                  className={cn(
                    'h-10 w-16 rounded-lg border text-sm font-medium transition-all',
                    selectedInterval === v
                      ? 'border-rose-500 bg-rose-50 text-rose-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-rose-300 hover:text-rose-600',
                    !isAdmin && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {v} min
                </button>
              ))}
            </div>
          </div>
        )}

        {intervalMutation.isError && (
          <p className="text-sm text-red-500">Error al guardar. Intenta de nuevo.</p>
        )}

        {isAdmin && (
          <div className="flex items-center gap-3 pt-1 border-t">
            <Button
              type="button"
              onClick={() => intervalMutation.mutate(selectedInterval)}
              disabled={!isIntervalDirty || intervalMutation.isPending}
              className="gap-1.5"
            >
              {intervalMutation.isPending ? 'Guardando…' : (
                <><Check className="h-4 w-4" /> Guardar</>
              )}
            </Button>
            {intervalMutation.isSuccess && !isIntervalDirty && (
              <span className="text-sm text-emerald-600 font-medium">Guardado correctamente</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
