'use client'

// Datos del cliente para la factura electrónica (Alegra/DIAN). Todos son
// obligatorios salvo las responsabilidades fiscales. Las mismas reglas las
// aplica el backend (validacion_facturacion.py); aquí se avisan antes de enviar.
// Departamento y municipio salen del catálogo de Alegra, que es quien los
// traduce a códigos DANE: escritos a mano, la factura falla al emitirse.

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { DatosFacturacion } from '@/types/suscripciones'

export type ErroresFacturacion = Partial<Record<keyof DatosFacturacion, string>>

const PESOS_DV = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]

/** Dígito de verificación de un NIT (algoritmo de la DIAN). */
export function dvNit(numero: string): string {
  const digitos = numero.split('').reverse().map(Number)
  const residuo = digitos.reduce((suma, d, i) => suma + d * (PESOS_DV[i] ?? 0), 0) % 11
  return String(residuo > 1 ? 11 - residuo : residuo)
}

const limpiarDocumento = (n: string) => n.replace(/[\s.-]/g, '').toUpperCase()

export function erroresFacturacion(d: DatosFacturacion, ubicaciones: Record<string, string[]>): ErroresFacturacion {
  const e: ErroresFacturacion = {}
  const numero = limpiarDocumento(d.numero_documento)
  if (d.tipo_persona === 'juridica' && d.tipo_documento !== 'NIT') e.tipo_documento = 'Una empresa factura con NIT.'
  if (d.tipo_documento === 'NIT' || d.tipo_documento === 'CC') {
    if (!/^\d{5,10}$/.test(numero)) e.numero_documento = 'Escribe solo los números del documento (sin el dígito de verificación).'
  } else if (!/^[A-Z0-9]{3,15}$/.test(numero)) {
    e.numero_documento = 'El documento debe tener entre 3 y 15 letras o números.'
  }
  if (d.tipo_documento === 'NIT' && !e.numero_documento) {
    if (!/^\d$/.test(d.dv)) e.dv = 'Indica el dígito de verificación.'
    else if (d.dv !== dvNit(numero)) e.dv = 'No corresponde a ese NIT. Revisa el RUT.'
  }
  if (d.tipo_persona === 'juridica' && d.razon_social.trim().length < 3) e.razon_social = 'Escribe la razón social tal como aparece en el RUT.'
  if (d.tipo_persona === 'natural') {
    if (d.nombres.trim().length < 2) e.nombres = 'Escribe los nombres.'
    if (d.apellidos.trim().length < 2) e.apellidos = 'Escribe los apellidos.'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email_facturacion.trim())) e.email_facturacion = 'Escribe un correo válido: ahí llega la factura.'
  const tel = d.telefono.replace(/\D/g, '')
  if (tel.length < 7 || tel.length > 15) e.telefono = 'Escribe un teléfono de contacto.'
  if (d.direccion.trim().length < 5) e.direccion = 'Escribe la dirección completa.'
  if (!ubicaciones[d.departamento]) e.departamento = 'Elige el departamento.'
  else if (!ubicaciones[d.departamento].includes(d.ciudad)) e.ciudad = 'Elige el municipio.'
  return e
}

