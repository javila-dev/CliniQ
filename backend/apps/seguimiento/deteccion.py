"""Detección diaria de paquetes atrasados (M1 del plan de seguimiento).

Para cada paquete vendido calcula su ritmo (``ritmo.calcular``) y:

- si está **atrasado**, crea o actualiza su oportunidad (tipo "paquete") para
  que aparezca en "Para hoy";
- si una oportunidad de paquete ya no está atrasada (agendó o avanzó), la
  cierra: **recuperada** (ganada) si hay una cita creada después de detectarla,
  **resuelta sola** si no.

Es idempotente: la clave incluye el número de la sesión que toca, así cada
sesión genera como máximo una oportunidad. Si una que se cerró sola vuelve a
estar atrasada (p. ej. se canceló la cita o no asistió) se reabre; las que la
recepción cerró a mano no. Se dispara una vez al día por clínica (ver
``detectar_si_toca``).

Solo se crean oportunidades con hasta ``MAX_DIAS_ATRASO_NUEVA`` días de atraso:
al activar la función, las ventas viejas sin citas ligadas no llenan "Para hoy"
de golpe. Corriendo a diario, todo atraso nuevo se detecta mucho antes.
"""

import logging

from django.db import transaction
from django.utils import timezone

from apps.seguimiento import ritmo
from apps.seguimiento.models import ConfigSeguimiento, Oportunidad

logger = logging.getLogger(__name__)

MAX_DIAS_ATRASO_NUEVA = 60


def _frase(item, r) -> str:
    sesion = f"sesión {r['realizadas'] + 1} de {r['total']}"
    if r.get("ultima_realizada") is None:
        texto = f"{item.descripcion} · compró y no ha agendado ninguna sesión"
    else:
        texto = f"{item.descripcion} · {sesion} · debía agendar hace {r['dias_atraso']} día{'s' if r['dias_atraso'] != 1 else ''}"
    if r.get("no_asistio"):
        texto += " · no asistió a su última cita"
    return texto


def _items_vendidos(clinica):
    from apps.agenda.models import Cita
    from apps.cotizaciones.models import Cotizacion, ItemCotizacion
    from apps.protocolos.models import TratamientoPaciente
    from django.db.models import Prefetch

    # Sin productos ni los paquetes ya terminados o abandonados, que no pueden
    # estar atrasados.
    return (
        ItemCotizacion.objects.filter(
            activo=True,
            cotizacion__clinica=clinica,
            cotizacion__activo=True,
            cotizacion__estado=Cotizacion.Estado.ACEPTADA,
            cotizacion__paciente__activo=True,
        )
        .exclude(tipo=ItemCotizacion.Tipo.INSUMO)
        .exclude(tratamientos_paciente__estado__in=[
            TratamientoPaciente.Estado.COMPLETADO, TratamientoPaciente.Estado.ABANDONADO,
        ])
        .distinct()
        .select_related("cotizacion", "cotizacion__paciente", "tratamiento", "procedimiento", "servicio")
        .prefetch_related(Prefetch("citas", queryset=Cita.objects.exclude(estado=Cita.Estado.CANCELADA)))
    )


