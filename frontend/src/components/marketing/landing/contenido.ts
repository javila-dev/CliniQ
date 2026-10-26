// Textos del landing que también se publican como datos estructurados (JSON-LD)
// y en /llms.txt. Lo que se marca como FAQPage debe coincidir con lo visible.

export const RESUMEN =
  'CliniQ es un software en la nube para clínicas estéticas y de bienestar en Colombia. Conecta agenda, historia clínica, consentimientos con firma electrónica, tratamientos por sesiones, cotizaciones, cartera e inventario por sede, con recordatorios por WhatsApp.'

export const FUNCIONES = [
  'Agenda diaria, semanal y mensual por profesional y sede',
  'Confirmaciones y recordatorios de citas por WhatsApp',
  'Autorregistro y check-in del paciente con verificación facial y código por WhatsApp',
  'Historia clínica con fotografías, zonas tratadas y evolución por sesión',
  'Consentimientos informados por procedimiento con firma electrónica',
  'Tratamientos por paquetes y sesiones',
  'Cotizaciones, acuerdos de pago, cuotas y control de cartera en mora',
  'Inventario, compras y costo promedio por sede',
  'Varias sedes con operación separada y catálogo compartido',
  'Permisos por rol y auditoría de acciones sensibles',
]

export const FAQ: [string, string][] = [
  ['¿Qué es CliniQ?', 'Es un software de gestión para clínicas estéticas y de bienestar en Colombia. Reúne agenda, historia clínica, consentimientos, tratamientos, cobros, cartera e inventario en un solo sistema que usan recepción, profesionales y administración.'],
  ['¿Cuánto cuesta CliniQ?', 'Hay planes mensuales para cada tamaño de clínica, desde un profesional independiente hasta cadenas con varias sedes. Los precios en pesos colombianos están en la sección de planes y todos incluyen 14 días de prueba sin tarjeta.'],
  ['¿CliniQ sirve para una clínica con varias sedes?', 'Sí. La sede es una unidad operativa real: agenda, stock, compras y operación diaria respetan la ubicación física donde ocurren.'],
  ['¿Podemos migrar los pacientes que ya tenemos?', 'Sí. CliniQ incluye herramientas de carga y un proceso de puesta en marcha para organizar la información inicial de la clínica.'],
  ['¿Los profesionales y recepción ven lo mismo?', 'No necesariamente. Los permisos se configuran por rol para que cada persona acceda únicamente a la información y acciones que necesita.'],
  ['¿Cómo funciona la prueba?', 'Puedes registrar la clínica y usar CliniQ durante 14 días sin tarjeta de crédito. Así puedes configurar el equipo y probar el flujo real antes de elegir un plan.'],
]
