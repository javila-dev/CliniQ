from rest_framework import mixins, viewsets
from rest_framework.exceptions import PermissionDenied

from apps.historia_clinica.autoria import exigir_documentable
from apps.users.authorization import atiende_solo_lo_propio
from apps.users.permissions import IsAdminOrProfesional, RequirePermission
from .models import MedicionAntropometrica
from .serializers import MedicionAntropometricaSerializer


def _clinica_id(request):
    return request.user.clinica_id


class MedicionAntropometricaViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    Mediciones — filtrar por ?paciente=<uuid>
    GET    /obesidad/mediciones/?paciente=<uuid>
    POST   /obesidad/mediciones/
    GET    /obesidad/mediciones/{id}/
    PATCH  /obesidad/mediciones/{id}/   — editar la medición de la sesión
    DELETE /obesidad/mediciones/{id}/   — borrado lógico (activo=False)
    """

    serializer_class = MedicionAntropometricaSerializer

    def get_permissions(self):
        # Leer exige ver la historia; registrar o editar, ser quien atiende (antes
        # bastaba con estar logueado, incluso para borrar mediciones).
        if self.action in {"list", "retrieve"}:
            return [RequirePermission("historia.ver")()]
        return [IsAdminOrProfesional()]

    def get_queryset(self):
        qs = MedicionAntropometrica.objects.select_related(
            "paciente", "tomado_por", "nota"
        ).filter(activo=True)
        if self.request.user.rol != "superadmin":
            qs = qs.filter(paciente__clinica_id=_clinica_id(self.request))
        paciente_id = self.request.query_params.get("paciente")
        if paciente_id:
            qs = qs.filter(paciente_id=paciente_id)
        return qs

    def perform_create(self, serializer):
        nota = serializer.validated_data.get("nota")
        if nota is not None:
            exigir_documentable(self.request.user, nota)
        serializer.save(tomado_por=self.request.user)

    def _exigir_que_sea_suya(self, instance):
        """Quien atiende edita o borra solo las mediciones que tomó (o las de su
        atención); el admin, cualquiera (AT-02)."""
        user = self.request.user
        if not atiende_solo_lo_propio(user) or instance.tomado_por_id == user.id:
            return
        if instance.nota_id:
            exigir_documentable(user, instance.nota, en_borrador=False)
            return
        raise PermissionDenied("Solo puedes modificar las mediciones que tomaste tú.")

    def perform_update(self, serializer):
        # No se reasigna tomado_por: la medición sigue perteneciendo a quien la abrió.
        self._exigir_que_sea_suya(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._exigir_que_sea_suya(instance)
        instance.activo = False
        instance.save(update_fields=["activo", "updated_at"])
