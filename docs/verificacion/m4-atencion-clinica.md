# M4 — Atención clínica

**Estado:** Revisado (10/10/2026) · **Sigue:** M5 · **Viene de:** M3

**Alcance:**
- *Frontend:* `atenciones/*`, `consentimientos`, `firma-movil`, `firmar-consentimiento`; los componentes de `atenciones`, `historia`, `consentimientos`, `firma`, `protocolos` y `obesidad`; `lib/api/historiaClinica.ts`, `consentimientos.ts`, `firmaProfesional.ts`, `protocolos.ts` y `obesidad.ts`.
- *Backend:* `apps/historia_clinica` (incluye el webhook de Documenso), `apps/consentimientos`, `apps/protocolos` y `apps/obesidad`.

**Antes de corregir:**
- M4-01, M4-04 y M4-05 tienen **impacto legal**: permiten un consentimiento "firmado" sin firma real, y la firma del paciente no queda en el PDF.
- M4-02 deja a cualquier rol personalizado que atiende sin poder documentar.

## Hallazgos

**✅ M4-01 · Crítico · permisos (legal)** · confirmado
- **Dónde:** `backend/apps/historia_clinica/serializers.py:282`; `views.py:655`.
- **Qué ve el usuario:** nada en pantalla. Pero por API, quien tiene `historia.consentimientos.gestionar` (Recepción lo tiene por defecto) puede:
  - hacer `PATCH {"firmado": true}` y **marcar el consentimiento como firmado sin firma**;
  - reemplazar el PDF firmado;
  - o pasarlo a no firmado y después borrarlo.
- **Arreglo:** dejar `firmado`, `fecha_firma`, `archivo`, `paciente` y `cita` como solo lectura, o quitar `patch`.

**✅ M4-02 · Crítico · roles personalizados** · confirmado
- **Dónde:** `permissions_catalog.py:676`; `historia_clinica/views.py:203`; `atenciones/[citaId]/page.tsx:112,139,590-632`.
- **Qué ve el usuario:** una Recepción o un rol "Esteticista" con "atiende pacientes", pero sin "Ver historia", inicia la atención y **todas las pestañas salen en blanco**. Al completar siempre sale "Nota sin contenido", así que no puede documentar.
- **Causa:** `PERMISOS_ATIENDE_PACIENTES` no incluye `historia.ver`, y el error se silencia con `.catch(() => {})`.
- **Arreglo:** agregar `historia.ver` y `pacientes.antecedentes.ver` a esos permisos, y mostrar un error en lugar de pestañas vacías.

**✅ M4-03 · Alto · parámetros** · confirmado
- **Dónde:** `lib/api/consentimientos.ts:70-72`; `consentimientos/page.tsx:43`.
- **Qué ve el usuario:** pulsa "Revocar", confirma, y **no pasa nada**.
- **Causa:** el frontend no envía `motivo_revocacion`, el backend responde 400 y no hay `onError`.
- **Arreglo:** pedir el motivo en un diálogo y mostrar el error si falla.

**✅ M4-04 · Alto · faltante (legal)** · confirmado
- **Dónde:** `firmar-consentimiento/[token]/page.tsx`; `consentimientos/views.py:194`; `services.py:531`.
- **Qué ve el usuario:** el paciente dibuja su firma y ve "firma registrada", pero **el PDF no tiene la firma**.
- **Causa:** el backend ignora el campo `firma`.
- **Arreglo:** guardar la firma, validarla e incrustarla en el PDF.

**✅ M4-05 · Alto · permisos** · confirmado
- **Dónde:** `historia_clinica/views.py:797` (`completar_firma`).
- **Qué ve el usuario:** nada. El consentimiento queda "firmado" porque así lo dice el navegador.
- **Causa:** no se consulta a Documenso antes de marcarlo.
- **Arreglo:** marcarlo solo si `verificar_firma_consentimiento_en_documenso` lo confirma.

**✅ M4-06 · Alto · pérdida de datos** · confirmado
- **Dónde:** `components/historia/TabMotivoConsulta.tsx:32`; `TabPlanManejo.tsx:31`.
- **Qué ve el usuario:**
  - escribe el motivo, cambia a la pestaña Fotos y al volver **el texto ya no está**;
  - si Guardar falla, no aparece ningún aviso;
  - después de guardar, al volver a la pestaña ve el texto viejo.
- **Causa:** las pestañas inactivas se desmontan, no hay autoguardado, falta `onError` y no se invalidan las notas.
- **Arreglo:** autoguardado con debounce, o `forceMount`, o un aviso de cambios sin guardar; además `onError` e invalidar las notas.

