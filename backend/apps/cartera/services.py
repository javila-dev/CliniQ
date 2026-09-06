"""Servicios de dominio de cartera: acuerdos de pago (renegociación del plan).

Ciclo de vida de un acuerdo:

1. ``crear_acuerdo_pago``  -> estado ``pendiente_firma``. NO toca la cartera.
   Guarda el plan nuevo en ``plan_propuesto`` y genera el acta firmable.
2. El paciente firma el acta en Documenso. El webhook / la confirmación /
   la verificación manual llaman ``aplicar_acuerdo_pago_por_firma`` ->
   ``aplicar_acuerdo_pago`` -> estado ``vigente``: anula las cuotas viejas
   pendientes (con ``excepcion_aprobada`` para levantar la mora), cierra las
   parcialmente pagadas a lo abonado y materializa el plan nuevo.
3. ``anular_acuerdo_pago`` -> solo mientras esté ``pendiente_firma``.
"""

import logging
from datetime import date
from decimal import Decimal

from django.db import models, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.cartera.models import AcuerdoPago, CuotaCartera, CuotaCarteraLog
from apps.core.logging import registrar_accion

logger = logging.getLogger(__name__)

TOLERANCIA = Decimal("0.01")
TIPOS_VALIDOS = {t.value for t in CuotaCartera.Tipo}


def _dec(value) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def validar_plan_propuesto(cuotas, *, saldo_objetivo) -> None:
    """Valida la estructura del plan nuevo. `cuotas` = lista de dicts con
    `tipo`, `descripcion`, `valor_esperado` (Decimal/num), `fecha_esperada` (date).
    """
    if not cuotas:
        raise ValidationError({"error": "El acuerdo debe tener al menos una cuota.", "code": "PLAN_VACIO"})

    hoy = timezone.localdate()
    total = Decimal("0")
    for i, c in enumerate(cuotas):
        tipo = c.get("tipo")
        if tipo not in TIPOS_VALIDOS:
            raise ValidationError({"error": f"Cuota {i + 1}: tipo de pago inválido.", "code": "TIPO_INVALIDO"})
        try:
            valor = _dec(c["valor_esperado"])
        except (TypeError, ValueError, KeyError):
            raise ValidationError({"error": f"Cuota {i + 1}: valor inválido.", "code": "MONTO_INVALIDO"})
        if valor <= 0:
            raise ValidationError({"error": f"Cuota {i + 1}: el monto debe ser mayor a 0.", "code": "MONTO_INVALIDO"})
        fecha = c.get("fecha_esperada")
        if isinstance(fecha, str):
            fecha = date.fromisoformat(fecha)
        if fecha is None:
            raise ValidationError({"error": f"Cuota {i + 1}: la fecha es obligatoria.", "code": "FECHA_REQUERIDA"})
        if fecha < hoy:
            raise ValidationError({
                "error": f"Cuota {i + 1}: la fecha ({fecha.isoformat()}) no puede ser pasada.",
                "code": "FECHA_PASADA",
                "detalle": {"indice": i},
            })
        total += valor

    diferencia = total - _dec(saldo_objetivo)
    if abs(diferencia) > TOLERANCIA:
        raise ValidationError({
            "error": "La suma de las cuotas debe ser exactamente el saldo pendiente.",
            "code": "SUMA_NO_CUADRA",
            "detalle": {
                "esperado": f"{_dec(saldo_objetivo):.2f}",
                "recibido": f"{total:.2f}",
                "diferencia": f"{diferencia:.2f}",
            },
        })


