"""Autorización de precios fuera de regla en cotizaciones.

Quien no tiene ``cotizaciones.cambiar_precio`` puede cotizar por debajo del
precio de catálogo o pasar el descuento máximo si lo pide: la cotización se
guarda, queda "por autorizar" (no se envía, no sale el PDF para el paciente ni
se acepta) y quien tiene el permiso, en la sede de la cotización, la autoriza o
la rechaza. Quien tiene el permiso guarda directo y su precio queda autorizado
a su nombre. Ver docs/plan-autorizacion-precios.md.
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.core.logging import registrar_accion
from apps.cotizaciones.models import Cotizacion, SolicitudAutorizacionPrecio
from apps.users.authorization import user_has_permission

PERMISO_AUTORIZAR = "cotizaciones.cambiar_precio"
TOLERANCIA = Decimal("0.01")
CENTAVOS = Decimal("0.01")

Estado = SolicitudAutorizacionPrecio.Estado


def puede_autorizar_precios(request) -> bool:
    return bool(request and user_has_permission(request.user, PERMISO_AUTORIZAR, request=request))


def _precios_cubiertos(cotizacion, estados) -> dict:
    """Clave de catálogo → condiciones autorizadas (precio, citas y brecha al mínimo)."""
    if cotizacion is None or cotizacion.pk is None:
        return {}
    cubiertos = {}
    for items in cotizacion.autorizaciones_precio.filter(estado__in=estados).values_list("items", flat=True):
        for entrada in items or []:
            precio = Decimal(str(entrada["precio_efectivo"]))
            minimo = Decimal(str(entrada.get("minimo", precio)))
            cubiertos.setdefault(entrada["clave"], []).append({
                "precio": precio,
                "num_citas": int(entrada.get("num_citas") or 1),
                "brecha": minimo - precio,
            })
    return cubiertos


def _cubierto(entrada, cubiertos) -> bool:
    """Una autorización vale para ese precio o uno mayor, con las mismas citas o
    menos, y sin que la brecha frente al mínimo crezca.

    Antes solo miraba la clave y el precio: tras autorizar se podía subir el
    número de citas, o cambiar a una sede con precio de lista más alto, sin pedir
    otra autorización (CT-03).
    """
    precio = Decimal(entrada["precio_efectivo"])
    num_citas = int(entrada.get("num_citas") or 1)
    brecha = Decimal(entrada.get("minimo", precio)) - precio
    return any(
        precio >= c["precio"] - TOLERANCIA
        and num_citas <= c["num_citas"]
        and brecha <= c["brecha"] + TOLERANCIA
        for c in cubiertos.get(entrada["clave"], [])
    )


def validar_fuera_de_regla(cotizacion, fuera_de_regla, *, total_items, request, solicita: bool) -> None:
    """Rechaza el guardado si hay precios fuera de regla sin cubrir.

    Cubren: el permiso, una autorización vigente o la solicitud pendiente (se
    puede seguir editando mientras se espera). Si la persona pide autorización
    en este mismo guardado, también pasa. El error mantiene el formato de antes
    (por ítem, con su código) y agrega ``PRECIO_REQUIERE_AUTORIZACION``.
    """
    if not fuera_de_regla or solicita or puede_autorizar_precios(request):
        return
    cubiertos = _precios_cubiertos(cotizacion, [Estado.AUTORIZADA, Estado.PENDIENTE])
    faltan = [(indice, entrada) for indice, entrada in fuera_de_regla if not _cubierto(entrada, cubiertos)]
    if not faltan:
        return
    errores = [{} for _ in range(total_items)]
    for indice, entrada in faltan:
        errores[indice] = {entrada["campo"]: [entrada["mensaje"]], "code": [entrada["code"]]}
    raise serializers.ValidationError({
        "items": errores,
        "code": "PRECIO_REQUIERE_AUTORIZACION",
        "error": "Hay precios por debajo de lo permitido: pide autorización o ajústalos.",
    })


def _texto(valor) -> str:
    return str(Decimal(valor).quantize(CENTAVOS))


def _snapshot(cotizacion, entradas):
    """Ítems fuera de regla tal como los verá el autorizador, y los totales."""
    items = []
    diferencia_total = Decimal("0")
    for entrada in entradas:
        num_citas = Decimal(entrada["num_citas"])
        diferencia = Decimal(entrada["diferencia_unitaria"]) * num_citas
        diferencia_total += diferencia
        minimo = Decimal(entrada["minimo"])
        pct = (minimo - Decimal(entrada["precio_pedido"])) / minimo * 100 if minimo else Decimal("0")
        items.append({
            "clave": entrada["clave"],
            "descripcion": entrada["descripcion"],
            "num_citas": int(entrada["num_citas"]),
            "regla": entrada["regla"],
            "precio_lista": _texto(entrada["precio_lista"]),
            "descuento_maximo_pct": _texto(entrada["descuento_maximo_pct"]),
            "valor_unitario": _texto(entrada["valor_unitario"]),
            "descuento_porcentaje": _texto(entrada["descuento_porcentaje"]),
            "precio_efectivo": _texto(entrada["precio_efectivo"]),
            "minimo": _texto(minimo),
            "precio_pedido": _texto(entrada["precio_pedido"]),
            "diferencia": _texto(diferencia),
            "diferencia_pct": str(pct.quantize(Decimal("0.1"))),
        })
    total_pedido = Decimal(cotizacion.total)
    return items, total_pedido, total_pedido + diferencia_total


def _huella(items) -> set:
    """Lo que se pide autorizar, sin textos: clave, precio y citas de cada ítem."""
    return {
        (i["clave"], str(Decimal(str(i["precio_efectivo"])).quantize(CENTAVOS)), int(i.get("num_citas") or 1))
        for i in items or []
    }


def _detalle_log(solicitud) -> dict:
    return {
        "solicitud": str(solicitud.id),
        "estado": solicitud.estado,
        "items": [
            {"descripcion": i["descripcion"], "minimo": i["minimo"], "precio_pedido": i["precio_pedido"]}
            for i in solicitud.items
        ],
        "total_pedido": _texto(solicitud.total_pedido),
        "total_permitido": _texto(solicitud.total_permitido),
    }


def _cancelar(solicitud, comentario: str) -> None:
    solicitud.estado = Estado.CANCELADA
    solicitud.resuelta_en = timezone.now()
    solicitud.comentario = comentario
    solicitud.save(update_fields=["estado", "resuelta_en", "comentario", "updated_at"])


def _marcar(cotizacion, por_autorizar: bool) -> None:
    if cotizacion.precio_por_autorizar != por_autorizar:
        cotizacion.precio_por_autorizar = por_autorizar
        cotizacion.save(update_fields=["precio_por_autorizar", "updated_at"])


def aplicar_fuera_de_regla(cotizacion, fuera_de_regla, *, request, motivo: str | None = None):
    """Tras guardar los ítems: crea, refresca o cancela la solicitud y marca la cotización.

    ``fuera_de_regla`` ya pasó ``validar_fuera_de_regla``. Devuelve la solicitud
    creada o refrescada, o ``None``.
    """
    entradas = [entrada for _, entrada in fuera_de_regla]
    autorizados = _precios_cubiertos(cotizacion, [Estado.AUTORIZADA])
    sin_autorizar = [entrada for entrada in entradas if not _cubierto(entrada, autorizados)]
    pendiente = cotizacion.autorizaciones_precio.filter(estado=Estado.PENDIENTE).first()

    if not sin_autorizar:
        if pendiente is not None:
            _cancelar(pendiente, "Los precios quedaron dentro de lo permitido.")
        _marcar(cotizacion, False)
        return None

    items, total_pedido, total_permitido = _snapshot(cotizacion, sin_autorizar)
    user = request.user
    # Quien autoriza y guarda otro cambio sin tocar los precios pedidos no los
    # autoriza sin querer: la solicitud sigue pendiente y se decide con su botón
    # (CT-16). Si cambió esos precios, son suyos y quedan autorizados.
    mismos_precios = pendiente is not None and _huella(pendiente.items) == _huella(items)
    if puede_autorizar_precios(request) and not mismos_precios:
        # Quien puede cambiar precios los pone directo (M5-18); queda a su nombre
        # para que el asesor que edite después no tenga que pedirlos otra vez.
        if pendiente is not None:
            _cancelar(pendiente, f"{user.nombre_completo} puso los precios directamente.")
        solicitud = SolicitudAutorizacionPrecio.objects.create(
            cotizacion=cotizacion, estado=Estado.AUTORIZADA, directa=True,
            solicitada_por=user, resuelta_por=user, resuelta_en=timezone.now(),
            items=items, total_pedido=total_pedido, total_permitido=total_permitido,
        )
        registrar_accion(request, "cotizacion.precio_autorizado_directo", cotizacion, _detalle_log(solicitud))
        _marcar(cotizacion, False)
        return solicitud

    if motivo:
        if pendiente is not None:
            _cancelar(pendiente, "Se reemplazó por una nueva solicitud.")
        solicitud = SolicitudAutorizacionPrecio.objects.create(
            cotizacion=cotizacion, solicitada_por=user, motivo=motivo,
            items=items, total_pedido=total_pedido, total_permitido=total_permitido,
        )
        registrar_accion(
            request, "cotizacion.autorizacion_precio.solicitar", cotizacion,
            {**_detalle_log(solicitud), "motivo": motivo},
        )
        _marcar(cotizacion, True)
        return solicitud

    # Sigue editando mientras espera: el autorizador ve los precios actuales.
    if pendiente is not None:
        pendiente.items = items
        pendiente.total_pedido = total_pedido
        pendiente.total_permitido = total_permitido
        pendiente.save(update_fields=["items", "total_pedido", "total_permitido", "updated_at"])
    _marcar(cotizacion, True)
    return pendiente


def cancelar_pendientes(cotizacion, comentario: str) -> None:
    """La cotización se descartó o eliminó: no queda nada por decidir."""
    for solicitud in cotizacion.autorizaciones_precio.filter(estado=Estado.PENDIENTE):
        _cancelar(solicitud, comentario)
    _marcar(cotizacion, False)


def _validar_decidible(solicitud) -> Cotizacion:
    if solicitud.estado != Estado.PENDIENTE:
        raise serializers.ValidationError({
            "error": "Esta solicitud ya se resolvió.", "code": "SOLICITUD_YA_RESUELTA", "estado": solicitud.estado,
        })
    cotizacion = solicitud.cotizacion
    if cotizacion.estado != Cotizacion.Estado.BORRADOR or not cotizacion.activo:
        _cancelar(solicitud, "La cotización ya no está abierta.")
        raise serializers.ValidationError({
            "error": "La cotización ya no está abierta.", "code": "COTIZACION_NO_EDITABLE",
        })
    return cotizacion


@transaction.atomic
def autorizar(solicitud, *, request, comentario: str = "") -> SolicitudAutorizacionPrecio:
    solicitud = SolicitudAutorizacionPrecio.objects.select_for_update().select_related("cotizacion").get(pk=solicitud.pk)
    cotizacion = _validar_decidible(solicitud)
    solicitud.estado = Estado.AUTORIZADA
    solicitud.resuelta_por = request.user
    solicitud.resuelta_en = timezone.now()
    solicitud.comentario = comentario
    solicitud.save(update_fields=["estado", "resuelta_por", "resuelta_en", "comentario", "updated_at"])
    # La pendiente se refresca en cada guardado: cubre todo lo que está fuera de regla.
    _marcar(cotizacion, False)
    registrar_accion(
        request, "cotizacion.autorizacion_precio.autorizar", cotizacion,
        {**_detalle_log(solicitud), "comentario": comentario},
    )
    return solicitud


@transaction.atomic
def rechazar(solicitud, *, request, comentario: str) -> SolicitudAutorizacionPrecio:
    solicitud = SolicitudAutorizacionPrecio.objects.select_for_update().select_related("cotizacion").get(pk=solicitud.pk)
    cotizacion = _validar_decidible(solicitud)
    solicitud.estado = Estado.RECHAZADA
    solicitud.resuelta_por = request.user
    solicitud.resuelta_en = timezone.now()
    solicitud.comentario = comentario
    solicitud.save(update_fields=["estado", "resuelta_por", "resuelta_en", "comentario", "updated_at"])
    # Sigue con los precios rechazados: queda bloqueada hasta corregirlos o pedir de nuevo.
    _marcar(cotizacion, True)
    registrar_accion(
        request, "cotizacion.autorizacion_precio.rechazar", cotizacion,
        {**_detalle_log(solicitud), "comentario": comentario},
    )
    return solicitud


def ultima_solicitud(cotizacion):
    """La solicitud que explica el estado de precios de la cotización (sin canceladas)."""
    return (
        cotizacion.autorizaciones_precio.exclude(estado=Estado.CANCELADA)
        .select_related("solicitada_por", "resuelta_por")
        .order_by("-created_at")
        .first()
    )


def validar_sin_precio_por_autorizar(cotizacion, accion: str) -> None:
    """Enviar, PDF para el paciente y aceptar esperan la autorización."""
    if not cotizacion.precio_por_autorizar:
        return
    raise serializers.ValidationError({
        "error": f"Esta cotización tiene precios por autorizar: no se puede {accion} todavía.",
        "code": "PRECIO_POR_AUTORIZAR",
    })
