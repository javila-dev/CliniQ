"""Acotar a la clínica activa las relaciones que llegan por id en un serializer.

Un `PrimaryKeyRelatedField(queryset=Sede.objects.all())` acepta el id de una sede
de cualquier clínica: conociendo un UUID se podía crear una cita, un cobro o un
ajuste de stock sobre datos de otra clínica. `AcotadoAClinicaMixin` filtra el
queryset de cada relación por la clínica activa de la request, así un id ajeno
responde "no existe" igual que uno inventado.
"""

from rest_framework import serializers

# Camino de cada modelo hasta su clínica, en orden de preferencia.
CAMINOS_A_CLINICA = (
    "clinica",
    "sede__clinica",
    "historia__clinica",
    "nota__historia__clinica",
    "paciente__clinica",
    "cotizacion__clinica",
    "cartera__cotizacion__clinica",
    "caja__sede__clinica",
)


def camino_a_clinica(modelo) -> str | None:
    """Primer camino de CAMINOS_A_CLINICA que existe en el modelo, o None."""
    for camino in CAMINOS_A_CLINICA:
        actual = modelo
        try:
            for parte in camino.split("__"):
                actual = actual._meta.get_field(parte).related_model
                if actual is None:
                    break
            else:
                return camino
        except Exception:  # noqa: BLE001 - el campo no existe en este modelo
            continue
    return None


def acotar_queryset(queryset, clinica):
    camino = camino_a_clinica(queryset.model)
    if camino is None:
        return queryset
    return queryset.filter(**{camino: clinica})


class AcotadoAClinicaMixin:
    """Mixin de serializer: limita a la clínica activa las relaciones por id.

    Requiere `request` en el contexto (de este serializer o del raíz, si va
    anidado). Sin clínica activa (superadmin sin clínica elegida) no se acota.
    Se aplica en get_fields, que corre al primer uso de `.fields`: para un
    serializer anidado eso ocurre ya enlazado al raíz, con su contexto.
    """

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request is None or not getattr(request.user, "is_authenticated", False):
            return fields
        from apps.users.permissions import get_clinica_activa

        clinica = get_clinica_activa(request)
        if clinica is None:
            return fields
        for campo in fields.values():
            relacion = getattr(campo, "child_relation", campo)
            if isinstance(relacion, serializers.RelatedField) and getattr(relacion, "queryset", None) is not None:
                relacion.queryset = acotar_queryset(relacion.queryset, clinica)
        return fields
