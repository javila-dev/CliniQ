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

function mensajeError(error: unknown) {
  const data = (error as { response?: { data?: { campos?: string | string[] } } })?.response?.data
  const campos = data?.campos
  if (campos) return Array.isArray(campos) ? campos.join(' ') : campos
  if (error instanceof Error && error.message) return error.message
  return 'No se pudo guardar la plantilla. Intenta de nuevo.'
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
    setFile(f)
    if (!nombre) setNombre(f.name.replace(/\.pdf$/i, ''))
    if (pdfBlob) URL.revokeObjectURL(pdfBlob)
    setPdfBlob(URL.createObjectURL(f))
  }

  const saveMutation = useMutation({
    mutationFn: async ({ campos, requiere }: { campos: CampoPlantilla[]; requiere: boolean }) => {
      if (!file || !nombre.trim()) throw new Error('Falta el nombre de la plantilla.')
      const plantilla = await configuracionApi.plantillasConsentimiento.upload(nombre.trim(), file)
      await configuracionApi.plantillasConsentimiento.guardarCampos(plantilla.id, campos, requiere)
      return plantilla
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
  if (!pdfBlob) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-full max-w-md space-y-6 px-4">
          <div>
            <Link href="/configuracion/consentimientos" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
              <ChevronLeft className="h-4 w-4" /> Volver
            </Link>
            <h1 className="text-xl font-bold">Nueva plantilla de consentimiento</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sube el PDF y ubica los campos en dos pasos: primero los del paciente y luego los del profesional.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Nombre de la plantilla</Label>
            <Input
              placeholder="Ej: Consentimiento toxina botulínica"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
            />
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors border-gray-200 hover:border-primary/40 hover:bg-primary/5"
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium">Haz clic para seleccionar un PDF</p>
            <p className="text-xs text-muted-foreground mt-1">Máximo 20 MB</p>
          </div>
          {inputArchivo}

          {fileError && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" /> {fileError}
            </p>
          )}
        </div>
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
          <Link href="/configuracion/consentimientos" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> Volver
          </Link>
          <input
            className="mt-2 w-full text-sm font-semibold bg-transparent border-0 border-b border-dashed border-gray-200 focus:outline-none focus:border-primary pb-0.5 truncate"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Nombre de la plantilla"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <FileText className="h-3 w-3" />
            {file?.name ?? 'archivo.pdf'}
          </button>
          {inputArchivo}
        </>
      }
    />
  )
}
