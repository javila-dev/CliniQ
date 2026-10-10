"""Ritmo de un paquete vendido: cuándo debería ser la siguiente sesión.

Regla (decidida 2026-10-09):

    próxima esperada = fecha de la última sesión REALIZADA + días de la sesión que sigue
    sin sesiones realizadas: fecha de compra + ConfigSeguimiento.dias_tras_compra

Los "días de la sesión que sigue" salen, en este orden, de: la copia guardada
en la sesión vendida (``SesionProcedimiento.cada_dias``, que viene del bloque
del tratamiento o de las semanas del protocolo), el ítem de la cotización, el
procedimiento del catálogo y, si nada lo define, ``dias_sin_sesion`` de la
clínica (``sin_ritmo=True``: es un valor genérico, no del tratamiento).

Estados:
    completo  -> ya se hicieron todas las sesiones vendidas
    pausado   -> el tratamiento del paciente está abandonado
    agendada  -> la siguiente sesión ya tiene cita (o hay una cita pasada que
                 la recepción aún no cierra: no se marca atraso por eso)
    a_tiempo  -> todavía no le toca
    pronto    -> le toca dentro de ``dias_aviso_previo``
    atrasada  -> la fecha esperada pasó hace más de ``tolerancia_dias``
    (entre la fecha esperada y el fin de la tolerancia también es "pronto").
    Para la primera sesión no hay tolerancia: atrasada desde el día siguiente
    a compra + ``dias_tras_compra`` (con 7: al día 8).
"""

from datetime import datetime, timedelta

from django.utils import timezone

ESTADOS_ACTIVOS_CITA = ("pendiente", "confirmada", "en_espera", "en_curso")


def _fecha(valor):
    return timezone.localdate(valor) if isinstance(valor, datetime) else valor


def calcular(item, config, hoy=None):
    """Ritmo de un ``ItemCotizacion`` de una cotización aceptada. Devuelve un dict
    o None si el ítem no vende sesiones agendables."""
    from apps.agenda.models import Cita
    from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

    if not item.tiene_cupo_propio or item.tipo == item.Tipo.INSUMO:
        return None
    hoy = hoy or timezone.localdate()
    total = item.num_sesiones_efectivas()
    if not total:
        return None

    citas = list(item.citas.all())
    completadas = [c for c in citas if c.estado == Cita.Estado.COMPLETADA]
    tratamiento = item.tratamientos_paciente.order_by("created_at").first()
    sesiones = []
    if tratamiento is not None:
        sesiones = list(
            tratamiento.sesiones.filter(activo=True).order_by("tipo_sesion__orden", "paso__orden", "numero", "created_at")
        )
    realizadas_sin_cita = [
        s for s in sesiones if s.estado == SesionProcedimiento.Estado.COMPLETADO and s.cita_id is None
    ]
    # Las sesiones previas de una migración se guardan dos veces: como número en
    # el ítem y como sesiones completadas sin cita. Se cuentan una sola vez.
    realizadas = len(completadas) + max(item.sesiones_previas_consumidas, len(realizadas_sin_cita))

    base = {"total": total, "realizadas": min(realizadas, total), "cada_dias": None, "sin_ritmo": False}
    if realizadas >= total:
        return {**base, "estado": "completo", "proxima_esperada": None, "dias_atraso": 0}
    if tratamiento is not None and tratamiento.estado == TratamientoPaciente.Estado.ABANDONADO:
        return {**base, "estado": "pausado", "proxima_esperada": None, "dias_atraso": 0}

    activas = [c for c in citas if c.estado in ESTADOS_ACTIVOS_CITA]
    # La próxima cita; si solo hay pasadas sin cerrar, la más reciente de ellas.
    agendada = min(
        (c for c in activas if _fecha(c.fecha_inicio) >= hoy), key=lambda c: c.fecha_inicio, default=None,
    ) or max(activas, key=lambda c: c.fecha_inicio, default=None)
    if agendada is not None:
        return {**base, "estado": "agendada", "proxima_esperada": _fecha(agendada.fecha_inicio), "dias_atraso": 0}

    fechas_realizadas = [_fecha(c.fecha_inicio) for c in completadas]
    fechas_realizadas += [s.fecha for s in realizadas_sin_cita if s.fecha]
    ultima = max(fechas_realizadas, default=None)

    if ultima is None:
        compra = item.cotizacion.aceptada_en or item.cotizacion.created_at
        esperada = _fecha(compra) + timedelta(days=config.dias_tras_compra)
        cada_dias = config.dias_tras_compra
        sin_ritmo = False
    else:
        # La siguiente es la primera sesión aún pendiente (no la posición N: las
        # sesiones pueden hacerse fuera de orden).
        siguiente = next((s for s in sesiones if s.estado == SesionProcedimiento.Estado.PENDIENTE), None)
        cada_dias = next(
            (
                valor for valor in (
                    siguiente.cada_dias if siguiente else None,
                    item.cada_dias,
                    getattr(item.procedimiento or item.servicio, "cada_dias", None),
                )
                if valor is not None  # 0 es válido: dos pasos del protocolo la misma semana
            ),
            None,
        )
        sin_ritmo = cada_dias is None
        if sin_ritmo:
            cada_dias = config.dias_sin_sesion
        esperada = ultima + timedelta(days=cada_dias)

    atraso = (hoy - esperada).days
    # Compró y no ha agendado la primera: se avisa al día siguiente de la fecha
    # esperada, sin tolerancia. Entre sesiones sí aplica la tolerancia.
    tolerancia = 0 if ultima is None else config.tolerancia_dias
    if atraso > tolerancia:
        estado = "atrasada"
    elif atraso >= 0 or (esperada - hoy).days <= config.dias_aviso_previo:
        estado = "pronto"
    else:
        estado = "a_tiempo"

    no_asistio = any(
        c.estado == Cita.Estado.NO_ASISTIO and (ultima is None or _fecha(c.fecha_inicio) >= ultima) for c in citas
    )
    return {
        **base,
        "estado": estado,
        "proxima_esperada": esperada,
        "dias_atraso": max(atraso, 0),
        "cada_dias": cada_dias,
        "sin_ritmo": sin_ritmo,
        "ultima_realizada": ultima,
        "no_asistio": no_asistio,
    }


def serializar(ritmo):
    if ritmo is None:
        return None
    salida = dict(ritmo)
    for clave in ("proxima_esperada", "ultima_realizada"):
        if salida.get(clave) is not None:
            salida[clave] = salida[clave].isoformat()
    return salida
