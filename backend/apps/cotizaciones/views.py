import logging
from collections import defaultdict
from datetime import date, datetime

from decimal import Decimal

from django.http import HttpResponse
from django.db.models import DecimalField, Prefetch, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
import requests
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.agenda.models import Cita, RegistroConfirmacion
from apps.core.models import LogAccion
from apps.cotizaciones.models import Cotizacion, CotizacionEnvio
from apps.cotizaciones.pdf import render_consolidado_asistencia_pdf, render_cotizacion_pdf
from apps.cotizaciones.serializers import (
    CambiarEstadoCotizacionSerializer,
    CotizacionEnvioSerializer,
    CotizacionSerializer,
    EnviarCotizacionEmailSerializer,
    RegistrarEnvioCotizacionSerializer,
)
from apps.notificaciones.services import email_provider_config, enviar_documento_whatsapp_webhook, enviar_email
from apps.users.authorization import user_is_tenant_admin
from apps.users.permissions import RequirePermission

logger = logging.getLogger(__name__)


TRANSICIONES_COTIZACION = {
    Cotizacion.Estado.BORRADOR: {Cotizacion.Estado.ACEPTADA, Cotizacion.Estado.DESCARTADA},
    Cotizacion.Estado.ACEPTADA: {Cotizacion.Estado.BORRADOR},
    Cotizacion.Estado.VENCIDA: set(),
    Cotizacion.Estado.DESCARTADA: set(),
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
    queryset = Cotizacion.objects.select_related(
        "clinica", "paciente", "profesional", "sede"
    ).prefetch_related(
        "items", "formas_pago", "envios__enviado_por"
    ).annotate(
        _total_pagado=Coalesce(
            Sum(
                "cobros__pagos__valor",
                filter=~Q(cobros__estado="anulado"),
            ),
            Decimal("0"),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        )
    ).order_by("-created_at")
    filterset_fields = ("estado", "paciente", "profesional", "activo")
    search_fields = ("paciente__nombres", "paciente__apellidos", "notas")
    ordering_fields = ("created_at", "updated_at")

    def get_permissions(self):
        if self.action in {"list", "retrieve", "pdf", "envios", "consolidado_asistencia",
                           "historial_sesiones", "sesiones"}:
            return [RequirePermission("cotizaciones.ver")()]
        return [RequirePermission("cotizaciones.gestionar")()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(clinica=user.clinica)
        # Un profesional solo ve en el listado las cotizaciones que creó,
        # no las de toda la clínica. El detalle sigue accesible por id para
        # los flujos que abren una cotización puntual (paciente, cartera…).
        if self.action == "list" and user.rol == "profesional":
            queryset = queryset.filter(profesional=user)
        activo = self.request.query_params.get("activo")
        if activo is None:
            queryset = queryset.filter(activo=True)

        queryset = self._filtrar_por_fecha(queryset)
        return queryset

    def _filtrar_por_fecha(self, queryset):
        def parse(valor):
            try:
                return date.fromisoformat(valor)
            except (TypeError, ValueError):
                raise ValidationError(
                    {"error": "Rango de fechas invalido.", "code": "FECHA_INVALIDA"}
                )

        fecha_desde = self.request.query_params.get("fecha_desde")
        fecha_hasta = self.request.query_params.get("fecha_hasta")
        if fecha_desde:
            queryset = queryset.filter(created_at__date__gte=parse(fecha_desde))
        if fecha_hasta:
            queryset = queryset.filter(created_at__date__lte=parse(fecha_hasta))
        return queryset

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        cotizacion = self.get_object()
        compromiso = self._compromiso_pago_existente(cotizacion)
        if compromiso is None and cotizacion.estado == Cotizacion.Estado.ACEPTADA:
            # Genera el compromiso de pago pendiente si la clinica lo exige y aun
            # no existe. Cubre cotizaciones aceptadas antes de que existiera esta
            # generacion automatica: el panel aparece al abrir el detalle.
            compromiso = self._generar_compromiso_pago_si_aplica(cotizacion)
        response.data["compromiso_pago"] = self._serializar_compromiso_pago(compromiso)
        return response

    def _compromiso_pago_existente(self, cotizacion):
        """Compromiso de pago vigente de la cotizacion (consentimiento sin plantilla)."""
        from apps.consentimientos.models import Consentimiento

        return (
            Consentimiento.objects.filter(cotizacion=cotizacion, plantilla__isnull=True)
            .exclude(estado=Consentimiento.Estado.REVOCADO)
            .order_by("-created_at")
            .first()
        )

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

        if nuevo_estado == Cotizacion.Estado.BORRADOR:
            if not (user_is_tenant_admin(request.user) or request.user.rol == "superadmin"):
                raise ValidationError({"error": "Solo admin o superadmin pueden revertir a borrador.", "code": "PERMISSION_DENIED"})
            from apps.cobros.models import Cobro
            if cotizacion.cobros.exclude(estado=Cobro.Estado.ANULADO).exists():
                raise ValidationError({"error": "La cotización tiene cobros activos. Anúlos primero.", "code": "COTIZACION_CON_COBROS"})
            tiene_citas = any(
                item.citas_no_canceladas() > 0
                for item in cotizacion.items.filter(activo=True).prefetch_related("citas")
            )
            if tiene_citas:
                raise ValidationError({"error": "La cotización tiene citas agendadas. Cancélalas primero.", "code": "COTIZACION_CON_CITAS"})

        if nuevo_estado == Cotizacion.Estado.ACEPTADA:
            from apps.consentimientos.models import Consentimiento
            from apps.cotizaciones.services import aceptar_cotizacion

            compromiso_pago = self._generar_compromiso_pago_si_aplica(cotizacion)
            requiere_firma = (
                compromiso_pago is not None
                and compromiso_pago.estado != Consentimiento.Estado.FIRMADO
            )
            if requiere_firma:
                # La cotizacion NO pasa a aceptada hasta que el cliente firme el
                # compromiso de pago. Al recibirse la firma (webhook de Documenso
                # o confirmacion manual) la transicion ocurre automaticamente.
                payload = self.get_serializer(cotizacion).data
                payload["compromiso_pago"] = self._serializar_compromiso_pago(compromiso_pago)
                payload["requiere_firma_compromiso"] = True
                return Response(payload, status=status.HTTP_200_OK)

            consentimientos_pendientes = aceptar_cotizacion(cotizacion, actor=request.user)
            payload = self.get_serializer(cotizacion).data
            payload["consentimientos_pendientes"] = consentimientos_pendientes
            payload["compromiso_pago"] = self._serializar_compromiso_pago(compromiso_pago)
            payload["requiere_firma_compromiso"] = False
            return Response(payload, status=status.HTTP_200_OK)

        cotizacion.estado = nuevo_estado
        cotizacion.save(update_fields=["estado", "updated_at"])
        return Response(self.get_serializer(cotizacion).data, status=status.HTTP_200_OK)

    def _serializar_compromiso_pago(self, compromiso_pago):
        if not compromiso_pago:
            return None
        from apps.consentimientos.serializers import ConsentimientoSerializer

        return ConsentimientoSerializer(compromiso_pago).data

    def _generar_compromiso_pago_si_aplica(self, cotizacion):
        """
        Si la clinica tiene activo el requisito de compromiso de pago
        (configuracion.ConfiguracionCartera.requiere_consentimiento_promocional),
        genera el documento estandar en estado pendiente de firma. El texto es
        fijo y no configurable — la clinica solo activa o desactiva el requisito.
        """
        from apps.configuracion.models import ConfiguracionCartera
        from apps.consentimientos.models import Consentimiento
        from apps.consentimientos.services import generar_consentimiento

        # Datos previos (asistente de puesta en marcha): no se genera un
        # compromiso de pago pendiente de firma — es histórico / firmado en papel.
        if getattr(cotizacion, "es_migracion", False):
            return None

        config = ConfiguracionCartera.objects.filter(
            clinica_id=cotizacion.clinica_id,
            requiere_consentimiento_promocional=True,
        ).first()
        if not config:
            return None

        existente = Consentimiento.objects.filter(
            cotizacion=cotizacion, plantilla__isnull=True,
        ).exclude(estado=Consentimiento.Estado.REVOCADO).first()
        if existente:
            return existente

        try:
            return generar_consentimiento(cotizacion=cotizacion, plantilla=None)
        except Exception:
            logger.exception(
                "[cambiar_estado] fallo al generar compromiso de pago | cotizacion_id=%s", cotizacion.id,
            )
            return None

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        cotizacion = self.get_object()
        pdf_bytes = render_cotizacion_pdf(cotizacion)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="cotizacion-{cotizacion.id}.pdf"'
        return response

    @action(detail=True, methods=["get"], url_path="consolidado_asistencia")
    def consolidado_asistencia(self, request, pk=None):
        cotizacion = self.get_object()
        pdf_bytes = render_consolidado_asistencia_pdf(cotizacion)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="consolidado-asistencia-{cotizacion.id}.pdf"'
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
                "citas_completadas": (
                    item.citas.filter(estado=Cita.Estado.COMPLETADA).count()
                    + item.sesiones_previas_consumidas
                ),
                "citas_restantes": item.citas_restantes(),
                "sesiones_previas": item.sesiones_previas_consumidas,
                "citas": citas,
            }
            if sesiones_detalle is not None:
                item_data["sesiones_detalle"] = sesiones_detalle

            payload["items"].append(item_data)
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="historial_sesiones")
    def historial_sesiones(self, request, pk=None):
        """Línea de tiempo de cada sesión (cita) de la cotización: agendada,
        reagendada, confirmada, check-in, atendida, cancelada, no asistió."""
        cotizacion = self.get_object()
        items = list(
            cotizacion.items.filter(activo=True).prefetch_related(
                Prefetch(
                    "citas",
                    queryset=Cita.objects.select_related("profesional", "sede", "created_by", "paciente")
                    .prefetch_related(
                        Prefetch(
                            "registros_confirmacion",
                            queryset=RegistroConfirmacion.objects.select_related("usuario").order_by("created_at"),
                        )
                    )
                    .order_by("fecha_inicio"),
                ),
            )
        )

        cita_ids = [str(cita.id) for item in items for cita in item.citas.all()]
        reagendas = defaultdict(list)
        if cita_ids:
            logs = (
                LogAccion.objects.filter(
                    objeto_tipo="Cita", objeto_id__in=cita_ids, accion="cita.reagendar"
                )
                .select_related("usuario")
                .order_by("created_at")
            )
            for log in logs:
                reagendas[log.objeto_id].append(log)

        sesiones = []
        for item in items:
            for idx, cita in enumerate(item.citas.all(), start=1):
                sesiones.append(
                    {
                        "item_id": str(item.id),
                        "item_descripcion": item.descripcion,
                        "cita_id": str(cita.id),
                        "sesion_numero": idx,
                        "fecha_inicio": cita.fecha_inicio,
                        "estado_actual": cita.estado,
                        "profesional_nombre": cita.profesional.nombre_completo,
                        "sede_nombre": cita.sede.nombre,
                        "eventos": _eventos_cita(cita, reagendas.get(str(cita.id), [])),
                    }
                )
        sesiones.sort(key=lambda s: s["fecha_inicio"])
        return Response(
            {"cotizacion_id": str(cotizacion.id), "sesiones": sesiones},
            status=status.HTTP_200_OK,
        )


