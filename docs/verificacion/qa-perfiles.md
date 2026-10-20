# QA por perfiles (14/10/2026)

Prueba simulada, al estilo QA, con 11 usuarios de distintos perfiles en Beauty Clinic (2 sedes). Busca:
- fallas silenciosas (pantallas que cargan vacías o en cero porque una consulta respondió 403);
- botones que se muestran a quien no puede usarlos;
- permisos opuestos (puede hacer A, pero A necesita B y no tiene B);
- listas incompletas por sede o por "solo lo propio".

## Perfiles

| Clave | Rol | Atiende | Sedes |
|---|---|---|---|
| admin | Administrador (sistema) | no | Principal + H4 |
| profesional | Profesional (sistema) | sí | Principal |
| recepcion | Recepción (sistema) | no | Principal |
| recepcion_atiende | Recepción (sistema) + check "atiende pacientes" | sí | H4 |
| rec_basica | Personalizado: agendar, pacientes, cobrar, ver catálogo | no | Principal |
| asesora | Personalizado: ver agenda, ver pacientes, cotizar, seguimiento, toda la sede | no | H4 |
| cajera | Personalizado: cobrar, pagos de cartera, cierres de caja, gastos (sin ver pacientes) | no | Principal |
| esteticista | Personalizado: ver agenda, ver pacientes | sí | Principal |
| medica_ventas | Personalizado: agendar, pacientes, historia, cotizar, ver cobros (solo lo propio) | sí | H4 |
| solo_agenda | Personalizado: solo ver la agenda | no | Principal |
| gerencia | Personalizado: reportes, ver cobros, cartera, cotizaciones, gastos, cierres, pacientes, agenda | no | Principal + H4 |

## Cómo se probó

Tres capas, con scripts repetibles en `backend/scripts/auditoria/`:

1. **Matriz de API** (`qa_matriz_api.py`): 135 endpoints de lectura × 11 perfiles. Para cada uno guarda el estado HTTP y cuántos registros ve. Todo corre en una transacción que se deshace.
2. **Escenarios de escritura** (`qa_escenarios.py`): crear paciente, cita (en su sede y en otra), confirmar, nota clínica (propia y ajena), cotización (normal, bajo precio con y sin autorización), editar cotización ajena, cobro con pago, abrir caja, gasto, interesado y el asistente de llegada. Compara el resultado con lo que dicen los permisos. También se deshace.
3. **Recorrido en navegador** (`qa_recorrido_roles.mjs` + `qa_analizar_recorrido.py`): Playwright entra con cada perfil a 70 pantallas. Registra redirecciones, respuestas 4xx/5xx, errores de consola, avisos y textos de "sin permiso". Deja capturas en `salida/qa_capturas/`.

El recorrido se hizo sobre un build de producción aparte (puerto 3100). El servidor de desarrollo recompila cada ~5 s por el watcher con polling sobre Google Drive y tardaba ~2 min por pantalla.

## Lo que está bien

- **El backend no deja pasar nada indebido.** En los 11 perfiles, toda escritura sin permiso, en otra sede o sobre lo de otro profesional se rechazó con 403/404 y un mensaje claro, incluida la regla de precio sin autorización.
- **El alcance por sede es consistente** en agenda, cotizaciones, ventas, cobros, cartera, seguimiento y reportes. Un usuario asignado a dos sedes ve lo mismo que el admin.
- **Los selectores base responden a todos** (sedes, formas de pago, procedimientos, tratamientos, profesionales, categorías de gasto). Las formas de pago y las sedes ya no se vacían por falta de un "ver".
- **Las pantallas a las que se entra por URL sin permiso** casi siempre muestran "Tu rol no tiene permiso para hacer esto. Pídeselo al administrador".

## Estado de las correcciones (14/10/2026, sin commit)