function Campo({ id, label, error, className, children }: {
  id: string
  label: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function FormFacturacion({ datos, onChange, errores, ubicaciones, responsabilidades }: {
  datos: DatosFacturacion
  onChange: (d: DatosFacturacion) => void
  /** Solo los que se deben mostrar (tras intentar continuar, o los del servidor). */
  errores: ErroresFacturacion
  ubicaciones: Record<string, string[]>
  responsabilidades: Record<string, string>
}) {
  const set = (k: keyof DatosFacturacion) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...datos, [k]: e.target.value })
  const juridica = datos.tipo_persona === 'juridica'
  const esNit = datos.tipo_documento === 'NIT'
  const numero = limpiarDocumento(datos.numero_documento)
  const dvSugerido = esNit && /^\d{5,10}$/.test(numero) ? dvNit(numero) : null
  const invalido = (k: keyof DatosFacturacion) => (errores[k] ? 'border-destructive focus-visible:ring-destructive/30' : undefined)

  function alternarResponsabilidad(id: string, marcada: boolean) {
    const actuales = new Set(datos.responsabilidades_fiscales)
    if (marcada) actuales.add(id)
    else actuales.delete(id)
    onChange({ ...datos, responsabilidades_fiscales: [...actuales] })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="tipo-persona" label="Factura a nombre de">
          <Select
            value={datos.tipo_persona}
            onValueChange={v => onChange({ ...datos, tipo_persona: v as DatosFacturacion['tipo_persona'], tipo_documento: v === 'juridica' ? 'NIT' : 'CC' })}
          >
            <SelectTrigger id="tipo-persona"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="juridica">Empresa</SelectItem>
              <SelectItem value="natural">Persona natural</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo id="tipo-documento" label="Tipo de documento" error={errores.tipo_documento}>
          <Select
            value={datos.tipo_documento}
            onValueChange={v => onChange({ ...datos, tipo_documento: v as DatosFacturacion['tipo_documento'], dv: v === 'NIT' ? datos.dv : '' })}
          >
            <SelectTrigger id="tipo-documento" className={invalido('tipo_documento')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NIT">NIT</SelectItem>
              {!juridica && <SelectItem value="CC">Cédula de ciudadanía</SelectItem>}
              {!juridica && <SelectItem value="CE">Cédula de extranjería</SelectItem>}
              {!juridica && <SelectItem value="PP">Pasaporte</SelectItem>}
            </SelectContent>
          </Select>
        </Campo>

        <div className={cn('grid gap-2', esNit ? 'grid-cols-[1fr_5rem]' : 'grid-cols-1', 'sm:col-span-2')}>
          <Campo id="documento" label={esNit ? 'NIT (sin el dígito de verificación)' : 'Número de documento'} error={errores.numero_documento}>
            <Input id="documento" inputMode={esNit || datos.tipo_documento === 'CC' ? 'numeric' : 'text'} className={invalido('numero_documento')}
              value={datos.numero_documento} onChange={set('numero_documento')} />
          </Campo>
          {esNit && (
            <Campo id="dv" label="DV" error={errores.dv}>
              <Input id="dv" maxLength={1} inputMode="numeric" className={invalido('dv')}
                value={datos.dv} onChange={e => onChange({ ...datos, dv: e.target.value.replace(/\D/g, '') })} />
            </Campo>
          )}
        </div>
        {esNit && dvSugerido && datos.dv !== dvSugerido && (
          <p className="-mt-1 text-xs text-muted-foreground sm:col-span-2">
            Según la DIAN, el dígito de verificación de ese NIT es {dvSugerido}.{' '}
            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => onChange({ ...datos, dv: dvSugerido })}>
              Usarlo
            </button>
          </p>
        )}

        {juridica ? (
          <Campo id="razon-social" label="Razón social (como aparece en el RUT)" error={errores.razon_social} className="sm:col-span-2">
            <Input id="razon-social" className={invalido('razon_social')} value={datos.razon_social} onChange={set('razon_social')} />
          </Campo>
        ) : (
          <>
            <Campo id="nombres" label="Nombres" error={errores.nombres}>
              <Input id="nombres" className={invalido('nombres')} value={datos.nombres} onChange={set('nombres')} />
            </Campo>
            <Campo id="apellidos" label="Apellidos" error={errores.apellidos}>
              <Input id="apellidos" className={invalido('apellidos')} value={datos.apellidos} onChange={set('apellidos')} />
            </Campo>
          </>
        )}

        <Campo id="email-factura" label="Correo donde llega la factura" error={errores.email_facturacion}>
          <Input id="email-factura" type="email" className={invalido('email_facturacion')} value={datos.email_facturacion} onChange={set('email_facturacion')} />
        </Campo>
        <Campo id="tel-factura" label="Teléfono" error={errores.telefono}>
          <Input id="tel-factura" inputMode="tel" className={invalido('telefono')} value={datos.telefono} onChange={set('telefono')} />
        </Campo>

        <Campo id="direccion" label="Dirección" error={errores.direccion} className="sm:col-span-2">
          <Input id="direccion" className={invalido('direccion')} placeholder="Ej.: Calle 10 # 43-12, oficina 301" value={datos.direccion} onChange={set('direccion')} />
        </Campo>
        <Campo id="departamento" label="Departamento" error={errores.departamento}>
          <Select value={datos.departamento || undefined} onValueChange={v => onChange({ ...datos, departamento: v, ciudad: '' })}>
            <SelectTrigger id="departamento" className={invalido('departamento')}><SelectValue placeholder="Elige el departamento" /></SelectTrigger>
            <SelectContent>
              {Object.keys(ubicaciones).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </Campo>
        <Campo id="ciudad" label="Municipio" error={errores.ciudad}>
          <Select value={datos.ciudad || undefined} onValueChange={v => onChange({ ...datos, ciudad: v })} disabled={!ubicaciones[datos.departamento]}>
            <SelectTrigger id="ciudad" className={invalido('ciudad')}><SelectValue placeholder={datos.departamento ? 'Elige el municipio' : 'Primero el departamento'} /></SelectTrigger>
            <SelectContent>
              {(ubicaciones[datos.departamento] ?? []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Campo>
      </div>

      <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label htmlFor="responsable-iva" className="text-sm font-medium">Responsable de IVA</Label>
            <p className="text-xs text-muted-foreground">Como figura en el RUT. Muchas clínicas no son responsables de IVA.</p>
          </div>
          <Switch id="responsable-iva" checked={datos.responsable_iva} onCheckedChange={v => onChange({ ...datos, responsable_iva: v })} />
        </div>
        <div>
          <p className="text-sm font-medium">Responsabilidades fiscales <span className="font-normal text-muted-foreground">(solo si aparecen en el RUT)</span></p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {Object.entries(responsabilidades).map(([id, nombre]) => (
              <label key={id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={datos.responsabilidades_fiscales.includes(id)}
                  onChange={e => alternarResponsabilidad(id, e.target.checked)} />
                {nombre}
              </label>
            ))}
          </div>
          {errores.responsabilidades_fiscales && <p className="mt-1 text-xs text-destructive">{errores.responsabilidades_fiscales}</p>}
        </div>
      </div>
    </div>
  )
}
