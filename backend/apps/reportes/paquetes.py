"""Paquetes sin movimiento: lo vendido o importado que no se está atendiendo en la app.

Un paquete es un ítem con sesiones agendables de una cotización aceptada: una
venta o un paciente que llegó por la puesta en marcha (importado). Está **activo**
mientras le falten sesiones y su tratamiento no esté pausado (abandonado).

Un paquete activo está **sin movimiento** cuando no tiene una próxima cita y su
último movimiento (la última sesión hecha o, si no hay, la venta o la carga) fue
hace ``dias`` o más. Si nunca tuvo una cita en la app, queda como **nunca
agendado**: lo más común cuando se vende o se importa y se atiende por fuera.

Cada paquete tiene un **responsable**: quien lo vendió o, si es importado, quien
hizo la carga. El resumen por responsable y por sede es lo que da trazabilidad:
cuántos paquetes activos tiene cada uno y cuántos están quietos.

Las sesiones hechas se cuentan como en el ritmo del paquete
(``seguimiento.ritmo``): citas completadas más las hechas sin cita (las previas
de una carga se guardan dos veces y se cuentan una).
"""

from datetime import datetime

from django.db.models import Count, Prefetch, Q
from django.utils import timezone

ESTADOS_CITA_ACTIVA = ("pendiente", "confirmada", "en_espera", "en_curso")
DIAS_POR_DEFECTO = 30


def _fecha(valor):
    return timezone.localdate(valor) if isinstance(valor, datetime) else valor


def _items(clinica, sede_ids):
    from apps.agenda.models import Cita
    from apps.clinicas.models import TipoSesion
    from apps.cotizaciones.models import Cotizacion, ItemCotizacion
    from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

    items = ItemCotizacion.objects.filter(
        activo=True, cotizacion__clinica=clinica, cotizacion__activo=True,
        cotizacion__estado=Cotizacion.Estado.ACEPTADA,
    ).exclude(tipo=ItemCotizacion.Tipo.INSUMO).exclude(
        # Obsequios sin cupo propio: informativos y sesiones clonadas (suman al tratamiento).
        Q(es_obsequio=True) & (Q(agendable=False) | Q(item_origen__isnull=False)),
    )
    if sede_ids is not None:
        items = items.filter(cotizacion__sede_id__in=sede_ids)

    # Lo que leen num_sesiones_efectivas y el conteo de sesiones hechas, precargado
    # para no consultar por paquete (igual que el listado de ventas).
    seguimientos = TratamientoPaciente.objects.annotate(
        _n_sesiones_vendidas=Count("sesiones", filter=Q(sesiones__item_obsequio__isnull=True)),
        _n_hechas_sin_cita=Count(
            "sesiones",
            filter=Q(
                sesiones__activo=True, sesiones__cita__isnull=True,
                sesiones__estado=SesionProcedimiento.Estado.COMPLETADO,
            ),
        ),
    ).order_by("created_at")
    sesiones_sin_cita = SesionProcedimiento.objects.filter(
        activo=True, cita__isnull=True, estado=SesionProcedimiento.Estado.COMPLETADO, fecha__isnull=False,
    ).only("id", "tratamiento_id", "fecha", "registrada_despues_en")
    return items.select_related(
        "tratamiento", "cotizacion", "cotizacion__paciente", "cotizacion__sede", "cotizacion__profesional",
    ).prefetch_related(
        Prefetch("citas", queryset=Cita.objects.only("id", "item_cotizacion_id", "estado", "fecha_inicio")),
        Prefetch(
            "obsequios",
            queryset=ItemCotizacion.objects.filter(activo=True, es_obsequio=True, agendable=True),
            to_attr="_obsequios_agendables",
        ),
        Prefetch(
            "tratamientos_paciente",
            queryset=seguimientos.prefetch_related(
                Prefetch("sesiones", queryset=sesiones_sin_cita, to_attr="_hechas_sin_cita"),
            ),
            to_attr="_seguimientos_vendidos",
        ),
        Prefetch(
            "tratamiento__tipos_sesion",
            queryset=TipoSesion.objects.filter(es_compromiso=True, activo=True),
            to_attr="_tipos_sesion_compromiso",
        ),
    )


def _responsables_de_cargas(clinica, items) -> dict:
    """Quién hizo cada carga de la puesta en marcha (las no revertidas)."""
    from apps.migracion.models import LoteMigracion

    lotes = {i.cotizacion.lote_migracion for i in items if i.cotizacion.es_migracion and i.cotizacion.lote_migracion}
    if not lotes:
        return {}
    return {
        lote.id: lote
        for lote in LoteMigracion.objects.filter(clinica=clinica, pk__in=lotes, revertido_en__isnull=True)
        .select_related("creado_por")
    }


