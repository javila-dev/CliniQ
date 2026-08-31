from django.db import transaction
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
from apps.consentimientos.services import (
    confirmar_firma_compromiso_pago,
    enviar_link_firma_consentimiento,
    firmar_consentimiento,
    generar_consentimiento,
    iniciar_firma_compromiso_pago_documenso,
    verificar_firma_compromiso_pago_en_documenso,
)
from apps.historia_clinica.services import DocumensoIntegrationError
from apps.core.logging import registrar_accion
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
        ambito = self.request.query_params.get("ambito")
        if servicio:
            queryset = queryset.filter(servicio_id=servicio)
        if activa is not None:
            queryset = queryset.filter(activo=activa.lower() == "true")
        if ambito:
            queryset = queryset.filter(ambito=ambito)
        return queryset.order_by("nombre", "-version")


class ConsentimientoViewSet(ReadOnlyModelViewSet):
    serializer_class = ConsentimientoSerializer
    queryset = Consentimiento.objects.select_related(
        "cita",
        "cita__sede",
        "cotizacion",
        "paciente",
        "plantilla",
    ).all()
    def get_permissions(self):
        if self.action in {"generar", "iniciar_firma_documenso", "confirmar_firma_documenso", "enviar_link_documenso", "verificar_firma_documenso"}:
            permission_classes = (RequirePermission("consentimientos.generar"),)
        elif self.action == "revocar":
            permission_classes = (RequirePermission("consentimientos.revocar"),)
        else:
            permission_classes = (RequirePermission("consentimientos.ver"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        from django.db.models import Q

        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(
                Q(cita__sede__clinica=user.clinica) | Q(cotizacion__clinica=user.clinica)
            )
        estado = self.request.query_params.get("estado")
        paciente = self.request.query_params.get("paciente")
        cita = self.request.query_params.get("cita")
        cotizacion = self.request.query_params.get("cotizacion")
        if estado:
            queryset = queryset.filter(estado=estado)
        if paciente:
            queryset = queryset.filter(paciente_id=paciente)
        if cita:
            queryset = queryset.filter(cita_id=cita)
        if cotizacion:
            queryset = queryset.filter(cotizacion_id=cotizacion)
        elif self.action == "list":
            # El compromiso de pago (consentimiento sin plantilla atado a una
            # cotizacion) se gestiona desde el detalle de la cotizacion; no debe
            # aparecer en el listado global de consentimientos. El detalle
            # (retrieve) y las acciones de firma siguen accesibles por id, y un
            # filtro ?cotizacion=... explicito tambien lo devuelve.
            queryset = queryset.exclude(plantilla__isnull=True, cotizacion__isnull=False)
        return queryset

    @action(detail=False, methods=["post"], url_path="generar")
    def generar(self, request, *args, **kwargs):
        serializer = GenerarConsentimientoSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        consentimiento = generar_consentimiento(
            cita=serializer.validated_data["cita"],
            plantilla=serializer.validated_data["plantilla"],
            cotizacion=serializer.validated_data["cotizacion"],
        )
        return Response(self.get_serializer(consentimiento).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="iniciar_firma_documenso")
    def iniciar_firma_documenso(self, request, pk=None):
        with transaction.atomic():
            consentimiento = Consentimiento.objects.select_for_update().get(pk=self.get_object().pk)
            try:
                result = iniciar_firma_compromiso_pago_documenso(consentimiento)
            except DocumensoIntegrationError as exc:
                return Response({"error": str(exc), "code": "DOCUMENSO_ERROR"}, status=status.HTTP_502_BAD_GATEWAY)
            except ValueError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="confirmar_firma_documenso")
    def confirmar_firma_documenso(self, request, pk=None):
        consentimiento = self.get_object()
        consentimiento = confirmar_firma_compromiso_pago(consentimiento)
        return Response(self.get_serializer(consentimiento).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="verificar_firma_documenso")
    def verificar_firma_documenso(self, request, pk=None):
        """Consulta el estado directamente en Documenso y reconcilia el estado
        del consentimiento. Respaldo manual cuando el webhook tarda o no llega."""
        consentimiento = self.get_object()
        verificar_firma_compromiso_pago_en_documenso(consentimiento)
        consentimiento.refresh_from_db()
        return Response(self.get_serializer(consentimiento).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="enviar_link_documenso")
    def enviar_link_documenso(self, request, pk=None):
        with transaction.atomic():
            consentimiento = Consentimiento.objects.select_for_update().get(pk=self.get_object().pk)
            try:
                result = enviar_link_firma_consentimiento(consentimiento)
            except DocumensoIntegrationError as exc:
                return Response({"error": str(exc), "code": "DOCUMENSO_ERROR"}, status=status.HTTP_502_BAD_GATEWAY)
            except ValueError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(result, status=status.HTTP_200_OK)

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

    def get(self, request, token, *args, **kwargs):
        try:
            consentimiento = Consentimiento.objects.select_related("cita", "cotizacion", "paciente", "plantilla").get(token=token)
        except Consentimiento.DoesNotExist:
            return Response({"ok": False, "error": "Token de firma inválido."}, status=status.HTTP_404_NOT_FOUND)
        if consentimiento.estado == Consentimiento.Estado.PENDIENTE and not consentimiento.token_vigente:
            return Response({"ok": False, "error": "El enlace de firma ya expiró."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ConsentimientoSerializer(consentimiento).data, status=status.HTTP_200_OK)

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

        registrar_accion(request, "consentimiento.firmar", consentimiento, {
            "paciente_id": str(consentimiento.paciente_id) if consentimiento.paciente_id else None,
            "plantilla_id": str(consentimiento.plantilla_id) if consentimiento.plantilla_id else None,
        })
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
