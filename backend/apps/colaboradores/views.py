import logging

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.colaboradores.models import Colaborador, HorarioColaborador
from apps.colaboradores.serializers import (
    ColaboradorListSerializer,
    ColaboradorSerializer,
    ColaboradorCreateSerializer,
    HorarioColaboradorSerializer,
    ProfesionalListSerializer,
    colaborador_tiene_citas_futuras,
)
from apps.users.permissions import HasClinicamente, RequirePermission


logger = logging.getLogger(__name__)


class ColaboradorViewSet(HasClinicamente, ModelViewSet):
    serializer_class = ColaboradorSerializer
    queryset = Colaborador.objects.select_related(
        "user",
        "user__rol_dinamico",
        "sede_principal",
        "sede_principal__clinica",
    ).prefetch_related("especialidades", "sedes", "horarios", "horarios__sede").all()
    search_fields = ("user__first_name", "user__last_name", "user__email")
    ordering_fields = ("fecha_ingreso", "created_at", "user__first_name", "user__last_name")

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            permission_classes = (RequirePermission("colaboradores.gestionar"),)
        else:
            permission_classes = (RequirePermission("colaboradores.ver"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = ModelViewSet.get_queryset(self)
        if self.request.user.rol != "superadmin":
            queryset = queryset.filter(sede_principal__clinica=self.request.user.clinica)
        activo = self.request.query_params.get("activo")
        tipo_contrato = self.request.query_params.get("tipo_contrato")
        sede_principal = self.request.query_params.get("sede_principal")

        if activo is not None:
            queryset = queryset.filter(activo=activo.lower() == "true")
        if tipo_contrato:
            queryset = queryset.filter(tipo_contrato=tipo_contrato)
        if sede_principal:
            queryset = queryset.filter(sede_principal_id=sede_principal)
        return queryset

    def get_serializer_class(self):
        if self.action == "create":
            return ColaboradorCreateSerializer
        if self.action == "list":
            return ColaboradorListSerializer
        return ColaboradorSerializer

    def _get_safe_request_data(self, request):
        if hasattr(request.data, "lists"):
            data = {key: values if len(values) > 1 else values[0] for key, values in request.data.lists()}
        else:
            data = dict(request.data)
        if "password" in data:
            data["password"] = "***"
        return data

    def create(self, request, *args, **kwargs):
        safe_data = self._get_safe_request_data(request)
        logger.info(
            "Creando colaborador | user_id=%s | rol=%s | payload=%s",
            str(getattr(request.user, "id", "")),
            getattr(request.user, "rol", None),
            safe_data,
        )
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError:
            logger.warning(
                "Validacion fallida al crear colaborador | user_id=%s | payload=%s | errors=%s",
                str(getattr(request.user, "id", "")),
                safe_data,
                serializer.errors,
            )
            raise

        try:
            colaborador = serializer.save()
        except Exception:
            logger.exception(
                "Error inesperado al guardar colaborador | user_id=%s | payload=%s",
                str(getattr(request.user, "id", "")),
                safe_data,
            )
            raise
        return Response(ColaboradorSerializer(colaborador, context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        instance = self.get_object()
        nuevo_activo = serializer.validated_data.get("activo", instance.activo)
        if instance.activo and not nuevo_activo and colaborador_tiene_citas_futuras(instance):
            raise ValidationError({"activo": "No se puede desactivar un colaborador con citas futuras."})
        serializer.save()

    def perform_destroy(self, instance):
        if colaborador_tiene_citas_futuras(instance):
            raise ValidationError({"error": "No se puede eliminar un colaborador con citas futuras."})
        instance.delete()

    @action(detail=False, methods=["get"], url_path="profesionales", pagination_class=None)
    def profesionales(self, request, *args, **kwargs):
        queryset = self.filter_queryset(
            self.get_queryset().filter(
                activo=True,
                user__es_profesional=True,
            )
        )
        sede_id = request.query_params.get("sede_id")
        if sede_id:
            queryset = queryset.filter(sedes__id=sede_id).distinct()
        serializer = ProfesionalListSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class HorarioColaboradorViewSet(ModelViewSet):
    serializer_class = HorarioColaboradorSerializer
    pagination_class = None
    queryset = HorarioColaborador.objects.select_related(
        "colaborador",
        "colaborador__user",
        "colaborador__user__rol_dinamico",
        "colaborador__sede_principal",
        "sede",
        "sede__clinica",
    ).all()
    ordering_fields = ("dia_semana", "hora_inicio", "sede__nombre")

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            permission_classes = (RequirePermission("colaboradores.horarios.gestionar"),)
        else:
            permission_classes = (RequirePermission("colaboradores.horarios.ver"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = ModelViewSet.get_queryset(self)
        user = self.request.user

        if user.rol != "superadmin":
            queryset = queryset.filter(sede__clinica=user.clinica)

        if self.action == "retrieve" and user.rol not in {"admin", "superadmin"}:
            return queryset.filter(colaborador__user=user)

        colaborador_id = self.request.query_params.get("colaborador")
        if self.action == "list":
            if not colaborador_id:
                return queryset.none()
            queryset = queryset.filter(colaborador_id=colaborador_id)
            if user.rol not in {"admin", "superadmin"}:
                queryset = queryset.filter(colaborador__user=user)

        return queryset
