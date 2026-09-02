from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.migracion.models import LoteMigracion
from apps.migracion.serializers import LoteMigracionSerializer, PacienteEnCursoSerializer
from apps.migracion.services import cargar_paciente_en_curso, revertir_lote
from apps.pacientes.models import Paciente
from apps.clinicas.models import Sede
from apps.users.authorization import user_has_permission
from apps.users.permissions import get_clinica_activa


def _guard(request):
    """El asistente exige: clínica activa en modo puesta en marcha + permiso
    ``migracion.gestionar`` (o superadmin)."""
    clinica = get_clinica_activa(request)
    if clinica is None:
        raise PermissionDenied("No hay una clínica activa.")
    if not clinica.modo_puesta_en_marcha:
        raise PermissionDenied("La clínica no está en modo puesta en marcha.")
    if request.user.rol != "superadmin" and not user_has_permission(
        request.user, "migracion.gestionar", request=request
    ):
        raise PermissionDenied("No tienes permiso para el asistente de puesta en marcha.")
    return clinica


class MigracionViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    """Lotes de puesta en marcha + acciones de carga y reversión."""

    serializer_class = LoteMigracionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        clinica = _guard(self.request)
        return (
            LoteMigracion.objects.filter(clinica=clinica)
            .select_related("paciente", "creado_por")
            .order_by("-created_at")
        )

    def create(self, request, *args, **kwargs):
        """Alias de ``paciente_en_curso`` para POST directo al colección."""
        return self.paciente_en_curso(request)

    def paciente_en_curso(self, request):
        clinica = _guard(request)
        ser = PacienteEnCursoSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        paciente = Paciente.objects.filter(id=data["paciente"], clinica=clinica).first()
        if paciente is None:
            raise ValidationError({"paciente": "Paciente no encontrado en esta clínica."})
        sede = Sede.objects.filter(id=data["sede"], clinica=clinica).first()
        if sede is None:
            raise ValidationError({"sede": "Sede no encontrada en esta clínica."})

        lote = cargar_paciente_en_curso(
            data, clinica=clinica, sede=sede, paciente=paciente, actor=request.user
        )
        return Response(LoteMigracionSerializer(lote).data, status=status.HTTP_201_CREATED)

    def revertir(self, request, pk=None):
        _guard(request)
        lote = self.get_object()
        revertir_lote(lote, actor=request.user)
        return Response(LoteMigracionSerializer(lote).data)