def _paquete(item, lotes, hoy) -> dict | None:
    """El estado de un paquete, o None si no está activo (completo, pausado o revertido)."""
    from apps.protocolos.models import TratamientoPaciente

    cotizacion = item.cotizacion
    if cotizacion.terminada_en is not None:
        return None  # venta terminada: el paciente dejó el paquete
    if cotizacion.es_migracion:
        lote = lotes.get(cotizacion.lote_migracion)
        if lote is None:
            return None  # carga revertida
        origen, responsable, inicio = "importado", lote.creado_por, lote.created_at
    else:
        origen, responsable, inicio = "venta", cotizacion.profesional, cotizacion.aceptada_en or cotizacion.created_at

    total = item.num_sesiones_efectivas()
    if not total:
        return None
    seguimientos = item._seguimientos_vendidos
    seguimiento = seguimientos[0] if seguimientos else None
    if seguimiento is not None and seguimiento.estado == TratamientoPaciente.Estado.ABANDONADO:
        return None

    citas = list(item.citas.all())
    completadas = [c for c in citas if c.estado == "completada"]
    hechas_sin_cita = seguimiento._n_hechas_sin_cita if seguimiento else 0
    hechas = len(completadas) + max(item.sesiones_previas_consumidas, hechas_sin_cita)
    if hechas >= total:
        return None

    activas = sorted((c for c in citas if c.estado in ESTADOS_CITA_ACTIVA), key=lambda c: c.fecha_inicio)
    proxima = next((c for c in activas if _fecha(c.fecha_inicio) >= hoy), None) or (activas[-1] if activas else None)
    fechas_hechas = [_fecha(c.fecha_inicio) for c in completadas]
    if seguimiento is not None:
        fechas_hechas += [s.fecha for s in seguimiento._hechas_sin_cita]
    ultima = max(fechas_hechas, default=None)
    referencia = ultima or _fecha(inicio)
    en_app = [c for c in citas if c.estado not in ("cancelada",)]

    if proxima is not None:
        estado = "con_cita"
    elif not en_app:
        estado = "nunca_agendado"
    else:
        estado = "sin_proxima_cita"

    paciente = cotizacion.paciente
    return {
        "item_id": str(item.id),
        "cotizacion_id": str(cotizacion.id),
        "paciente_id": str(paciente.id),
        "paciente_nombre": paciente.nombre_completo,
        "tratamiento": item.descripcion,
        "sede_id": str(cotizacion.sede_id) if cotizacion.sede_id else None,
        "sede_nombre": cotizacion.sede.nombre if cotizacion.sede_id else None,
        "origen": origen,
        "responsable_id": str(responsable.id) if responsable else None,
        "responsable_nombre": responsable.nombre_completo if responsable else None,
        "inicio": _fecha(inicio).isoformat(),
        "sesiones_total": total,
        "sesiones_hechas": hechas,
        "citas_en_app": len(en_app),
        "ultima_atencion": ultima.isoformat() if ultima else None,
        "proxima_cita": proxima.fecha_inicio.isoformat() if proxima else None,
        "dias_sin_movimiento": max((hoy - referencia).days, 0),
        "registradas_despues": sum(1 for s in seguimiento._hechas_sin_cita if s.registrada_despues_en)
        if seguimiento is not None else 0,
        "estado": estado,
    }


def _grupo(grupos, clave, nombre) -> dict:
    return grupos.setdefault(clave, {
        "id": clave, "nombre": nombre, "activos": 0, "nunca_agendados": 0, "sin_movimiento": 0,
        "registradas_despues": 0,
    })


