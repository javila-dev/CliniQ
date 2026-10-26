import type { Metadata } from 'next'
import Link from 'next/link'
import { EMPRESA, PaginaLegal, type Seccion } from '@/components/marketing/legal/PaginaLegal'

export const metadata: Metadata = {
  title: 'Política de tratamiento de datos personales — CliniQ',
  description: 'Cómo 2Asoft S.A.S. trata los datos personales en CliniQ, conforme a la Ley 1581 de 2012.',
}

const correo = <a href={`mailto:${EMPRESA.correo}`}>{EMPRESA.correo}</a>

const SECCIONES: Seccion[] = [
  {
    id: 'responsable',
    titulo: 'Responsable del tratamiento',
    contenido: (
      <>
        <ul>
          <li><strong>Razón social:</strong> {EMPRESA.razonSocial}</li>
          <li><strong>NIT:</strong> {EMPRESA.nit}</li>
          <li><strong>Domicilio:</strong> {EMPRESA.direccion}, {EMPRESA.ciudad}</li>
          <li><strong>Correo para asuntos de datos personales:</strong> {correo}</li>
        </ul>
        <p>
          Esta política se adopta en cumplimiento de la Ley 1581 de 2012, el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015) y las demás normas colombianas sobre protección de datos personales.
        </p>
      </>
    ),
  },
  {
    id: 'roles',
    titulo: 'A quién aplica y en qué calidad tratamos los datos',
    contenido: (
      <>
        <p>
          <strong>Como responsables</strong> tratamos los datos de las personas que se registran o nos contactan, de los usuarios de las clínicas clientes (administración, recepción, profesionales) y de los representantes y contactos de facturación de cada clínica.
        </p>
        <p>
          <strong>Como encargados</strong> tratamos los datos de los pacientes que cada clínica registra en CliniQ. En ese caso la clínica es la responsable: decide qué datos recoge y para qué, y debe obtener la autorización de sus pacientes. Nosotros solo los tratamos para prestarle el servicio y siguiendo sus instrucciones.
        </p>
      </>
    ),
  },
  {
    id: 'datos',
    titulo: 'Datos que tratamos',
    contenido: (
      <>
        <p>De clínicas y usuarios:</p>
        <ul>
          <li>Identificación y contacto: nombre, correo, teléfono, cargo, nombre y ciudad de la clínica.</li>
          <li>Facturación: razón social, NIT, dirección y correo de facturación.</li>
          <li>Pagos: los datos de la tarjeta los recibe y tokeniza el procesador de pagos; CliniQ no almacena el número completo de la tarjeta.</li>
          <li>Uso y seguridad: dirección IP, registros de acceso, acciones realizadas dentro de la plataforma y cookies necesarias para mantener la sesión.</li>
        </ul>
        <p>De pacientes, por cuenta de la clínica:</p>
        <ul>
          <li>Identificación y contacto, datos de citas y atenciones.</li>
          <li>Historia clínica, fotografías clínicas, zonas tratadas, consentimientos y firmas.</li>
          <li>Datos biométricos para verificación facial, cuando la clínica activa esa función.</li>
          <li>Cotizaciones, pagos, cuotas y saldos.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'finalidades',
    titulo: 'Finalidades',
    contenido: (
      <ul>
        <li>Crear y administrar la cuenta de la clínica y de sus usuarios.</li>
        <li>Prestar las funciones de la plataforma: agenda, historia clínica, consentimientos, cartera, inventario, mensajería y demás módulos contratados.</li>
        <li>Enviar mensajes operativos por correo o WhatsApp: verificación de la cuenta, recordatorios, códigos de verificación, enlaces de firma y avisos del servicio.</li>
        <li>Cobrar la suscripción y emitir la factura electrónica.</li>
        <li>Dar soporte, atender solicitudes y comunicar cambios del servicio.</li>
        <li>Proteger la seguridad de la plataforma, prevenir fraudes y mantener registros de auditoría.</li>
        <li>Enviar información comercial sobre CliniQ a quienes lo hayan aceptado; puedes pedir que dejemos de hacerlo en cualquier momento.</li>
        <li>Cumplir obligaciones legales, contables y tributarias.</li>
      </ul>
    ),
  },
  {
    id: 'sensibles',
    titulo: 'Datos sensibles y de menores',
    contenido: (
      <>
        <p>
          Los datos de salud, las fotografías clínicas y los datos biométricos son datos sensibles. Su tratamiento requiere autorización previa, expresa e informada del titular, que la clínica obtiene de sus pacientes. Nadie está obligado a autorizar el tratamiento de datos sensibles.
        </p>
        <p>
          Los datos de niños, niñas y adolescentes solo se tratan cuando la clínica los atiende, respetando su interés superior y con la autorización de su representante legal.
        </p>
      </>
    ),
  },
  {
    id: 'derechos',
    titulo: 'Derechos de los titulares',
    contenido: (
      <>
        <p>Como titular de tus datos puedes:</p>
        <ul>
          <li>Conocer, actualizar y rectificar tus datos.</li>
          <li>Solicitar prueba de la autorización otorgada.</li>
          <li>Ser informado sobre el uso que se ha dado a tus datos.</li>
          <li>Revocar la autorización o pedir la supresión de tus datos cuando no exista un deber legal o contractual de conservarlos.</li>
          <li>Acceder gratuitamente a tus datos.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio, después de haber agotado el trámite de consulta o reclamo ante nosotros.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'procedimiento',
    titulo: 'Cómo ejercer tus derechos',
    contenido: (
      <>
        <p>
          Escríbenos a {correo} indicando tu nombre, documento de identidad, la solicitud concreta y un medio de respuesta.
        </p>
        <ul>
          <li><strong>Consultas:</strong> se responden en un máximo de 10 días hábiles, prorrogables por 5 días hábiles más, informando el motivo.</li>
          <li><strong>Reclamos</strong> (corrección, actualización, supresión o incumplimiento): se responden en un máximo de 15 días hábiles, prorrogables por 8 días hábiles más, informando el motivo.</li>
        </ul>
        <p>
          Si eres paciente de una clínica que usa CliniQ, dirige tu solicitud a la clínica, que es la responsable de tus datos. Si nos escribes a nosotros, la trasladaremos a la clínica y te lo informaremos.
        </p>
      </>
    ),
  },
  {
    id: 'terceros',
    titulo: 'Proveedores y transferencias',
    contenido: (
      <>
        <p>Para prestar el servicio compartimos datos, solo en lo necesario, con proveedores que actúan como encargados:</p>
        <ul>
          <li>Infraestructura en la nube para alojamiento y copias de seguridad.</li>
          <li>Wompi, para el procesamiento de pagos con tarjeta.</li>
          <li>Alegra, para la emisión de facturas electrónicas.</li>
          <li>Proveedores de la API oficial de WhatsApp y de correo transaccional, para el envío de mensajes.</li>
          <li>Un proveedor de firma electrónica, para la firma de consentimientos y documentos.</li>
        </ul>
        <p>
          Algunos de estos proveedores pueden almacenar o procesar datos fuera de Colombia. En esos casos exigimos condiciones de seguridad y confidencialidad adecuadas, conforme a la ley. No vendemos datos personales.
        </p>
      </>
    ),
  },
  {
    id: 'seguridad',
    titulo: 'Seguridad',
    contenido: (
      <ul>
        <li>Conexiones cifradas y sesiones en cookies protegidas, no accesibles desde el navegador.</li>
        <li>Separación de la información de cada clínica y permisos por rol para que cada usuario vea solo lo necesario.</li>
        <li>Enmascaramiento de datos sensibles del paciente para los roles que no deben verlos.</li>
        <li>Registro de auditoría de las acciones sensibles y copias de seguridad periódicas.</li>
      </ul>
    ),
  },
  {
    id: 'conservacion',
    titulo: 'Conservación y cookies',
    contenido: (
      <>
        <p>
          Conservamos los datos mientras la cuenta esté activa y durante el tiempo necesario para cumplir las finalidades descritas y las obligaciones legales. Los datos de pacientes se conservan según las instrucciones de la clínica y la normativa de historia clínica; al terminar el servicio se manejan como indican los <Link href="/terminos">Términos y condiciones</Link>.
        </p>
        <p>
          El sitio y la plataforma usan solo cookies técnicas necesarias para iniciar y mantener la sesión. No usamos cookies de publicidad.
        </p>
      </>
    ),
  },
  {
    id: 'vigencia',
    titulo: 'Vigencia y cambios',
    contenido: (
      <p>
        Esta política rige desde su publicación. Si la modificamos de forma sustancial, lo informaremos por correo o dentro de la plataforma antes de aplicar los cambios. Las bases de datos se mantendrán vigentes mientras se requieran para las finalidades aquí descritas.
      </p>
    ),
  },
]

export default function Page() {
  return (
    <PaginaLegal
      titulo="Política de tratamiento de datos personales"
      resumen={<p>Qué datos tratamos en CliniQ, para qué, con quién los compartimos y cómo puedes conocerlos, corregirlos o pedir que los eliminemos.</p>}
      secciones={SECCIONES}
      otra={{ href: '/terminos', texto: 'Términos y condiciones' }}
    />
  )
}
