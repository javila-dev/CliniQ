from django.http import HttpResponse
from django.db.models import Prefetch
import requests
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.agenda.models import Cita
from apps.cartera.models import Cartera, CuotaCartera
from apps.cotizaciones.models import Cotizacion, CotizacionEnvio
from apps.cotizaciones.pdf import render_cotizacion_pdf
from apps.cotizaciones.serializers import (
    CambiarEstadoCotizacionSerializer,
    CotizacionEnvioSerializer,
    CotizacionSerializer,
    EnviarCotizacionEmailSerializer,
    RegistrarEnvioCotizacionSerializer,
)
from apps.notificaciones.services import email_provider_config, enviar_documento_whatsapp_webhook, enviar_email
from apps.protocolos.services import consentimientos_pendientes_cotizacion
from apps.users.permissions import RequirePermission


TRANSICIONES_COTIZACION = {
    Cotizacion.Estado.BORRADOR: {Cotizacion.Estado.ACEPTADA},
    Cotizacion.Estado.VENCIDA: set(),
    Cotizacion.Estado.ACEPTADA: set(),
}


def normalize_error_response(detail):
    if isinstance(detail, dict):
        normalized = {}
        for key, value in detail.items():
            if isinstance(value, list) and len(value) == 1:
                normalized[key] = value[0]
            else:
                normalized[key] = value
        return normalized
    return detail


