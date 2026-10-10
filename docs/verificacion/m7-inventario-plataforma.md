# M7 — Inventario, compras, notificaciones, WhatsApp, ayuda y consola

**Estado:** Revisado (10/10/2026) · **Viene de:** M6 (último módulo)

**Alcance.**
- *Pantallas:* `inventario`, `proveedores`, `compras`, `ayuda`, `/console` (superadmin), `registro-clinica` y `verificar-clinica`.
- *Frontend:* `lib/api/inventario.ts`, `proveedores.ts`, `notificaciones.ts`, `whatsappPropio.ts`, `admin.ts`, `ayuda.ts` y `core.ts`.
- *Backend:* `apps/inventario`, `apps/proveedores`, `apps/notificaciones`, `apps/ayuda`, `apps/core` y el registro y la administración de clínicas.

**Antes de corregir.**
- **M7-04 es un riesgo de seguridad.** Cualquier recepcionista puede enviar correos a cualquier destinatario desde la cuenta de la plataforma.
- **M7-02 es el mismo problema de paginación** que T-01.

## Hallazgos

**M7-01 · Alto · previsible** · confirmado
- **Dónde:** `backend/apps/historia_clinica/views.py:1108-1148`, `services.py:646`
- **Qué ve el usuario:** borra un consumo de insumo con doble clic, al reintentar o desde dos pestañas, y **el stock sube dos veces**.
- **Causa:** `destroy` encuentra consumos ya revertidos, y `eliminar_consumo_insumo` no revisa `activo` ni bloquea la fila. Los obsequios sí tienen esta protección.
- **Arreglo:** usar `select_for_update`, rechazar si el consumo no está activo y filtrar por `activo=True` también en `destroy`.

**✅ M7-02 · Alto · parámetros** · confirmado
- **Dónde:** `config/settings/base.py:138-139`; `TabInsumos.tsx:52-56`; `CompraForm.tsx:189-192`; `compras/page.tsx:61`; `inventario/[id]/page.tsx:31,109-119`
- **Qué ve el usuario:**
  - En la atención, el selector solo muestra 25 insumos.
  - En Registrar compra solo aparecen 25 proveedores.
  - En el kardex, la página 3 da 404 y aparece "Sin movimientos".
- **Arreglo:** ver T-01, o usar búsqueda remota en los selectores.

**M7-03 · Alto · llamada sin resolver** · confirmado
- **Dónde:** `CompraForm.tsx:264-281`
- **Qué ve el usuario:** "Registrar y recibir" falla y, cada vez que reintenta, **queda una compra borrador duplicada** que no se puede borrar.
- **Causa:** son dos llamadas que no forman una sola operación (crear y recibir). Si falla la segunda, por ejemplo por falta del permiso `ordenes.recibir`, el formulario no se entera de que la compra ya existe.
- **Arreglo:** un endpoint que haga las dos cosas de forma atómica, u ocultar el botón a quien no tenga el permiso de recibir.

**M7-04 · Alto · permisos/seguridad** · confirmado
- **Dónde:** `backend/apps/notificaciones/views.py:149-176`, `serializers.py:38-61`, `permissions_catalog.py:709`
- **Qué ve el usuario:** nada en pantalla. Pero **cualquier recepcionista puede, por API, enviar correos a cualquier persona**, con HTML y con el remitente (`from_email`) que quiera, desde la cuenta de la plataforma.
- **Contexto:** no se usa en ninguna pantalla. Los helpers de bienvenida que lo llaman son código muerto y arman HTML con la contraseña en texto plano.
- **Arreglo:** eliminar el endpoint, o dejarlo solo para superadmin; quitar `from_email` y borrar esos helpers.

**M7-05 · Medio · faltante/previsible** · confirmado
- **Dónde:** `TabInsumos.tsx:52-61`; `historia_clinica/services.py:616-625`
- **Qué ve el usuario:**
  - En una nota sin cita, "Registrar consumo" siempre falla.
  - Con varias sedes, ve el stock de la primera sede y recibe "Stock insuficiente".
- **Causa:** el frontend nunca envía `sede`.
- **Arreglo:** enviar la sede de la cita (o pedirla) y mostrar el error que devuelve el backend.

