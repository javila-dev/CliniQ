# Autorización de precios en cotizaciones

Pedido del cliente (14/10/2026): por temas comerciales, a veces hay que cotizar por debajo de lo permitido (precio menor al de catálogo o descuento sobre el tope). El asesor no tiene permiso para hacerlo y no debe tenerlo; necesita que alguien autorizado lo apruebe o lo rechace, y que la cotización se actualice sola.

## Decisiones del usuario

| Pregunta | Decisión |
|---|---|
| ¿Cómo se entera el autorizador? | Solo dentro de CliniQ: contador en el menú, bandeja de autorizaciones y aviso emergente si está conectado. Sin WhatsApp. |
| ¿Qué puede hacer el autorizador? | Autorizar o rechazar (con comentario). Sin contraoferta. |
| ¿Qué se bloquea mientras está pendiente? | Enviar, descargar el PDF para el paciente y aceptar. Editar y guardar sí se puede. |
| ¿Quién autoriza? | Quien tiene `cotizaciones.cambiar_precio`, limitado a sus sedes. Sin permiso nuevo. |

## Flujo

1. **Asesor.** Un ítem fuera de la regla (valor bajo el precio de catálogo bloqueado, o precio efectivo bajo el piso del descuento máximo) ya no se rechaza al guardar si se pide autorización:
   - el formulario muestra "Este precio necesita autorización" y el botón **Solicitar autorización** con motivo obligatorio;
   - una sola solicitud por cotización cubre todos sus ítems fuera de la regla;
   - la cotización queda "Pendiente de autorización": no se envía, no se descarga el PDF para el paciente, no se acepta.
2. **Autorizador.** Contador "Autorizaciones · N" en el menú y bandeja con las pendientes de sus sedes. Por cada ítem: precio de lista, mínimo permitido, precio pedido, diferencia en $ y %, total antes y después; quién pide, paciente y motivo. **Autorizar** o **Rechazar** (comentario obligatorio al rechazar). También puede decidir desde un aviso dentro de la propia cotización.
3. **En vivo.** Mientras está pendiente, la cotización del asesor consulta cada ~10 s (sin websockets). Autorizada: aviso verde ("Autorizado por X, hora") y se habilitan Enviar/Aceptar. Rechazada: muestra el comentario y ofrece **Volver al precio permitido** (un clic) o ajustar y pedir de nuevo.

## Reglas

- La autorización cubre esos precios exactos (huella de los ítems autorizados). Bajar después el precio o subir el descuento de un ítem autorizado la invalida; subir el precio no.
- Promociones activas (dentro del rango) y obsequios siguen sin pedir autorización.
- Quien ya tiene `cotizaciones.cambiar_precio` no pide nada: guarda directo (decisión M5-18).
- Auditoría: quién pidió, quién decidió, cuándo, precios y motivo; en el historial de la cotización y en `LogAccion`.
- Una solicitud pendiente se cancela sola si la cotización se descarta o se corrigen los precios para quedar dentro de la regla.

## Piezas

- **Backend:** modelo `SolicitudAutorizacionPrecio` (cotización, solicitada_por, motivo, estado pendiente/autorizada/rechazada/cancelada, resuelta_por, resuelta_en, comentario, snapshot de ítems, huella). El serializer de ítems acepta el precio fuera de regla cuando la cotización va a pedir autorización; `enviar_*`, PDF para el paciente y `aceptar` exigen que no haya ítems fuera de regla sin autorización vigente. Endpoints: solicitar, listar pendientes (acotadas a sedes), contador, autorizar, rechazar.
- **Frontend:** aviso y botón en `CotizacionForm`, polling del estado, bandeja de autorizaciones, contador en el menú, aviso emergente para el autorizador.

## Implementación (14/10/2026)

**Backend** (`apps/cotizaciones`, migración `0021_autorizacion_precios`)
- `Cotizacion.precio_por_autorizar`: marca guardada que bloquea enviar (`_validar_enviable`), el PDF y aceptar (también la aceptación automática al firmar el compromiso). Código `PRECIO_POR_AUTORIZAR`.
- `SolicitudAutorizacionPrecio`: `items` guarda por ítem la clave de catálogo (`t:<id>` / `p:<id>`), el precio de lista, el mínimo permitido, el precio pedido y el precio efectivo. La cobertura se compara por precio efectivo: igual o mayor sigue cubierto, menor pide de nuevo. `directa=True` cuando quien tiene el permiso pone el precio (queda autorizado a su nombre, fuera de la bandeja).
- `ItemCotizacionSerializer` ya no rechaza: marca el ítem fuera de regla. `CotizacionSerializer` decide con `autorizaciones.validar_fuera_de_regla` (antes de guardar) y `aplicar_fuera_de_regla` (después): permiso, autorización vigente, pendiente o `solicitar_autorizacion: "<motivo>"` en el mismo guardado. Sin nada de eso responde 400 con los errores por ítem de siempre más `code: PRECIO_REQUIERE_AUTORIZACION`.
- Mientras espera se puede editar sin bajar más el precio; la pendiente se refresca con los precios actuales. Volver a lo permitido, descartar o eliminar la cancela.
- Endpoints: `GET /cotizaciones/{id}/autorizacion_precio/` (polling), `GET /autorizaciones-precio/?estado=pendiente|resueltas&sede=`, `GET /autorizaciones-precio/contador/`, `POST /autorizaciones-precio/{id}/autorizar/` y `/rechazar/` (comentario obligatorio). Bandeja con `cotizaciones.cambiar_precio`, acotada a las sedes del usuario.
- `LogAccion`: `cotizacion.autorizacion_precio.solicitar|autorizar|rechazar` y `cotizacion.precio_autorizado_directo`.
- Tests: `apps/cotizaciones/tests_autorizacion_precios.py`.

**Frontend**
- `CotizacionForm`: guardar ya no bloquea en el navegador. Si el backend pide autorización, abre `SolicitarAutorizacionDialog` (motivo obligatorio) y guarda pidiéndola. `AutorizacionPrecioBanner` muestra si está esperando, rechazada (con "Volver al precio permitido" y "Pedir de nuevo") o autorizada; quien autoriza decide ahí mismo. La consulta corre cada 10 s mientras espera; PDF, Enviar y Registrar aceptación quedan deshabilitados.
- Campos de precio y descuento: "Requiere autorización", "Esperando autorización" o "Autorizado" en lugar del error rojo.
- `/autorizaciones` (bandeja con "Por decidir" y "Resueltas"), ítem "Autorizaciones" en Comercial con contador (cada 30 s) y aviso emergente cuando llega una solicitud nueva.
- Listado de cotizaciones: marca "Precio por autorizar".