**✅ M4-07 · Alto · previsible** · probable
- **Dónde:** `TabFotos.tsx:56`; `atenciones/[citaId]/page.tsx:137-139`.
- **Qué ve el usuario:** en la primera entrada a una atención, las fotos **se guardan en la nota de la visita anterior**. Si solo se suben fotos, el sistema dice "Nota sin contenido".
- **Causa:** se usa `notas[0]` en vez de `notaId`, y la caché no se refresca después de crear el borrador.

**✅ M4-08 · Alto · Documenso caído** · código confirmado; impacto probable
- **Dónde:** `backend/apps/agenda/serializers.py:23-38` (`_archivo_url`).
- **Qué ve el usuario:** si Documenso está lento, **la Agenda, Atenciones y el asistente se quedan cargando**.
- **Causa:** al serializar cada cita se descarga en línea el PDF de cada consentimiento firmado que no tiene archivo, con esperas de 10 a 30 segundos.
- **Arreglo:** sacar esa descarga del serializer y hacerla en una tarea (`refrescar_pdfs_firmados`) o bajo demanda.

**✅ M4-09 · Alto · faltante** · confirmado
- **Dónde:** `historia_clinica/views.py:882` (`reintentar_pdf` sin uso); `pacientes/views.py:180-210`.
- **Qué ve el usuario:** un consentimiento firmado cuyo PDF falló aparece sin enlace, sin aviso y sin forma de reintentar.
- **Arreglo:** mostrar "PDF pendiente · Reintentar".

**✅ M4-10 · Alto · permisos (multiclínica)** · confirmado
- **Dónde:** `backend/apps/obesidad/views.py:103`; `obesidad/serializers.py`.
- **Qué ve el usuario:** cualquier usuario autenticado, incluida Recepción sin permisos clínicos, puede crear, editar y borrar signos vitales y mediciones. Además puede hacerlo **sobre pacientes de otra clínica**.
- **Arreglo:** exigir `historia.notas.crear` y `historia.ver`, validar la clínica y dejar `tomado_por` e `indicado_por` como solo lectura.

**✅ M4-11 · Medio · permisos (multiclínica)** · confirmado
- **Dónde:** `historia_clinica/serializers.py:30-49`; `views.py:546`.
- **Problema:** se pueden subir fotos a la nota de otra clínica, y no hay límite de tamaño ni de tipo de archivo.

**✅ M4-12 · Medio · roles personalizados** · confirmado (igual que M0-22)
- **Dónde:** `historia_clinica/serializers.py:147`; `views.py:546`; `protocolos/views.py:115`.
- **Problema:** la regla "solo el profesional de la cita" se aplica únicamente con `rol == "profesional"`.
- **Arreglo:** basar la regla en `es_profesional` o en un permiso.

**✅ M4-13 · Medio · roles personalizados** · confirmado
- **Dónde:** `protocolos/views.py:110-116`; `protocolos/services.py:496`.
- **Qué ve el usuario:** si un admin o un rol personalizado completa una sesión de tratamiento, **la sesión queda sin profesional** y se borra el que tenía. Esto afecta reportes y comisiones.
- **Arreglo:** usar `cita.profesional` como respaldo y no sobrescribir con `None`.

**✅ M4-14 · Medio · llamada sin resolver** · confirmado
- **Dónde:** `atenciones/[citaId]/page.tsx:173,235`.
- **Problema:**
  - si falla completar la nota, igual se cierra la cita y la nota queda en borrador;
  - "descartar" no tiene `onError`.

**✅ M4-15 · Medio · faltante** · confirmado
- **Dónde:** `atenciones/[citaId]/page.tsx:401`; `agenda/views.py:313`.
- **Qué ve el usuario:** en una cita "Confirmada" aparece "Iniciar atención", y siempre falla.
- **Arreglo:** mostrar el botón solo cuando la cita está `en_espera`.

**✅ M4-16 · Medio · previsible** · confirmado
- **Dónde:** `atenciones/[citaId]/page.tsx:675-685`.
- **Qué ve el usuario:** "Descartar" dice "los datos se perderán, vuelve a Confirmada", pero la cita pasa a "en espera" y la nota, las fotos y los insumos se quedan. Si cancela, **el stock de insumos no se devuelve**.
- **Arreglo:** corregir el texto y revertir los consumos al cancelar, o advertirlo.

**✅ M4-17 · Medio · llamada sin resolver** · confirmado
- **Dónde:** `TabOrdenesMedicas.tsx:49,65,86`; `TabExamenes.tsx:48,69`; `TabZonas.tsx:405-426`; `pacientes/[id]/historia/page.tsx:85`.
- **Qué ve el usuario:** crear o enviar una orden, descargar PDFs, crear o eliminar exámenes y marcar zonas **fallan sin ningún mensaje**.

