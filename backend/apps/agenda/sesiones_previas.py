"""Corregir el paquete de un paciente migrado (soporte, console): el tratamiento
que se cargó y las sesiones que ya había hecho.

La puesta en marcha guarda las sesiones que el paciente ya había hecho antes de
CliniQ de dos formas: como número en el ítem (``sesiones_previas_consumidas``) y
como sesiones del protocolo completadas sin cita. Las que se cargaron con
profesional quedaron como citas migradas y no se tocan aquí.

- Las sesiones previas solo se corrigen mientras el paciente no haya hecho
  ninguna sesión del paquete dentro de la app: desde ese momento las reales ya
  se cruzaron con las previas.
- El tratamiento se puede cambiar aunque ya tenga atenciones (hechas o
  agendadas) en la app: soporte elige a qué sesión exacta del tratamiento nuevo
  pasa cada una, y la sesión conserva su cita, fecha, profesional y lo
  registrado en ella.

El paquete queda como si la carga se hubiera hecho con los datos correctos; el
precio, los pagos y la cartera no cambian. Antes de confirmar, la corrección se
hace completa y se descarta, para mostrar el protocolo tal como va a quedar.
"""

from django.db import transaction
from django.utils import timezone

from apps.agenda import soporte
from apps.agenda.models import Cita, CorreccionSoporte
from apps.agenda.soporte import error
from apps.migracion.services import OBSERVACION_PREVIA, campos_item, crear_protocolo, marcar_previas

ESTADOS_HECHA = (Cita.Estado.COMPLETADA, Cita.Estado.EN_CURSO)
# Citas que no ocupan sesión del paquete.
ESTADOS_LIBRES = (Cita.Estado.CANCELADA, Cita.Estado.NO_ASISTIO)
ORDEN_PROTOCOLO = ("tipo_sesion__orden", "numero", "paso__orden", "created_at")


def _sesiones(item):
    from apps.protocolos.models import SesionProcedimiento

    # Mismo orden con que la puesta en marcha eligió las sesiones previas.
    return SesionProcedimiento.objects.filter(
        tratamiento__in=item.tratamientos_paciente.all(), activo=True,
    ).select_related("tipo_sesion", "procedimiento", "tratamiento").order_by(*ORDEN_PROTOCOLO)


def _es_previa(sesion) -> bool:
    from apps.protocolos.models import SesionProcedimiento

    return (
        sesion.estado == SesionProcedimiento.Estado.COMPLETADO
        and sesion.cita_id is None
        and sesion.observaciones == OBSERVACION_PREVIA
    )


def _atenciones(item) -> list[tuple]:
    """Citas del paquete hechas o agendadas en la app, con la sesión del protocolo que ocupan."""
    from apps.protocolos.models import SesionProcedimiento

    citas = list(
        item.citas.filter(es_migracion=False).exclude(estado__in=ESTADOS_LIBRES)
        .select_related("profesional").order_by("fecha_inicio")
    )
    sesiones = {
        s.cita_id: s
        for s in SesionProcedimiento.objects.filter(cita__in=citas, tratamiento__cotizacion_item=item)
        .select_related("tipo_sesion", "procedimiento")
    }
    return [(c, sesiones.get(c.id)) for c in citas]


def _atencion_payload(cita, sesion) -> dict:
    return {
        "cita_id": str(cita.id),
        "fecha_inicio": cita.fecha_inicio,
        "estado": cita.estado,
        "servicio_nombre": cita.servicio_nombre,
        "profesional_nombre": soporte.nombre(cita.profesional),
        "sesion": soporte.sesion_payload(sesion) if sesion else None,
    }