| Hallazgo | Decisión / corrección | Estado |
|---|---|---|
| QA-01 | El storage de archivos devuelve la URL vacía y deja el error en el log en vez de tumbar la respuesta (`ArchivosS3Storage`). Falta `MINIO_ENDPOINT` en el `.env` local (no se tocó). | ✅ código |
| QA-02 | Check-in, OTP, foto y registro de asistencia: los hace quien edita citas **o quien atiende esa cita**. En el paso de Pago, quien no cobra ve "El cobro lo registra recepción" y sigue. | ✅ |
| QA-03 | **Decisión:** la puesta en marcha (ver, cargar, botón y banner) es para quien crea cotizaciones. Revertir sigue pidiendo `migracion.gestionar`, y el nombre de esa capacidad ahora lo dice. | ✅ |
| QA-04 | **Decisión:** registrar gastos permite abrir la caja (en Caja y desde "Registrar gasto"). Cerrarla sigue siendo de quien hace cierres. | ✅ |
| QA-05 | Cada botón aparece solo con su permiso: Registrar pago (ingresos y cartera), Crear paciente, Agendar desde Seguimiento, Agendar cita y accesos rápidos del dashboard, agenda vacía. | ✅ |
| QA-06 | Quien cotiza lista insumos. Quien crea citas ve los paquetes vendidos del paciente y sus sesiones, aunque los haya vendido otra persona. Quien atiende sin "ver agenda" lista sus propias citas. El dashboard oculta las tarjetas de citas o cartera sin su permiso. | ✅ |
| QA-07 | **Decisión:** las citas de toda la sede las ve quien puede agendar (`agenda.citas.crear`; Recepción lo trae por defecto, aunque también atienda). Quien atiende sin ese permiso ve solo su agenda: listado de la agenda, citas de hoy y aviso de sin confirmar en el backend, Agenda sin selector de profesionales y dashboard "Mis citas de hoy". **Las pantallas del paciente (ficha, atención, asistencias) y el detalle de una cita muestran todo**; las acciones sobre citas ajenas las frenan sus permisos. Quien no atiende y tiene "Ver la agenda" (gerencia, asesora) ve la de toda la sede. | ✅ |
| QA-08 | Sin agenda ni pacientes aterriza en Ingresos, Cartera, Seguimiento o Cotizaciones. La pantalla sin reportes ofrece esos accesos. | ✅ |
| QA-09 | **Decisión:** los antecedentes se leen igual que la historia (con el permiso); editarlos sigue siendo solo en pacientes que ha atendido. | ✅ |
| QA-13 | Corregido con AT-12 de [revision-flujo-critico.md](revision-flujo-critico.md): la historia se crea si falta, y la migración `historia_clinica.0020` creó las que faltaban. | ✅ |
| QA-10 | `RoleGuard` en el layout de Seguimiento, Cotizaciones, Ventas, Cartera y el detalle de Atención: sin el permiso se vuelve al inicio, también por URL. | ✅ |
| QA-11 | "Resultados" sale en el menú solo con Resumen, Egresos o Caja; con solo "ver cobros" queda "Ingresos". | ✅ |
| QA-12 | Si la invitación por correo falla, el colaborador se crea igual y se avisa para reenviarla desde la lista. | ✅ |

Pruebas: `apps/core/tests/test_qa_perfiles.py`.

## Hallazgos

Severidad: **Alta** (bloquea trabajo o expone datos), **Media** (confunde o lleva a un error evitable), **Baja** (pulido).

### QA-01 · Alta · Un archivo sin URL tumba el listado de Pacientes y la configuración de la clínica
- **Qué pasa:** `/pacientes/` y el detalle del paciente responden 500 si algún paciente tiene foto de control. `/clinicas/clinicas/{id}/` también responde 500 si la clínica tiene logo. Afecta a todos los perfiles: Pacientes muestra "Error al cargar", y Configuración > Datos, Agenda, Recepción y Biometría fallan.
- **Causa:** en local falta `MINIO_ENDPOINT` en el `.env` (solo están las `AWS_*`), así que el storage arma la URL con endpoint vacío (`ValueError: Invalid endpoint`). En el código, `get_foto_control_url` (`backend/apps/pacientes/serializers.py:175`) no captura el error, y una sola URL rompe la lista completa.
- **Propuesta:** agregar `MINIO_ENDPOINT` al `.env` local. En el código, que la URL de foto o logo devuelva `None` si falla, en vez de tumbar la respuesta.

### QA-02 · Alta · El asistente de llegada se corta para quien atiende
- **Perfiles:** profesional, esteticista (y cualquier rol que atiende sin "editar citas").
- **Qué pasa:** en su propia cita pueden marcar "Llegó" y pasar a "en espera". Los pasos del asistente responden 403:
  - check-in, OTP y foto;
  - registro y firma de asistencia;
  - Pago (exige `cobros.crear`; afecta a medica_ventas).
