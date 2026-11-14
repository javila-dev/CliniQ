"""Terminar una venta que el paciente deja a medias (docs/plan-terminacion-ventas.md).

La cotización sigue ``aceptada`` (cuenta como vendida en su ``aceptada_en``);
``terminada_en`` marca que ya no se agendan más sesiones. Al terminar:

- Los tratamientos del paciente de la venta pasan a ``ABANDONADO`` (ritmo,
  "Paquetes sin movimiento" y el seguimiento ya lo respetan).
- Las citas sin cerrar se cancelan o quedan a cargo de la clínica, según elija
  quien termina. Las que están en atención nunca se cancelan solas.
- Las oportunidades abiertas del paquete se cierran como perdidas.
- El saldo de cartera se perdona o se deja un cobro de X (0 < X ≤ saldo). Si X
  es el saldo completo, el plan de cuotas no se toca.

Reanudar solo se puede si no se perdonó nada.
"""

from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from apps.core.logging import registrar_accion
from apps.cotizaciones.models import Cotizacion, ItemCotizacion, MotivoTerminacion

CERO = Decimal("0.00")


def _error(mensaje: str, code: str, **extra):
    raise ValidationError({"error": mensaje, "code": code, **extra})


def se_puede_reanudar(cotizacion) -> bool:
    return cotizacion.terminada_en is not None and Decimal(cotizacion.valor_perdonado or 0) <= 0


# ── Lo que toca la terminación ────────────────────────────────────────────────


def _items_con_sesiones(cotizacion):
    items = cotizacion.items.filter(activo=True).exclude(tipo=ItemCotizacion.Tipo.INSUMO).order_by("created_at")
    return [i for i in items if i.tiene_cupo_propio]


def _sesiones(cotizacion) -> list[dict]:
    filas = []
    for item in _items_con_sesiones(cotizacion):
        total = item.num_sesiones_efectivas()
        if not total:
            continue
        hechas = item.sesiones_previas_consumidas + item.citas.filter(estado="completada").count()
        filas.append({
            "item_id": str(item.id),
            "descripcion": item.descripcion,
            "total": total,
            "hechas": min(hechas, total),
            "pendientes": max(0, total - hechas),
        })
    return filas


def _citas_sin_cerrar(cotizacion) -> dict:
    """Citas de la venta que no están cerradas, en tres grupos."""
    from apps.agenda.models import Cita

    citas = (
        Cita.objects.filter(
            item_cotizacion__cotizacion=cotizacion,
            estado__in=[Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA, Cita.Estado.EN_ESPERA, Cita.Estado.EN_CURSO],
        )
        .select_related("profesional", "servicio", "item_cotizacion", "sede")
        .order_by("fecha_inicio")
    )
    hoy = timezone.localdate()
    grupos = {"agendadas": [], "sin_cerrar": [], "en_atencion": []}
    for cita in citas:
        if cita.estado in (Cita.Estado.EN_ESPERA, Cita.Estado.EN_CURSO):
            grupo = "en_atencion"
        elif timezone.localdate(cita.fecha_inicio) >= hoy:
            grupo = "agendadas"
        else:
            grupo = "sin_cerrar"
        grupos[grupo].append(cita)
    return grupos


def _cita_publica(cita) -> dict:
    return {
        "id": str(cita.id),
        "fecha_inicio": cita.fecha_inicio.isoformat(),
        "estado": cita.estado,
        "profesional_nombre": cita.profesional.nombre_completo if cita.profesional_id else None,
        "sede_nombre": cita.sede.nombre if cita.sede_id else None,
        "descripcion": (
            cita.item_cotizacion.descripcion if cita.item_cotizacion_id
            else (cita.servicio.nombre if cita.servicio_id else "")
        ),
    }


def _oportunidades_abiertas(cotizacion):
    from apps.seguimiento.models import Oportunidad

    return Oportunidad.objects.filter(
        Q(cotizacion=cotizacion) | Q(item_cotizacion__cotizacion=cotizacion),
        estado=Oportunidad.Estado.ABIERTA,
    ).distinct()


def _cartera(cotizacion):
    from apps.cartera.models import Cartera

    return Cartera.objects.filter(cotizacion=cotizacion).first()