def _estado(item) -> dict:
    """Cómo está el paquete y qué se puede corregir."""
    from apps.protocolos.models import SesionProcedimiento

    citas = item.citas.all()
    detalladas = citas.filter(es_migracion=True).exclude(estado__in=ESTADOS_LIBRES).count()
    hechas_citas = citas.filter(es_migracion=False, estado__in=ESTADOS_HECHA).count()
    sesiones = list(_sesiones(item))
    # Completadas en la app: con cita, o marcadas a mano sin cita.
    hechas_sesiones = [
        s for s in sesiones if s.estado == SesionProcedimiento.Estado.COMPLETADO and not _es_previa(s)
    ]
    a_mano = sum(1 for s in hechas_sesiones if s.cita_id is None)
    atenciones = _atenciones(item)
    total = item.num_sesiones_efectivas()
    # Las de la carga sin cita: las que aún no se agendaron (una pendiente con
    # cita es de una cita agendada en la app y sigue siendo de ella).
    candidatas = [
        s for s in sesiones
        if s.cita_id is None and (s.estado == SesionProcedimiento.Estado.PENDIENTE or _es_previa(s))
    ]

    bloqueo = None
    if hechas_citas or hechas_sesiones:
        hechas = max(hechas_citas, len(hechas_sesiones))
        bloqueo = (
            f"Ya tiene {hechas} sesión{'es' if hechas != 1 else ''} hecha{'s' if hechas != 1 else ''} "
            "dentro de la app: las sesiones previas ya no se pueden corregir."
        )
    bloqueo_tratamiento = None
    if a_mano:
        bloqueo_tratamiento = (
            f"Tiene {a_mano} sesión{'es' if a_mano != 1 else ''} marcada{'s' if a_mano != 1 else ''} como "
            "hecha sin cita: no hay atención que pasar al tratamiento nuevo."
        )
    elif SesionProcedimiento.objects.filter(tratamiento__cotizacion_item=item, item_obsequio__isnull=False).exists():
        bloqueo_tratamiento = "El paquete tiene sesiones obsequiadas: no se puede cambiar el tratamiento."
    return {
        "tipo": item.tipo,
        "tratamiento_id": str(item.tratamiento_id) if item.tratamiento_id else None,
        "total": total,
        "previas": detalladas + item.sesiones_previas_consumidas,
        "con_cita": detalladas,
        "agendadas_en_app": len(atenciones),
        "minimo": detalladas,
        "maximo": max(detalladas, total - len(atenciones)),
        "restantes": item.citas_restantes(),
        "bloqueo": bloqueo,
        "bloqueo_tratamiento": bloqueo_tratamiento,
        "atenciones": [_atencion_payload(c, s) for c, s in atenciones],
        "sesiones": [{**soporte.sesion_payload(s), "previa": _es_previa(s)} for s in candidatas],
        "_candidatas": candidatas,
        "_atenciones": atenciones,
    }


def _publico(estado: dict) -> dict:
    return {k: v for k, v in estado.items() if not k.startswith("_")}


def _lote(item):
    from apps.migracion.models import LoteMigracion

    cotizacion = item.cotizacion
    if not cotizacion.es_migracion or not cotizacion.lote_migracion:
        return None
    return LoteMigracion.objects.filter(pk=cotizacion.lote_migracion, revertido_en__isnull=True).first()


def cargas_del_paciente(clinica, paciente) -> list[dict]:
    """Los paquetes que llegaron por la puesta en marcha, con sus sesiones previas."""
    from apps.cotizaciones.models import ItemCotizacion
    from apps.migracion.models import LoteMigracion

    lotes = {
        lote.id: lote
        for lote in LoteMigracion.objects.filter(
            clinica=clinica, paciente=paciente, revertido_en__isnull=True,
        ).select_related("creado_por")
    }
    items = (
        ItemCotizacion.objects.filter(
            cotizacion__clinica=clinica, cotizacion__paciente=paciente,
            cotizacion__es_migracion=True, cotizacion__lote_migracion__in=lotes.keys(), activo=True,
        )
        .select_related("cotizacion", "tratamiento")
        .order_by("-cotizacion__created_at")
    )
    return [
        {
            "item_id": str(i.id),
            "lote_id": str(lotes[i.cotizacion.lote_migracion].id),
            "descripcion": i.descripcion,
            "cargado_en": lotes[i.cotizacion.lote_migracion].created_at,
            "cargado_por": soporte.nombre(lotes[i.cotizacion.lote_migracion].creado_por),
            "nota": lotes[i.cotizacion.lote_migracion].nota,
            **_publico(_estado(i)),
        }
        for i in items if i.tiene_cupo_propio
    ]


def _ranuras(catalogo) -> list[dict]:
    """Las sesiones que tendrá el protocolo de un tratamiento del catálogo, en su
    orden (las mismas que crea ``crear_tratamiento_desde_cotizacion``)."""
    tipos = [t for t in catalogo.tipos_sesion.all() if t.activo and t.es_compromiso]
    tipos.sort(key=lambda t: t.orden)
    ranuras = []
    for tipo in tipos:
        for numero in range(1, tipo.cantidad + 1):
            ranuras.append({"clave": f"{tipo.id}:{numero}", "nombre": tipo.nombre, "numero": numero})
    return ranuras