**M7-06 · Medio · carga/errores** · confirmado
- **Dónde:** `inventario/page.tsx:304-334,416,454`
- **Qué ve el usuario:**
  - Si fallan las alertas, aparece **"Todo en orden"**.
  - En una clínica recién registrada, sin sedes, la pantalla se queda cargando para siempre.
- **Arreglo:** mostrar un estado de error y, sin sedes, un aviso "Crea una sede primero".

**M7-07 · Medio · faltante** · confirmado
- **Qué ve el usuario:** no puede editar ni desactivar insumos o proveedores, ni cancelar órdenes, ni quitar ítems de un borrador. No existe pantalla de categorías.
- **Causa:** las funciones del API existen, pero no hay pantalla que las use.

**M7-08 · Medio · errores/parámetros** · confirmado
- **Dónde:** `AjusteStockSheet.tsx:99-101`; `CompraForm.tsx:64,155,261,280`; `inventario/page.tsx:164-166`; `proveedores/serializers.py:68`
- **Qué ve el usuario:**
  - Mensajes genéricos que ocultan la explicación del backend.
  - Un ítem con costo $0 pasa en el formulario y falla al guardar.
- **Arreglo:** un helper común para los mensajes (ver T-02) y la misma regla de costo en el frontend y en el backend.

**M7-09 · Medio · permisos (multiclínica)** · confirmado
- **Dónde:** `inventario/serializers.py:24,101-104`; `views.py:121-130`; `historia_clinica/serializers.py:549`
- **Qué ve el usuario:** nada. Por API se puede ajustar stock en la sede de otra clínica, asignar una categoría ajena o registrar un consumo en una sede ajena.
- **Arreglo:** validar que la sede y la categoría sean de la misma clínica que el insumo.

**M7-10 · Medio · permisos/privacidad** · confirmado
- **Dónde:** `notificaciones/views.py:111-138`; `dashboard/page.tsx:603,798-803`; `configuracion/whatsapp/consumo/page.tsx:121`
- **Qué ve el usuario:** cualquier usuario ve en el Dashboard los "envíos fallidos" **con el teléfono completo del paciente**, y puede marcarlos como resueltos.
- **Arreglo:** exigir un permiso y enmascarar el teléfono.

**M7-11 · Medio · endpoint público** · confirmado
- **Dónde:** `clinicas/views.py:1530-1561`; `serializers.py:1327-1336`
- **Qué pasa:**
  - El registro de clínicas no tiene límite de intentos ni captcha, así que sirve para enviar correo masivo.
  - Revela si un email o un NIT ya existen.
  - Un error 500 devuelve `str(exc)`.
- **Arreglo:** límite por IP, captcha u honeypot, y respuestas neutras.

**M7-12 · Medio · previsible** · confirmado
- **Dónde:** `clinicas/services.py:82-132`; `users/services.py:272-277`
- **Qué ve el usuario:** la dueña verifica su correo, cierra la pestaña antes de crear la contraseña y **queda bloqueada**:
  - el enlace ya fue usado;
  - "Olvidé mi contraseña" no le envía nada;
  - volver a registrarse falla.
- **Arreglo:** reemitir la invitación y permitir el reset para administradores con la invitación pendiente.

**M7-13 · Medio · permisos/carga** · confirmado
- **Dónde:** `lib/permissions.ts:184-185`; `console/(protected)/clinicas/page.tsx:290-381`
- **Qué ve el usuario:** un usuario del equipo de ayuda (`is_staff`) entra a /console y ve "No hay clínicas" y pantallas vacías.
- **Causa:** el backend exige superadmin.
- **Arreglo:** a ese usuario mostrarle solo el Centro de ayuda.

**M7-14 · Medio · faltante** · confirmado
- **Dónde:** `console/(protected)/clinicas/page.tsx:285-381`; `clinicas/views.py:349-378`
- **Qué ve el usuario:** "N clínicas" pero solo 25 en la lista, sin paginador. Los filtros Activas e Inactivas no filtran.

**M7-15 · Medio · decimales** · confirmado
- **Dónde:** `CompraForm.tsx:108,358`; `TabInsumos.tsx`
- **Qué ve el usuario:** "Stock actual: 5.000", que en Colombia se lee como cinco mil.
- **Arreglo:** usar `formatCantidad` en todos los lugares.

