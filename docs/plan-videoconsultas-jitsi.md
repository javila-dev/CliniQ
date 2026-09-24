# Plan: videoconsultas con Jitsi autohospedado

Fecha: 2026-09-20.
Estado: planeado, no implementado.

## Decisión y objetivo

CliniQ incorporará videoconsultas sincrónicas mediante una instalación propia de
Jitsi Meet. Jitsi aportará la interfaz y el transporte de audio y video; CliniQ
seguirá siendo responsable del agendamiento, la autenticación, el enlace enviado
al paciente, el consentimiento, la trazabilidad y la integración con la historia
clínica.

La primera versión estará limitada a consultas individuales entre un profesional
y un paciente adulto. No incluirá grabación, transcripción, inteligencia
artificial, SIP, streaming, acompañantes, menores de edad, teleexperticia,
telemonitoreo ni consultas grupales.

La funcionalidad no verificará ni concederá habilitaciones sanitarias. Para
activarla, un administrador de la clínica deberá declarar que cuenta con las
habilitaciones, inscripciones, talento humano, procesos y condiciones que le sean
aplicables. CliniQ conservará evidencia de esa declaración, pero no garantizará
su exactitud ni sustituirá la verificación de las autoridades competentes.

## Marco de responsabilidad

La clínica es responsable de la habilitación de sus servicios, inscripción en
REPS, idoneidad del talento humano, selección de servicios aptos para atención a
distancia, protocolos clínicos, atención de emergencias y cumplimiento de las
obligaciones propias del prestador.

CliniQ es responsable de implementar controles tecnológicos razonables de
acceso, confidencialidad, integridad, disponibilidad, trazabilidad, consentimiento
e integración con la historia clínica. El proveedor del VPS será tratado como
proveedor de infraestructura y, cuando corresponda, como subencargado del
tratamiento.

La referencia normativa principal del plan es la Resolución 1644 de 2026 del
Ministerio de Salud y Protección Social, que derogó la Resolución 2654 de 2019.
La implementación también deberá considerar la Ley 1581 de 2012, el régimen de
historia clínica electrónica y las normas vigentes del Sistema Único de
Habilitación, incluida la Resolución 3100 de 2019 o la que la modifique o
sustituya.

Referencia oficial:
https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/DIJ/resolucion-1644-de-2026.pdf

Este plan define controles del producto, pero no sustituye la revisión final de
los textos legales, contratos y consentimientos por un abogado colombiano con
experiencia en salud y protección de datos.

## Declaración de habilitación de la clínica

Se creará un modelo `DeclaracionHabilitacionTelemedicina`. Solo un administrador
de clínica o superadministrador podrá aceptar o revocar la declaración. La
aceptación será obligatoria antes de habilitar el módulo y se bloquearán nuevas
videoconsultas cuando no exista una declaración vigente.

La evidencia conservará la clínica, el usuario que aceptó, el nombre y cargo
declarados, la fecha y hora, IP, user-agent, versión del texto, hash del texto y
estado vigente o revocado. El texto deberá versionarse y solicitar una nueva
aceptación cuando cambie materialmente. Se recomienda además una ratificación
anual.

Texto base sujeto a revisión jurídica:

> La clínica declara que cuenta con las inscripciones, habilitaciones, talento
> humano, procesos, protocolos y condiciones requeridas para prestar los
> servicios seleccionados mediante telemedicina. Reconoce que CliniQ proporciona
> una herramienta tecnológica y no verifica, concede ni sustituye las
> habilitaciones sanitarias exigidas por las autoridades competentes.

La interfaz debe explicar con claridad que la declaración no es una validación
de CliniQ y que su falsedad o desactualización es responsabilidad de la clínica.

## Alcance funcional del MVP

El administrador habilitará el módulo y aceptará la declaración. Después podrá
marcar qué servicios de la clínica admiten teleconsulta. Al crear una cita, la
modalidad `teleconsulta` solo estará disponible si el módulo está activo, la
declaración continúa vigente y el servicio fue marcado como apto.

