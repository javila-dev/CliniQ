"""La hoja del paquete de una cita, como la que las clínicas llevan en papel: una fila
por sesión con lo que se hizo, cuándo, quién y si el paciente firmó.

Solo lee: la vista sencilla de la atención la pinta y guarda por los mismos
caminos que la atención completa (docs/plan-atencion-sencilla.md).
"""
from django.utils import timezone

from apps.agenda.models import Cita
from apps.core.storage import get_public_url


def _profesional(user):
    if user is None:
        return None
    return {
        "id": str(user.id),
        "nombre": user.nombre_completo,
        "firma_url": get_public_url(user.firma_digital.name) if user.firma_digital else None,
    }


def _fecha_hora(cita, sesion=None):
    if cita is not None:
        momento = timezone.localtime(cita.fecha_inicio_real or cita.fecha_inicio)
        return momento.date().isoformat(), momento.strftime("%H:%M")
    # Sesiones cargadas por la migración o marcadas sin cita.
    if sesion is not None and sesion.fecha:
        return sesion.fecha.isoformat(), sesion.hora.strftime("%H:%M") if sesion.hora else None
    return None, None


def _zonas_por_cita(cita_ids):
    """Nombres de los diagramas con marcas en la nota de cada cita: es el "dónde"."""
    from apps.historia_clinica.models import AnotacionZona

    zonas = {}
    anotaciones = (
        AnotacionZona.objects.filter(nota__cita_id__in=cita_ids, nota__activo=True, activo=True)
        .select_related("diagrama", "nota")
        .order_by("diagrama__orden", "diagrama__nombre", "created_at")
    )
    for anotacion in anotaciones:
        nombres = zonas.setdefault(str(anotacion.nota.cita_id), [])
        if anotacion.diagrama.nombre not in nombres:
            nombres.append(anotacion.diagrama.nombre)
    return zonas


def _fila_de_cita(cita, numero, *, actual, zonas):
    fecha, hora = _fecha_hora(cita)
    nombre = cita.servicio_nombre or (cita.servicio.nombre if cita.servicio_id else "")
    hecha = cita.estado == Cita.Estado.COMPLETADA
    return {
        "numero": numero,
        "sesion_id": None,
        "cita_id": str(cita.id),
        "es_actual": actual,
        "estado": "completado" if hecha else ("inasistencia" if cita.estado == Cita.Estado.NO_ASISTIO else "pendiente"),
        "obsequio": False,
        "procedimientos": [{
            "id": str(cita.servicio_id) if cita.servicio_id else None,
            "nombre": nombre,
            "realizado": hecha,
        }],
        "fecha": fecha,
        "hora": hora,
        "profesional": _profesional(cita.profesional),
        "firma_paciente": cita.firma_asistencia_estado,
        "zonas": zonas.get(str(cita.id), []),
    }


def _fila_vacia(numero, nombre):
    return {
        "numero": numero, "sesion_id": None, "cita_id": None, "es_actual": False, "estado": "pendiente",
        "obsequio": False, "procedimientos": [{"id": None, "nombre": nombre, "realizado": False}],
        "fecha": None, "hora": None, "profesional": None, "firma_paciente": None, "zonas": [],
    }