_CHECKIN_LABEL = {"otp_whatsapp": "Check-in por WhatsApp", "foto_presencial": "Check-in con foto"}
_MEDIO_LABEL = dict(RegistroConfirmacion.Medio.choices)


def _nombre_usuario(user, fallback="Sistema"):
    if not user:
        return fallback
    return getattr(user, "nombre_completo", "") or user.get_full_name() or user.email or fallback


def _eventos_cita(cita, reagenda_logs):
    eventos = [
        {
            "tipo": "agendada",
            "fecha": cita.created_at,
            "usuario": _nombre_usuario(cita.created_by),
            "detalle": f"Programada para el {timezone.localtime(cita.fecha_inicio):%d/%m/%Y %H:%M}",
        }
    ]
    for log in reagenda_logs:
        detalle = log.detalle or {}
        try:
            nueva = timezone.localtime(datetime.fromisoformat(detalle["fecha_nueva"]))
            texto = f"Movida al {nueva:%d/%m/%Y %H:%M}"
        except (KeyError, ValueError, TypeError):
            texto = ""
        eventos.append(
            {
                "tipo": "reagendada",
                "fecha": log.created_at,
                "usuario": _nombre_usuario(log.usuario),
                "detalle": texto,
            }
        )
    for reg in cita.registros_confirmacion.all():
        eventos.append(
            {
                "tipo": reg.estado_resultante,
                "fecha": reg.created_at,
                "usuario": reg.usuario_nombre or _nombre_usuario(reg.usuario),
                "detalle": reg.nota or (_MEDIO_LABEL.get(reg.medio, "") if reg.medio else ""),
            }
        )
    if cita.checkin_en:
        eventos.append(
            {
                "tipo": "checkin",
                "fecha": cita.checkin_en,
                "usuario": cita.paciente.nombre_completo,
                "detalle": _CHECKIN_LABEL.get(cita.checkin_metodo, ""),
            }
        )
    if cita.estado == Cita.Estado.COMPLETADA and cita.fecha_fin_real:
        eventos.append(
            {
                "tipo": "atendida",
                "fecha": cita.fecha_fin_real,
                "usuario": cita.profesional.nombre_completo,
                "detalle": "",
            }
        )
    eventos.sort(key=lambda e: e["fecha"])
    return eventos
