import hashlib
import hmac
import json

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.logging import registrar_accion
from apps.notificaciones import numero_propio
from apps.notificaciones.models import NotificacionFallida, NumeroWhatsapp
from apps.notificaciones.serializers import (
    EmailConfigSerializer,
    EmailSendSerializer,
    NotificacionFallidaCallbackSerializer,
    NotificacionFallidaSerializer,
    WhatsappConectarSerializer,
    WhatsappPropioConfigSerializer,
)
from apps.notificaciones.services import email_provider_config, enviar_email
from apps.users.permissions import IsSuperAdmin, RequirePermission, get_clinica_activa


def firma_lyvio_valida(cuerpo: bytes, timestamp: str, firma: str, *, ahora=None) -> bool:
    """Firma del webhook de Chatwoot 4.18: X-Chatwoot-Signature =
    "sha256=" + HMAC-SHA256(secreto, f"{X-Chatwoot-Timestamp}.{cuerpo}"). El
    secreto lo genera Lyvio al crear el webhook. Se rechazan avisos con mas de
    LYVIO_WEBHOOK_TOLERANCIA_SEGUNDOS para que no se puedan reenviar."""
    secreto = settings.LYVIO_WEBHOOK_SECRET
    if not secreto or not timestamp or not firma.startswith("sha256="):
        return False
    try:
        edad = abs((ahora if ahora is not None else timezone.now().timestamp()) - int(timestamp))
    except ValueError:
        return False
    if edad > LYVIO_WEBHOOK_TOLERANCIA_SEGUNDOS:
        return False
    esperada = hmac.new(secreto.encode(), timestamp.encode() + b"." + cuerpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(firma.removeprefix("sha256="), esperada)


LYVIO_WEBHOOK_TOLERANCIA_SEGUNDOS = 300


class LyvioWebhookView(APIView):
    """Webhook de cuenta de Lyvio (cuenta de CliniQ) con message_created y
    message_updated, firmado por Lyvio (ver firma_lyvio_valida). Siempre
    responde 200 a eventos validos para que Lyvio no reintente."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request, *args, **kwargs):
        cuerpo = request.body  # crudo: la firma es sobre los bytes exactos
        if not firma_lyvio_valida(
            cuerpo,
            request.headers.get("X-Chatwoot-Timestamp", ""),
            request.headers.get("X-Chatwoot-Signature", ""),
        ):
            return Response({"error": "No autorizado."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            payload = json.loads(cuerpo or b"{}")
        except ValueError:
            return Response({"error": "JSON inválido."}, status=status.HTTP_400_BAD_REQUEST)
        resultado = numero_propio.procesar_webhook(payload if isinstance(payload, dict) else {})
        return Response({"ok": True, "resultado": resultado})


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


class _NumeroPropioBaseView(APIView):
    """WhatsApp con numero propio de la clinica activa. Configurarlo es parte de
    editar la clinica: mismo permiso."""

    permission_classes = (RequirePermission("clinicas.editar"),)

    def _clinica(self, request):
        clinica = get_clinica_activa(request)
        if clinica is None:
            return None, Response(
                {"error": "No hay una clínica activa.", "code": "SIN_CLINICA"}, status=status.HTTP_400_BAD_REQUEST,
            )
        return clinica, None

    @staticmethod
    def _error(exc):
        return Response({"error": exc.mensaje, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)


class WhatsappPropioView(_NumeroPropioBaseView):
    """GET: estado para la pantalla de configuracion. PATCH: pago en Meta,
    numero por defecto y asignacion de numeros a las sedes."""

    def get(self, request, *args, **kwargs):
        clinica, error = self._clinica(request)
        if error:
            return error
        return Response(numero_propio.estado(clinica))

    def patch(self, request, *args, **kwargs):
        clinica, error = self._clinica(request)
        if error:
            return error
        serializer = WhatsappPropioConfigSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            conexion = numero_propio.configurar(clinica, **serializer.validated_data)
        except numero_propio.NumeroPropioError as exc:
            return self._error(exc)
        registrar_accion(
            request, "whatsapp_propio.configurar", conexion,
            {
                "resumen": "Configuración de WhatsApp con número propio actualizada",
                **json.loads(json.dumps(serializer.validated_data, cls=DjangoJSONEncoder)),
            },
            clinica=clinica,
        )
        return Response(numero_propio.estado(clinica))


class WhatsappPropioConectarView(_NumeroPropioBaseView):
    """Recibe el resultado del Embedded Signup de Meta y conecta el numero."""

    def post(self, request, *args, **kwargs):
        clinica, error = self._clinica(request)
        if error:
            return error
        serializer = WhatsappConectarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            numero = numero_propio.conectar_numero(clinica, **serializer.validated_data)
        except numero_propio.NumeroPropioError as exc:
            return self._error(exc)
        registrar_accion(
            request, "whatsapp_propio.conectar", numero,
            {
                "resumen": "Número de WhatsApp conectado",
                "numero": numero.numero_visible,
                "lyvio_inbox_id": numero.lyvio_inbox_id,
            },
            clinica=clinica,
        )
        return Response(numero_propio.estado(clinica), status=status.HTTP_201_CREATED)


class AdminWhatsappPropioView(APIView):
    """Consola: estado del numero propio de una clinica con plantillas."""

    permission_classes = (IsSuperAdmin,)

    def get(self, request, clinica_id, *args, **kwargs):
        from apps.clinicas.models import Clinica

        clinica = get_object_or_404(Clinica, pk=clinica_id)
        return Response(numero_propio.detalle_admin(clinica))


class AdminWhatsappNumeroAccionView(APIView):
    """Consola: crear plantillas, actualizar su estado o revisar la salud de un
    numero. Manual por ahora (sin jobs periodicos)."""

    permission_classes = (IsSuperAdmin,)
    accion = None  # crear_plantillas | actualizar_plantillas | revisar_salud
    _RESUMEN = {
        "crear_plantillas": "Plantillas de WhatsApp creadas en Meta",
        "actualizar_plantillas": "Estado de plantillas de WhatsApp actualizado",
        "revisar_salud": "Salud del número de WhatsApp revisada",
    }

    def post(self, request, pk, *args, **kwargs):
        numero = get_object_or_404(NumeroWhatsapp.objects.select_related("conexion__clinica"), pk=pk)
        clinica = numero.conexion.clinica
        extra = {}
        try:
            if self.accion == "crear_plantillas":
                extra["resultados"] = numero_propio.crear_plantillas(numero)
            elif self.accion == "actualizar_plantillas":
                numero_propio.actualizar_plantillas(numero)
            else:
                extra["salud"] = numero_propio.revisar_salud(numero)
        except numero_propio.NumeroPropioError as exc:
            return Response({"error": exc.mensaje, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)

        numero.refresh_from_db()
        registrar_accion(
            request, f"whatsapp_propio.{self.accion}", numero,
            {"resumen": self._RESUMEN[self.accion], "estado": numero.estado, "numero": numero.numero_visible},
            clinica=clinica,
        )
        return Response({**extra, "detalle": numero_propio.detalle_admin(clinica)})
