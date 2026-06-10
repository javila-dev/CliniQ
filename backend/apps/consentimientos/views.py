from django.utils import timezone
from rest_framework import mixins, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet, ModelViewSet, ReadOnlyModelViewSet

from apps.consentimientos.models import Consentimiento, PlantillaConsentimiento
from apps.consentimientos.serializers import (
    ConsentimientoSerializer,
    GenerarConsentimientoSerializer,
    PlantillaConsentimientoSerializer,
    RevocarConsentimientoSerializer,
)
from apps.consentimientos.services import firmar_consentimiento, generar_consentimiento
from apps.users.permissions import RequirePermission


class PlantillaConsentimientoViewSet(ModelViewSet):
    serializer_class = PlantillaConsentimientoSerializer
    queryset = PlantillaConsentimiento.objects.select_related("clinica", "servicio").all()

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            permission_classes = (RequirePermission("consentimientos.plantillas.ver"),)
        else:
            permission_classes = (RequirePermission("consentimientos.plantillas.gestionar"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(clinica=user.clinica)
        servicio = self.request.query_params.get("servicio")
        activa = self.request.query_params.get("activa")
        if servicio:
            queryset = queryset.filter(servicio_id=servicio)
        if activa is not None:
            queryset = queryset.filter(activo=activa.lower() == "true")
        return queryset.order_by("nombre", "-version")


class ConsentimientoViewSet(ReadOnlyModelViewSet):
    serializer_class = ConsentimientoSerializer
    queryset = Consentimiento.objects.select_related(
        "cita",
        "cita__sede",
        "paciente",
        "plantilla",
    ).all()
    def get_permissions(self):
        if self.action == "generar":
            permission_classes = (RequirePermission("consentimientos.generar"),)
        elif self.action == "revocar":
            permission_classes = (RequirePermission("consentimientos.revocar"),)
        else:
            permission_classes = (RequirePermission("consentimientos.ver"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(cita__sede__clinica=user.clinica)
        estado = self.request.query_params.get("estado")
        paciente = self.request.query_params.get("paciente")
        cita = self.request.query_params.get("cita")
        if estado:
            queryset = queryset.filter(estado=estado)
        if paciente:
            queryset = queryset.filter(paciente_id=paciente)
        if cita:
            queryset = queryset.filter(cita_id=cita)
        return queryset

    @action(detail=False, methods=["post"], url_path="generar")
    def generar(self, request, *args, **kwargs):
        serializer = GenerarConsentimientoSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        consentimiento = generar_consentimiento(serializer.validated_data["cita"], serializer.validated_data["plantilla"])
        return Response(self.get_serializer(consentimiento).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="revocar")
    def revocar(self, request, pk=None):
        consentimiento = self.get_object()
        serializer = RevocarConsentimientoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        consentimiento.estado = Consentimiento.Estado.REVOCADO
        consentimiento.revocado_en = timezone.now()
        consentimiento.motivo_revocacion = serializer.validated_data["motivo_revocacion"]
        consentimiento.save()
        return Response(self.get_serializer(consentimiento).data, status=status.HTTP_200_OK)


class FirmarConsentimientoPublicoView(APIView):
    authentication_classes = ()
    permission_classes = ()

    def post(self, request, token, *args, **kwargs):
        try:
            consentimiento = firmar_consentimiento(
                token=token,
                ip=request.META.get("REMOTE_ADDR"),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
        except Consentimiento.DoesNotExist:
            return Response({"ok": False, "error": "Token de firma inválido."}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({"ok": False, "error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "ok": True,
                "consentimiento_id": str(consentimiento.id),
                "estado": consentimiento.estado,
                "firmado_en": consentimiento.firmado_en,
                "pdf_url": consentimiento.pdf_archivo.url if consentimiento.pdf_archivo else None,
            },
            status=status.HTTP_200_OK,
        )