def tratamientos_de_la_clinica(clinica) -> list[dict]:
    """Tratamientos del catálogo que se pueden poner en un paquete migrado, con las
    sesiones de su protocolo (a las que se puede pasar cada atención)."""
    from apps.clinicas.models import TratamientoCatalogo

    tratamientos = TratamientoCatalogo.objects.filter(clinica=clinica, activo=True).prefetch_related("tipos_sesion")
    resultado = []
    for t in tratamientos.order_by("nombre"):
        ranuras = _ranuras(t)
        resultado.append({"id": str(t.id), "nombre": t.nombre, "total_sesiones": len(ranuras), "sesiones": ranuras})
    return resultado


def _item_corregible(clinica, item_id):
    from apps.cotizaciones.models import ItemCotizacion

    item = (
        ItemCotizacion.objects.select_related("cotizacion", "cotizacion__paciente", "tratamiento")
        .filter(pk=item_id, cotizacion__clinica=clinica, activo=True)
        .first()
    )
    if item is None:
        error("El paquete no existe en esta clínica.", "ITEM_NO_ENCONTRADO")
    lote = _lote(item)
    if lote is None:
        error("El paquete no llegó por la puesta en marcha (o su carga se revirtió).", "ITEM_NO_MIGRADO")
    return item, lote


def _validar_rango(sesiones, *, minimo, maximo, total, con_cita, agendadas):
    if sesiones < minimo:
        error(
            f"{con_cita} de las sesiones previas se cargaron con cita y profesional: el mínimo es {minimo}.",
            "SESIONES_BAJO_MINIMO",
        )
    if sesiones > maximo:
        extra = f" ({agendadas} ya en la app)" if agendadas else ""
        error(f"El paquete tiene {total} sesiones{extra}: el máximo de previas es {maximo}.", "SESIONES_SOBRE_MAXIMO")


def _remarcar_previas(item, estado, sin_cita, previas=None) -> tuple[list[str], list[str]]:
    """Mismo tratamiento: quedan hechas las sesiones `previas` (ids) que soporte
    marcó, o sin ellas las primeras `sin_cita`; las demás quedan pendientes."""
    from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

    candidatas = estado["_candidatas"]
    fecha = next((s.fecha for s in candidatas if _es_previa(s) and s.fecha), None)
    marcadas, desmarcadas = [], []
    for i, sesion in enumerate(candidatas):
        hecha = str(sesion.id) in previas if previas is not None else i < sin_cita
        if hecha and not _es_previa(sesion):
            sesion.estado = SesionProcedimiento.Estado.COMPLETADO
            sesion.fecha = fecha
            sesion.observaciones = OBSERVACION_PREVIA
            marcadas.append(str(sesion.id))
        elif not hecha and _es_previa(sesion):
            sesion.estado = SesionProcedimiento.Estado.PENDIENTE
            sesion.fecha = None
            sesion.observaciones = ""
            desmarcadas.append(str(sesion.id))
        else:
            continue
        sesion.save(update_fields=["estado", "fecha", "observaciones", "updated_at"])

    # El protocolo termina si las previas cubren el paquete (como en la carga).
    for tratamiento in item.tratamientos_paciente.all():
        if sin_cita >= estado["total"] and tratamiento.estado == TratamientoPaciente.Estado.ACTIVO:
            tratamiento.estado = TratamientoPaciente.Estado.COMPLETADO
        elif sin_cita < estado["total"] and tratamiento.estado == TratamientoPaciente.Estado.COMPLETADO:
            tratamiento.estado = TratamientoPaciente.Estado.ACTIVO
        else:
            continue
        tratamiento.save(update_fields=["estado", "updated_at"])
    return marcadas, desmarcadas


def _nombre_sesion(sesion) -> str | None:
    if sesion is None:
        return None
    s = soporte.sesion_payload(sesion)
    return f"{s['nombre']} #{s['numero']}"


def _validar_previas(previas, sin_cita, permitidas):
    """Las sesiones marcadas a mano: tantas como previas sin cita y todas válidas."""
    if previas is None:
        return
    if len(set(previas)) != sin_cita:
        error("Marca exactamente las sesiones hechas antes de CliniQ.", "PREVIAS_NO_CUADRAN")
    if not set(previas) <= permitidas:
        error("Una de las sesiones marcadas no está libre en el protocolo.", "PREVIA_NO_ENCONTRADA")