@transaction.atomic
def crear_acuerdo_pago(cartera, *, motivo, cuotas, request=None):
    """Crea el acuerdo en `pendiente_firma` + genera el acta. No modifica cuotas."""
    from apps.consentimientos.services import documenso_configurado, generar_acta_acuerdo_pago

    actor = getattr(request, "user", None)
    if actor is not None and not getattr(actor, "is_authenticated", False):
        actor = None

    motivo = (motivo or "").strip()
    if not motivo:
        raise ValidationError({"error": "El motivo del acuerdo es obligatorio.", "code": "MOTIVO_REQUERIDO"})

    saldo = cartera.saldo_pendiente
    if saldo <= 0:
        raise ValidationError({
            "error": "Esta cartera no tiene saldo pendiente; no aplica un acuerdo de pago.",
            "code": "SIN_SALDO",
        })

    pendiente = cartera.acuerdos.filter(estado=AcuerdoPago.Estado.PENDIENTE_FIRMA).first()
    if pendiente is not None:
        raise ValidationError({
            "error": "Ya hay un acuerdo de pago pendiente de firma en esta cartera. "
                     "Fírmalo o cancélalo antes de crear otro.",
            "code": "ACUERDO_PENDIENTE_EXISTE",
            "detalle": {
                "acuerdo_id": str(pendiente.id),
                "numero": pendiente.numero,
                "creado_en": pendiente.created_at.isoformat(),
            },
        })

    if not documenso_configurado():
        raise ValidationError({
            "error": "La firma digital (Documenso) no está configurada para esta clínica. "
                     "No se pueden crear acuerdos de pago hasta configurarla.",
            "code": "FIRMA_NO_DISPONIBLE",
        })

    validar_plan_propuesto(cuotas, saldo_objetivo=saldo)

    numero = (cartera.acuerdos.aggregate(m=models.Max("numero"))["m"] or 0) + 1
    plan_propuesto = [
        {
            "tipo": c["tipo"],
            "descripcion": (c.get("descripcion") or "").strip(),
            "valor_esperado": f"{_dec(c['valor_esperado']):.2f}",
            "fecha_esperada": (
                c["fecha_esperada"].isoformat()
                if not isinstance(c["fecha_esperada"], str)
                else c["fecha_esperada"]
            ),
        }
        for c in cuotas
    ]

    acuerdo = AcuerdoPago.objects.create(
        cartera=cartera,
        numero=numero,
        motivo=motivo,
        saldo_al_proponer=saldo,
        plan_propuesto=plan_propuesto,
        creado_por=actor,
    )
    acuerdo.documento = generar_acta_acuerdo_pago(acuerdo)
    acuerdo.save(update_fields=["documento", "updated_at"])

    registrar_accion(request, "cartera.acuerdo_pago.crear", acuerdo, {
        "cartera_id": str(cartera.id),
        "numero": numero,
        "saldo": f"{saldo:.2f}",
        "n_cuotas": len(plan_propuesto),
    })
    return acuerdo