def _cuotas_pendientes(cartera) -> list:
    """Cuotas vigentes con saldo, en orden de fecha."""
    if cartera is None:
        return []
    cuotas = cartera.cuotas.filter(anulada=False).select_related("tipo").order_by("fecha_esperada", "created_at")
    return [c for c in cuotas if c.saldo_pendiente > 0]


def _saldo(cuotas) -> Decimal:
    return sum((c.saldo_pendiente for c in cuotas), CERO)


def _acuerdo_pendiente(cartera) -> bool:
    if cartera is None:
        return False
    from apps.cartera.models import AcuerdoPago

    return cartera.acuerdos.filter(estado=AcuerdoPago.Estado.PENDIENTE_FIRMA).exists()


# ── Vista previa ──────────────────────────────────────────────────────────────


def vista_previa(cotizacion) -> dict:
    """Todo lo que el modal muestra antes de terminar."""
    cartera = _cartera(cotizacion)
    cuotas = _cuotas_pendientes(cartera)
    citas = _citas_sin_cerrar(cotizacion)
    return {
        "terminada": cotizacion.terminada_en is not None,
        "puede_reanudar": se_puede_reanudar(cotizacion),
        "sesiones": _sesiones(cotizacion),
        "citas": {grupo: [_cita_publica(c) for c in lista] for grupo, lista in citas.items()},
        "oportunidades_abiertas": _oportunidades_abiertas(cotizacion).count(),
        "saldo": f"{_saldo(cuotas):.2f}",
        "cuotas_pendientes": [
            {
                "id": str(c.id),
                "descripcion": c.descripcion,
                "fecha_esperada": c.fecha_esperada.isoformat() if c.fecha_esperada else None,
                "saldo": f"{c.saldo_pendiente:.2f}",
                "vencida": c.vencida,
            }
            for c in cuotas
        ],
        "forma_pago_sugerida": str(cuotas[0].tipo_id) if cuotas else None,
        "acuerdo_pendiente": _acuerdo_pendiente(cartera),
        "motivos": [{"value": v, "label": l} for v, l in MotivoTerminacion.choices],
    }


# ── Terminar ──────────────────────────────────────────────────────────────────


class TerminarVentaSerializer(serializers.Serializer):
    motivo = serializers.ChoiceField(choices=MotivoTerminacion.choices)
    nota = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)
    # Qué hacer con las citas agendadas o sin cerrar: obligatorio solo si las hay.
    citas = serializers.ChoiceField(choices=["cancelar", "manual"], required=False, allow_null=True)
    # Qué hacer con el saldo: obligatorio solo si hay saldo.
    modo = serializers.ChoiceField(choices=["perdonar", "cobrar"], required=False, allow_null=True)
    valor = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)
    fecha = serializers.DateField(required=False, allow_null=True)
    forma_pago = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs["motivo"] == MotivoTerminacion.OTRO and not attrs.get("nota", "").strip():
            raise serializers.ValidationError({"nota": "Escribe el motivo."})
        return attrs


def _cerrar_cuotas_pendientes(cuotas, *, usuario, etiqueta: str) -> None:
    """Igual que un acuerdo de pago: la cuota con abono queda cerrada por lo
    abonado; la que no tiene abono se anula (y deja de contar para la mora)."""
    from apps.cartera.models import CuotaCarteraLog
    from apps.cartera.services import _append_obs

    logs = []
    for cuota in cuotas:
        abonado = Decimal(cuota.valor_pagado or 0)
        if abonado > 0:
            logs.append(CuotaCarteraLog(
                cuota=cuota, campo="valor_esperado", valor_anterior=str(cuota.valor_esperado),
                valor_nuevo=f"{abonado} ({etiqueta})", modificado_por=usuario,
            ))
            cuota.valor_esperado = abonado
            cuota.pagada = True
            cuota.observaciones = _append_obs(cuota.observaciones, etiqueta)
            cuota.save(update_fields=["valor_esperado", "pagada", "observaciones", "updated_at"])
        else:
            logs.append(CuotaCarteraLog(
                cuota=cuota, campo="anulada", valor_anterior="False",
                valor_nuevo=f"True ({etiqueta})", modificado_por=usuario,
            ))
            cuota.anulada = True
            cuota.excepcion_aprobada = True
            cuota.observaciones = _append_obs(cuota.observaciones, etiqueta)
            cuota.save(update_fields=["anulada", "excepcion_aprobada", "observaciones", "updated_at"])
    if logs:
        CuotaCarteraLog.objects.bulk_create(logs)