**M7-16 · Medio · errores** · confirmado (mensaje) / probable (cupo)
- **Dónde:** `EnviarCotizacionModal.tsx:145-151`; `cotizaciones/views.py:563-611`
- **Qué ve el usuario:**
  - Cualquier fallo de WhatsApp dice "Verifica el teléfono".
  - Si el paciente no tiene teléfono, la ruta compartida igual responde "enviada" y descuenta cupo.
- **Arreglo:** mostrar el error real y validar el teléfono antes de enviar.

**M7-17 · Medio · privacidad** · probable
- **Dónde:** `notificaciones/services.py:142-147`
- **Qué pasa:** los PDF que se envían por WhatsApp quedan en el bucket público con una URL permanente.
- **Arreglo:** URL firmada de corta duración, o limpieza programada.

**M7-18 · Bajo · permisos (superadmin)** · confirmado
- **Dónde:** `inventario/views.py:153-158`; `proveedores/views.py:61-64`
- **Qué pasa:** el superadmin que opera una clínica ve las órdenes de todas las clínicas.
- **Arreglo:** usar `get_clinica_activa`.

**M7-19 · Bajo · roles personalizados** · confirmado
- **Dónde:** `CompraForm.tsx:52-56,298,418`
- **Qué ve el usuario:** con "gestionar órdenes" pero sin "ver inventario", el buscador de ítems dice "Sin resultados" (en realidad es un 403). Además, "Crear proveedor" aparece sin el permiso.

**M7-20 · Bajo · zona horaria** · confirmado
- **Dónde:** `CompraForm.tsx:175`
- **Qué ve el usuario:** después de las 7 p. m., la fecha de compra por defecto es la de mañana (ver T-04).

**M7-21 · Bajo · faltante** · confirmado
- **Dónde:** `proveedores/models.py:69`; `CompraForm.tsx:239-242,390-394`
- **Qué ve el usuario:**
  - No puede guardar un borrador sin número de factura.
  - Una orden enviada o cancelada aparece como "ya fue recibida".

**M7-22 · Bajo · concurrencia** · probable
- **Dónde:** `proveedores/models.py:100-115`; `inventario/services.py:7-9`
- **Qué pasa:** error 500 ocasional al crear órdenes al mismo tiempo, porque el consecutivo es global.

**M7-23 · Bajo · tipos** · confirmado
- **Dónde:** `lib/api/inventario.ts:54`
- **Qué pasa:** `ajustarStock` está mal tipado; el backend devuelve el movimiento plano.

**M7-24 · Bajo · permisos** · confirmado
- **Dónde:** `inventario/serializers.py:163-224`
- **Qué pasa:** quien solo puede ver el kardex ve nombres de pacientes y enlaces a su historia (además hay N+1 consultas).

**M7-25 · Bajo · previsible** · confirmado
- **Dónde:** `ayuda/views.py:193-200`; `notificaciones/views.py:111-144`
- **Qué pasa:**
  - "¿Te fue útil?" se puede inflar sin límite.
  - Los reintentos de n8n duplican los avisos de fallo.

## Pruebas no técnicas

| # | Pasos | Resultado esperado | Valida |
|---|---|---|---|
| 1 | Clínica con más de 25 insumos → atención → Insumos → Nuevo. | Aparecen todos o se pueden buscar. | M7-02 |
| 2 | Registrar un consumo y pulsar dos veces rápido la papelera. | El stock sube una sola vez. | M7-01 |
| 3 | Nota sin cita (por ejemplo, migrada) → registrar un insumo. | Pide la sede y lo registra. | M7-05 |
| 4 | Con dos sedes, atender en la sede B y mirar el stock. | Muestra el stock de la sede B. | M7-05 |
| 5 | Con un rol que gestiona órdenes pero no las recibe → "Registrar y recibir" dos veces. | No hay borradores duplicados. | M7-03 |
| 6 | Compra con un ítem de costo $0. | Mensaje claro antes de guardar. | M7-08 |
| 7 | Ajustar el stock a la misma cantidad que ya tiene. | "La cantidad nueva es igual al stock actual". | M7-08 |
| 8 | Comprar 5 unidades y volver a abrir la compra. | Dice "5", no "5.000". | M7-15 |
| 9 | Clínica nueva sin sede → Inventario. | Pide crear una sede. | M7-06 |
| 10 | Usuario de la sede A → Alertas de stock. | Alertas reales o un error, nunca "Todo en orden" falso. | M7-06 |
| 11 | Intentar editar un insumo, desactivar un proveedor o cancelar un borrador. | La opción existe. | M7-07 |
| 12 | Profesional sin datos sensibles → Dashboard con envíos fallidos. | Teléfono enmascarado, o sin acceso. | M7-10 |
| 13 | Registrar una clínica, verificar el correo, cerrar sin crear contraseña y reabrir el enlace. | Puede terminar el registro. | M7-12 |
| 14 | Enviar una cotización por WhatsApp sin cupo, o a un paciente sin teléfono. | Mensaje con la causa real; no queda marcada como enviada. | M7-16 |
| 15 | Entrar a /console con un usuario del equipo de ayuda. | Solo ve el Centro de ayuda. | M7-13 |
| 16 | Consola con más de 25 clínicas → filtro "Inactivas". | Hay paginación y el filtro funciona. | M7-14 |
| 17 | A las 8 p. m. → Registrar compra. | La fecha es la de hoy. | M7-20 |

