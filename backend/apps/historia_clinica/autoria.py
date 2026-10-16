"""Quién puede escribir en una nota clínica y en lo que cuelga de ella.

Quien atiende pacientes documenta solo en sus propias citas; el admin, en todas.
Antes la regla se validaba solo al crear la nota y la foto: por API (y en parte
desde la pantalla, reusando el borrador de otro) se editaba, se completaba y se
agregaban zonas, consumos, exámenes u órdenes en la atención de otro profesional
(AT-02).
"""

from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.users.authorization import atiende_solo_lo_propio


def puede_documentar(user, nota) -> bool:
    if nota is None or not atiende_solo_lo_propio(user):
        return True
    if nota.cita_id:
        return nota.cita.profesional_id == user.id
    # Nota sin cita (mini-atención de una cotización): la de quien la firmó.
    return nota.firmada_por_id in (None, user.id)


def exigir_documentable(user, nota, *, en_borrador=True):
    """Lanza 403 si no es su atención y 400 si la nota ya se completó."""
    if not puede_documentar(user, nota):
        raise PermissionDenied("Solo puedes documentar en tus propias atenciones.")
    if en_borrador and nota is not None and nota.estado == nota.EstadoNota.COMPLETADA:
        raise ValidationError({"error": "La nota ya está completada: no se puede modificar.", "code": "NOTA_COMPLETADA"})