def _cambiar_tratamiento(clinica, item, estado, trat, sesiones, asignaciones, previas=None) -> tuple[list[str], list[dict]]:
    """Rehace el ítem y su protocolo con el otro tratamiento, como en la carga, y
    pasa cada atención de la app a la sesión que soporte eligió."""
    from apps.clinicas.models import TratamientoCatalogo
    from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

    if estado["bloqueo_tratamiento"]:
        error(estado["bloqueo_tratamiento"], "TRATAMIENTO_NO_CAMBIABLE")
    atenciones = estado["_atenciones"]
    catalogo = None
    if trat["tipo"] == "tratamiento":
        catalogo = (
            TratamientoCatalogo.objects.filter(pk=trat["tratamiento"], clinica=clinica, activo=True)
            .prefetch_related("tipos_sesion").first()
        )
        if catalogo is None:
            error("El tratamiento no existe en esta clínica.", "TRATAMIENTO_NO_ENCONTRADO")
        trat = {**trat, "descripcion": catalogo.nombre, "num_sesiones_total": 1}
    elif atenciones:
        error(
            "El paquete ya tiene atenciones en la app: el tratamiento nuevo debe ser del catálogo, "
            "para elegir a qué sesión pasa cada una.",
            "ATENCIONES_REQUIEREN_CATALOGO",
        )

    # Cada atención va a una sesión distinta del tratamiento nuevo, elegida por soporte.
    destino_de = {str(a["cita"]): a["sesion"] for a in asignaciones}
    if set(destino_de) != {str(c.id) for c, _ in atenciones}:
        error("Indica a qué sesión del tratamiento nuevo pasa cada atención.", "ASIGNACIONES_INCOMPLETAS")
    if len(set(destino_de.values())) != len(destino_de):
        error("Dos atenciones no pueden ir a la misma sesión.", "SESION_REPETIDA")
    ranuras = {r["clave"] for r in _ranuras(catalogo)} if catalogo else set()
    if atenciones and not set(destino_de.values()) <= ranuras:
        error("Una de las sesiones elegidas no es del tratamiento nuevo.", "SESION_NO_ENCONTRADA")
    # Las previas se marcan en las sesiones que no quedaron para una atención.
    _validar_previas(previas, sesiones - estado["con_cita"], ranuras - set(destino_de.values()))

    fecha = next((s.fecha for s in estado["_candidatas"] if _es_previa(s) and s.fecha), None)
    # El protocolo viejo se aparta del ítem para crear el nuevo; al final se borra
    # con lo que no se pasó al nuevo.
    viejos = list(item.tratamientos_paciente.values_list("pk", flat=True))
    TratamientoPaciente.objects.filter(pk__in=viejos).update(cotizacion_item=None)
    for campo, valor in campos_item(trat, clinica).items():
        setattr(item, campo, valor)
    sin_cita = sesiones - estado["con_cita"]
    item.sesiones_previas_consumidas = sin_cita
    item.save()

    total = item.num_sesiones_efectivas()
    _validar_rango(
        sesiones, minimo=estado["con_cita"], maximo=max(estado["con_cita"], total - len(atenciones)),
        total=total, con_cita=estado["con_cita"], agendadas=len(atenciones),
    )
    ids = crear_protocolo(item, 0)
    tp = TratamientoPaciente.objects.filter(pk__in=ids).first()

    movidas = []
    for cita, vieja in atenciones:
        tipo_id, numero = destino_de[str(cita.id)].split(":")
        destino = SesionProcedimiento.objects.select_related("tipo_sesion").get(
            tratamiento=tp, tipo_sesion_id=tipo_id, numero=int(numero),
        )
        movidas.append({
            "cita": str(cita.id),
            "fecha": cita.fecha_inicio.isoformat(),
            "de": _nombre_sesion(vieja),
            "a": _nombre_sesion(destino),
        })
        if vieja is not None:
            # La sesión de la atención pasa al protocolo nuevo en el lugar elegido y
            # conserva lo registrado (procedimientos, consentimientos, check-in).
            for campo in ("tipo_sesion_id", "numero", "procedimiento_id", "paso_id", "cada_dias"):
                setattr(vieja, campo, getattr(destino, campo))
            vieja.tratamiento = tp
            destino.delete()
            vieja.save()
        else:
            destino.cita = cita
            if cita.estado in ESTADOS_HECHA:
                destino.estado = SesionProcedimiento.Estado.COMPLETADO
                destino.fecha = timezone.localdate(cita.fecha_inicio)
                destino.profesional = cita.profesional
            destino.save()
    if tp is not None:
        marcar_previas(tp, item, sin_cita, fecha=fecha, claves=previas)
    TratamientoPaciente.objects.filter(pk__in=viejos).delete()
    return ids, movidas