- **Causa:** `backend/apps/agenda/views.py:163-166` exige `agenda.citas.editar` para esos pasos. El asistente se muestra con `puedeCambiarEstado` (`CitaDetailSheet.tsx:198-212`), que incluye al profesional de la cita.
- **Propuesta:**
  - Permitir esos pasos a quien atiende su propia cita, con la misma regla que `CanChangeAppointmentState`.
  - En el asistente, saltar o explicar el paso de Pago cuando el usuario no puede cobrar.

### QA-03 · Alta (decisión) · Puesta en marcha expone pagos y deudas a cualquier usuario
- **Perfiles:** todos, por ejemplo solo_agenda y cajera, mientras el modo puesta en marcha esté activo.
- **Qué pasa:**
  - `/puesta-en-marcha` no tiene guarda.
  - Lista las cargas con nombre del paciente, lo pagado y la deuda.
  - Muestra "Revertir"; el backend lo niega, pero el botón aparece.
  - "Empezar" crea pacientes, cotizaciones y pagos sin `pacientes.crear` ni `cobros.crear`.
- **Causa:** `backend/apps/migracion/views.py:15-26` abre la carga a todo usuario de la clínica, por decisión documentada. Solo revertir pide `migracion.gestionar`.
- **Propuesta (decidir):**
  - Exigir `migracion.gestionar` también para ver y cargar; o al menos ocultar los montos y el botón Revertir a quien no lo tiene.
  - La capacidad "Usar el asistente de puesta en marcha" hoy solo controla revertir, así que su nombre engaña.

### QA-04 · Media · Recepción y Profesional pueden registrar gastos, pero no abrir la caja
- **Qué pasa:** por defecto tienen `caja.gastos.registrar`, pero no `caja.cierre.realizar`. Con la caja cerrada, el gasto responde "La caja está cerrada. Ábrela para registrar gastos." (`backend/apps/caja/views.py:311`), algo que no pueden hacer.
- **Propuesta (decidir):** cambiar el mensaje a "Pídele a quien abre la caja que la abra". La otra opción es dejar que quien registra gastos también pueda abrirla.

### QA-05 · Media · Botones visibles a quien no puede usarlos (terminan en 403)

| Botón | Dónde | Falta | Perfil afectado |
|---|---|---|---|
| Registrar pago (ingreso) | `ingresos/page.tsx:231`: depende solo del estado | `cobros.registrar_pago` | gerencia, medica_ventas |
| Registrar pago / Cobrar (cuota) | `cartera/[id]/page.tsx:125-131` y `onCobrar` | `cartera.registrar_pago` | gerencia |
| Crear paciente desde Nueva cita | `NuevaCitaModal.tsx:439` | `pacientes.crear` | perfiles sin crear pacientes |
| Crear paciente desde Cotización | `CotizacionForm.tsx:1466` | `pacientes.crear` | asesora |
| Agendar (desde Seguimiento) | `ParaHoyLista.tsx:98`, `seguimiento/page.tsx:379` | `agenda.citas.crear` (y `pacientes.crear` para interesados) | asesora |
| Agendar cita (tarjeta Citas de hoy) | `CitasHoyCard` (`accionVacia`) | `agenda.citas.crear` | profesional, gerencia |
| Accesos rápidos "Nueva cita", "Nuevo paciente" | `dashboard/page.tsx` ~1110 | `agenda.citas.crear`, `pacientes.crear` | profesional, gerencia |
| "Agendar una cita" (agenda vacía) | `agenda/page.tsx` | `agenda.citas.crear` | asesora, solo_agenda, esteticista |
| Banner "Trae tus pacientes… Empezar" | dashboard | ver QA-03 | todos |

### QA-06 · Media · Selectores que quedan vacíos o dicen algo falso
- **Cotización > obsequio "Producto del inventario"** (`ObsequiosCotizacionSection.tsx:116`):
  - `/inventario/insumos/` exige `inventario.ver` o `inventario.consumo.registrar` (`inventario/views.py:22`).
  - Quien solo cotiza (asesora) ve "No se pudo cargar el inventario".
  - Es un "ver" que rompe un selector, contra la regla acordada.
