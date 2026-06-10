import requests
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet, ModelViewSet

from apps.agenda.models import Cita
from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente
from apps.protocolos.serializers import (
    SesionProcedimientoSerializer,
    TratamientoPacienteListSerializer,
    TratamientoPacienteSerializer,
)
from apps.protocolos.services import (
    ProtocolosError,
    consentimiento_status_sesion,
    iniciar_checkin_otp,
    marcar_sesion_completada,
    registrar_checkin_foto,
    verificar_otp,
)
from apps.users.models import User
from apps.users.permissions import IsAdmin, IsAdminOrRecepcion


class TratamientoPacienteViewSet(ModelViewSet):
    queryset = TratamientoPaciente.objects.select_related(
        "paciente",
        "servicio",
        "tratamiento_catalogo",
        "cotizacion_item",
    ).prefetch_related(
        "sesiones",
        "sesiones__paso",
        "sesiones__procedimiento",
        "sesiones__profesional",
        "sesiones__cita",
    )
    filterset_fields = ("paciente", "servicio", "tratamiento_catalogo", "estado", "activo")
    search_fields = ("paciente__nombres", "paciente__apellidos", "servicio__nombre", "tratamiento_catalogo__nombre")
    ordering_fields = ("fecha_inicio", "created_at")

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated()]
        if self.action == "destroy":
            return [IsAdmin()]
        return [IsAdminOrRecepcion()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(paciente__clinica=user.clinica)
        return queryset

    def get_serializer_class(self):
        if self.action == "list":
            return TratamientoPacienteListSerializer
        return TratamientoPacienteSerializer


class SesionProcedimientoViewSet(mixins.UpdateModelMixin, GenericViewSet):
    serializer_class = SesionProcedimientoSerializer
    queryset = SesionProcedimiento.objects.select_related(
        "tratamiento",
        "tratamiento__paciente",
        "tratamiento__servicio",
        "tratamiento__tratamiento_catalogo",
        "paso",
        "procedimiento",
        "cita",
        "profesional",
    )
    http_method_names = ["get", "post"]

    def get_permissions(self):
        return [IsAuthenticated()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(tratamiento__paciente__clinica=user.clinica)
        return queryset

    def _request_ip(self, request):
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")

    @action(detail=True, methods=["post"], url_path="marcar_completado")
    def marcar_completado(self, request, pk=None):
        sesion = self.get_object()
        cita = None
        profesional = None
        if request.data.get("cita_id"):
            cita = get_object_or_404(Cita, id=request.data["cita_id"])
        if request.data.get("profesional_id"):
            profesional = get_object_or_404(User, id=request.data["profesional_id"])
        elif request.user.rol == "profesional":
            profesional = request.user
        try:
            sesion = marcar_sesion_completada(
                sesion,
                cita=cita,
                profesional=profesional,
                observaciones=request.data.get("observaciones", ""),
                fecha=request.data.get("fecha"),
                hora=request.data.get("hora"),
                procedimientos_ejecutados=request.data.get("procedimientos_ejecutados", []),
                forzar_sin_consentimiento=bool(request.data.get("forzar_sin_consentimiento")),
                motivo=request.data.get("motivo", ""),
            )
        except ProtocolosError as exc:
            return Response({"error": str(exc), "code": exc.code, **exc.extra}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(sesion).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="marcar_completada")
    def marcar_completada(self, request, pk=None):
        return self.marcar_completado(request, pk=pk)

    @action(detail=True, methods=["post"], url_path="marcar_inasistencia")
    def marcar_inasistencia(self, request, pk=None):
        sesion = self.get_object()
        sesion.estado = SesionProcedimiento.Estado.INASISTENCIA
        sesion.observaciones = request.data.get("observaciones", sesion.observaciones)
        sesion.save(update_fields=["estado", "observaciones", "updated_at"])
        return Response(self.get_serializer(sesion).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="consentimientos")
    def consentimientos(self, request, pk=None):
        sesion = self.get_object()
        return Response(consentimiento_status_sesion(sesion), status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="iniciar_checkin")
    def iniciar_checkin(self, request, pk=None):
        sesion = self.get_object()
        try:
            otp, enviado = iniciar_checkin_otp(sesion, self._request_ip(request))
        except requests.RequestException:
            return Response(
                {"error": "No se pudo contactar el webhook", "code": "WEBHOOK_ERROR"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except ProtocolosError as exc:
            return Response({"error": str(exc), "code": exc.code, **exc.extra}, status=status.HTTP_400_BAD_REQUEST)

        payload = {"expira_en": otp.expira_en}
        payload["otp_enviado" if enviado else "otp_activo"] = True
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="verificar_otp")
    def verificar_otp_action(self, request, pk=None):
        sesion = self.get_object()
        codigo = request.data.get("codigo", "")
        if not codigo:
            raise ValidationError({"codigo": "Este campo es obligatorio."})
        try:
            sesion = verificar_otp(sesion, codigo, self._request_ip(request))
        except ProtocolosError as exc:
            return Response({"error": str(exc), "code": exc.code, **exc.extra}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(sesion).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="checkin_foto")
    def checkin_foto(self, request, pk=None):
        sesion = self.get_object()
        foto = request.FILES.get("foto")
        if foto is None:
            raise ValidationError({"foto": "Debes adjuntar una foto."})
        if foto.content_type not in {"image/jpeg", "image/png", "image/jpg"}:
            raise ValidationError({"foto": "Solo se permiten imagenes JPEG o PNG."})
        if foto.size > 5 * 1024 * 1024:
            raise ValidationError({"foto": "La foto no puede superar 5MB."})
        sesion = registrar_checkin_foto(sesion, foto, self._request_ip(request))
        return Response(self.get_serializer(sesion).data, status=status.HTTP_200_OK)