Al confirmar una cita de teleconsulta, CliniQ generará una invitación opaca y
enviará un enlace de la propia aplicación mediante el flujo actual de WhatsApp.
El paciente abrirá ese enlace, verificará su identidad mediante OTP, firmará el
consentimiento de telemedicina y realizará una prueba previa de cámara y
micrófono. Permanecerá en una pantalla de espera de CliniQ hasta que el
profesional abra la consulta.

El profesional accederá desde el detalle autenticado de la cita. Django emitirá
un JWT de Jitsi limitado a la sala y al rol correspondiente. El profesional será
moderador y el paciente invitado. Al finalizar, el profesional registrará el
resultado técnico y completará la nota clínica.

## Modelo de datos

### Cambios en `Cita`

Se añadirá `modalidad` con valores `presencial` y `teleconsulta`. El valor por
defecto será `presencial` para no alterar citas existentes.

### `Videoconsulta`

Relación uno a uno con `Cita`. Contendrá como mínimo:

- `room_name`, aleatorio y sin información personal.
- `invite_token_hash` y `invite_expira_en`.
- `estado`: `programada`, `esperando_profesional`, `disponible`, `en_curso`,
  `finalizada`, `fallida` o `cancelada`.
- `consentimiento`, referencia al documento firmado aplicable.
- `identidad_verificada_en` y método de verificación.
- `abierta_por`, `abierta_en`, `iniciada_en` y `finalizada_en`.
- `motivo_finalizacion` e `incidente_tecnico`.

El token de invitación nunca se guardará en texto plano. Se almacenará su hash y
se comparará de forma segura. El token se invalidará cuando se cancele la cita,
cambie el paciente, se revoque el acceso o se deshabilite el módulo. Al
reagendar se rotará y se enviará un enlace nuevo.

### `DeclaracionHabilitacionTelemedicina`

Además de la evidencia descrita anteriormente, tendrá fecha de revocación y
motivo. Los registros no se eliminarán físicamente.

### Configuración de servicios

`Servicio` tendrá `permite_teleconsulta=False`. Activarlo será una decisión
administrativa de la clínica y requerirá una declaración vigente.

## Consentimiento y autorización de datos

Se reutilizará el sistema actual de `Consentimiento`, que ya conserva contenido
congelado, hash, fecha, IP, user-agent, archivo firmado e inmutabilidad. Se
creará una plantilla especial y versionada de consentimiento de telemedicina.

El texto deberá explicar el funcionamiento, alcance, beneficios, limitaciones,
responsabilidades, privacidad, tratamiento de información, protocolo de
contacto, fallas tecnológicas, situaciones de emergencia, posible derivación
presencial, riesgo de pérdida de confidencialidad, revocación y ausencia de
grabación.

El consentimiento de telemedicina será independiente de la autorización de
tratamiento de datos personales. Para el MVP se firmará por cita. La política de
datos y el contrato entre CliniQ y la clínica deberán identificar los roles de
responsable, encargado y proveedor de infraestructura. Si el VPS se aloja fuera
de Colombia, se documentará la transmisión internacional correspondiente.

## Infraestructura Jitsi

Jitsi se desplegará en un VPS dedicado mediante el Docker Compose oficial. Se
fijará una versión estable concreta y no se usará `latest` en producción. La
instalación tendrá dominio propio, certificado TLS válido, IPv4 fija, firewall y
acceso administrativo restringido.

La configuración habilitará autenticación JWT, invitados, lobby y página previa
de dispositivos. Se expondrán únicamente los servicios y puertos necesarios,
incluidos HTTPS y el tráfico UDP del videobridge.

No se instalará Jibri. Se deshabilitarán grabación local, grabación en servidor,
streaming, transcripción, Dropbox, YouTube, compartir videos externos,
invitaciones abiertas e integraciones de terceros. La barra de herramientas no
mostrará controles asociados. Esta configuración no puede impedir que un
participante utilice software externo o un segundo dispositivo para grabar; esa
conducta se cubrirá mediante consentimiento y política de uso.

El VPS no compartirá recursos con Django, PostgreSQL o MinIO. El respaldo
incluirá configuración y secretos cifrados, nunca contenido audiovisual. Se
configurarán monitoreo externo de disponibilidad, alertas de CPU, memoria,
ancho de banda y vencimiento de certificados, revisión mensual de versiones y
un procedimiento de actualización y reversión.

