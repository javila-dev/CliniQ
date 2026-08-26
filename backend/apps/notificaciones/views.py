import hmac

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notificaciones.models import NotificacionFallida
from apps.notificaciones.serializers import (
    EmailConfigSerializer,
    EmailSendSerializer,
    NotificacionFallidaCallbackSerializer,
    NotificacionFallidaSerializer,
)
from apps.notificaciones.services import email_provider_config, enviar_email
from apps.users.permissions import RequirePermission, get_clinica_activa


class NotificacionFallidaCallbackView(APIView):
    """Callback que n8n llama cuando no pudo completar un envio de WhatsApp (recordatorio/OTP/cotizacion/orden)."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request, *args, **kwargs):
        secret = request.headers.get("X-Webhook-Secret", "")
        if not settings.N8N_WEBHOOK_SECRET or not hmac.compare_digest(secret, settings.N8N_WEBHOOK_SECRET):
            return Response({"error": "No autorizado.", "code": "N8N_UNAUTHORIZED"}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = NotificacionFallidaCallbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        from apps.clinicas.models import Clinica
        from apps.pacientes.models import Paciente

        clinica = Clinica.objects.filter(id=data["clinica_id"]).first()
        if clinica is None:
            return Response({"error": "Clinica no encontrada.", "code": "CLINICA_NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        paciente = None
        if data.get("paciente_id"):
            paciente = Paciente.objects.filter(id=data["paciente_id"], clinica=clinica).first()

        notificacion = NotificacionFallida.objects.create(
            clinica=clinica,
            paciente=paciente,
            tipo_notificacion=data["tipo_notificacion"],
            telefono=data.get("telefono", ""),
            motivo=data.get("motivo", "")[:2000],
        )
        return Response({"ok": True, "id": str(notificacion.id)}, status=status.HTTP_201_CREATED)


class NotificacionFallidaListView(ListAPIView):
    serializer_class = NotificacionFallidaSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            return NotificacionFallida.objects.none()
        queryset = NotificacionFallida.objects.select_related("paciente").filter(clinica=clinica)
        if self.request.query_params.get("resuelta") == "false":
            queryset = queryset.filter(resuelta=False)
        return queryset


class NotificacionFallidaResolverView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, pk=None, *args, **kwargs):
        clinica = get_clinica_activa(request)
        queryset = NotificacionFallida.objects.all()
        if clinica is not None:
            queryset = queryset.filter(clinica=clinica)
        notificacion = get_object_or_404(queryset, pk=pk)
        notificacion.resuelta = True
        notificacion.resuelta_en = timezone.now()
        notificacion.resuelta_por = request.user
        notificacion.save(update_fields=["resuelta", "resuelta_en", "resuelta_por"])
        return Response(NotificacionFallidaSerializer(notificacion).data, status=status.HTTP_200_OK)


class EmailConfigView(APIView):
    permission_classes = (RequirePermission("notificaciones.email.ver_config"),)

    def get(self, request, *args, **kwargs):
        serializer = EmailConfigSerializer(email_provider_config())
        return Response(serializer.data, status=status.HTTP_200_OK)


class EmailSendView(APIView):
    permission_classes = (RequirePermission("notificaciones.email.enviar"),)

    def post(self, request, *args, **kwargs):
        serializer = EmailSendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            enviados = enviar_email(**serializer.validated_data)
        except Exception as exc:
            return Response(
                {
                    "ok": False,
                    "error": "No fue posible enviar el email.",
                    "code": "EMAIL_SEND_FAILED",
                    "detail": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "ok": True,
                "sent": enviados,
                "provider": "resend",
            },
            status=status.HTTP_200_OK,
        )