@transaction.atomic
def aplicar_acuerdo_pago(acuerdo, *, request=None):
    """Aplica el swap del plan. Idempotente. Se dispara al confirmarse la firma."""
    acuerdo.refresh_from_db()
    if acuerdo.estado == AcuerdoPago.Estado.VIGENTE:
        return acuerdo
    if acuerdo.estado != AcuerdoPago.Estado.PENDIENTE_FIRMA:
        return acuerdo

    from apps.consentimientos.models import Consentimiento

    if acuerdo.documento_id is None or acuerdo.documento.estado != Consentimiento.Estado.FIRMADO:
        return acuerdo

    cartera = acuerdo.cartera
    saldo_actual = cartera.saldo_pendiente
    total_plan = sum((_dec(r["valor_esperado"]) for r in acuerdo.plan_propuesto), Decimal("0"))
    if abs(total_plan - saldo_actual) > TOLERANCIA:
        acuerdo.estado = AcuerdoPago.Estado.REQUIERE_REVISION
        acuerdo.save(update_fields=["estado", "updated_at"])
        registrar_accion(request, "cartera.acuerdo_pago.requiere_revision", acuerdo, {
            "saldo_al_proponer": f"{acuerdo.saldo_al_proponer:.2f}",
            "saldo_actual": f"{saldo_actual:.2f}",
            "total_plan": f"{total_plan:.2f}",
        })
        logger.warning(
            "[aplicar_acuerdo_pago] saldo cambió entre propuesta y firma | acuerdo_id=%s | "
            "propuesto=%s actual=%s plan=%s",
            acuerdo.id, acuerdo.saldo_al_proponer, saldo_actual, total_plan,
        )
        return acuerdo

    logs = []
    for cuota in cartera.cuotas.filter(anulada=False, pagada=False):
        abonado = Decimal(cuota.valor_pagado or 0)
        if abonado > 0:
            logs.append(CuotaCarteraLog(
                cuota=cuota, campo="valor_esperado",
                valor_anterior=str(cuota.valor_esperado),
                valor_nuevo=f"{abonado} (cerrada por acuerdo N°{acuerdo.numero})",
            ))
            cuota.valor_esperado = abonado
            cuota.pagada = True
            cuota.observaciones = _append_obs(cuota.observaciones, f"Cerrada por acuerdo de pago N°{acuerdo.numero}")
            cuota.save(update_fields=["valor_esperado", "pagada", "observaciones", "updated_at"])
        else:
            logs.append(CuotaCarteraLog(
                cuota=cuota, campo="anulada", valor_anterior="False",
                valor_nuevo=f"True (acuerdo de pago N°{acuerdo.numero})",
            ))
            cuota.anulada = True
            cuota.excepcion_aprobada = True
            cuota.observaciones = _append_obs(cuota.observaciones, f"Reemplazada por acuerdo de pago N°{acuerdo.numero}")
            cuota.save(update_fields=["anulada", "excepcion_aprobada", "observaciones", "updated_at"])
    if logs:
        CuotaCarteraLog.objects.bulk_create(logs)

    for row in acuerdo.plan_propuesto:
        fecha = row["fecha_esperada"]
        if isinstance(fecha, str):
            fecha = date.fromisoformat(fecha)
        CuotaCartera.objects.create(
            cartera=cartera,
            acuerdo=acuerdo,
            tipo=row["tipo"],
            descripcion=row.get("descripcion") or "Cuota (acuerdo de pago)",
            valor_esperado=_dec(row["valor_esperado"]),
            fecha_esperada=fecha,
        )

    acuerdo.estado = AcuerdoPago.Estado.VIGENTE
    acuerdo.vigente_desde = timezone.now()
    acuerdo.save(update_fields=["estado", "vigente_desde", "updated_at"])

    registrar_accion(request, "cartera.acuerdo_pago.aplicar", acuerdo, {
        "cartera_id": str(cartera.id),
        "numero": acuerdo.numero,
        "saldo": f"{saldo_actual:.2f}",
    })
    logger.info("[aplicar_acuerdo_pago] acuerdo vigente | acuerdo_id=%s | cartera_id=%s", acuerdo.id, cartera.id)
    return acuerdo


def aplicar_acuerdo_pago_por_firma(consentimiento) -> None:
    """Punto de entrada desde los hooks de firma (webhook / confirmación /
    verificación). No-op si el consentimiento no es el acta de un acuerdo."""
    acuerdo = AcuerdoPago.objects.filter(documento_id=consentimiento.id).first()
    if acuerdo is None:
        return
    aplicar_acuerdo_pago(acuerdo)


@transaction.atomic
def anular_acuerdo_pago(acuerdo, *, motivo, request=None):
    """Cancela un acuerdo que aún no entró en vigencia. Revoca el acta."""
    from apps.consentimientos.models import Consentimiento

    actor = getattr(request, "user", None)
    if actor is not None and not getattr(actor, "is_authenticated", False):
        actor = None

    if acuerdo.estado != AcuerdoPago.Estado.PENDIENTE_FIRMA:
        raise ValidationError({
            "error": "Solo se puede cancelar un acuerdo que está pendiente de firma.",
            "code": "ACUERDO_NO_ANULABLE",
        })

    doc = acuerdo.documento
    if doc is not None and doc.estado != Consentimiento.Estado.REVOCADO:
        doc.estado = Consentimiento.Estado.REVOCADO
        doc.revocado_en = timezone.now()
        doc.motivo_revocacion = f"Acuerdo de pago N°{acuerdo.numero} cancelado: {motivo}".strip()
        doc.save(update_fields=["estado", "revocado_en", "motivo_revocacion", "updated_at"])

    acuerdo.estado = AcuerdoPago.Estado.ANULADO
    acuerdo.anulado_por = actor
    acuerdo.anulado_en = timezone.now()
    acuerdo.motivo_anulacion = (motivo or "").strip()
    acuerdo.save(update_fields=["estado", "anulado_por", "anulado_en", "motivo_anulacion", "updated_at"])

    registrar_accion(request, "cartera.acuerdo_pago.anular", acuerdo, {"motivo": acuerdo.motivo_anulacion})
    return acuerdo


def _append_obs(actual: str, texto: str) -> str:
    actual = (actual or "").strip()
    combinado = f"{actual}\n{texto}".strip() if actual else texto
    return combinado[:300]