**✅ M4-18 · Medio · previsible** · confirmado
- **Dónde:** webhook `historia_clinica/webhooks.py`.
- **Qué ve el usuario:** el paciente rechaza el consentimiento desde el enlace, pero la pantalla sigue en "Esperando firma".
- **Causa:** se ignora `DOCUMENT_DECLINED` para el consentimiento informado.
- **Arreglo:** guardar y mostrar el estado "rechazado".

**✅ M4-19 · Medio · carga** · confirmado
- **Dónde:** `FirmaProfesionalModal.tsx:156`.
- **Qué ve el usuario:** si falla la carga, ve un spinner infinito. `guardarTp` no tiene `onError`.

**✅ M4-20 · Medio · previsible** · confirmado
- **Dónde:** `consentimientos/page.tsx:48`.
- **Qué ve el usuario:** solo los primeros 25 consentimientos. El total y las pestañas Pendientes/Firmados se calculan sobre esos 25.

**✅ M4-21 · Medio · errores** · confirmado / probable
- **Dónde:** `ElegirMetodoFirma.tsx`; `ConsentimientoFirmaContent.tsx`.
- **Qué ve el usuario:** un 403 o un 400 aparece como "No se pudo abrir la firma". "Reintentar" vuelve a usar un token que quizá ya venció.
- **Arreglo:** un helper común de mensajes y regenerar el sobre de firma.

**✅ M4-22 · Medio · previsible** · probable
- **Dónde:** `firmar-consentimiento/[token]/page.tsx:149`.
- **Qué ve el usuario:** el paciente ve etiquetas HTML crudas (`<p>`, `<strong>`).
- **Arreglo:** mostrar el HTML saneado con DOMPurify.

**✅ M4-23 · Bajo · errores** · confirmado
- **Dónde:** `firma-movil/[token]/page.tsx:43`.
- **Qué ve el usuario:** si el envío falla por la red, ve "Este enlace ya no sirve" y no puede reintentar.

**✅ M4-24 · Bajo · previsible** · confirmado
- **Dónde:** `consentimientos/serializers.py:124,127,138`.
- **Problema:** una plantilla, cita o cotización inexistente produce un 500.

**✅ M4-25 · Bajo · privacidad** · confirmado
- **Dónde:** `consentimientos/views.py` (`FirmarConsentimientoPublicoView.get`, revocar).
- **Problema:**
  - el GET público expone el `signing_token`, la IP y el user agent, aun después de firmado;
  - revocar no valida el estado ni deja auditoría.

**✅ M4-26 · Bajo · previsible** · confirmado
- **Dónde:** `historiaClinica.ts` (exámenes, órdenes, consumos); `obesidad.ts`.
- **Qué ve el usuario:** desde el registro 26, los más viejos dejan de verse sin aviso (T-01).

**✅ M4-27 · Bajo · faltante** · confirmado
- **Problemas:**
  - *Rutas sin pantalla:* `evolucion-signos`, `ordenes-medicas/{id}`, `protocolos/sesiones/{id}` y `configuracion/signos-vitales`.
  - *Componentes huérfanos:* `ProtocoloPanelAtencion`, `TratamientoCard`, `CheckinSheet`, `ConsentimientosSesionCheck`, `AntecedentesSheet` y `ConsentimientoFirmaSheet`.
  - *Campos faltantes:* `NotaClinica.servicio_nombre` y `anamnesis` se esperan en el frontend, pero el serializer no los devuelve.
  - *Archivos huérfanos:* el webhook del consentimiento informado vuelve a guardar el PDF en cada reintento.

**✅ M4-28 · Bajo · permisos** · confirmado
- **Dónde:** `protocolos/views.py` (listado de tratamientos, consentimientos de sesión, check-in, OTP).
- **Problema:** solo exige `IsAuthenticated`. Además, `marcar_inasistencia` puede pisar una sesión ya completada.

## Pruebas no técnicas

Usuarios: un Profesional; Recepción con "atiende pacientes"; un rol personalizado "Esteticista" con "atiende pacientes" y sin "Ver historia"; y un Admin.