def _protocolo_payload(item) -> list[dict]:
    """El protocolo del paquete sesión por sesión: qué es cada una."""
    from apps.protocolos.services import verificar_consentimientos_sesion

    filas = []
    for posicion, s in enumerate(_sesiones(item).select_related("cita", "cita__profesional"), start=1):
        fila = {**soporte.sesion_payload(s), "posicion": posicion, "origen": "pendiente", "atencion": None}
        if s.cita_id:
            fila["origen"] = "atencion"
            fila["atencion"] = _atencion_payload(s.cita, None)
            fila["consentimientos_faltantes"] = [
                f["template_nombre"] for f in verificar_consentimientos_sesion(s, cita_id=s.cita_id)
            ]
        elif _es_previa(s):
            fila["origen"] = "previa"
        filas.append(fila)
    return filas


def corregir(
    clinica, item_id, *, sesiones, tratamiento=None, asignaciones=(), previas=None, motivo="", usuario=None,
    request=None, confirmar=True,
):
    """Corrige las sesiones previas y, si viene `tratamiento`, el tratamiento del
    paquete. `previas` son las sesiones que soporte marcó como hechas antes de
    CliniQ: ids del protocolo actual, o con otro tratamiento "<tipo de sesión>:<número>".
    Con ``confirmar=False`` hace todo, devuelve cómo queda y lo descarta."""
    from apps.cotizaciones.models import ItemCotizacion

    motivo = (motivo or "").strip()
    if confirmar and not motivo:
        error("Escribe el motivo.", "MOTIVO_REQUERIDO")

    with transaction.atomic():
        ItemCotizacion.objects.select_for_update().filter(pk=item_id).first()
        item, lote = _item_corregible(clinica, item_id)
        estado = _estado(item)

        antes = estado["previas"]
        tratamiento_antes = item.descripcion
        manifest = lote.manifest or {}
        marcadas = desmarcadas = movidas = []
        if tratamiento:
            manifest["tratamientos_paciente"], movidas = _cambiar_tratamiento(
                clinica, item, estado, tratamiento, sesiones, asignaciones, previas,
            )
        else:
            if estado["bloqueo"]:
                error(estado["bloqueo"], "SESIONES_HECHAS_EN_APP")
            actuales = {str(s.id) for s in estado["_candidatas"] if _es_previa(s)}
            if sesiones == antes and (previas is None or set(previas) == actuales):
                error("El paquete ya tiene esas sesiones previas.", "SIN_CAMBIOS")
            _validar_previas(previas, sesiones - estado["con_cita"], {str(s.id) for s in estado["_candidatas"]})
            _validar_rango(
                sesiones, minimo=estado["minimo"], maximo=estado["maximo"], total=estado["total"],
                con_cita=estado["con_cita"], agendadas=estado["agendadas_en_app"],
            )
            item.sesiones_previas_consumidas = sesiones - estado["con_cita"]
            item.save(update_fields=["sesiones_previas_consumidas", "updated_at"])
            marcadas, desmarcadas = _remarcar_previas(
                item, estado, sesiones - estado["con_cita"], set(previas) if previas is not None else None,
            )

        # El resumen de la carga (pantalla de puesta en marcha) refleja la corrección.
        total = item.num_sesiones_efectivas()
        resumen_lote = manifest.get("resumen")
        if resumen_lote:
            resumen_lote["sesiones_total"] = total
            resumen_lote["sesiones_realizadas"] = sesiones
            resumen_lote["sesiones_pendientes"] = max(0, total - sesiones)
        lote.manifest = manifest
        lote.save(update_fields=["manifest"])

        if not confirmar:
            vista = {
                "descripcion": item.descripcion,
                "total": total,
                "previas": sesiones,
                "restantes": item.citas_restantes(),
                "protocolo": _protocolo_payload(item),
                "atenciones_movidas": movidas,
            }
            transaction.set_rollback(True)
            return vista

        resumen = {
            "lote": str(lote.id),
            "paquete": item.descripcion,
            "sesiones_antes": antes,
            "sesiones_despues": sesiones,
            "sesiones_marcadas": marcadas,
            "sesiones_desmarcadas": desmarcadas,
        }
        detalle = {"paquete": item.descripcion, "sesiones_antes": antes, "sesiones_despues": sesiones}
        if tratamiento:
            cambio = {
                "tratamiento_antes": tratamiento_antes,
                "tratamiento_despues": item.descripcion,
                "atenciones_movidas": movidas,
            }
            resumen.update(cambio)
            detalle.update(cambio)
        return soporte.registrar(
            request,
            clinica=clinica, tipo=CorreccionSoporte.Tipo.CORREGIR_SESIONES_PREVIAS, cita=None,
            paciente=item.cotizacion.paciente, item_origen=item,
            accion_cobro=CorreccionSoporte.AccionCobro.SIN_COBRO, motivo=motivo, usuario=usuario,
            resumen=resumen, detalle=detalle,
        )