def _registradas_despues(clinica, sede_ids, origen) -> list[dict]:
    """Sesiones registradas después (hechas por fuera de la app), con el
    responsable y la sede de su paquete. Cuentan también las de paquetes ya
    completos: muestran si la costumbre de atender por fuera sigue."""
    from apps.migracion.models import LoteMigracion
    from apps.protocolos.models import SesionProcedimiento

    filas = SesionProcedimiento.objects.filter(
        activo=True, registrada_despues_en__isnull=False,
        tratamiento__cotizacion_item__cotizacion__clinica=clinica,
    )
    if sede_ids is not None:
        filas = filas.filter(tratamiento__cotizacion_item__cotizacion__sede_id__in=sede_ids)
    if origen:
        filas = filas.filter(tratamiento__cotizacion_item__cotizacion__es_migracion=(origen == "importado"))
    filas = list(filas.values(
        "tratamiento__cotizacion_item__cotizacion__es_migracion",
        "tratamiento__cotizacion_item__cotizacion__lote_migracion",
        "tratamiento__cotizacion_item__cotizacion__profesional_id",
        "tratamiento__cotizacion_item__cotizacion__sede_id",
    ))
    pre = "tratamiento__cotizacion_item__cotizacion__"
    lotes = {
        lote.id: lote.creado_por_id
        for lote in LoteMigracion.objects.filter(
            clinica=clinica, pk__in={f[pre + "lote_migracion"] for f in filas if f[pre + "es_migracion"]},
        ).only("id", "creado_por_id")
    }
    return [
        {
            "responsable_id": str(r) if (r := (
                lotes.get(f[pre + "lote_migracion"]) if f[pre + "es_migracion"] else f[pre + "profesional_id"]
            )) else None,
            "sede_id": str(f[pre + "sede_id"]) if f[pre + "sede_id"] else None,
        }
        for f in filas
    ]


def _resumen(activos, clave_id, clave_nombre, dias, registradas=(), nombres=None) -> list[dict]:
    grupos: dict = {}
    for r in registradas:
        _grupo(grupos, r[clave_id], (nombres or {}).get(r[clave_id]))["registradas_despues"] += 1
    for p in activos:
        g = _grupo(grupos, p[clave_id], p[clave_nombre])
        g["nombre"] = p[clave_nombre]
        g["activos"] += 1
        quieto = p["estado"] != "con_cita" and p["dias_sin_movimiento"] >= dias
        if quieto:
            g["sin_movimiento"] += 1
            if p["estado"] == "nunca_agendado":
                g["nunca_agendados"] += 1
    return sorted(grupos.values(), key=lambda g: (-g["sin_movimiento"], -g["activos"], g["nombre"] or ""))


def _nombres(registradas) -> tuple[dict, dict]:
    """Nombres de responsables y sedes que solo aparecen por sus sesiones registradas después."""
    from apps.clinicas.models import Sede
    from apps.users.models import User

    usuarios = {r["responsable_id"] for r in registradas if r["responsable_id"]}
    sedes = {r["sede_id"] for r in registradas if r["sede_id"]}
    return (
        {str(u.id): u.nombre_completo for u in User.objects.filter(pk__in=usuarios)},
        {str(s.id): s.nombre for s in Sede.objects.filter(pk__in=sedes).only("id", "nombre")},
    )


def paquetes_sin_movimiento(clinica, *, sede_ids=None, dias=DIAS_POR_DEFECTO, responsable=None, origen=None, hoy=None):
    """Los paquetes activos sin movimiento hace ``dias`` o más, con el resumen
    por responsable y por sede (sobre todos los activos, para ver la proporción)."""
    hoy = hoy or timezone.localdate()
    items = list(_items(clinica, sede_ids))
    lotes = _responsables_de_cargas(clinica, items)
    activos = [p for p in (_paquete(i, lotes, hoy) for i in items) if p is not None]
    if origen:
        activos = [p for p in activos if p["origen"] == origen]
    if responsable:
        activos = [p for p in activos if p["responsable_id"] == str(responsable)]

    registradas = _registradas_despues(clinica, sede_ids, origen)
    if responsable:
        registradas = [r for r in registradas if r["responsable_id"] == str(responsable)]
    nombres_responsables, nombres_sedes = _nombres(registradas)

    quietos = [p for p in activos if p["estado"] != "con_cita" and p["dias_sin_movimiento"] >= dias]
    quietos.sort(key=lambda p: (p["estado"] != "nunca_agendado", -p["dias_sin_movimiento"]))
    return {
        "dias": dias,
        "totales": {
            "activos": len(activos),
            "sin_movimiento": len(quietos),
            "nunca_agendados": sum(1 for p in quietos if p["estado"] == "nunca_agendado"),
            "sesiones_pendientes": sum(p["sesiones_total"] - p["sesiones_hechas"] for p in quietos),
            "registradas_despues": len(registradas),
        },
        "por_responsable": _resumen(
            activos, "responsable_id", "responsable_nombre", dias, registradas, nombres_responsables,
        ),
        "por_sede": _resumen(activos, "sede_id", "sede_nombre", dias, registradas, nombres_sedes),
        "paquetes": quietos,
    }