def _filas_de_tratamiento(tratamiento, sesion_actual_id=None):
    from apps.protocolos.models import SesionProcedimiento

    sesiones = list(
        tratamiento.sesiones.select_related("tipo_sesion", "procedimiento", "paso", "profesional", "cita__profesional")
        .prefetch_related("procedimientos_ejecutados", "tipo_sesion__procedimientos__procedimiento")
    )
    # Mismo orden que "Sesión X de Y" en la atención (contexto_sesion_para_cita).
    sesiones.sort(key=lambda s: (s.tipo_sesion.orden if s.tipo_sesion_id else 0, s.numero))
    zonas = _zonas_por_cita([s.cita_id for s in sesiones if s.cita_id])

    filas = []
    for numero, sesion in enumerate(sesiones, start=1):
        planeados = []
        if sesion.tipo_sesion_id:
            planeados = [
                tp.procedimiento for tp in sorted(sesion.tipo_sesion.procedimientos.all(), key=lambda tp: tp.orden)
                if tp.activo
            ]
        if not planeados and sesion.procedimiento_id:
            planeados = [sesion.procedimiento]
        hecha = sesion.estado == SesionProcedimiento.Estado.COMPLETADO
        ejecutados = list(sesion.procedimientos_ejecutados.all()) if hecha else []
        ids_ejecutados = {p.id for p in ejecutados}
        procedimientos = [
            {"id": str(p.id), "nombre": p.nombre, "realizado": p.id in ids_ejecutados} for p in planeados
        ]
        # Lo que se hizo fuera de lo planeado también cuenta.
        planeados_ids = {p.id for p in planeados}
        procedimientos += [
            {"id": str(p.id), "nombre": p.nombre, "realizado": True} for p in ejecutados if p.id not in planeados_ids
        ]
        if not procedimientos:
            nombre = sesion.paso.nombre if sesion.paso_id else (sesion.tipo_sesion.nombre if sesion.tipo_sesion_id else "Sesión")
            procedimientos = [{"id": None, "nombre": nombre, "realizado": hecha}]

        cita = sesion.cita
        fecha, hora = _fecha_hora(cita, sesion) if (cita or hecha) else (None, None)
        filas.append({
            "numero": numero,
            "sesion_id": str(sesion.id),
            "cita_id": str(cita.id) if cita else None,
            "es_actual": sesion.id == sesion_actual_id,
            "estado": sesion.estado,
            "obsequio": sesion.item_obsequio_id is not None,
            "procedimientos": procedimientos,
            "fecha": fecha,
            "hora": hora,
            "profesional": _profesional(sesion.profesional or (cita.profesional if cita else None)),
            "firma_paciente": cita.firma_asistencia_estado if cita else None,
            "zonas": zonas.get(str(cita.id), []) if cita else [],
        })

    if tratamiento.tratamiento_catalogo_id:
        nombre = tratamiento.tratamiento_catalogo.nombre
    elif tratamiento.servicio_id:
        nombre = tratamiento.servicio.nombre
    else:
        nombre = ""
    return {"id": str(tratamiento.id), "nombre": nombre}, filas


def _filas_de_item(item, cita_actual_id=None):
    """Paquete de un procedimiento (ítem de cotización sin sesiones de tratamiento):
    una fila por cita del ítem y las que faltan por agendar."""
    citas = list(
        item.citas.exclude(estado=Cita.Estado.CANCELADA).select_related("profesional", "servicio").order_by("fecha_inicio")
    )
    zonas = _zonas_por_cita([c.id for c in citas])
    filas = [
        _fila_de_cita(c, numero, actual=c.id == cita_actual_id, zonas=zonas) for numero, c in enumerate(citas, start=1)
    ]
    nombre = (citas[0].servicio_nombre if citas else "") or item.descripcion
    for numero in range(len(filas) + 1, item.num_sesiones_efectivas() + 1):
        filas.append(_fila_vacia(numero, nombre))
    return {"id": None, "nombre": item.descripcion}, filas


def filas_de_item(item):
    """La hoja de un ítem de cotización, sin cita actual (para el PDF consolidado):
    las sesiones de su tratamiento o, si no tiene, sus citas y las que faltan."""
    from apps.cotizaciones.models import ItemCotizacion

    # Un producto o un ítem libre no es un paquete de sesiones: sin citas no
    # tiene hoja (num_citas vale 1 por defecto y dejaría una fila para firmar).
    if item.tipo in (ItemCotizacion.Tipo.INSUMO, ItemCotizacion.Tipo.LIBRE) and not (
        item.citas.exclude(estado=Cita.Estado.CANCELADA).exists()
    ):
        return []
    tratamiento = item.tratamientos_paciente.order_by("created_at").first()
    if tratamiento is not None and tratamiento.sesiones.exists():
        return _filas_de_tratamiento(tratamiento)[1]
    return _filas_de_item(item)[1]


def tarjeta_de_cita(cita) -> dict:
    from apps.configuracion.models import ConfiguracionWizard
    from apps.protocolos.services import _sesion_vinculada_o_pendiente

    sesion = _sesion_vinculada_o_pendiente(cita)
    if sesion is not None:
        paquete, filas = _filas_de_tratamiento(sesion.tratamiento, sesion.id)
    elif cita.item_cotizacion_id:
        paquete, filas = _filas_de_item(cita.item_cotizacion, cita.id)
    else:
        # Consulta o procedimiento suelto: una sola fila, la de hoy.
        paquete, filas = None, [_fila_de_cita(cita, 1, actual=True, zonas=_zonas_por_cita([cita.id]))]

    config = ConfiguracionWizard.objects.filter(clinica_id=cita.sede.clinica_id).first()
    firma_activa = config.paso_firma_asistencia if config else True
    actual = next((f for f in filas if f["es_actual"]), None)
    return {
        "cita_id": str(cita.id),
        "paquete": paquete,
        "numero_actual": actual["numero"] if actual else None,
        "total": len(filas),
        "filas": filas,
        "firma_asistencia_activa": firma_activa,
        # Con el paso apagado la columna sobra, salvo que haya firmas de antes.
        "mostrar_firma_paciente": firma_activa or any(f["firma_paciente"] == "firmada" for f in filas),
    }
