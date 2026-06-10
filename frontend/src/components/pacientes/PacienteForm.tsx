'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { Paciente, CreatePacienteRequest, TipoDocumento } from '@/types/pacientes'

const COUNTRY_CODES = [
  { code: 'CO', dial: '57',  flag: '🇨🇴', label: 'Colombia' },
  { code: 'VE', dial: '58',  flag: '🇻🇪', label: 'Venezuela' },
  { code: 'EC', dial: '593', flag: '🇪🇨', label: 'Ecuador' },
  { code: 'PE', dial: '51',  flag: '🇵🇪', label: 'Perú' },
  { code: 'MX', dial: '52',  flag: '🇲🇽', label: 'México' },
  { code: 'AR', dial: '54',  flag: '🇦🇷', label: 'Argentina' },
  { code: 'CL', dial: '56',  flag: '🇨🇱', label: 'Chile' },
  { code: 'BR', dial: '55',  flag: '🇧🇷', label: 'Brasil' },
  { code: 'PA', dial: '507', flag: '🇵🇦', label: 'Panamá' },
  { code: 'CR', dial: '506', flag: '🇨🇷', label: 'Costa Rica' },
  { code: 'DO', dial: '1809',flag: '🇩🇴', label: 'Rep. Dominicana' },
  { code: 'US', dial: '1',   flag: '🇺🇸', label: 'Estados Unidos' },
  { code: 'ES', dial: '34',  flag: '🇪🇸', label: 'España' },
]

function detectarPais(telefono: string): { code: string; localPhone: string } {
  const normalized = telefono.startsWith('+') ? telefono.slice(1) : telefono
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length)
  for (const c of sorted) {
    if (normalized.startsWith(c.dial)) {
      return { code: c.code, localPhone: normalized.slice(c.dial.length) }
    }
  }
  return { code: 'CO', localPhone: telefono }
}

const DOCS_NUMERICOS: TipoDocumento[] = ['CC', 'TI']
const NONE = '__none__'
const sel = (v: string | undefined) => v || NONE
const unsel = (v: string) => v === NONE ? undefined : v

const schema = z.object({
  nombres:            z.string().min(2, 'Mínimo 2 caracteres'),
  apellidos:          z.string().min(2, 'Mínimo 2 caracteres'),
  tipo_documento:     z.enum(['CC', 'CE', 'PA', 'TI', 'NIT']),
  numero_documento:   z.string().min(4, 'Requerido'),
  sexo:               z.enum(['M', 'F', 'O']),
  fecha_nacimiento:   z.string().optional(),
  telefono:           z.string().min(7, 'Teléfono inválido'),
  email:              z.string().email('Correo inválido').optional().or(z.literal('')),
  canal_confirmacion: z.enum(['whatsapp', 'sms', 'llamada']),
  autoriza_datos:     z.boolean().refine((v) => v === true, {
    message: 'El paciente debe autorizar el tratamiento de datos',
  }),
  direccion: z.string().optional(), ciudad: z.string().optional(), barrio: z.string().optional(),
  estado_civil: z.string().optional(), ocupacion: z.string().optional(),
  escolaridad: z.string().optional(), grupo_etnico: z.string().optional(),
  grupo_sanguineo: z.string().optional(), eps: z.string().optional(),
  tipo_afiliado: z.string().optional(), regimen: z.string().optional(),
  nombre_responsable: z.string().optional(), parentesco_responsable: z.string().optional(),
  telefono_responsable: z.string().optional(),
}).superRefine((data, ctx) => {
  if (DOCS_NUMERICOS.includes(data.tipo_documento) && !/^\d+$/.test(data.numero_documento)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Solo números para este tipo de documento', path: ['numero_documento'] })
  }
})

type FormValues = z.infer<typeof schema>

interface PacienteFormProps {
  defaultValues?: Paciente
  onSubmit: (data: CreatePacienteRequest) => Promise<void>
  isLoading?: boolean
  submitLabel?: string
  initialNombre?: string
  compact?: boolean
}

// Campo reutilizable: label + input + error
function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// Select con opción vacía para campos opcionales
function OptionalSelect({ value, onChange, placeholder = '—', children }: {
  value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string; children: React.ReactNode
}) {
  return (
    <Select value={sel(value)} onValueChange={(v) => onChange(unsel(v))}>
      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}><span className="text-muted-foreground">—</span></SelectItem>
        {children}
      </SelectContent>
    </Select>
  )
}