def _recalcular_total_cartera(cartera) -> None:
    """El total de la cartera es la suma de sus cuotas vigentes (M6-26)."""
    cartera.total = cartera.cuotas.filter(anulada=False).aggregate(t=Sum("valor_esperado"))["t"] or CERO
    cartera.save(update_fields=["total", "updated_at"])


def _abandonar_tratamientos(cotizacion) -> int:
    from apps.protocolos.models import TratamientoPaciente

    return TratamientoPaciente.objects.filter(
        cotizacion_item__cotizacion=cotizacion, estado=TratamientoPaciente.Estado.ACTIVO,
    ).update(estado=TratamientoPaciente.Estado.ABANDONADO, updated_at=timezone.now())


@transaction.atomic
def terminar(cotizacion, datos: dict, *, usuario, request=None) -> dict:
    """Termina la venta. ``datos`` viene validado por TerminarVentaSerializer.
    Devuelve un resumen de lo que hizo."""
    from apps.agenda.services import cancelar_cita
    from apps.clinicas.models import FormaDePago
    from apps.cartera.models import CuotaCartera
    from apps.seguimiento.services import perder

    cotizacion = Cotizacion.objects.select_for_update().get(pk=cotizacion.pk)
    if cotizacion.estado != Cotizacion.Estado.ACEPTADA:
        _error("Solo se termina una venta (cotización aceptada).", "VENTA_NO_ACEPTADA")
    if cotizacion.terminada_en is not None:
        _error("La venta ya está terminada.", "VENTA_YA_TERMINADA")

    cartera = _cartera(cotizacion)
    if cartera is not None:
        from apps.cartera.models import Cartera

        Cartera.objects.select_for_update().filter(pk=cartera.pk).first()
    if _acuerdo_pendiente(cartera):
        _error(
            "La venta tiene un acuerdo de pago pendiente de firma: anúlalo antes de terminarla.",
            "ACUERDO_PENDIENTE",
        )

    # Citas: si hay agendadas o sin cerrar, hay que elegir qué hacer con ellas.
    grupos = _citas_sin_cerrar(cotizacion)
    cancelables = grupos["agendadas"] + grupos["sin_cerrar"]
    accion_citas = datos.get("citas")
    if cancelables and accion_citas not in ("cancelar", "manual"):
        _error(
            "La venta tiene citas sin cerrar: elige si se cancelan o si las manejas tú.",
            "ELEGIR_ACCION_CITAS",
        )

    # Dinero: si hay saldo, perdonarlo o dejar un cobro de X.
    cuotas = _cuotas_pendientes(cartera)
    saldo = _saldo(cuotas)
    cobro = CERO
    forma_pago = None
    fecha = None
    if saldo > 0:
        modo = datos.get("modo")
        if modo not in ("perdonar", "cobrar"):
            _error("Elige si se perdona el saldo o se cobra un valor.", "ELEGIR_MODO_SALDO")
        if modo == "cobrar":
            cobro = datos.get("valor")
            if cobro is None or cobro <= 0 or cobro > saldo:
                _error(
                    f"El valor a cobrar debe estar entre 1 y el saldo pendiente (${saldo:,.0f}).".replace(",", "."),
                    "VALOR_FUERA_DE_RANGO",
                )
            if cobro < saldo:
                fecha = datos.get("fecha")
                if fecha is None:
                    _error("Elige la fecha del cobro.", "FECHA_REQUERIDA")
                if fecha < timezone.localdate():
                    _error("La fecha del cobro no puede ser anterior a hoy.", "FECHA_INVALIDA")
                forma_pago_id = datos.get("forma_pago") or (cuotas[0].tipo_id if cuotas else None)
                forma_pago = FormaDePago.objects.filter(pk=forma_pago_id, clinica=cotizacion.clinica).first()
                if forma_pago is None:
                    _error("Elige la forma de pago del cobro.", "FORMA_PAGO_REQUERIDA")
    perdonado = saldo - cobro

    # ── Aplicar ──
    ahora = timezone.now()
    cotizacion.terminada_en = ahora
    cotizacion.terminada_por = usuario if getattr(usuario, "is_authenticated", False) else None
    cotizacion.motivo_terminacion = datos["motivo"]
    cotizacion.nota_terminacion = (datos.get("nota") or "").strip()
    cotizacion.saldo_al_terminar = saldo
    cotizacion.valor_perdonado = perdonado
    cotizacion.save(update_fields=[
        "terminada_en", "terminada_por", "motivo_terminacion", "nota_terminacion",
        "saldo_al_terminar", "valor_perdonado", "updated_at",
    ])

    tratamientos = _abandonar_tratamientos(cotizacion)

    motivo_texto = cotizacion.get_motivo_terminacion_display()
    canceladas = []
    if accion_citas == "cancelar":
        for cita in cancelables:
            cancelar_cita(cita, motivo=f"Venta terminada: {motivo_texto}", usuario=usuario, request=request)
            canceladas.append(str(cita.id))

    oportunidades = 0
    for oportunidad in _oportunidades_abiertas(cotizacion):
        perder(oportunidad, usuario=usuario, motivo="otro", nota=f"Venta terminada: {motivo_texto}")
        oportunidades += 1

    if cartera is not None and perdonado > 0:
        etiqueta = "Cerrada por terminación de la venta"
        _cerrar_cuotas_pendientes(cuotas, usuario=usuario, etiqueta=etiqueta)
        if cobro > 0:
            CuotaCartera.objects.create(
                cartera=cartera,
                tipo=forma_pago,
                descripcion="Cobro acordado al terminar la venta",
                valor_esperado=cobro,
                fecha_esperada=fecha,
            )
        _recalcular_total_cartera(cartera)

    resumen = {
        "motivo": cotizacion.motivo_terminacion,
        "nota": cotizacion.nota_terminacion,
        "saldo": f"{saldo:.2f}",
        "cobro": f"{cobro:.2f}",
        "perdonado": f"{perdonado:.2f}",
        "citas": accion_citas or "",
        "citas_canceladas": len(canceladas),
        "citas_en_atencion": len(grupos["en_atencion"]),
        "citas_a_cargo_de_la_clinica": 0 if accion_citas == "cancelar" else len(cancelables),
        "tratamientos_abandonados": tratamientos,
        "oportunidades_cerradas": oportunidades,
    }
    registrar_accion(request, "venta.terminar", cotizacion, resumen, actor=usuario)
    return resumen


