'use client'

import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, FileSignature, PenLine, ScanFace, ShieldCheck, Sparkles } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { toast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { FlujoRecepcion } from '@/components/configuracion/FlujoRecepcion'
import { avisarGuardado, EtiquetaAjuste } from '@/components/configuracion/ajustes'
import type { WizardConfig } from '@/types/clinicas'

type ClavePaso = 'paso_checkin' | 'paso_verificacion_facial' | 'consentimiento' | 'paso_pago' | 'paso_firma_asistencia'

const CONTACTO_PLAN = (
  <>
    Es un add-on: escríbenos y lo activamos en tu plan. Puedes revisar lo que tienes incluido en{' '}
    <Link href="/configuracion/plan" className="font-medium text-primary hover:underline">Plan</Link>.
  </>
)

// Mismo orden que Preparar paciente; el orden no se puede cambiar.
const PASOS: {
  key: ClavePaso
  label: string
  description: React.ReactNode
  icon: React.ElementType
  fijo?: boolean
  addonKey?: 'facial_verificacion_habilitada' | 'whatsapp_habilitado'
  comoActivar?: React.ReactNode
  consecuenciaApagado?: React.ReactNode
}[] = [
  {
    key: 'paso_checkin',
    label: 'Verificación de llegada',
    description: (
      <>
        Confirma que el paciente llegó, con un código que recibe por WhatsApp o con una foto. El código sale del
        número de CliniQ, aunque tengas{' '}
        <Link href="/configuracion/whatsapp" className="font-medium text-primary hover:underline">número propio</Link>.
      </>
    ),
    icon: ScanFace,
    addonKey: 'whatsapp_habilitado',
    comoActivar: (
      <>
        <p>Viene con el add-on de WhatsApp, que también envía cotizaciones, firmas y recordatorios.</p>
        <p className="mt-1 text-muted-foreground">{CONTACTO_PLAN}</p>
      </>
    ),
  },
  {
    key: 'paso_verificacion_facial',
    label: 'Verificación de identidad facial',
    description: 'Compara la foto en vivo del paciente con su foto de control registrada.',
    icon: ShieldCheck,
    addonKey: 'facial_verificacion_habilitada',
    comoActivar: (
      <>
        <p>Viene con el add-on de verificación facial. Después podrás ajustar el nivel de coincidencia en Biometría.</p>
        <p className="mt-1 text-muted-foreground">{CONTACTO_PLAN}</p>
      </>
    ),
  },
  {
    key: 'consentimiento',
    label: 'Consentimiento informado',
    description: 'Lo firma el paciente cuando el procedimiento tiene uno asignado. No se puede apagar.',
    icon: FileSignature,
    fijo: true,
  },
  {
    key: 'paso_pago',
    label: 'Registro de pago',
    description: 'Registra el cobro de la sesión antes de iniciar la atención.',
    icon: CreditCard,
    consecuenciaApagado: (
      <>
        Recepción no cobra al llegar. Si cobras, regístralo en{' '}
        <Link href="/cobros" className="font-medium underline-offset-2 hover:underline">Cobros</Link>: CliniQ no avisa de
        citas atendidas sin cobro.
      </>
    ),
  },
  {
    key: 'paso_firma_asistencia',
    label: 'Firma de asistencia',
    description: 'El paciente firma que asistió a la cita.',
    icon: PenLine,
    consecuenciaApagado: 'No queda constancia firmada de que el paciente asistió a la cita.',
  },
]

const DEFAULT_WIZARD_CONFIG: WizardConfig = {
  paso_checkin: true,
  paso_verificacion_facial: false,
  foto_control_obligatoria: false,
  paso_pago: true,
  paso_firma_asistencia: true,
}

/**
 * Los pasos de recepción con su interruptor, listos para usar en cualquier
 * pantalla (Configuración > Recepción y Preparar mi clínica). Cada cambio se
 * guarda al tocarlo, con opción de deshacer.
 */
export function FlujoRecepcionEditor({ onGuardado }: { onGuardado?: () => void }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const clinicaId = user?.clinica_id
  const puedeEditar = hasPermission(user, PERM.CLINICAS_EDITAR)

  const { data: wizardConfig, isLoading } = useQuery({
    queryKey: ['wizard-config'],
    queryFn: () => clinicasApi.wizardConfig.get(),
  })
  const { data: miClinica } = useQuery({
    queryKey: ['mi-clinica', clinicaId],
    queryFn: () => clinicasApi.miClinica(clinicaId),
    enabled: !!clinicaId,
  })

  const mutation = useMutation({
    mutationFn: (data: Partial<WizardConfig>) => clinicasApi.wizardConfig.update(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wizard-config'] })
      onGuardado?.()
    },
    onError: () => toast.error('No se pudo guardar', 'Intenta de nuevo.'),
  })

  function cambiarPaso(clave: keyof WizardConfig, valor: boolean, conDeshacer = true) {
    mutation.mutate({ [clave]: valor }, {
      onSuccess: () => avisarGuardado(conDeshacer ? () => cambiarPaso(clave, !valor, false) : undefined),
    })
  }

  if (isLoading) {
    return <div className="h-72 animate-pulse bg-muted/30" />
  }

  const config = wizardConfig ?? DEFAULT_WIZARD_CONFIG
  const facialActivo = config.paso_verificacion_facial && Boolean(miClinica?.facial_verificacion_habilitada)

  return (
    <>
      <FlujoRecepcion
        deshabilitado={!puedeEditar || mutation.isPending}
        onCambiar={(clave, valor) => cambiarPaso(clave as keyof WizardConfig, valor)}
        pasos={PASOS.map((paso) => {
          const fueraDelPlan = Boolean(paso.addonKey && !miClinica?.[paso.addonKey])
          return {
            clave: paso.key,
            titulo: paso.label,
            icono: paso.icon,
            activo: paso.fijo ? true : config[paso.key as keyof WizardConfig],
            bloqueado: fueraDelPlan ? 'plan' as const : paso.fijo ? 'fijo' as const : undefined,
            extra: paso.addonKey
              ? <EtiquetaAjuste tono={fueraDelPlan ? 'neutro' : 'addon'} icono={Sparkles}>Add-on</EtiquetaAjuste>
              : undefined,
            descripcion: paso.description,
            comoActivar: paso.comoActivar,
            consecuenciaApagado: paso.consecuenciaApagado,
          }
        })}
      />
      {facialActivo && (
        <p className="border-t px-4 py-2.5 text-[13px] text-muted-foreground">
          Nivel de coincidencia, check-in automático y foto de control obligatoria:{' '}
          <Link href="/configuracion/biometria" className="font-medium text-primary hover:underline">ajustes avanzados</Link>.
        </p>
      )}
    </>
  )
}
