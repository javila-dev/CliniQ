import type { Metadata } from 'next'
import Link from 'next/link'
import { EMPRESA, PaginaLegal, type Seccion } from '@/components/marketing/legal/PaginaLegal'

export const metadata: Metadata = {
  title: 'Términos y condiciones — CliniQ',
  description: 'Condiciones de uso de CliniQ, el software de gestión para clínicas estéticas y de bienestar de 2Asoft S.A.S.',
}

const correo = <a href={`mailto:${EMPRESA.correo}`}>{EMPRESA.correo}</a>

const SECCIONES: Seccion[] = [
  {
    id: 'quienes-somos',
    titulo: 'Quiénes somos y aceptación',
    contenido: (
      <>
        <p>
          CliniQ es un software en la nube para la gestión de clínicas estéticas y de bienestar, desarrollado y operado por <strong>{EMPRESA.razonSocial}</strong>, sociedad colombiana identificada con NIT {EMPRESA.nit}, con domicilio en {EMPRESA.direccion}, {EMPRESA.ciudad} (en adelante, «2Asoft», «nosotros»).
        </p>
        <p>
          Estos términos regulan el acceso y el uso de CliniQ. Al registrar una clínica, crear un usuario o usar la plataforma, aceptas estos términos y la <Link href="/privacidad">Política de tratamiento de datos personales</Link>. Si actúas en nombre de una clínica o empresa, declaras que tienes facultades para obligarla.
        </p>
      </>
    ),
  },
  {
    id: 'definiciones',
    titulo: 'Definiciones',
    contenido: (
      <ul>
        <li><strong>Plataforma:</strong> el software CliniQ, sus aplicaciones web, integraciones y documentación.</li>
        <li><strong>Cliente o clínica:</strong> la persona natural o jurídica que registra una cuenta y contrata el servicio.</li>
        <li><strong>Usuarios:</strong> las personas a quienes el cliente da acceso (administración, recepción, profesionales y demás roles).</li>
        <li><strong>Pacientes:</strong> las personas atendidas por el cliente cuyos datos se registran en la plataforma.</li>
        <li><strong>Información del cliente:</strong> todo dato, documento, imagen o registro que el cliente o sus usuarios cargan o generan en CliniQ.</li>
      </ul>
    ),
  },
  {
    id: 'cuenta',
    titulo: 'Cuenta, usuarios y seguridad',
    contenido: (
      <>
        <p>Para usar CliniQ debes registrar la clínica con información veraz y mantenerla actualizada. El cliente es responsable de:</p>
        <ul>
          <li>Los usuarios que crea, los roles y permisos que les asigna y las acciones que realizan con sus cuentas.</li>
          <li>Mantener la confidencialidad de las credenciales y no compartir un usuario entre varias personas.</li>
          <li>Retirar el acceso de quienes dejen de trabajar con la clínica.</li>
          <li>Avisarnos a {correo} si sospecha de un acceso no autorizado.</li>
        </ul>
        <p>La plataforma registra las acciones sensibles de cada usuario con fines de seguridad y trazabilidad.</p>
      </>
    ),
  },
  {
    id: 'prueba',
    titulo: 'Periodo de prueba',
    contenido: (
      <p>
        Las clínicas nuevas pueden usar CliniQ durante 14 días sin costo y sin registrar tarjeta. Al terminar la prueba, para seguir usando la plataforma es necesario contratar un plan; mientras no se contrate, el acceso puede quedar limitado. La información cargada durante la prueba se conserva para que puedas continuar si contratas.
      </p>
    ),
  },
  {
    id: 'planes-pagos',
    titulo: 'Planes, pagos y facturación',
    contenido: (
      <>
        <ul>
          <li>Los planes, sus precios en pesos colombianos y sus límites (usuarios, sedes, mensajes y módulos incluidos) son los publicados en el sitio o en la plataforma al momento de contratar.</li>
          <li>El servicio se paga por anticipado en ciclos mensuales o anuales. El pago con tarjeta se procesa a través de Wompi; CliniQ no almacena el número completo de la tarjeta.</li>
          <li>La suscripción se renueva automáticamente al final de cada ciclo con el mismo medio de pago, salvo que la canceles antes de la fecha de renovación.</li>
          <li>Emitimos factura electrónica conforme a la normativa de la DIAN, con los datos de facturación que nos suministres. Los precios incluyen o discriminan los impuestos según corresponda.</li>
          <li>Si un cobro no puede realizarse, te avisaremos y podremos reintentarlo; si el pago sigue pendiente, el acceso puede suspenderse hasta que se regularice.</li>
          <li>Cualquier cambio de precio se anunciará con al menos 30 días de anticipación y aplicará desde el ciclo siguiente.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'cancelacion',
    titulo: 'Cancelación y terminación',
    contenido: (
      <>
        <p>
          Puedes cancelar la suscripción en cualquier momento. La cancelación tiene efecto al final del ciclo ya pagado y no genera devolución de periodos parciales, salvo lo que disponga la ley aplicable.
        </p>
        <p>
          Podemos suspender o terminar el servicio si se incumplen estos términos, si se usa la plataforma de forma ilícita o si existe mora en el pago. Tras la terminación, el cliente puede solicitar a {correo} una copia de su información dentro de los 30 días siguientes; vencido ese plazo, la información puede ser eliminada de forma segura, salvo la que debamos conservar por obligación legal.
        </p>
      </>
    ),
  },
  {
    id: 'uso-aceptable',
    titulo: 'Uso aceptable',
    contenido: (
      <>
        <p>No está permitido:</p>
        <ul>
          <li>Usar CliniQ para actividades ilícitas o para tratar datos sin la autorización de sus titulares.</li>
          <li>Enviar por WhatsApp o correo mensajes no solicitados, engañosos o contrarios a las políticas de esos canales.</li>
          <li>Intentar acceder a información de otras clínicas, vulnerar la seguridad o probar la plataforma sin autorización.</li>
          <li>Copiar, descompilar, revender o sublicenciar la plataforma.</li>
          <li>Cargar contenido que infrinja derechos de terceros.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'informacion-clinica',
    titulo: 'Información clínica, consentimientos y datos de pacientes',
    contenido: (
      <>
        <p>
          CliniQ es una herramienta; las decisiones clínicas y administrativas son del cliente. En particular, el cliente es responsable de:
        </p>
        <ul>
          <li>El contenido de la historia clínica y su manejo conforme a la normativa colombiana (incluida la Resolución 1995 de 1999 y las normas que la modifiquen).</li>
          <li>El texto legal de sus consentimientos informados, acuerdos de pago y demás documentos que configure en la plataforma.</li>
          <li>Obtener de sus pacientes la autorización para el tratamiento de sus datos personales, incluidos los datos sensibles de salud, fotografías y datos biométricos.</li>
        </ul>
        <p>
          Frente a los datos de los pacientes, el cliente actúa como responsable del tratamiento y 2Asoft como encargado: los tratamos solo para prestar el servicio y siguiendo las instrucciones del cliente, como se describe en la <Link href="/privacidad">Política de tratamiento de datos personales</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'firma-mensajeria',
    titulo: 'Firma electrónica y mensajería',
    contenido: (
      <>
        <p>
          Las firmas electrónicas de consentimientos y documentos se realizan a través de un proveedor especializado, en el marco de la Ley 527 de 1999 y el Decreto 2364 de 2012. El cliente decide qué documentos firma y por qué medio.
        </p>
        <p>
          Los mensajes por WhatsApp (recordatorios, códigos de verificación, enlaces de firma) se envían a través de la API oficial de WhatsApp y están sujetos a sus políticas. El volumen incluido depende del plan contratado.
        </p>
      </>
    ),
  },
  {
    id: 'propiedad',
    titulo: 'Propiedad intelectual',
    contenido: (
      <>
        <p>
          La plataforma, su código, diseño, marcas y documentación son de 2Asoft o de sus licenciantes. Durante la vigencia de la suscripción otorgamos al cliente una licencia de uso limitada, no exclusiva e intransferible.
        </p>
        <p>
          La información del cliente es del cliente. Nos autoriza a alojarla, procesarla y respaldarla únicamente en la medida necesaria para prestar, mantener y mejorar el servicio.
        </p>
      </>
    ),
  },
  {
    id: 'disponibilidad',
    titulo: 'Disponibilidad y soporte',
    contenido: (
      <p>
        Hacemos esfuerzos razonables para que CliniQ esté disponible de forma continua y realizamos copias de seguridad periódicas. Pueden existir interrupciones por mantenimiento, que procuraremos avisar con anticipación, o por causas ajenas a nuestro control. El soporte se presta por los canales indicados en la plataforma y en {correo}.
      </p>
    ),
  },
  {
    id: 'responsabilidad',
    titulo: 'Limitación de responsabilidad',
    contenido: (
      <p>
        En la medida que lo permita la ley, 2Asoft no responde por daños indirectos, lucro cesante ni pérdida de oportunidades derivados del uso de la plataforma, ni por el contenido que carguen el cliente o sus usuarios. La responsabilidad total de 2Asoft frente al cliente se limita al valor efectivamente pagado por el cliente en los doce (12) meses anteriores al hecho que la origine.
      </p>
    ),
  },
  {
    id: 'cambios',
    titulo: 'Cambios a estos términos',
    contenido: (
      <p>
        Podemos actualizar estos términos para reflejar cambios del servicio o de la ley. Los cambios relevantes se avisarán por correo o dentro de la plataforma con anticipación razonable; seguir usando CliniQ después de su entrada en vigor implica su aceptación.
      </p>
    ),
  },
  {
    id: 'ley',
    titulo: 'Ley aplicable y contacto',
    contenido: (
      <p>
        Estos términos se rigen por las leyes de la República de Colombia. Cualquier diferencia se intentará resolver primero de manera directa; de no lograrse, se acudirá a los jueces competentes de Colombia. Para cualquier asunto relacionado con estos términos escríbenos a {correo}.
      </p>
    ),
  },
]

export default function Page() {
  return (
    <PaginaLegal
      titulo="Términos y condiciones de CliniQ"
      resumen={<p>Las reglas para usar CliniQ: la cuenta, la prueba gratis, los pagos, la cancelación y quién responde por la información de cada clínica.</p>}
      secciones={SECCIONES}
      otra={{ href: '/privacidad', texto: 'Tratamiento de datos' }}
    />
  )
}