# ── Reanudar ──────────────────────────────────────────────────────────────────


@transaction.atomic
def reanudar(cotizacion, *, usuario, request=None) -> None:
    from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

    cotizacion = Cotizacion.objects.select_for_update().get(pk=cotizacion.pk)
    if cotizacion.terminada_en is None:
        _error("La venta no está terminada.", "VENTA_NO_TERMINADA")
    if not se_puede_reanudar(cotizacion):
        _error(
            "Al terminar la venta se perdonó parte del saldo: no se puede reanudar. Si el paciente vuelve, haz una venta nueva.",
            "NO_REANUDABLE",
        )

    terminada_en = cotizacion.terminada_en
    for tratamiento in TratamientoPaciente.objects.filter(
        cotizacion_item__cotizacion=cotizacion, estado=TratamientoPaciente.Estado.ABANDONADO,
    ):
        sesiones = tratamiento.sesiones.filter(activo=True)
        total = sesiones.count()
        completas = sesiones.filter(estado=SesionProcedimiento.Estado.COMPLETADO).count()
        tratamiento.estado = (
            TratamientoPaciente.Estado.COMPLETADO if total and completas >= total else TratamientoPaciente.Estado.ACTIVO
        )
        tratamiento.save(update_fields=["estado", "updated_at"])

    cotizacion.terminada_en = None
    cotizacion.terminada_por = None
    cotizacion.motivo_terminacion = ""
    cotizacion.nota_terminacion = ""
    cotizacion.saldo_al_terminar = None
    cotizacion.valor_perdonado = CERO
    cotizacion.save(update_fields=[
        "terminada_en", "terminada_por", "motivo_terminacion", "nota_terminacion",
        "saldo_al_terminar", "valor_perdonado", "updated_at",
    ])
    registrar_accion(
        request, "venta.reanudar", cotizacion, {"terminada_en": terminada_en.isoformat()}, actor=usuario,
    )
