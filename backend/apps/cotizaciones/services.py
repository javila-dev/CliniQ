"""Servicios de dominio de cotizaciones.

La aceptación de una cotización tiene efectos colaterales (cartera, cuotas,
consentimientos pendientes) que se disparan desde dos sitios:

* la acción ``CotizacionViewSet.cambiar_estado`` (aceptación manual), y
* la firma del compromiso de pago (webhook de Documenso o confirmación manual),
  cuando la clínica exige ese documento: en ese caso la cotización pasa a
  ``aceptada`` automáticamente al recibirse la firma.

``aceptar_cotizacion`` centraliza esos efectos para que ambos caminos hagan
exactamente lo mismo.
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.cotizaciones.models import Cotizacion, ItemCotizacion

logger = logging.getLogger(__name__)

REFERENCIA_OBSEQUIO = "obsequio_cotizacion"


def clinica_exige_compromiso_pago(cotizacion) -> bool:
    """True si la clínica de la cotización requiere el compromiso de pago firmado."""
    from apps.configuracion.models import ConfiguracionCartera

    return ConfiguracionCartera.objects.filter(
        clinica_id=cotizacion.clinica_id,
        requiere_consentimiento_promocional=True,
    ).exists()


# Tolerancia de 1 peso: el descuento porcentual puede dejar centavos que la
# interfaz redondea (misma tolerancia que aplica el formulario al aceptar).
TOLERANCIA_PLAN_PAGOS = Decimal("1")


def validar_plan_de_pagos(cotizacion) -> None:
    """El plan de pagos (formas de pago) debe sumar el total de la cotizacion.

    Sin esto la cartera y el documento de aceptacion firmado no cuadrarian con
    lo que el paciente acepto. Lanza ``ValidationError`` (400) si no cuadra.
    """
    from apps.consentimientos.services import formatear_moneda

    total = Decimal(cotizacion.total)
    if total <= 0:
        return
    formas_pago = list(cotizacion.formas_pago.filter(activo=True))
    if not formas_pago:
        raise ValidationError(
            {
                "error": "Debes registrar el plan de pagos antes de aceptar la cotización.",
                "code": "PLAN_PAGOS_NO_CUADRA",
            }
        )
    suma = sum((forma.valor for forma in formas_pago), Decimal("0"))
    if abs(suma - total) > TOLERANCIA_PLAN_PAGOS:
        raise ValidationError(
            {
                "error": (
                    f"El plan de pagos suma {formatear_moneda(suma)} y el total de la cotización es "
                    f"{formatear_moneda(total)}. Ajusta el plan de pagos para que sume el total."
                ),
                "code": "PLAN_PAGOS_NO_CUADRA",
            }
        )


def aceptar_cotizacion(cotizacion, *, actor=None) -> list:
    """Transiciona la cotización a ACEPTADA y crea su cartera + cuotas.

    Devuelve la lista de consentimientos de procedimiento pendientes. Es
    idempotente: si la cotización ya está aceptada no repite nada.
    """
    from apps.cartera.models import Cartera, CuotaCartera
    from apps.protocolos.services import consentimientos_pendientes_cotizacion

    if cotizacion.estado == Cotizacion.Estado.ACEPTADA:
        return consentimientos_pendientes_cotizacion(cotizacion)

    cotizacion.estado = Cotizacion.Estado.ACEPTADA
    cotizacion.save(update_fields=["estado", "updated_at"])

    cartera, created = Cartera.objects.get_or_create(
        cotizacion=cotizacion,
        defaults={"paciente": cotizacion.paciente, "total": cotizacion.total},
    )
    if not created:
        cartera.total = cotizacion.total
        cartera.save(update_fields=["total", "updated_at"])
    if not cartera.cuotas.exists():
        for forma_pago in cotizacion.formas_pago.filter(activo=True):
            CuotaCartera.objects.create(
                cartera=cartera,
                tipo=forma_pago.tipo,
                descripcion=forma_pago.descripcion,
                valor_esperado=forma_pago.valor,
                fecha_esperada=forma_pago.fecha,
            )

    logger.info(
        "[aceptar_cotizacion] cotizacion aceptada | cotizacion_id=%s | actor=%s",
        cotizacion.id, getattr(actor, "id", None),
    )
    return consentimientos_pendientes_cotizacion(cotizacion)


def _bloquear_obsequio_producto(item) -> ItemCotizacion:
    """Relee el ítem con bloqueo de fila y exige que sea un obsequio de producto."""
    item = ItemCotizacion.objects.select_for_update().get(pk=item.pk)
    if not (item.activo and item.es_obsequio and item.tipo == ItemCotizacion.Tipo.INSUMO):
        raise ValidationError(
            {"error": "Solo se pueden entregar obsequios de tipo producto.", "code": "OBSEQUIO_NO_ENTREGABLE"}
        )
    return item


@transaction.atomic
def entregar_obsequio(item, *, sede, user) -> ItemCotizacion:
    """Entrega un obsequio de producto: descuenta el stock de ``sede``.

    Solo con la cotización aceptada y una única vez. Respeta las reglas de
    ``registrar_salida`` (stock insuficiente salvo que el insumo permita stock
    negativo). Deja constancia en el kardex con origen ``obsequio``.
    """
    from apps.inventario.models import MovimientoInventario
    from apps.inventario.services import registrar_salida

    item = _bloquear_obsequio_producto(item)
    cotizacion = item.cotizacion
    if cotizacion.estado != Cotizacion.Estado.ACEPTADA:
        raise ValidationError(
            {"error": "Solo se entregan obsequios de cotizaciones aceptadas.", "code": "COTIZACION_NO_ACEPTADA"}
        )
    if item.entregado_at is not None:
        raise ValidationError({"error": "Este obsequio ya fue entregado.", "code": "OBSEQUIO_YA_ENTREGADO"})
    if sede.clinica_id != cotizacion.clinica_id or not sede.activo:
        raise ValidationError({"error": "La sede no es válida para esta cotización.", "code": "SEDE_INVALIDA"})

    movimiento = registrar_salida(
        insumo=item.insumo,
        sede=sede,
        cantidad=item.cantidad_insumo,
        origen=MovimientoInventario.OrigenMovimiento.OBSEQUIO,
        referencia_id=cotizacion.id,
        referencia_tipo=REFERENCIA_OBSEQUIO,
        user=user,
    )
    item.entregado_at = timezone.now()
    item.entregado_por = user
    item.movimiento_entrega = movimiento
    item.save(update_fields=["entregado_at", "entregado_por", "movimiento_entrega", "updated_at"])
    logger.info(
        "[entregar_obsequio] obsequio entregado | cotizacion_id=%s | item_id=%s | sede_id=%s | actor=%s",
        cotizacion.id, item.id, sede.id, getattr(user, "id", None),
    )
    return item


@transaction.atomic
def revertir_entrega_obsequio(item, *, user) -> ItemCotizacion:
    """Deshace la entrega de un obsequio: devuelve el stock con un ajuste trazable."""
    from apps.inventario.services import get_or_crear_stock, registrar_ajuste

    item = _bloquear_obsequio_producto(item)
    if item.entregado_at is None:
        raise ValidationError({"error": "Este obsequio no ha sido entregado.", "code": "OBSEQUIO_NO_ENTREGADO"})
    movimiento = item.movimiento_entrega
    if movimiento is None:
        raise ValidationError(
            {"error": "No se pudo determinar la sede de esta entrega.", "code": "SEDE_REQUERIDA"}
        )

    stock_actual = get_or_crear_stock(item.insumo, movimiento.sede).stock_actual
    registrar_ajuste(
        insumo=item.insumo,
        sede=movimiento.sede,
        cantidad_nueva=stock_actual + item.cantidad_insumo,
        user=user,
        motivo=f"Reversion de obsequio entregado (cotizacion {str(item.cotizacion_id)[:8].upper()})",
    )
    item.entregado_at = None
    item.entregado_por = None
    item.movimiento_entrega = None
    item.save(update_fields=["entregado_at", "entregado_por", "movimiento_entrega", "updated_at"])
    logger.info(
        "[revertir_entrega_obsequio] entrega revertida | cotizacion_id=%s | item_id=%s | actor=%s",
        item.cotizacion_id, item.id, getattr(user, "id", None),
    )
    return item


def aceptar_cotizacion_por_firma_compromiso(consentimiento) -> None:
    """Hook de firma: si ``consentimiento`` es un compromiso de pago recién
    firmado y su cotización sigue en borrador (y la clínica lo exige), acepta
    la cotización automáticamente.

    Se llama desde el webhook de Documenso y desde las confirmaciones manuales.
    """
    from apps.consentimientos.models import Consentimiento

    if consentimiento.plantilla_id is not None or consentimiento.cotizacion_id is None:
        return
    if consentimiento.estado != Consentimiento.Estado.FIRMADO:
        return
    # El acta de un acuerdo de pago tambien es un Consentimiento sin plantilla
    # atado a la cotizacion, pero no debe disparar la aceptacion de la cotizacion
    # (que ya esta aceptada): la maneja apps.cartera.services.
    from apps.cartera.models import AcuerdoPago

    if AcuerdoPago.objects.filter(documento_id=consentimiento.id).exists():
        return

    cotizacion = consentimiento.cotizacion
    if cotizacion.estado != Cotizacion.Estado.BORRADOR:
        return
    if not clinica_exige_compromiso_pago(cotizacion):
        return

    logger.info(
        "[aceptar_cotizacion_por_firma_compromiso] firma recibida, aceptando cotizacion"
        " | cotizacion_id=%s | consentimiento_id=%s",
        cotizacion.id, consentimiento.id,
    )
    aceptar_cotizacion(cotizacion)
