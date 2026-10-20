'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Upload, FileText, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { configuracionApi, type CampoPlantilla } from '@/lib/api/configuracion'
import { MapeadorCampos } from '@/components/consentimientos/MapeadorCampos'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SeccionAjustes } from '@/components/configuracion/ajustes'
import { mensajeDeError } from '@/lib/errores'

function mensajeError(error: unknown) {
  const data = (error as { response?: { data?: { campos?: string | string[] } } })?.response?.data
  const campos = data?.campos
  if (campos) return Array.isArray(campos) ? campos.join(' ') : campos
  if (!(error as { response?: unknown })?.response && error instanceof Error && error.message) return error.message
  // Antes salía "Request failed with status code 400".
  return mensajeDeError(error, 'No se pudo guardar la plantilla. Intenta de nuevo.')
}

export default function NuevaPlantillaPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [nombre, setNombre] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [pdfBlob, setPdfBlob] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  // Tras guardar se navega al listado; el botón sigue "guardando" hasta que la página cambie.
  const [redirigiendo, setRedirigiendo] = useState(false)
  // Plantilla ya subida en un intento anterior: reintentar solo guarda los
  // campos, no sube otra copia (antes cada reintento la duplicaba).
  const plantillaSubida = useRef<string | null>(null)

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setFileError('Solo se aceptan archivos PDF.')
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      setFileError('El archivo no puede superar 20 MB.')
      return
    }
    setFileError(null)
    plantillaSubida.current = null
    setFile(f)
    if (!nombre) setNombre(f.name.replace(/\.pdf$/i, ''))
    if (pdfBlob) URL.revokeObjectURL(pdfBlob)
    setPdfBlob(URL.createObjectURL(f))
  }

  const saveMutation = useMutation({
    mutationFn: async ({ campos, requiere }: { campos: CampoPlantilla[]; requiere: boolean }) => {
      if (!file || !nombre.trim()) throw new Error('Falta el nombre de la plantilla.')
      if (!plantillaSubida.current) {
        const plantilla = await configuracionApi.plantillasConsentimiento.upload(nombre.trim(), file)
        plantillaSubida.current = plantilla.id
      }
      await configuracionApi.plantillasConsentimiento.guardarCampos(plantillaSubida.current, campos, requiere)
    },
    onSuccess: () => {
      setRedirigiendo(true)
      qc.invalidateQueries({ queryKey: ['plantillas-consentimiento'] })
      router.push('/configuracion/consentimientos')
    },
  })

  const inputArchivo = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf"
      className="hidden"
      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
    />
  )

  // ── Sin PDF: pantalla de carga ──────────────────────────────────────────────
  // El marco de Configuración ya pone el h1 ("Consentimientos") y las pestañas:
  // aquí solo un enlace de regreso y el título del formulario como h2.
  if (!pdfBlob) {
    return (
      <div className="max-w-2xl space-y-4">
        <VolverAConsentimientos />

        <SeccionAjustes
          titulo="Nueva plantilla de consentimiento"
          descripcion="Sube el PDF y luego ubica los campos en dos pasos: primero los del paciente y después los del profesional."
        >
          <div className="space-y-4 px-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="nombre-plantilla" className="text-[13px] font-medium">Nombre de la plantilla</Label>
              <Input
                id="nombre-plantilla"
                placeholder="Ej: Consentimiento toxina botulínica"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-gray-200 px-6 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Upload className="mb-2.5 h-7 w-7 text-muted-foreground/60" />
              <span className="text-sm font-medium">Selecciona el PDF del consentimiento</span>
              <span className="mt-1 text-xs text-muted-foreground">Máximo 20 MB</span>
            </button>
            {inputArchivo}

            {fileError && (
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /> {fileError}
              </p>
            )}
          </div>
        </SeccionAjustes>
      </div>
    )
  }

  // ── Con PDF: mapeador en dos pasos ──────────────────────────────────────────
  return (
    <MapeadorCampos
      pdfUrl={pdfBlob}
      campos={[]}
      requiereFirmaProfesional
      guardando={saveMutation.isPending || redirigiendo}
      error={saveMutation.isError ? mensajeError(saveMutation.error) : null}
      onGuardar={(campos, requiere) => saveMutation.mutate({ campos, requiere })}
      encabezado={
        <>
          <VolverAConsentimientos />
          <input
            className="mt-2 w-full text-sm font-semibold bg-transparent border-0 border-b border-dashed border-gray-200 focus:outline-none focus:border-primary pb-0.5 truncate"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Nombre de la plantilla"
            aria-label="Nombre de la plantilla"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            type="button"
            className="mt-1.5 flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Cambiar el PDF"
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{file?.name ?? 'archivo.pdf'}</span>
          </button>
          {inputArchivo}
        </>
      }
    />
  )
}

function VolverAConsentimientos() {
  return (
    <Link
      href="/configuracion/consentimientos"
      className="inline-flex items-center gap-0.5 text-sm text-primary hover:underline"
    >
      <ChevronLeft className="h-4 w-4" />
      Consentimientos
    </Link>
  )
}