- **Nueva cita > "Sesión de cotización"** (`NuevaCitaModal.tsx:176,453`):
  - `/cotizaciones/?paciente=` exige `cotizaciones.ver`.
  - Quien agenda sin ver cotizaciones (rec_basica) recibe "El paciente no tiene cotizaciones aceptadas" y no puede agendar sesiones de un paquete vendido.
- **Atenciones** para un rol que atiende sin "Ver la agenda": la lista llama a `/agenda/citas/` y queda vacía sin aviso. Es probable por el código; ningún perfil QA tenía esa combinación.
- **Dashboard** con reportes, pero sin `agenda.citas.ver` o `cartera.ver` (`dashboard/page.tsx:739,772,780`): las tarjetas muestran 0 en vez de ocultarse.

### QA-07 · Media · El dashboard del profesional nunca muestra "Mis citas de hoy"
- `esSoloProfesional` (`dashboard/page.tsx:635`) exige no tener `reportes.ver_operativos`, pero `DashboardContent` solo se muestra a quien sí lo tiene. Esa rama nunca se ejecuta.
- Resultado: el Profesional de sistema ve las citas de toda la sede. Un rol que atiende sin reportes ve la pantalla de accesos.
- **Propuesta (decidir):** quien atiende y no es admin ve "Mis citas de hoy", aunque tenga reportes.

### QA-08 · Media · La cajera aterriza en un dashboard vacío
- Sin agenda, pacientes ni reportes, `defaultRoute` la manda a `/dashboard`. Ahí `DashboardSinReportes` solo ofrece Agenda, Atenciones y Pacientes, así que ve "Usa el menú para ir a las secciones de tu rol."
- **Propuesta:** que aterrice en Ingresos o Cartera, y que los accesos incluyan Ingresos, Cartera, Cotizaciones y Seguimiento según los permisos.

### QA-09 · Media (decisión) · Quien atiende lee toda la historia, pero no los antecedentes
- Con `historia.ver` ve las notas de cualquier paciente. `/pacientes/{id}/antecedentes/` en cambio responde 403 si no lo ha atendido (`pacientes/views.py:155`).
- La pestaña Antecedentes queda en blanco en la historia y en la atención de un paciente nuevo para él.
- **Decidir:** aplicar la misma regla a las dos, o dejar ver los antecedentes con `historia.ver`.

### QA-10 · Baja · Pantallas sin guarda de ruta
- Por URL se entra a `/seguimiento`, `/cotizaciones/*`, `/ventas/*`, `/cartera/*`, `/atenciones/[citaId]` y `/puesta-en-marcha` sin el permiso.
- En casi todas el error es claro. El detalle de paciente para la cajera dice "Ocurrió un error".
- **Propuesta:** un `RoleGuard` uniforme.

### QA-11 · Baja · "Resultados" en el menú duplica "Ingresos"
- Con solo `cobros.ver` (rec_basica, medica_ventas), Resultados redirige a Ingresos: dos entradas del menú llevan a la misma pantalla.

### QA-12 · Baja · Crear un colaborador falla entero si no se puede enviar la invitación
- Sin correo configurado, `POST /colaboradores/` responde 400 "El canal de email no esta configurado" y no crea nada (`colaboradores/serializers.py:471`). En producción hay correo, pero una caída del SMTP impediría dar de alta personal.
- **Propuesta:** crear el colaborador y avisar que la invitación no salió, con la opción de reenviarla.

### QA-13 · Baja · Datos viejos sin historia clínica
- 2 de 14 pacientes de Beauty Clinic no tienen historia; se crearon antes o por fuera de la señal que la crea.
- La app los muestra sin romperse, pero conviene una migración de datos que la cree.

## Cómo repetir

```bash
docker exec cliniq_backend python scripts/auditoria/qa_roles_seed.py
docker exec cliniq_backend python scripts/auditoria/qa_matriz_api.py
docker exec cliniq_backend python scripts/auditoria/qa_escenarios.py
PLAYWRIGHT_DIR=<e2e/node_modules> FRONT_URL=http://localhost:3100 node backend/scripts/auditoria/qa_recorrido_roles.mjs
python backend/scripts/auditoria/qa_analizar_recorrido.py
```

- Los usuarios QA (`qa.*@cliniq.test`) quedan activos en Beauty Clinic. Sus credenciales de prueba están en `salida/qa_usuarios.json`, que está fuera de git.
- `qa_roles_seed.py --desactivar` los deja inactivos.
