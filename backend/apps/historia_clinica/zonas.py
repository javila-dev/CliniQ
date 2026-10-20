"""Diagramas de la pestaña Zonas de una atención (20/10/2026).

Antes la pestaña mostraba siempre los diagramas de los grupos de zonas del
procedimiento de la cita, y si el procedimiento no tenía grupos la pestaña ni
aparecía. Ahora cada nota guarda los suyos (NotaDiagramaZona): el procedimiento
los propone al abrirla y el profesional agrega grupos o diagramas sueltos.

Las notas anteriores al cambio (zonas_inicializadas=False) arman su lista la
primera vez con la misma regla de antes, más cualquier diagrama que ya tenga
marcas, así que muestran lo mismo que mostraban.
"""
from django.db import transaction

from apps.clinicas.models import DiagramaCorporal, ServicioGrupoZonas
from apps.historia_clinica.models import AnotacionZona, NotaClinica, NotaDiagramaZona


def diagramas_del_procedimiento(cita) -> list[str]:
    """Ids de los diagramas que proponen los procedimientos de la cita, en orden.

    Misma regla que tenía la pestaña: para citas de tratamiento (sin servicio
    propio) se juntan las zonas de todos los procedimientos del tipo de sesión,
    sin repetir diagramas.
    """
    if cita is None:
        return []
    from apps.protocolos.services import contexto_sesion_para_cita

    servicio_ids = []
    contexto = contexto_sesion_para_cita(cita)
    if contexto and contexto["procedimientos"]:
        servicio_ids = [p["id"] for p in contexto["procedimientos"]]
    elif cita.servicio_id:
        servicio_ids = [str(cita.servicio_id)]
    if not servicio_ids:
        return []

    ids: list[str] = []
    grupos = (
        ServicioGrupoZonas.objects
        .filter(servicio_id__in=servicio_ids, activo=True)
        .prefetch_related("grupo__diagramas__diagrama")
        .order_by("orden")
    )
    for rel in grupos:
        for gd in rel.grupo.diagramas.order_by("orden"):
            if str(gd.diagrama_id) not in ids:
                ids.append(str(gd.diagrama_id))
    return ids


def _diagramas_con_marcas(nota) -> list[str]:
    ids: list[str] = []
    for diagrama_id in (
        AnotacionZona.objects.filter(nota=nota, activo=True).order_by("created_at").values_list("diagrama_id", flat=True)
    ):
        if str(diagrama_id) not in ids:
            ids.append(str(diagrama_id))
    return ids


def _lista_inicial(nota) -> list[str]:
    """Lo que la nota mostraba antes del cambio, y luego lo que tiene marcas."""
    ids = diagramas_del_procedimiento(nota.cita)
    for diagrama_id in _diagramas_con_marcas(nota):
        if diagrama_id not in ids:
            ids.append(diagrama_id)
    return ids


def inicializar(nota) -> None:
    """Guarda la lista inicial de diagramas de la nota (una sola vez)."""
    if nota.zonas_inicializadas:
        return
    with transaction.atomic():
        fresca = NotaClinica.objects.select_for_update().get(pk=nota.pk)
        if not fresca.zonas_inicializadas:
            existentes = set(
                str(d) for d in NotaDiagramaZona.objects.filter(nota=fresca).values_list("diagrama_id", flat=True)
            )
            for orden, diagrama_id in enumerate(_lista_inicial(fresca), start=1):
                if diagrama_id not in existentes:
                    NotaDiagramaZona.objects.create(nota=fresca, diagrama_id=diagrama_id, orden=orden)
            fresca.zonas_inicializadas = True
            fresca.save(update_fields=["zonas_inicializadas", "updated_at"])
    nota.zonas_inicializadas = True


def diagramas_de_nota(nota) -> list[DiagramaCorporal]:
    """Diagramas de la pestaña, en orden.

    Una nota completada que nunca se abrió con el cambio no se modifica al
    consultarla: se calcula su lista sin guardarla.
    """
    if not nota.zonas_inicializadas:
        if nota.estado == NotaClinica.EstadoNota.COMPLETADA:
            ids = _lista_inicial(nota)
            por_id = {str(d.id): d for d in DiagramaCorporal.objects.filter(id__in=ids)}
            return [por_id[i] for i in ids if i in por_id]
        inicializar(nota)
    return [
        rel.diagrama
        for rel in NotaDiagramaZona.objects.filter(nota=nota, activo=True).select_related("diagrama").order_by("orden", "created_at")
    ]


def agregar(nota, diagrama_ids) -> None:
    """Agrega diagramas al final (los que ya estaban se ignoran)."""
    inicializar(nota)
    actuales = {
        str(rel.diagrama_id): rel for rel in NotaDiagramaZona.objects.filter(nota=nota)
    }
    siguiente = max([rel.orden for rel in actuales.values() if rel.activo] or [0]) + 1
    for diagrama_id in diagrama_ids:
        rel = actuales.get(str(diagrama_id))
        if rel is None:
            NotaDiagramaZona.objects.create(nota=nota, diagrama_id=diagrama_id, orden=siguiente)
        elif not rel.activo:
            rel.activo = True
            rel.orden = siguiente
            rel.save(update_fields=["activo", "orden", "updated_at"])
        else:
            continue
        siguiente += 1


def tiene_marcas(nota, diagrama_id) -> bool:
    return AnotacionZona.objects.filter(nota=nota, diagrama_id=diagrama_id, activo=True).exists()


def quitar(nota, diagrama_id) -> None:
    inicializar(nota)
    NotaDiagramaZona.objects.filter(nota=nota, diagrama_id=diagrama_id, activo=True).update(activo=False)


def zonas_anteriores(nota):
    """La atención anterior del paciente con zonas marcadas: para repetirlas."""
    anterior = (
        NotaClinica.objects
        .filter(historia_id=nota.historia_id, activo=True, created_at__lt=nota.created_at, anotaciones_zona__activo=True)
        .exclude(pk=nota.pk)
        .select_related("cita", "cita__servicio")
        .order_by("-created_at")
        .distinct()
        .first()
    )
    if anterior is None:
        return None
    return anterior, _diagramas_con_marcas(anterior)