## Pruebas técnicas

| # | Verificación | Esperado | Valida |
|---|---|---|---|
| 1 | `GET /api/v1/inventario/insumos/?page_size=200` | Hasta 200 resultados (hoy 25). | M7-02 |
| 2 | `GET /api/v1/inventario/kardex/?insumo=<id>&page=3&page_size=20` con 45 movimientos. | 200 (hoy 404). | M7-02 |
| 3 | `DELETE /api/v1/historia-clinica/consumos-insumo/<id>/` dos veces. | 204 y luego 404/400; un solo `ajuste_positivo`. | M7-01 |
| 4 | `POST /inventario/insumos/<insumo A>/ajustar_stock/` con `sede` de la clínica B. | 400/403 (hoy 200). | M7-09 |
| 5 | `POST /api/v1/notificaciones/emails/enviar/` como recepción, con `from_email` ajeno. | 403 o 404 (hoy 200). | M7-04 |
| 6 | `GET /api/v1/notificaciones/fallidas/` sin datos sensibles. | 403, o el teléfono enmascarado. | M7-10 |
| 7 | 20 `POST /api/v1/registro-clinica/` desde la misma IP. | 429 al pasar el límite. | M7-11 |
| 8 | `GET /api/v1/admin/tenants/?activo=false` | Solo clínicas inactivas. | M7-14 |
| 9 | `GET /api/v1/admin/tenants/` con `is_staff`, sin ser superadmin. | 403 (confirma la diferencia de criterio con el frontend). | M7-13 |
| 10 | `POST /api/v1/proveedores/ordenes-compra/` con `precio_unitario=0`. | 400 con un mensaje que el frontend muestra. | M7-08 |
| 11 | `POST /api/v1/historia-clinica/consumos-insumo/` en una nota sin cita y sin `sede`. | 400, y el toast lo muestra. | M7-05 |
| 12 | Test unitario: `eliminar_consumo_insumo(consumo_inactivo)`. | Lanza `ValidationError`. | M7-01 |
| 13 | `POST /api/v1/cotizaciones/<id>/enviar_whatsapp/` a un paciente sin teléfono. | 400, sin crear `EnvioWhatsApp`. | M7-16 |

## Notas

- **Falso positivo confirmado:** `/admin/whatsapp-numeros/{id}/{accion}/`. La acción es un literal tipado y las tres rutas existen.
- **Rutas que el frontend no llama:**
  - `lyvio-webhook` y `n8n-callback`: correcto, no deben llamarse desde el frontend.
  - `notificaciones/emails/config`: se puede eliminar junto con M7-04.
  - `inventario/categorias`: falta la pantalla (M7-07).
- **Webhooks que están bien hechos:**
  - Lyvio valida la firma HMAC con timestamp y deduplica.
  - n8n compara el secreto con `compare_digest`.
  - El envío por número propio maneja el estado "incierto" y pide confirmación.
- **Stock negativo:** está protegido en salidas y ajustes. Solo falla al borrar un consumo (M7-01).
- **Centro de ayuda:** maneja errores y no usa `dangerouslySetInnerHTML`.
