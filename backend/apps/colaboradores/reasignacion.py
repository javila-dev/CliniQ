"""Pasar las citas futuras de un colaborador a otro profesional al desactivarlo.

Un colaborador con citas por delante no se desactiva: quedarían en la agenda de
alguien que ya no entra. Desde el diálogo de desactivar se pueden pasar todas a
otro profesional en un paso. Cada cita pasa por las mismas reglas que "Cambiar
profesional" en la agenda (sede del profesional, su horario, bloqueos, cruces y,
si la clínica lo activó, que realice el procedimiento). Las que no caben se
quedan donde están y se listan con el motivo para resolverlas a mano.

Solo cambia el profesional: la hora, la sala y los equipos siguen igual, y al
paciente no se le avisa.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from apps.core.logging import registrar_accion

# Las citas que ya no se van a atender no frenan la desactivación.
ESTADOS_CERRADOS = ("cancelada", "no_asistio", "completada")


def citas_futuras(colaborador):
    from apps.agenda.models import Cita

    return (
        Cita.objects.filter(profesional=colaborador.user, fecha_inicio__gt=timezone.now())
        .exclude(estado__in=ESTADOS_CERRADOS)
        .select_related("paciente", "sede")
        .order_by("fecha_inicio")
    )


def resumen_cita(cita, motivo=None) -> dict:
    data = {
        "id": str(cita.id),
        "fecha_inicio": cita.fecha_inicio,
        "fecha_fin": cita.fecha_fin,
        "paciente_nombre": cita.paciente.nombre_completo,
        "servicio_nombre": cita.servicio_nombre or "",
        "sede_nombre": cita.sede.nombre,
        "estado": cita.estado,
    }
    if motivo is not None:
        data["motivo"] = motivo
    return data


def _texto(detalle) -> str:
    """El primer mensaje legible de un error de validación de DRF."""
    if isinstance(detalle, dict):
        for clave in ("error", "detail", "profesional", "non_field_errors"):
            if clave in detalle:
                return _texto(detalle[clave])
        for clave, valor in detalle.items():
            if clave != "code":
                return _texto(valor)
        return ""
    if isinstance(detalle, (list, tuple)):
        return _texto(detalle[0]) if detalle else ""
    return str(detalle)


def _mover(cita, profesional, request):
    """Cambia el profesional de la cita con las reglas de la agenda o lanza
    ValidationError con el motivo."""
    from apps.agenda import services
    from apps.agenda.serializers import CitaSerializer

    # Las reglas propias de la cita (clínica del profesional y, con el filtro
    # activo, que realice el procedimiento): las mismas del PATCH de la agenda.
    serializer = CitaSerializer(
        instance=cita, data={"profesional": str(profesional.id)}, partial=True, context={"request": request},
    )
    serializer.is_valid(raise_exception=True)
    services._bloquear_agenda_del_profesional(profesional.id)
    services.validar_horario_cita(
        sede=cita.sede,
        profesional=profesional,
        fecha_inicio=cita.fecha_inicio,
        fecha_fin=cita.fecha_fin,
        excluir_cita_id=cita.id,
    )
    cita.profesional = profesional
    cita.save(update_fields=["profesional", "updated_at"])


def validar_destino(colaborador, profesional):
    if profesional.id == colaborador.user_id:
        raise ValidationError({"profesional": ["Elige un profesional distinto al que se desactiva."]})
    if profesional.clinica_id != colaborador.user.clinica_id:
        raise ValidationError({"profesional": ["El profesional no pertenece a esta clínica."]})
    perfil = getattr(profesional, "colaborador", None)
    if not profesional.activo or not profesional.es_profesional or (perfil is not None and not perfil.activo):
        raise ValidationError({"profesional": ["Ese profesional no está activo para atender."]})


def reasignar(colaborador, profesional, *, request, confirmar: bool) -> dict:
    """Intenta pasar cada cita futura a ``profesional``. Con ``confirmar=False``
    hace todo y lo descarta: sirve de vista previa con el resultado real."""
    validar_destino(colaborador, profesional)
    movidas, pendientes = [], []
    with transaction.atomic():
        for cita in citas_futuras(colaborador):
            try:
                with transaction.atomic():
                    _mover(cita, profesional, request)
            except (ValidationError, APIException) as exc:
                cita.refresh_from_db()
                pendientes.append(resumen_cita(cita, _texto(exc.detail) or "No se pudo cambiar el profesional."))
                continue
            movidas.append(resumen_cita(cita))
            if confirmar:
                registrar_accion(request, "cita.cambiar_profesional", cita, {
                    "profesional_anterior": colaborador.user.nombre_completo,
                    "profesional_nuevo": profesional.nombre_completo,
                    "origen": "desactivar_colaborador",
                })
        if not confirmar:
            transaction.set_rollback(True)
    return {"movidas": movidas, "pendientes": pendientes}
