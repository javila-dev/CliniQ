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

from apps.cotizaciones.models import Cotizacion

logger = logging.getLogger(__name__)


def clinica_exige_compromiso_pago(cotizacion) -> bool:
    """True si la clínica de la cotización requiere el compromiso de pago firmado."""
    from apps.configuracion.models import ConfiguracionCartera

    return ConfiguracionCartera.objects.filter(
        clinica_id=cotizacion.clinica_id,
        requiere_consentimiento_promocional=True,
    ).exists()


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
