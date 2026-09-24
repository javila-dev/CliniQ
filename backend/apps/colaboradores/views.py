import logging
from uuid import UUID

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
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
from apps.users import services as user_services
from apps.users.permissions import HasClinicamente, RequirePermission, get_clinica_activa


logger = logging.getLogger(__name__)
User = get_user_model()


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
        elif self.action == "profesionales":
            # Selector de profesionales de agenda, bloqueos y procedimientos: no
            # exige `colaboradores.ver` (ese permiso es para la ficha del personal).
            permission_classes = (IsAuthenticated,)
        else:
            permission_classes = (RequirePermission("colaboradores.ver"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = ModelViewSet.get_queryset(self)
        clinica_activa = get_clinica_activa(self.request)
        if clinica_activa is not None:
            queryset = queryset.filter(sede_principal__clinica=clinica_activa)
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

        # Desactivar el colaborador desactiva su usuario (ver
        # ColaboradorSerializer._sync_user_activo); cambiar su rol puede quitarle
        # el admin. En ninguno de los dos casos la clínica puede quedar sin
        # ningún administrador activo.
        rol_dinamico_nuevo = serializer.validated_data.get("_rol_dinamico")
        quedara_admin = user_services.es_admin(instance.user) if rol_dinamico_nuevo is None else rol_dinamico_nuevo.slug == "admin"
        if user_services.dejaria_clinica_sin_admin(
            instance.user, quedara_activo=bool(nuevo_activo), quedara_admin=quedara_admin
        ):
            raise ValidationError(
                "La clínica quedaría sin ningún administrador activo. Activa o designa otro administrador antes de aplicar este cambio."
            )
        serializer.save()

    def perform_destroy(self, instance):
        if colaborador_tiene_citas_futuras(instance):
            raise ValidationError({"error": "No se puede eliminar un colaborador con citas futuras."})
        instance.delete()

    @action(detail=False, methods=["get"], url_path="profesionales", pagination_class=None)
    def profesionales(self, request, *args, **kwargs):
        # La fuente de verdad para "atiende pacientes" es el usuario, no su
        # perfil laboral. Algunos usuarios legados pueden no tener Colaborador
        # y aun así ser profesionales válidos con citas ya asignadas.
        queryset = (
            User.objects.filter(activo=True, es_profesional=True)
            .filter(Q(colaborador__activo=True) | Q(colaborador__isnull=True))
            .select_related("rol_dinamico", "colaborador", "colaborador__sede_principal")
            .prefetch_related("colaborador__especialidades", "colaborador__sedes")
        )
        clinica = get_clinica_activa(request)
        if clinica is not None:
            queryset = queryset.filter(clinica=clinica)
        elif request.user.rol != "superadmin":
            queryset = queryset.none()

        sede_id = request.query_params.get("sede_id")
        if sede_id:
            queryset = queryset.filter(
                Q(colaborador__sedes__id=sede_id) | Q(colaborador__sede_principal_id=sede_id)
            ).distinct()

        # Solo filtra por procedimiento si la clínica lo activó. Si no, cualquier
        # profesional de la sede puede atender cualquier procedimiento y los parámetros
        # se ignoran, así el frontend puede enviarlos siempre. Con varios procedimientos
        # (sesión combinada) basta con que el profesional realice al menos uno.
        servicio_ids, item_id, sesion_id = self._leer_filtro_por_procedimiento(request)
        if clinica is not None and clinica.filtrar_profesionales_por_procedimiento:
            requeridos = self._procedimientos_requeridos(clinica, servicio_ids, item_id, sesion_id)
            if requeridos:
                queryset = queryset.filter(colaborador__especialidades__id__in=requeridos).distinct()

        serializer = ProfesionalListSerializer(queryset.order_by("last_name", "first_name"), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @staticmethod
    def _parse_uuid(valor, campo):
        try:
            return UUID(valor)
        except ValueError:
            raise ValidationError({campo: f"'{valor}' no es un id válido."})

    def _leer_filtro_por_procedimiento(self, request):
        """Lee y valida los ids recibidos, aunque la clínica no tenga el filtro activo."""
        params = request.query_params
        servicio_ids = {
            self._parse_uuid(valor.strip(), "servicio_ids")
            for valor in params.get("servicio_ids", "").split(",")
            if valor.strip()
        }
        item_id = params.get("item_cotizacion_id")
        sesion_id = params.get("sesion_ejecutada_id")
        return (
            servicio_ids,
            self._parse_uuid(item_id, "item_cotizacion_id") if item_id else None,
            self._parse_uuid(sesion_id, "sesion_ejecutada_id") if sesion_id else None,
        )

    @staticmethod
    def _procedimientos_requeridos(clinica, servicio_ids, item_id, sesion_id) -> set:
        """Procedimientos por los que se filtra, dados por id o por el ítem/sesión que se agenda."""
        # Import diferido: agenda.serializers importa colaboradores.models.
        from apps.agenda.serializers import procedimientos_de_la_cita
        from apps.cotizaciones.models import ItemCotizacion
        from apps.protocolos.models import SesionProcedimiento

        requeridos = set(servicio_ids)
        if item_id or sesion_id:
            item = (
                ItemCotizacion.objects.filter(id=item_id, cotizacion__clinica=clinica).first() if item_id else None
            )
            sesion = (
                SesionProcedimiento.objects.select_related("tipo_sesion")
                .filter(id=sesion_id, tratamiento__paciente__clinica=clinica)
                .first()
                if sesion_id
                else None
            )
            requeridos |= procedimientos_de_la_cita(item_cotizacion=item, sesion=sesion)
        return requeridos


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
