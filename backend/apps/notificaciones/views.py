from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notificaciones.serializers import EmailConfigSerializer, EmailSendSerializer
from apps.notificaciones.services import email_provider_config, enviar_email
from apps.users.permissions import RequirePermission


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