export function PacienteForm({ defaultValues, onSubmit, isLoading, submitLabel = 'Guardar', initialNombre, compact = false }: PacienteFormProps) {
  const [tab, setTab] = useState('basico')

  const detectado = defaultValues?.telefono ? detectarPais(defaultValues.telefono) : null
  const [codigoPais, setCodigoPais] = useState(detectado?.code ?? 'CO')

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ? {
      nombres: defaultValues.nombres, apellidos: defaultValues.apellidos,
      tipo_documento: defaultValues.tipo_documento, numero_documento: defaultValues.numero_documento,
      sexo: defaultValues.sexo, fecha_nacimiento: defaultValues.fecha_nacimiento ?? '',
      telefono: detectado?.localPhone ?? defaultValues.telefono, email: defaultValues.email ?? '',
      canal_confirmacion: defaultValues.canal_confirmacion, autoriza_datos: defaultValues.autoriza_datos,
      direccion: defaultValues.direccion ?? '', ciudad: defaultValues.ciudad ?? '', barrio: defaultValues.barrio ?? '',
      estado_civil: defaultValues.estado_civil ?? '', ocupacion: defaultValues.ocupacion ?? '',
      escolaridad: defaultValues.escolaridad ?? '', grupo_etnico: defaultValues.grupo_etnico ?? '',
      grupo_sanguineo: defaultValues.grupo_sanguineo ?? '', eps: defaultValues.eps ?? '',
      tipo_afiliado: defaultValues.tipo_afiliado ?? '', regimen: defaultValues.regimen ?? '',
      nombre_responsable: defaultValues.nombre_responsable ?? '',
      parentesco_responsable: defaultValues.parentesco_responsable ?? '',
      telefono_responsable: defaultValues.telefono_responsable ?? '',
    } : {
      nombres: initialNombre ?? '', tipo_documento: 'CC', sexo: 'F',
      canal_confirmacion: 'whatsapp', autoriza_datos: false,
    },
  })

  const dialCode = COUNTRY_CODES.find((c) => c.code === codigoPais)?.dial ?? '57'

  const tipoDoc = watch('tipo_documento')
  const autorizaDatos = watch('autoriza_datos')

  const handleFormSubmit = async (values: FormValues) => {
    await onSubmit({
      nombres: values.nombres, apellidos: values.apellidos,
      tipo_documento: values.tipo_documento, numero_documento: values.numero_documento,
      sexo: values.sexo, fecha_nacimiento: values.fecha_nacimiento || undefined,
      telefono: '+' + dialCode + values.telefono, email: values.email || undefined,
      canal_confirmacion: values.canal_confirmacion, autoriza_datos: values.autoriza_datos,
      direccion: values.direccion || undefined, ciudad: values.ciudad || undefined, barrio: values.barrio || undefined,
      estado_civil: (values.estado_civil || undefined) as CreatePacienteRequest['estado_civil'],
      ocupacion: values.ocupacion || undefined,
      escolaridad: (values.escolaridad || undefined) as CreatePacienteRequest['escolaridad'],
      grupo_etnico: (values.grupo_etnico || undefined) as CreatePacienteRequest['grupo_etnico'],
      grupo_sanguineo: (values.grupo_sanguineo || undefined) as CreatePacienteRequest['grupo_sanguineo'],
      eps: values.eps || undefined,
      tipo_afiliado: (values.tipo_afiliado || undefined) as CreatePacienteRequest['tipo_afiliado'],
      regimen: (values.regimen || undefined) as CreatePacienteRequest['regimen'],
      nombre_responsable: values.nombre_responsable || undefined,
      parentesco_responsable: values.parentesco_responsable || undefined,
      telefono_responsable: values.telefono_responsable || undefined,
    })
  }

  // ── Bloque de campos básicos (reutilizado en compact y en tab 1) ──────────────
  const BasicFields = (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Nombres *" error={errors.nombres?.message}>
          <Input className="h-9" placeholder="Ana María" {...register('nombres')} />
        </Field>
        <Field label="Apellidos *" error={errors.apellidos?.message}>
          <Input className="h-9" placeholder="Gómez Ruiz" {...register('apellidos')} />
        </Field>
        <Field label="Sexo *">
          <Controller name="sexo" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="F">Femenino</SelectItem>
                <SelectItem value="M">Masculino</SelectItem>
                <SelectItem value="O">Otro</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Tipo de documento *">
          <Controller name="tipo_documento" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CC">Cédula de ciudadanía</SelectItem>
                <SelectItem value="CE">Cédula de extranjería</SelectItem>
                <SelectItem value="PA">Pasaporte</SelectItem>
                <SelectItem value="TI">Tarjeta de identidad</SelectItem>
                <SelectItem value="NIT">NIT</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </Field>
        <Field label="Número de documento *" error={errors.numero_documento?.message}>
          <Input
            className="h-9"
            inputMode={DOCS_NUMERICOS.includes(tipoDoc) ? 'numeric' : 'text'}
            placeholder="1020304050"
            {...register('numero_documento')}
          />
        </Field>
        <Field label="Fecha de nacimiento">
          <Input className="h-9" type="date" {...register('fecha_nacimiento')} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Teléfono *" error={errors.telefono?.message}>
          <div className="flex h-9">
            <Select value={codigoPais} onValueChange={setCodigoPais}>
              <SelectTrigger className="h-9 w-[90px] shrink-0 rounded-r-none border-r-0 text-sm px-2">
                <SelectValue>
                  {(() => {
                    const c = COUNTRY_CODES.find((x) => x.code === codigoPais)
                    return c ? <span>{c.flag} +{c.dial}</span> : null
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_CODES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="flex items-center gap-2">
                      <span>{c.flag}</span>
                      <span>{c.label}</span>
                      <span className="text-muted-foreground">+{c.dial}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-9 rounded-l-none flex-1 min-w-0"
              type="tel"
              placeholder="3001234567"
              {...register('telefono')}
            />
          </div>
        </Field>
        <Field label="Correo electrónico" error={errors.email?.message}>
          <Input className="h-9" type="email" placeholder="paciente@email.com" {...register('email')} />
        </Field>
        <Field label="Canal de confirmación *">
          <Controller name="canal_confirmacion" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="llamada">Llamada</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </Field>
      </div>
    </div>
  )

  // ── Bloque de autorización ────────────────────────────────────────────────────
  const AuthBlock = (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
          {...register('autoriza_datos')}
        />
        <div>
          <p className="text-sm font-medium">Autorización de tratamiento de datos personales *</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            El paciente autoriza el uso de sus datos para la prestación de servicios de salud estética,
            conforme a la política de privacidad de la clínica.
          </p>
        </div>
      </label>
      {errors.autoriza_datos && <p className="text-xs text-destructive pl-7">{errors.autoriza_datos.message}</p>}
    </div>
  )

  // ── Modo compact: solo básicos + autorización ─────────────────────────────────
  if (compact) {
    return (
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
        {BasicFields}
        {AuthBlock}
        <div className="flex justify-end">
          <Button type="submit" disabled={isLoading || !autorizaDatos}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isLoading ? 'Guardando...' : submitLabel}
          </Button>
        </div>
      </form>
    )
  }

  // ── Modo completo: tabs ────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3 h-9">
          <TabsTrigger value="basico" className="text-xs">Identificación y contacto</TabsTrigger>
          <TabsTrigger value="personal" className="text-xs">Datos personales</TabsTrigger>
          <TabsTrigger value="salud" className="text-xs">Salud y afiliación</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: básico ── */}
        <TabsContent value="basico" className="pt-4">
          {BasicFields}
        </TabsContent>

        {/* ── Tab 2: datos personales ── */}
        <TabsContent value="personal" className="pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Dirección" className="sm:col-span-2">
              <Input className="h-9" placeholder="Calle 45 # 12-30 Apto 201" {...register('direccion')} />
            </Field>
            <Field label="Barrio">
              <Input className="h-9" placeholder="El Poblado" {...register('barrio')} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Ciudad / Municipio">
              <Input className="h-9" placeholder="Medellín" {...register('ciudad')} />
            </Field>
            <Field label="Estado civil">
              <Controller name="estado_civil" control={control} render={({ field }) => (
                <OptionalSelect value={field.value} onChange={field.onChange}>
                  <SelectItem value="soltero">Soltero/a</SelectItem>
                  <SelectItem value="casado">Casado/a</SelectItem>
                  <SelectItem value="union_libre">Unión libre</SelectItem>
                  <SelectItem value="separado">Separado/a</SelectItem>
                  <SelectItem value="divorciado">Divorciado/a</SelectItem>
                  <SelectItem value="viudo">Viudo/a</SelectItem>
                </OptionalSelect>
              )} />
            </Field>
            <Field label="Ocupación">
              <Input className="h-9" placeholder="Docente, Comerciante…" {...register('ocupacion')} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Escolaridad">
              <Controller name="escolaridad" control={control} render={({ field }) => (
                <OptionalSelect value={field.value} onChange={field.onChange}>
                  <SelectItem value="ninguna">Sin escolaridad</SelectItem>
                  <SelectItem value="primaria">Primaria</SelectItem>
                  <SelectItem value="secundaria">Secundaria</SelectItem>
                  <SelectItem value="tecnico">Técnico / Tecnólogo</SelectItem>
                  <SelectItem value="universitario">Universitario</SelectItem>
                  <SelectItem value="posgrado">Posgrado</SelectItem>
                </OptionalSelect>
              )} />
            </Field>
            <Field label="Grupo étnico">
              <Controller name="grupo_etnico" control={control} render={({ field }) => (
                <OptionalSelect value={field.value} onChange={field.onChange}>
                  <SelectItem value="mestizo">Mestizo</SelectItem>
                  <SelectItem value="blanco">Blanco</SelectItem>
                  <SelectItem value="afrocolombiano">Afrocolombiano</SelectItem>
                  <SelectItem value="indigena">Indígena</SelectItem>
                  <SelectItem value="raizal">Raizal</SelectItem>
                  <SelectItem value="rom">ROM / Gitano</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </OptionalSelect>
              )} />
            </Field>
          </div>

          {/* Responsable / acompañante — va aquí porque es "datos personales" */}
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-3">Responsable / acompañante</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Nombre del responsable">
                <Input className="h-9" placeholder="Carlos Gómez" {...register('nombre_responsable')} />
              </Field>
              <Field label="Parentesco">
                <Input className="h-9" placeholder="Esposo, Madre…" {...register('parentesco_responsable')} />
              </Field>
              <Field label="Teléfono del responsable">
                <Input className="h-9" type="tel" placeholder="3109876543" {...register('telefono_responsable')} />
              </Field>
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 3: salud y afiliación ── */}
        <TabsContent value="salud" className="pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Grupo sanguíneo">
              <Controller name="grupo_sanguineo" control={control} render={({ field }) => (
                <OptionalSelect value={field.value} onChange={field.onChange}>
                  {(['A+','A-','B+','B-','AB+','AB-','O+','O-'] as const).map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </OptionalSelect>
              )} />
            </Field>
            <Field label="EPS / Aseguradora" className="sm:col-span-2">
              <Input className="h-9" placeholder="Sura, Nueva EPS, Sánitas…" {...register('eps')} />
            </Field>
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-3">Seguridad social — SGSSS</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tipo de afiliado">
                <Controller name="tipo_afiliado" control={control} render={({ field }) => (
                  <OptionalSelect value={field.value} onChange={field.onChange}>
                    <SelectItem value="cotizante">Cotizante</SelectItem>
                    <SelectItem value="beneficiario">Beneficiario</SelectItem>
                    <SelectItem value="independiente">Independiente</SelectItem>
                    <SelectItem value="subsidiado">Subsidiado</SelectItem>
                    <SelectItem value="vinculado">Vinculado</SelectItem>
                  </OptionalSelect>
                )} />
              </Field>
              <Field label="Régimen de afiliación">
                <Controller name="regimen" control={control} render={({ field }) => (
                  <OptionalSelect value={field.value} onChange={field.onChange}>
                    <SelectItem value="contributivo">Contributivo</SelectItem>
                    <SelectItem value="subsidiado">Subsidiado</SelectItem>
                    <SelectItem value="vinculado">Vinculado</SelectItem>
                    <SelectItem value="especial">Especial / Excepción</SelectItem>
                    <SelectItem value="pensionado">Pensionado</SelectItem>
                  </OptionalSelect>
                )} />
              </Field>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {AuthBlock}

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading || !autorizaDatos}>
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isLoading ? 'Guardando...' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