| # | Pasos | Resultado esperado | Valida |
|---|---|---|---|
| 1 | Como "Esteticista", iniciar una atención propia, escribir el motivo y completar. | Puede documentar y completar. | M4-02 |
| 2 | Repetir con Recepción + "atiende pacientes". | Igual que la anterior. | M4-02 |
| 3 | Consentimientos → revocar uno firmado. | Pide el motivo y queda en "Revocados". | M4-03 |
| 4 | Abrir un enlace `/firmar-consentimiento/...`, dibujar la firma y descargar el PDF. | La firma aparece en el PDF. | M4-04 |
| 5 | En ese mismo enlace, revisar el texto. | No hay etiquetas `<p>`. | M4-22 |
| 6 | En la atención: escribir el motivo sin guardar, ir a Fotos y volver. | El texto sigue ahí, o ya se guardó. | M4-06 |
| 7 | Guardar el motivo, cambiar de pestaña y volver. | Se ve lo guardado. | M4-06 |
| 8 | Primera atención de un paciente recurrente: subir solo una foto y completar. | La foto queda en la visita de hoy y deja completar. | M4-07 |
| 9 | Con Documenso caído, abrir Agenda y Atenciones. | Cargan en menos de 3 s. | M4-08 |
| 10 | Paciente con un consentimiento firmado sin PDF → Consentimientos. | Aparece "PDF pendiente · Reintentar". | M4-09 |
| 11 | Enviar el consentimiento por WhatsApp y rechazarlo desde el celular. | La pantalla muestra "El paciente rechazó". | M4-18 |
| 12 | Abrir la atención de una cita Confirmada. | No aparece "Iniciar atención", o funciona. | M4-15 |
| 13 | Iniciar la atención, consumir un insumo y luego cancelar la cita. | El stock se devuelve, o el sistema avisa. | M4-16 |
| 14 | Crear una orden con una plantilla no editable, cambiando su texto. | Mensaje claro. | M4-17 |
| 15 | Descargar el PDF de la historia con el servidor caído. | Mensaje de error. | M4-17 |
| 16 | Como admin, completar una sesión de tratamiento de una cita del Dr. X. | La sesión queda a nombre del Dr. X. | M4-13 |
| 17 | En la firma por QR desde el celular, cortar la red y pulsar Guardar. | "No se pudo enviar, reintenta". | M4-23 |
| 18 | Abrir el modal de firma del profesional sin permiso. | Mensaje de error, no un spinner infinito. | M4-19 |

## Pruebas técnicas

| # | Verificación | Esperado | Valida |
|---|---|---|---|
| 1 | `PATCH /api/v1/historia-clinica/consentimientos/{id}/ {"firmado":true,"fecha_firma":"2026-10-10"}` como Recepción. | 400/403 o el campo se ignora (hoy 200). | M4-01 |
| 2 | `PATCH {"firmado":false}` y después `DELETE`, sobre un consentimiento firmado. | Ambos rechazados. | M4-01 |
| 3 | `PATCH /consentimientos/{id}/completar_firma/` sin firma real en Documenso. | 400/409 (hoy 200). | M4-05 |
| 4 | `POST /api/v1/consentimientos/{id}/revocar/` sin cuerpo y con `{"motivo_revocacion":"x"}`. | 400 y 200. | M4-03 |
| 5 | `GET /historia-clinica/historias/?paciente=…` con un rol personalizado + `es_profesional`, sin `historia.ver`. | 200 (hoy 403). | M4-02 |
| 6 | `POST /api/v1/obesidad/mediciones/` como Recepción. | 403 (hoy 201). | M4-10 |
| 7 | `POST /api/v1/obesidad/mediciones/` con un paciente de otra clínica. | 400. | M4-10 |
| 8 | `POST /historia-clinica/fotos/` con una nota de otra clínica. | 400. | M4-11 |
| 9 | `POST /protocolos/sesiones/{id}/marcar_completada/` como admin. | `profesional` no queda en null. | M4-13 |
| 10 | `POST /api/v1/consentimientos/generar/` con un `plantilla_id` inexistente. | 400 (hoy 500). | M4-24 |
| 11 | `GET /api/v1/agenda/citas/?page_size=50` con Documenso apuntando a un host que no responde. | Menos de 1 s. | M4-08 |
| 12 | Webhook con `DOCUMENT_DECLINED` de un ConsentimientoInformado. | Queda registrado como rechazado. | M4-18 |
| 13 | `GET /api/v1/consentimientos/firmar/{token}/` de un consentimiento ya firmado. | Sin `documenso_signing_token` ni `firma_ip`. | M4-25 |

## Notas

- **Alcance por sede:** la historia, las notas y los consentimientos solo se filtran por clínica. Un profesional de la sede A ve historias de toda la clínica. Hay que confirmar si es una decisión de negocio.
- **Firma del profesional:** solo la puede hacer el profesional asignado a la cita. Si falta, nadie puede iniciar la atención sin reasignarla, y el mensaje debería sugerir reasignar.
- **Completar la cita:** el backend no exige una nota completada; esa regla vive solo en el frontend.
- **Datos personales en logs:** `historia_clinica/views.py` (create de consentimiento) y `agenda/views.py` (`cambiar_estado`) escriben `request.data` con nivel warning.
- **Sin guard:** `atenciones/[citaId]/page.tsx` no tiene `RoleGuard`.
