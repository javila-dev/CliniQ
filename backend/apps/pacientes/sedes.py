"""Sede de un paciente.

El paciente es de la clínica y puede atenderse en cualquier sede; aquí no se
restringe quién lo ve. Hay tres nociones, para filtrar:

- ``sede_registro``: dónde se registró (campo guardado).
- sede habitual: la de su última cita (sin contar canceladas); si no tiene
  citas, la de su última cotización con sede; si tampoco, la de registro. Se
  calcula, así que sigue al paciente si cambia de sede. Sirve para estadísticas,
  donde cada paciente debe contar en una sola sede.
- "vinculado a una sede": registrado ahí o con alguna cita o cotización ahí. Un
  paciente puede estar vinculado a varias; sirve para cumpleaños y campañas.
"""

from django.db.models import Exists, F, OuterRef, Q, Subquery, UUIDField
from django.db.models.functions import Coalesce

from apps.agenda.models import Cita
from apps.clinicas.models import Sede
from apps.cotizaciones.models import Cotizacion


def anotar_sede_habitual(queryset):
    ultima_cita = (
        Cita.objects.filter(paciente=OuterRef("pk"))
        .exclude(estado=Cita.Estado.CANCELADA)
        .order_by("-fecha_inicio")
        .values("sede_id")[:1]
    )
    ultima_cotizacion = (
        Cotizacion.objects.filter(paciente=OuterRef("pk"), sede__isnull=False)
        .order_by("-created_at")
        .values("sede_id")[:1]
    )
    return queryset.annotate(
        sede_habitual_id=Coalesce(
            Subquery(ultima_cita, output_field=UUIDField()),
            Subquery(ultima_cotizacion, output_field=UUIDField()),
            F("sede_registro_id"),
            output_field=UUIDField(),
        )
    )


def q_vinculado_a_sede(sede_id) -> Q:
    return (
        Q(sede_registro_id=sede_id)
        | Exists(
            Cita.objects.filter(paciente=OuterRef("pk"), sede_id=sede_id).exclude(estado=Cita.Estado.CANCELADA)
        )
        | Exists(Cotizacion.objects.filter(paciente=OuterRef("pk"), sede_id=sede_id))
    )


def sede_por_defecto(clinica, user=None):
    """Sede de registro cuando el formulario no la manda: la sede principal de
    quien lo crea (si es de esta clínica) o, si la clínica tiene una sola sede
    activa, esa. Si no hay cómo saberlo, None."""
    if clinica is None:
        return None
    colaborador = getattr(user, "colaborador", None) if user is not None else None
    sede_id = getattr(colaborador, "sede_principal_id", None)
    if sede_id:
        sede = Sede.objects.filter(id=sede_id, clinica=clinica, activo=True).first()
        if sede is not None:
            return sede
    activas = list(Sede.objects.filter(clinica=clinica, activo=True)[:2])
    return activas[0] if len(activas) == 1 else None


def nombres_de_sedes(clinica_id, cache: dict) -> dict:
    """{sede_id: nombre} de la clínica, una sola consulta por clínica."""
    if clinica_id not in cache:
        cache[clinica_id] = dict(Sede.objects.filter(clinica_id=clinica_id).values_list("id", "nombre"))
    return cache[clinica_id]