## Integración y autenticación

Django será el único componente autorizado para generar JWT de Jitsi. El
secreto nunca llegará al frontend. Cada JWT indicará sala, rol, identidad
seudónima, emisor, audiencia y expiración corta.

El nombre de sala y la identidad Jitsi no contendrán nombres, documentos,
diagnósticos, servicios ni identificadores clínicos interpretables. Los enlaces
enviados al paciente apuntarán a CliniQ, no directamente a Jitsi.

La ventana inicial de acceso será configurable; como valor base se propone
desde treinta minutos antes hasta noventa minutos después del inicio de la
cita. Abrir el enlace fuera de la ventana mostrará información mínima y no
emitirá un JWT.

La autenticación del paciente combinará enlace privado, OTP al teléfono
registrado y confirmación verbal por el profesional al comenzar. Se registrará
el método y la fecha, no el código OTP ni las respuestas verbales.

## API propuesta

Los nombres definitivos se ajustarán a las convenciones actuales de agenda:

```text
POST /api/v1/agenda/citas/{id}/videoconsulta/abrir/
POST /api/v1/agenda/citas/{id}/videoconsulta/finalizar/
GET  /api/v1/videoconsultas/publica/{token}/
POST /api/v1/videoconsultas/publica/{token}/solicitar-otp/
POST /api/v1/videoconsultas/publica/{token}/verificar-otp/
POST /api/v1/videoconsultas/publica/{token}/acceso/
```

`abrir` comprobará profesional asignado, estado de la cita, módulo activo y
declaración vigente. `acceso` comprobará token, ventana horaria, OTP,
consentimiento y apertura por el profesional antes de devolver el JWT de Jitsi.

Todas las acciones administrativas y clínicas tendrán permisos explícitos y
errores con el contrato estándar `{"error": "mensaje", "code": "ERROR_CODE"}`.

## Frontend

La configuración de clínica incorporará la activación del módulo, declaración
de habilitación, teléfono de contingencia y administración de servicios aptos.
El formulario de cita añadirá la modalidad cuando corresponda.

La ruta pública `/v/[token]` tendrá cuatro estados: validación, verificación de
identidad, consentimiento y espera/consulta. Solo mostrará la información
necesaria para reconocer la cita. La videollamada se integrará con la IFrame API
de Jitsi usando el JWT emitido por Django.

El detalle autenticado de la cita tendrá `Abrir videoconsulta` y `Finalizar`.
Al terminar, el profesional escogerá entre finalización normal, interrupción de
conexión, continuación telefónica, reagendamiento, derivación presencial,
remisión a urgencias o inasistencia.

## Notificaciones

Se reutilizará el flujo actual Django -> n8n -> WhatsApp. El payload de una cita
de teleconsulta incluirá modalidad y enlace seguro de CliniQ. Inicialmente se
enviará con la confirmación y con el recordatorio automático ya existente; no se
creará una segunda programación de recordatorios en esta fase.

El mensaje no incluirá motivo clínico, diagnóstico ni procedimiento sensible.
Indicará que el enlace es personal, que no debe compartirse y que la consulta no
es un servicio de urgencias.

## Historia clínica y trazabilidad

La nota clínica continuará siendo el registro clínico oficial. CliniQ añadirá el
contexto de modalidad, método de verificación, consentimiento, profesional,
inicio, finalización, resultado técnico y limitaciones relevantes de la
atención remota.

El profesional seguirá siendo responsable de documentar valoración,
diagnóstico, conducta, órdenes, recomendaciones y necesidad de atención
presencial. CliniQ almacenará eventos administrativos, pero nunca audio, video,
fotogramas, transcripciones ni contenido de la conversación.

## Contingencias y seguridad del paciente

La clínica configurará un teléfono de contingencia y mantendrá un protocolo
interno. Antes de entrar, el paciente confirmará un teléfono de contacto y su
municipio o ubicación general. La pantalla advertirá que la videoconsulta no
reemplaza los servicios de urgencias.

Si la comunicación no permite una valoración segura, el profesional deberá
registrar si continuó por teléfono, reagendó, indicó atención presencial o
remitió a urgencias. La clínica define los criterios clínicos; CliniQ únicamente
facilita el registro y ejecución del flujo.