@transaction.atomic
def detectar_paquetes(clinica, hoy=None) -> dict:
    hoy = hoy or timezone.localdate()
    config = ConfigSeguimiento.de(clinica)
    vigentes = set()
    creadas = reabiertas = 0

    for item in _items_vendidos(clinica):
        r = ritmo.calcular(item, config, hoy=hoy)
        if r is None or r["estado"] != "atrasada":
            continue
        clave = f"sesiones_pendientes:item:{item.id}:sesion:{r['realizadas'] + 1}"
        vigentes.add(clave)
        if r["dias_atraso"] > MAX_DIAS_ATRASO_NUEVA and not Oportunidad.objects.filter(
            clinica=clinica, clave=clave,
        ).exists():
            continue
        detalle = {
            "frase": _frase(item, r),
            "proxima_esperada": r["proxima_esperada"].isoformat(),
            "dias_atraso": r["dias_atraso"],
            "sesion": r["realizadas"] + 1,
            "total": r["total"],
            "item_tipo": item.tipo,
        }
        oportunidad, creada = Oportunidad.objects.get_or_create(
            clinica=clinica,
            clave=clave,
            defaults={
                "paciente": item.cotizacion.paciente,
                "sede": item.cotizacion.sede,
                "tipo": Oportunidad.Tipo.PAQUETE,
                "motivo": Oportunidad.Motivo.SESIONES_PENDIENTES,
                "item_cotizacion": item,
                "cotizacion": item.cotizacion,
                "proximo_contacto": hoy,
                "detalle": detalle,
                "detectada_en": timezone.now(),
            },
        )
        if creada:
            creadas += 1
        elif oportunidad.estado == Oportunidad.Estado.ABIERTA:
            # Solo se refresca el texto (los días de atraso cambian cada día).
            oportunidad.detalle = detalle
            oportunidad.save(update_fields=["detalle", "updated_at"])
        elif oportunidad.cerrada_por_id is None and oportunidad.estado in (
            Oportunidad.Estado.GANADA, Oportunidad.Estado.RESUELTA_SOLA,
        ):
            # Se había cerrado sola (agendó) pero sigue atrasada: la cita se
            # canceló o no asistió. Vuelve a "Para hoy".
            oportunidad.estado = Oportunidad.Estado.ABIERTA
            oportunidad.detalle = detalle
            oportunidad.proximo_contacto = hoy
            oportunidad.detectada_en = timezone.now()
            oportunidad.cerrada_en = None
            oportunidad.save(update_fields=[
                "estado", "detalle", "proximo_contacto", "detectada_en", "cerrada_en", "updated_at",
            ])
            reabiertas += 1

    # Las que dejaron de estar atrasadas se cierran solas.
    cerradas = 0
    abiertas = Oportunidad.objects.filter(
        clinica=clinica, estado=Oportunidad.Estado.ABIERTA, motivo=Oportunidad.Motivo.SESIONES_PENDIENTES,
    ).exclude(clave__in=vigentes)
    for oportunidad in abiertas.select_related("item_cotizacion"):
        cerrar_paquete(oportunidad)
        cerradas += 1

    config.ultima_deteccion = hoy
    config.save(update_fields=["ultima_deteccion", "updated_at"])
    return {
        "creadas": creadas,
        "reabiertas": reabiertas,
        "abiertas": Oportunidad.objects.filter(
            clinica=clinica, estado=Oportunidad.Estado.ABIERTA, motivo=Oportunidad.Motivo.SESIONES_PENDIENTES,
        ).count(),
        "cerradas": cerradas,
    }


def cerrar_paquete(oportunidad, cita=None):
    """Recuperada si hay una cita del paquete creada después de detectarla; si no, resuelta sola."""
    if cita is None and oportunidad.item_cotizacion_id and oportunidad.detectada_en:
        cita = (
            oportunidad.item_cotizacion.citas.exclude(estado="cancelada")
            .filter(created_at__gte=oportunidad.detectada_en)
            .order_by("created_at")
            .first()
        )
    oportunidad.estado = Oportunidad.Estado.GANADA if cita else Oportunidad.Estado.RESUELTA_SOLA
    oportunidad.cita = cita or oportunidad.cita
    oportunidad.proximo_contacto = None
    oportunidad.cerrada_en = timezone.now()
    oportunidad.save(update_fields=["estado", "cita", "proximo_contacto", "cerrada_en", "updated_at"])


def detectar_si_toca(clinica) -> None:
    """Corre la detección una vez al día por clínica (la primera consulta del día).

    Así funciona sin depender de un cron; el endpoint para n8n hace lo mismo.
    Un error aquí nunca rompe la bandeja.
    """
    try:
        config = ConfigSeguimiento.de(clinica)
        hoy = timezone.localdate()
        if config.ultima_deteccion == hoy:
            return
        # Reclama el día antes de detectar: si dos consultas llegan a la vez solo
        # una corre la detección, y si falla no se reintenta en cada consulta.
        reclamado = ConfigSeguimiento.objects.filter(pk=config.pk).exclude(ultima_deteccion=hoy).update(
            ultima_deteccion=hoy,
        )
        if not reclamado:
            return
        detectar_paquetes(clinica, hoy=hoy)
    except Exception:
        logger.exception("[seguimiento] fallo la deteccion diaria | clinica_id=%s", getattr(clinica, "id", None))
