from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.clinicas.models import Clinica
from apps.configuracion.models import (
    HISTORIA_TABS_DISPONIBLES,
    ConfiguracionHistoria,
    ConfiguracionSignosVitales,
    DocumensoConsentimientoTemplate,
)
from apps.configuracion.services import (
    DocumensoTemplatesConfigurationError,
    DocumensoTemplatesUpstreamError,
    listar_templates_documenso_disponibles,
)
from apps.configuracion.serializers import (
    ConfiguracionHistoriaSerializer,
    ConfiguracionSignosVitalesSerializer,
    DocumensoConsentimientoTemplateSerializer,
)
from apps.users.permissions import IsAdmin


class DocumensoConsentimientoTemplateViewSet(GenericViewSet):
    serializer_class = DocumensoConsentimientoTemplateSerializer
    queryset = DocumensoConsentimientoTemplate.objects.select_related("clinica").all()
    lookup_field = "tipo"
    http_method_names = ["get", "put", "delete", "head", "options"]

    def get_permissions(self):
        if self.request.method.lower() == "get":
            permission_classes = (IsAuthenticated,)
        else:
            permission_classes = (IsAdmin,)
        return [permission() for permission in permission_classes]

    def _get_clinica(self):
        user = self.request.user
        if user.rol != "superadmin":
            if not user.clinica_id:
                raise ValidationError({"clinica": "El usuario autenticado no tiene una clinica asociada."})
            return user.clinica

        clinica_id = self.request.query_params.get("clinica")
        if user.clinica_id and not clinica_id:
            return user.clinica
        if not clinica_id:
            raise ValidationError({"clinica": "Debes enviar ?clinica=<uuid> para operar como superadmin."})
        try:
            return Clinica.objects.get(id=clinica_id)
        except Clinica.DoesNotExist as exc:
            raise ValidationError({"clinica": "La clinica indicada no existe."}) from exc

    def get_queryset(self):
        queryset = super().get_queryset()
        return queryset.filter(clinica=self._get_clinica())

    def list(self, request, *args, **kwargs):
        return Response(
            {"detail": "Este endpoint fue deprecado. Usa /configuracion/documenso-templates/disponibles/."},
            status=status.HTTP_410_GONE,
        )

    @action(detail=False, methods=["get"], url_path="disponibles", pagination_class=None)
    def disponibles(self, request, *args, **kwargs):
        try:
            data = listar_templates_documenso_disponibles(clinica=self._get_clinica())
        except DocumensoTemplatesConfigurationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except DocumensoTemplatesUpstreamError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(data, status=status.HTTP_200_OK)

    def update(self, request, *args, **kwargs):
        return Response(
            {"detail": "Este endpoint fue deprecado. Usa /configuracion/documenso-templates/disponibles/."},
            status=status.HTTP_410_GONE,
        )

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "Este endpoint fue deprecado. Usa /configuracion/documenso-templates/disponibles/."},
            status=status.HTTP_410_GONE,
        )


class ConfiguracionSignosVitalesViewSet(GenericViewSet):
    serializer_class = ConfiguracionSignosVitalesSerializer
    queryset = ConfiguracionSignosVitales.objects.select_related("clinica").all()
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method.lower() == "patch":
            permission_classes = (IsAdmin,)
        else:
            permission_classes = (IsAuthenticated,)
        return [permission() for permission in permission_classes]

    def _get_clinica(self):
        user = self.request.user
        if user.rol == "superadmin" and not user.clinica_id:
            clinica_id = self.request.query_params.get("clinica")
            if not clinica_id:
                raise ValidationError({"clinica": "Debes enviar ?clinica=<uuid> para operar como superadmin."})
            try:
                return Clinica.objects.get(id=clinica_id)
            except Clinica.DoesNotExist as exc:
                raise ValidationError({"clinica": "La clinica indicada no existe."}) from exc
        if not user.clinica_id:
            raise ValidationError({"clinica": "El usuario autenticado no tiene una clinica asociada."})
        return user.clinica

    def _get_instance(self):
        clinica = self._get_clinica()
        instance, _ = ConfiguracionSignosVitales.objects.get_or_create(clinica=clinica)
        return instance

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self._get_instance())
        return Response(serializer.data, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        instance = self._get_instance()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class ConfiguracionHistoriaViewSet(GenericViewSet):
    serializer_class = ConfiguracionHistoriaSerializer
    queryset = ConfiguracionHistoria.objects.select_related("clinica").all()
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method.lower() == "patch":
            permission_classes = (IsAdmin,)
        else:
            permission_classes = (IsAuthenticated,)
        return [permission() for permission in permission_classes]

    def _get_clinica(self):
        user = self.request.user
        if user.rol == "superadmin" and not user.clinica_id:
            clinica_id = self.request.query_params.get("clinica")
            if not clinica_id:
                raise ValidationError({"clinica": "Debes enviar ?clinica=<uuid> para operar como superadmin."})
            try:
                return Clinica.objects.get(id=clinica_id)
            except Clinica.DoesNotExist as exc:
                raise ValidationError({"clinica": "La clinica indicada no existe."}) from exc
        if not user.clinica_id:
            raise ValidationError({"clinica": "El usuario autenticado no tiene una clinica asociada."})
        return user.clinica

    def _get_instance(self):
        clinica = self._get_clinica()
        defaults = {"tabs_activos": [slug for slug, _, _ in HISTORIA_TABS_DISPONIBLES]}
        instance, _ = ConfiguracionHistoria.objects.get_or_create(clinica=clinica, defaults=defaults)
        return instance

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self._get_instance())
        return Response(serializer.data, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        instance = self._get_instance()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