class CotizacionViewSet(ModelViewSet):
    serializer_class = CotizacionSerializer
    queryset = Cotizacion.objects.select_related("clinica", "paciente", "profesional", "sede").prefetch_related(
        "items", "formas_pago", "envios__enviado_por"
    )
    filterset_fields = ("estado", "paciente", "profesional", "activo")
    search_fields = ("paciente__nombres", "paciente__apellidos", "notas")
    ordering_fields = ("created_at", "updated_at")

    def get_permissions(self):
        if self.action in {"list", "retrieve", "pdf", "envios"}:
            return [RequirePermission("cotizaciones.ver")()]
        return [RequirePermission("cotizaciones.gestionar")()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(clinica=user.clinica)
        activo = self.request.query_params.get("activo")
        if activo is None:
            queryset = queryset.filter(activo=True)
        return queryset

    def perform_destroy(self, instance):
        if instance.estado != Cotizacion.Estado.BORRADOR:
            raise ValidationError(
                {"error": "Solo se pueden eliminar cotizaciones en borrador.", "code": "COTIZACION_NO_EDITABLE"}
            )
        instance.activo = False
        instance.save(update_fields=["activo", "updated_at"])

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            return Response(normalize_error_response(exc.detail), status=status.HTTP_400_BAD_REQUEST)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def partial_update(self, request, *args, **kwargs):
        import logging
        logger = logging.getLogger(__name__)
        logger.debug("[PATCH cotizacion] payload: %s", request.data)

        instance = self.get_object()
        if instance.estado != Cotizacion.Estado.BORRADOR:
            raise ValidationError({"error": "Solo se pueden editar cotizaciones en borrador.", "code": "COTIZACION_NO_EDITABLE"})
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            logger.debug("[PATCH cotizacion] validation errors: %s", exc.detail)
            return Response(normalize_error_response(exc.detail), status=status.HTTP_400_BAD_REQUEST)
        self.perform_update(serializer)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="cambiar_estado")
    def cambiar_estado(self, request, pk=None):
        cotizacion = self.get_object()
        serializer = CambiarEstadoCotizacionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        nuevo_estado = serializer.validated_data["estado"]
        permitidos = set(TRANSICIONES_COTIZACION.get(cotizacion.estado, set()))
        if nuevo_estado not in permitidos:
            raise ValidationError({"error": "Transicion de estado invalida.", "code": "INVALID_TRANSITION"})
        cotizacion.estado = nuevo_estado
        cotizacion.save(update_fields=["estado", "updated_at"])
        consentimientos_pendientes = []
        if nuevo_estado == Cotizacion.Estado.ACEPTADA:
            cartera, created = Cartera.objects.get_or_create(
                cotizacion=cotizacion,
                defaults={
                    "paciente": cotizacion.paciente,
                    "total": cotizacion.total,
                },
            )
            if not created:
                cartera.total = cotizacion.total
                cartera.save(update_fields=["total", "updated_at"])
            if not cartera.cuotas.exists():
                for forma_pago in cotizacion.formas_pago.filter(activo=True):
                    CuotaCartera.objects.create(
                        cartera=cartera,
                        tipo=forma_pago.tipo,
                        descripcion=forma_pago.descripcion,
                        valor_esperado=forma_pago.valor,
                        fecha_esperada=forma_pago.fecha,
                    )
            consentimientos_pendientes = consentimientos_pendientes_cotizacion(cotizacion)
        payload = self.get_serializer(cotizacion).data
        if nuevo_estado == Cotizacion.Estado.ACEPTADA:
            payload["consentimientos_pendientes"] = consentimientos_pendientes
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        cotizacion = self.get_object()
        pdf_bytes = render_cotizacion_pdf(cotizacion)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="cotizacion-{cotizacion.id}.pdf"'
        return response

    @action(detail=True, methods=["post"], url_path="enviar_whatsapp")
    def enviar_whatsapp(self, request, pk=None):
        cotizacion = self.get_object()
        pdf_bytes = render_cotizacion_pdf(cotizacion)
        try:
            enviar_documento_whatsapp_webhook(
                paciente=cotizacion.paciente,
                tipo_notificacion="envio_cotizacion",
                pdf_bytes=pdf_bytes,
                nombre_archivo_pdf=f"cotizacion-{cotizacion.id}.pdf",
                metadata={
                    "cotizacion_id": str(cotizacion.id),
                    "profesional_nombre": cotizacion.profesional.nombre_completo if cotizacion.profesional else "",
                    "estado": cotizacion.estado,
                    "fecha_vencimiento": cotizacion.fecha_vencimiento.isoformat(),
                    "total": str(cotizacion.total),
                },
            )
        except ValueError:
            return Response(
                {"error": "Webhook no configurado", "code": "WEBHOOK_NOT_CONFIGURED"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except requests.RequestException as exc:
            return Response(
                {"error": "No se pudo contactar el webhook", "code": "WEBHOOK_ERROR"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        envio = CotizacionEnvio.objects.create(
            cotizacion=cotizacion,
            canal=CotizacionEnvio.Canal.WHATSAPP,
            destinatario=cotizacion.paciente.telefono or "",
            enviado_por=request.user,
            notas="",
        )
        return Response({"enviado": True, "envio_id": str(envio.id)}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="enviar_email")
    def enviar_email_action(self, request, pk=None):
        cotizacion = self.get_object()
        serializer = EnviarCotizacionEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config = email_provider_config()
        if not config.get("configured"):
            return Response(
                {"error": "El envio de email no esta configurado.", "code": "EMAIL_NO_CONFIGURADO"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        destinatario = serializer.validated_data.get("destinatario") or cotizacion.paciente.email
        if not destinatario:
            return Response(
                {"error": "La cotizacion no tiene un email destinatario disponible.", "code": "EMAIL_DESTINATARIO_REQUERIDO"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pdf_bytes = render_cotizacion_pdf(cotizacion)
        asunto = f"Cotizacion {str(cotizacion.id)[:8].upper()} - {cotizacion.clinica.nombre}"
        cuerpo = serializer.validated_data.get("notas") or (
            f"Adjuntamos la cotizacion de {cotizacion.clinica.nombre} para {cotizacion.paciente.nombre_completo}."
        )
        try:
            enviar_email(
                to=[destinatario],
                subject=asunto,
                body=cuerpo,
                attachments=[(f"cotizacion-{cotizacion.id}.pdf", pdf_bytes, "application/pdf")],
            )
        except Exception as exc:
            return Response(
                {"error": "No fue posible enviar el email.", "code": "EMAIL_SEND_FAILED"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        envio = CotizacionEnvio.objects.create(
            cotizacion=cotizacion,
            canal=CotizacionEnvio.Canal.EMAIL,
            destinatario=destinatario,
            enviado_por=request.user,
            notas=serializer.validated_data.get("notas", ""),
        )
        return Response({"enviado": True, "envio_id": str(envio.id)}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="registrar_envio")
    def registrar_envio(self, request, pk=None):
        cotizacion = self.get_object()
        serializer = RegistrarEnvioCotizacionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        envio = CotizacionEnvio.objects.create(
            cotizacion=cotizacion,
            canal=serializer.validated_data["canal"],
            destinatario="",
            enviado_por=request.user,
            notas=serializer.validated_data.get("notas", ""),
        )
        return Response(CotizacionEnvioSerializer(envio).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="envios")
    def envios(self, request, pk=None):
        cotizacion = self.get_object()
        serializer = CotizacionEnvioSerializer(cotizacion.envios.select_related("enviado_por").all(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="sesiones")
    def sesiones(self, request, pk=None):
        from apps.clinicas.models import TipoSesion

        cotizacion = self.get_object()
        items = cotizacion.items.prefetch_related(
            Prefetch(
                "citas",
                queryset=Cita.objects.exclude(estado=Cita.Estado.CANCELADA)
                .select_related("profesional", "sede")
                .order_by("fecha_inicio"),
            ),
            Prefetch(
                "tratamiento__tipos_sesion",
                queryset=TipoSesion.objects.filter(es_compromiso=True, activo=True).order_by("orden"),
                to_attr="tipos_sesion_compromiso",
            ),
        ).filter(activo=True)
        payload = {
            "cotizacion_id": str(cotizacion.id),
            "paciente_nombre": cotizacion.paciente.nombre_completo,
            "items": [],
        }
        for item in items:
            citas = [
                {
                    "cita_id": str(cita.id),
                    "fecha_inicio": cita.fecha_inicio,
                    "estado": cita.estado,
                    "profesional_nombre": cita.profesional.nombre_completo,
                    "sede_nombre": cita.sede.nombre,
                }
                for cita in item.citas.all()
            ]

            if item.tipo == "tratamiento" and item.tratamiento_id:
                tipos_sesion = item.tratamiento.tipos_sesion_compromiso
                num_citas = sum(ts.cantidad for ts in tipos_sesion)
                duracion_min = max((ts.duracion_min for ts in tipos_sesion), default=0)
                sesiones_detalle = [
                    {"nombre": ts.nombre, "cantidad": ts.cantidad, "duracion_min": ts.duracion_min}
                    for ts in tipos_sesion
                ]
            else:
                num_citas = item.num_citas
                duracion_min = 0
                sesiones_detalle = None

            item_data = {
                "item_id": str(item.id),
                "tipo": item.tipo,
                "descripcion": item.descripcion,
                "num_citas": num_citas,
                "duracion_min": duracion_min,
                "periodicidad": item.periodicidad,
                "citas_agendadas": item.citas_no_canceladas(),
                "citas_completadas": item.citas.filter(estado=Cita.Estado.COMPLETADA).count(),
                "citas_restantes": max(0, num_citas - item.citas_no_canceladas()),
                "citas": citas,
            }
            if sesiones_detalle is not None:
                item_data["sesiones_detalle"] = sesiones_detalle

            payload["items"].append(item_data)
        return Response(payload, status=status.HTTP_200_OK)
