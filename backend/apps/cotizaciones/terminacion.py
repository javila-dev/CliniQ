"""Terminar una venta que el paciente deja a medias (docs/plan-terminacion-ventas.md).

La cotización sigue ``aceptada`` (cuenta como vendida en su ``aceptada_en``);
``terminada_en`` marca que ya no se agendan más sesiones. Al terminar:

- Los tratamientos del paciente de la venta pasan a ``ABANDONADO`` (ritmo,
  "Paquetes sin movimiento" y el seguimiento ya lo respetan).
- Las citas sin cerrar se cancelan o quedan a cargo de la clínica, según elija
  quien termina. Las que están en atención nunca se cancelan solas.
- Las oportunidades abiertas del paquete se cierran como perdidas.
- El saldo de cartera se perdona o se deja un cobro de X (0 < X ≤ saldo). En
  los dos casos el plan de cuotas pendiente se cierra; al cobrar queda una sola
  cuota por X, con su fecha y forma de pago, aunque X sea el saldo completo. El
  saldo es el que muestra la cartera (``total − abonado``), aunque parte no
  tenga cuota (ver ``_saldo_venta``).

Reanudar solo se puede si no se perdonó nada (el plan cerrado no vuelve: queda
la cuota del cobro). Si un usuario dejó por error la cartera de una venta
terminada con saldo, soporte la cierra con ``cerrar_cartera``.
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


def _saldo_venta(cartera, cuotas) -> Decimal:
    """Saldo que se perdona o se cobra al terminar.

    La cartera muestra ``total − abonado`` (listado, resumen, filtro "pagada"),
    pero hay carteras cuyo total no cuadra con sus cuotas: ventas aceptadas antes
    de exigir el plan de pagos quedaron sin cuotas o con cuotas que no suman el
    total. Ese saldo sin cuota también es deuda: si solo se miraran las cuotas,
    la terminación lo ignoraría y la cartera quedaría activa para siempre.
    """
    saldo_cuotas = _saldo(cuotas)
    if cartera is None:
        return saldo_cuotas
    return max(saldo_cuotas, Decimal(cartera.saldo_pendiente))


def _forma_pago_sugerida(cartera, cuotas):
    """Forma de pago del cobro de X: la de la primera cuota pendiente; si no hay,
    la de la última cuota de la cartera; si tampoco, efectivo."""
    if cuotas:
        return cuotas[0].tipo
    if cartera is not None:
        ultima = cartera.cuotas.select_related("tipo").order_by("-created_at").first()
        if ultima is not None:
            return ultima.tipo
        from apps.clinicas.models import FormaDePago

        return (
            FormaDePago.objects.filter(clinica_id=cartera.cotizacion.clinica_id, tipo_base="efectivo", activo=True)
            .order_by("created_at")
            .first()
        )
    return None


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
    saldo = _saldo_venta(cartera, cuotas)
    forma_pago = _forma_pago_sugerida(cartera, cuotas)
    return {
        "terminada": cotizacion.terminada_en is not None,
        "puede_reanudar": se_puede_reanudar(cotizacion),
        "sesiones": _sesiones(cotizacion),
        "citas": {grupo: [_cita_publica(c) for c in lista] for grupo, lista in citas.items()},
        "oportunidades_abiertas": _oportunidades_abiertas(cotizacion).count(),
        "saldo": f"{saldo:.2f}",
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
        "forma_pago_sugerida": str(forma_pago.id) if forma_pago else None,
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
    saldo = _saldo_venta(cartera, cuotas)
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
            # Cobrar siempre cierra el plan y deja una sola cuota por X, también
            # cuando X es el saldo completo: la venta terminó y su plan de cuotas
            # (con su mora) ya no rige.
            fecha = datos.get("fecha")
            if fecha is None and cobro == saldo:
                # Compatibilidad: el modal anterior solo pedía fecha en un cobro parcial.
                fecha = timezone.localdate()
            if fecha is None:
                _error("Elige la fecha del cobro.", "FECHA_REQUERIDA")
            if fecha < timezone.localdate():
                _error("La fecha del cobro no puede ser anterior a hoy.", "FECHA_INVALIDA")
            forma_pago_id = datos.get("forma_pago")
            if forma_pago_id is None:
                sugerida = _forma_pago_sugerida(cartera, cuotas)
                forma_pago_id = sugerida.id if sugerida else None
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

    if cartera is not None and saldo > 0:
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


# ── Soporte: cerrar la cartera de una venta terminada ────────────────────────
# Al terminar, quien cobró un valor pudo dejar por error la cartera con saldo
# (o la venta se terminó antes de que la terminación viera el saldo sin cuota).
# Soporte la cierra desde el console: perdona lo pendiente, igual que "perdonar"
# al terminar. Solo para ventas ya terminadas.


def _descripcion_venta(cotizacion) -> str:
    items = cotizacion.items.filter(activo=True).exclude(tipo=ItemCotizacion.Tipo.INSUMO).order_by("created_at")
    return ", ".join(i.descripcion for i in items) or "Venta sin ítems"


def _cartera_soporte(cotizacion) -> dict:
    cartera = _cartera(cotizacion)
    cuotas = _cuotas_pendientes(cartera)
    saldo = _saldo_venta(cartera, cuotas)
    bloqueo = None
    if cartera is None or saldo <= 0:
        bloqueo = "La cartera ya está cerrada: no tiene saldo pendiente."
    elif _acuerdo_pendiente(cartera):
        bloqueo = "La cartera tiene un acuerdo de pago pendiente de firma: anúlalo antes de cerrarla."
    return {
        "cotizacion_id": str(cotizacion.id),
        "descripcion": _descripcion_venta(cotizacion),
        "aceptada_en": cotizacion.aceptada_en,
        "terminada_en": cotizacion.terminada_en,
        "motivo_terminacion": cotizacion.get_motivo_terminacion_display(),
        "terminada_por": cotizacion.terminada_por.nombre_completo if cotizacion.terminada_por_id else None,
        "valor_perdonado": f"{Decimal(cotizacion.valor_perdonado or 0):.2f}",
        "saldo": f"{max(saldo, CERO):.2f}",
        # Parte del saldo que ninguna cuota cubre (carteras descuadradas).
        "saldo_sin_cuota": f"{max(saldo - _saldo(cuotas), CERO):.2f}",
        "cuotas_pendientes": [
            {
                "id": str(c.id),
                "descripcion": c.descripcion,
                "fecha_esperada": c.fecha_esperada.isoformat() if c.fecha_esperada else None,
                "saldo": f"{c.saldo_pendiente:.2f}",
                "abonado": f"{Decimal(c.valor_pagado or 0):.2f}",
                "vencida": c.vencida,
            }
            for c in cuotas
        ],
        "bloqueo": bloqueo,
    }


def ventas_terminadas_del_paciente(clinica, paciente) -> list[dict]:
    """Ventas terminadas del paciente con el estado de su cartera."""
    ventas = Cotizacion.objects.filter(
        clinica=clinica, paciente=paciente, estado=Cotizacion.Estado.ACEPTADA, terminada_en__isnull=False,
    ).select_related("terminada_por").order_by("-terminada_en")
    return [_cartera_soporte(v) for v in ventas]


def cerrar_cartera(clinica, cotizacion_id, *, motivo: str, usuario=None, request=None):
    """Perdona el saldo pendiente de la cartera de una venta terminada: cierra
    sus cuotas pendientes como al terminar con "perdonar" y suma lo cerrado a
    ``valor_perdonado``. Devuelve la ``CorreccionSoporte``."""
    from apps.agenda import soporte
    from apps.agenda.models import CorreccionSoporte
    from apps.cartera.models import Cartera

    motivo = (motivo or "").strip()
    if not motivo:
        _error("Escribe el motivo.", "MOTIVO_REQUERIDO")

    with transaction.atomic():
        cotizacion = (
            Cotizacion.objects.select_for_update().select_related("paciente")
            .filter(pk=cotizacion_id, clinica=clinica).first()
        )
        if cotizacion is None:
            _error("La venta no existe en esta clínica.", "VENTA_NO_ENCONTRADA")
        if cotizacion.estado != Cotizacion.Estado.ACEPTADA or cotizacion.terminada_en is None:
            _error(
                "Solo se cierra la cartera de una venta terminada. Termina la venta desde su pantalla.",
                "VENTA_NO_TERMINADA",
            )
        cartera = Cartera.objects.select_for_update().filter(cotizacion=cotizacion).first()
        cuotas = _cuotas_pendientes(cartera)
        saldo = _saldo_venta(cartera, cuotas)
        if cartera is None or saldo <= 0:
            _error("La cartera ya está cerrada: no tiene saldo pendiente.", "CARTERA_YA_CERRADA")
        if _acuerdo_pendiente(cartera):
            _error(
                "La cartera tiene un acuerdo de pago pendiente de firma: anúlalo antes de cerrarla.",
                "ACUERDO_PENDIENTE",
            )

        total_antes = cartera.total
        perdonado_antes = Decimal(cotizacion.valor_perdonado or 0)
        _cerrar_cuotas_pendientes(cuotas, usuario=usuario, etiqueta="Cerrada por soporte: venta terminada")
        _recalcular_total_cartera(cartera)

        cotizacion.valor_perdonado = perdonado_antes + saldo
        # valor_perdonado nunca supera el saldo que había al terminar.
        cotizacion.saldo_al_terminar = max(Decimal(cotizacion.saldo_al_terminar or 0), cotizacion.valor_perdonado)
        cotizacion.save(update_fields=["valor_perdonado", "saldo_al_terminar", "updated_at"])

        cambio = {
            "paquete": _descripcion_venta(cotizacion),
            "saldo_cerrado": f"{saldo:.2f}",
            "cuotas_cerradas": len(cuotas),
            "total_cartera_antes": f"{total_antes:.2f}",
            "total_cartera_despues": f"{cartera.total:.2f}",
            "valor_perdonado_antes": f"{perdonado_antes:.2f}",
            "valor_perdonado_despues": f"{cotizacion.valor_perdonado:.2f}",
        }
        return soporte.registrar(
            request,
            clinica=clinica, tipo=CorreccionSoporte.Tipo.CERRAR_CARTERA, cita=None,
            paciente=cotizacion.paciente, objeto=cotizacion,
            accion_cobro=CorreccionSoporte.AccionCobro.SIN_COBRO, motivo=motivo, usuario=usuario,
            resumen={"cotizacion": str(cotizacion.id), **cambio}, detalle=cambio,
        )