## Matriz de cumplimiento técnico

| Requisito | Control en CliniQ | Evidencia |
|---|---|---|
| Habilitación del prestador | Declaración administrativa obligatoria | Usuario, fecha, versión, IP y hash |
| Consentimiento de telemedicina | Sistema actual de consentimientos | Documento, hash, firma y fecha |
| Autorización de datos | Documento separado | Registro de aceptación |
| Identidad | Enlace privado, OTP y confirmación verbal | Método y fecha |
| Confidencialidad | TLS, JWT, lobby y salas aleatorias | Configuración y pruebas |
| Ausencia de grabación | Sin Jibri y controles deshabilitados | Configuración y prueba funcional |
| Registro de atención | Vinculación con cita y nota clínica | Historia clínica |
| Falla tecnológica | Flujo de contingencia | Resultado registrado |
| Auditoría | Eventos de apertura, acceso y cierre | Log administrativo |
| Seguridad operativa | Parches, firewall, respaldo y monitoreo | Bitácora y alertas |
| Revocación | Invalidación del consentimiento y enlace | Estado y fecha |
| Minimización | Sin datos clínicos en Jitsi o logs | Revisión técnica |

## Pruebas y criterios de aceptación

Las pruebas backend cubrirán creación, reagendamiento, cancelación, rotación y
expiración de invitaciones, OTP incorrecto o agotado, consentimiento pendiente,
profesional equivocado, declaración vencida, servicio no apto y permisos.

Las pruebas de seguridad comprobarán que un token no funcione para otra cita,
los JWT expiren, el paciente no pueda ser moderador, no existan salas públicas,
los secretos no aparezcan en respuestas o logs y ninguna función de grabación,
streaming o transcripción esté disponible.

Las pruebas end-to-end cubrirán Chrome, Edge, Firefox y Safari en escritorio,
Chrome Android y Safari iOS. Se probarán permiso denegado de cámara, cambio de
dispositivo, desconexión y reconexión, red lenta, llegada anticipada, ausencia
del profesional y finalización desde ambos lados.

Antes del piloto se ejecutará una prueba de concurrencia en el VPS seleccionado.
No se prometerá una capacidad comercial hasta obtener resultados medidos. El
criterio de aceptación legal-operativo será que estén aprobados el texto de la
declaración, consentimiento, política de datos, contrato con infraestructura y
protocolo de contingencia.

## Orden de implementación

- [ ] Aprobar alcance, matriz de responsabilidades y textos sujetos a revisión jurídica.
- [ ] Implementar declaración de habilitación y activación del módulo.
- [ ] Añadir modalidad de cita y servicios aptos para teleconsulta.
- [ ] Crear modelo, migraciones, permisos y API de `Videoconsulta`.
- [ ] Desplegar Jitsi de staging con grabación y terceros deshabilitados.
- [ ] Implementar generación de JWT y acceso del profesional.
- [ ] Implementar enlace público, OTP y pantalla de espera del paciente.
- [ ] Crear y conectar el consentimiento de telemedicina.
- [ ] Incorporar el enlace al flujo actual de WhatsApp.
- [ ] Integrar el resultado de la sesión con la historia clínica.
- [ ] Implementar contingencias y registro de incidentes.
- [ ] Completar pruebas funcionales, de seguridad, navegadores y carga.
- [ ] Ejecutar piloto limitado y revisar métricas sin contenido clínico.
- [ ] Aprobar go-live y documentar mantenimiento, soporte y reversión.

## Entregables de salida

El proyecto se considerará listo cuando exista una instalación reproducible de
Jitsi, el acceso esté cerrado mediante JWT y OTP, la grabación sea imposible
desde la interfaz y no exista Jibri, las clínicas no puedan activar el módulo
sin declarar sus habilitaciones, el consentimiento quede incorporado a la
historia clínica, las contingencias puedan registrarse y las pruebas de
seguridad y compatibilidad hayan sido aprobadas.

La documentación final incluirá manual administrativo, guía del profesional,
instrucciones para el paciente, diagrama de flujo de datos, configuración segura
de Jitsi, procedimiento de actualización, protocolo de incidentes y evidencia de
las pruebas realizadas.
