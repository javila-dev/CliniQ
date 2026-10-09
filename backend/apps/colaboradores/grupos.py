"""Regla de quién realiza qué procedimiento.

Un profesional realiza un procedimiento si lo tiene asignado directamente
(Colaborador.especialidades) o si pertenece a un grupo de atención asignado a
ese procedimiento. Toda consulta de "quién realiza qué" pasa por aquí.
"""

from collections import defaultdict

from django.db.models import Q
from rest_framework.exceptions import ValidationError


def q_realiza(procedimiento_ids, prefijo=""):
    """Filtro sobre Colaborador (o sobre User con prefijo "colaborador__")."""
    return Q(**{f"{prefijo}especialidades__id__in": procedimiento_ids}) | Q(
        **{f"{prefijo}grupos_atencion__procedimientos__id__in": procedimiento_ids}
    )


def colaboradores_disponibles(queryset):
    """Los que cuentan como miembros: activos y que atienden pacientes."""
    return queryset.filter(activo=True, user__is_active=True, user__es_profesional=True)


def esta_disponible(colaborador) -> bool:
    return bool(colaborador.activo and colaborador.user.is_active and colaborador.user.es_profesional)


def miembros_disponibles(grupo, *, sin=None):
    miembros = colaboradores_disponibles(grupo.miembros.all())
    if sin is not None:
        miembros = miembros.exclude(id=sin.id)
    return miembros


def quedaria_vacio_sin(grupo, colaborador) -> bool:
    """True si el grupo está asignado y `colaborador` es su único miembro disponible."""
    return (
        esta_disponible(colaborador)
        and grupo.procedimientos.exists()
        and not miembros_disponibles(grupo, sin=colaborador).exists()
    )


def cobertura_por_procedimiento(clinica_id) -> dict:
    """{procedimiento_id: profesionales disponibles que lo realizan} en dos consultas."""
    from apps.colaboradores.models import Colaborador

    disponibles = colaboradores_disponibles(Colaborador.objects.filter(user__clinica_id=clinica_id))
    realizan = defaultdict(set)
    for colaborador_id, procedimiento_id in disponibles.filter(especialidades__isnull=False).values_list(
        "id", "especialidades__id"
    ):
        realizan[procedimiento_id].add(colaborador_id)
    for colaborador_id, procedimiento_id in disponibles.filter(
        grupos_atencion__procedimientos__isnull=False
    ).values_list("id", "grupos_atencion__procedimientos__id"):
        realizan[procedimiento_id].add(colaborador_id)
    return {procedimiento_id: len(ids) for procedimiento_id, ids in realizan.items()}


def procedimientos_del_colaborador(colaborador):
    """Procedimientos que realiza, directos o por sus grupos (para mostrar)."""
    from apps.clinicas.models import Servicio

    return (
        Servicio.objects.filter(Q(colaboradores=colaborador) | Q(grupos_atencion__miembros=colaborador))
        .distinct()
        .order_by("nombre")
    )


def _nombres(procedimientos, maximo=3):
    nombres = [p.nombre for p in procedimientos[:maximo]]
    resto = len(procedimientos) - len(nombres)
    return ", ".join(nombres) + (f" y {resto} más" if resto > 0 else "")


def error_grupo_asignado(grupo):
    procedimientos = list(grupo.procedimientos.order_by("nombre"))
    return ValidationError({
        "error": (
            f"El grupo «{grupo.nombre}» está asignado a {_nombres(procedimientos)}. "
            "Quítalo de esos procedimientos antes de dejarlo sin miembros."
        ),
        "code": "GRUPO_ASIGNADO_SIN_MIEMBROS",
    })


def validar_que_no_quede_vacio(colaborador, grupos_que_deja):
    """El colaborador deja de contar en `grupos_que_deja` (sale del grupo o deja
    de atender pacientes): ninguno asignado a procedimientos puede quedar vacío
    por eso. Si él ya no contaba (cuenta desactivada), sacarlo no vacía nada."""
    for grupo in grupos_que_deja:
        if quedaria_vacio_sin(grupo, colaborador):
            raise error_grupo_asignado(grupo)


def al_dejar_de_atender_pacientes(user):
    """Quien deja de atender pacientes sale de sus grupos, sin vaciar uno asignado."""
    from apps.colaboradores.models import Colaborador

    colaborador = Colaborador.objects.select_related("user").filter(user=user).first()
    if colaborador is None:
        return
    grupos = list(colaborador.grupos_atencion.all())
    validar_que_no_quede_vacio(colaborador, grupos)
    colaborador.grupos_atencion.clear()
