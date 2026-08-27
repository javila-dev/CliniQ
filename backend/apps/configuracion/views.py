import mimetypes

from django.http import FileResponse, Http404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.clinicas.models import Clinica
from apps.configuracion.models import (
    HISTORIA_TABS_DISPONIBLES,
    ConfiguracionCartera,
    ConfiguracionHistoria,
    ConfiguracionRegistroPublico,
    ConfiguracionSignosVitales,
    ConfiguracionWizard,
    DocumensoConsentimientoTemplate,
)
from apps.configuracion.services import (
    DocumensoTemplatesConfigurationError,
    DocumensoTemplatesUpstreamError,
    listar_templates_documenso_disponibles,
)
from apps.configuracion.serializers import (
    ConfiguracionCarteraSerializer,
    ConfiguracionFacialSerializer,
    ConfiguracionHistoriaSerializer,
    ConfiguracionRegistroPublicoSerializer,
    ConfiguracionSignosVitalesSerializer,
    ConfiguracionWizardSerializer,
    DocumensoConsentimientoTemplateSerializer,
    PlantillaConsentimientoUploadSerializer,
    PlantillaCamposSerializer,
)
from apps.pacientes.models import ConfiguracionFacial
from apps.users.permissions import IsAdmin, get_clinica_activa


class PlantillaConsentimientoViewSet(GenericViewSet):
    """Gestión self-service de plantillas de consentimiento (PDF + campos mapeados)."""

    serializer_class = DocumensoConsentimientoTemplateSerializer
    queryset = DocumensoConsentimientoTemplate.objects.all()
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        return [IsAdmin()]

    def _get_clinica(self):
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            raise ValidationError({"clinica": "No hay clínica activa para esta solicitud."})
        return clinica

    def get_queryset(self):
        return DocumensoConsentimientoTemplate.objects.filter(
            clinica=self._get_clinica(), activo=True, nombre__gt=""
        ).order_by("nombre", "created_at")

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        return Response(DocumensoConsentimientoTemplateSerializer(qs, many=True).data)

    def create(self, request, *args, **kwargs):
        """Subir PDF y crear plantilla."""
        ser = PlantillaConsentimientoUploadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        clinica = self._get_clinica()
        plantilla = DocumensoConsentimientoTemplate(clinica=clinica, nombre=ser.validated_data["nombre"])
        plantilla.save()
        plantilla.pdf_file.save(
            f"{plantilla.id}.pdf",
            ser.validated_data["pdf"],
            save=True,
        )
        return Response(
            DocumensoConsentimientoTemplateSerializer(plantilla).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["patch"], url_path="campos")
    def guardar_campos(self, request, pk=None):
        """Guardar posiciones de campos mapeados sobre el PDF."""
        plantilla = self.get_queryset().filter(pk=pk).first()
        if not plantilla:
            raise Http404
        ser = PlantillaCamposSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        plantilla.campos = ser.validated_data["campos"]
        plantilla.save(update_fields=["campos", "updated_at"])
        return Response(DocumensoConsentimientoTemplateSerializer(plantilla).data)

    @action(detail=True, methods=["get"], url_path="pdf")
    def get_pdf(self, request, pk=None):
        """Proxy del PDF almacenado en Minio para el mapper."""
        plantilla = self.get_queryset().filter(pk=pk).first()
        if not plantilla or not plantilla.pdf_file:
            raise Http404
        try:
            f = plantilla.pdf_file.open("rb")
            return FileResponse(f, content_type="application/pdf")
        except Exception:
            raise Http404

    def destroy(self, request, pk=None, *args, **kwargs):
        plantilla = self.get_queryset().filter(pk=pk).first()
        if not plantilla:
            raise Http404
        plantilla.activo = False
        plantilla.save(update_fields=["activo", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            raise ValidationError({"clinica": "No hay clínica activa para esta solicitud."})
        return clinica

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
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            raise ValidationError({"clinica": "No hay clínica activa para esta solicitud."})
        return clinica

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
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            raise ValidationError({"clinica": "No hay clínica activa para esta solicitud."})
        return clinica

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


class ConfiguracionCarteraViewSet(GenericViewSet):
    serializer_class = ConfiguracionCarteraSerializer
    queryset = ConfiguracionCartera.objects.select_related("clinica").all()
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method.lower() == "patch":
            permission_classes = (IsAdmin,)
        else:
            permission_classes = (IsAuthenticated,)
        return [permission() for permission in permission_classes]

    def _get_clinica(self):
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            raise ValidationError({"clinica": "No hay clínica activa para esta solicitud."})
        return clinica

    def _get_instance(self):
        clinica = self._get_clinica()
        instance, _ = ConfiguracionCartera.objects.get_or_create(clinica=clinica)
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


class ConfiguracionWizardViewSet(GenericViewSet):
    serializer_class = ConfiguracionWizardSerializer
    queryset = ConfiguracionWizard.objects.select_related("clinica").all()
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method.lower() == "patch":
            permission_classes = (IsAdmin,)
        else:
            permission_classes = (IsAuthenticated,)
        return [permission() for permission in permission_classes]

    def _get_clinica(self):
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            raise ValidationError({"clinica": "No hay clínica activa para esta solicitud."})
        return clinica

    def _get_instance(self):
        clinica = self._get_clinica()
        instance, _ = ConfiguracionWizard.objects.get_or_create(clinica=clinica)
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


class ConfiguracionFacialViewSet(GenericViewSet):
    serializer_class = ConfiguracionFacialSerializer
    queryset = ConfiguracionFacial.objects.select_related("clinica").all()
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method.lower() == "patch":
            permission_classes = (IsAdmin,)
        else:
            permission_classes = (IsAuthenticated,)
        return [permission() for permission in permission_classes]

    def _get_clinica(self):
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            raise ValidationError({"clinica": "No hay clínica activa para esta solicitud."})
        if not clinica.facial_verificacion_habilitada:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("El módulo de verificación facial no está habilitado para esta clínica.")
        return clinica

    def _get_instance(self):
        clinica = self._get_clinica()
        instance, _ = ConfiguracionFacial.objects.get_or_create(clinica=clinica)
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


class ConfiguracionRegistroPublicoViewSet(GenericViewSet):
    serializer_class = ConfiguracionRegistroPublicoSerializer
    queryset = ConfiguracionRegistroPublico.objects.select_related("clinica").all()
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method.lower() == "patch":
            permission_classes = (IsAdmin,)
        else:
            permission_classes = (IsAuthenticated,)
        return [permission() for permission in permission_classes]

    def _get_clinica(self):
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            raise ValidationError({"clinica": "No hay clínica activa para esta solicitud."})
        return clinica

    def _get_instance(self):
        clinica = self._get_clinica()
        instance, _ = ConfiguracionRegistroPublico.objects.get_or_create(clinica=clinica)
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
