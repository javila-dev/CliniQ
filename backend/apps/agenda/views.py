from collections import defaultdict
from datetime import datetime, timedelta
import logging

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

import requests as http_requests

from apps.agenda import services
from apps.agenda.confirmacion import confirmar_cita, confirmar_manual, crear_registro_confirmacion
from apps.agenda.models import BloqueoAgenda, Cita, RegistroConfirmacion
from apps.agenda.services import AgendaError, iniciar_checkin_otp_cita, registrar_checkin_foto_cita, verificar_otp_cita
from apps.agenda.serializers import (
    BloqueoAgendaSerializer,
    CambiarEstadoSerializer,
    CitaSerializer,
    ConfirmarManualSerializer,
    RecordatorioPendienteSerializer,
    RegistroConfirmacionSerializer,
    build_consentimiento_info,
)
from apps.clinicas.models import Clinica, Sede, Servicio
from apps.notificaciones.services import enviar_recordatorio_cita_webhook
from apps.users.models import User
from apps.users.permissions import CanChangeAppointmentState, RequirePermission


logger = logging.getLogger(__name__)


FLUJOS_ESTADO = {
    Cita.Estado.PENDIENTE: {Cita.Estado.CONFIRMADA, Cita.Estado.CANCELADA},
    Cita.Estado.CONFIRMADA: {Cita.Estado.EN_ESPERA, Cita.Estado.CANCELADA, Cita.Estado.NO_ASISTIO},
    Cita.Estado.EN_ESPERA: {Cita.Estado.EN_CURSO, Cita.Estado.CANCELADA},
    Cita.Estado.EN_CURSO: {Cita.Estado.COMPLETADA, Cita.Estado.CANCELADA, Cita.Estado.EN_ESPERA},
    Cita.Estado.COMPLETADA: set(),
    Cita.Estado.CANCELADA: set(),
    Cita.Estado.NO_ASISTIO: set(),
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


class CitaViewSet(ModelViewSet):
    serializer_class = CitaSerializer
    queryset = Cita.objects.select_related(
        "paciente",
        "sede",
        "sede__clinica",
        "servicio",
        "profesional",
        "created_by",
        "confirmado_por",
        "item_cotizacion",
        "item_cotizacion__cotizacion",
    ).prefetch_related(
        "registros_confirmacion",
        "servicio__consentimientos_requeridos",
        "sesiones_protocolo",
        "sesiones_protocolo__tipo_sesion",
        "sesiones_protocolo__procedimiento",
    ).all()
    search_fields = ("paciente__nombres", "paciente__apellidos", "paciente__numero_documento")
    ordering_fields = ("fecha_inicio", "created_at")

    def get_permissions(self):
        if self.action in {"recordatorios_pendientes", "marcar_recordatorio_enviado"}:
            permission_classes = ()
        elif self.action == "create":
            permission_classes = (RequirePermission("agenda.citas.crear"),)
        elif self.action in {"update", "partial_update"}:
            permission_classes = (RequirePermission("agenda.citas.editar"),)
        elif self.action == "cambiar_estado":
            permission_classes = (CanChangeAppointmentState,)
        elif self.action == "destroy":
            permission_classes = (RequirePermission("agenda.citas.eliminar"),)
        elif self.action == "confirmar_manual":
            permission_classes = (RequirePermission("agenda.citas.confirmar_manual"),)
        elif self.action in {"solicitar_recordatorio", "enviar_recordatorio_inmediato"}:
            permission_classes = (RequirePermission("agenda.citas.editar"),)
        elif self.action in {"iniciar_checkin", "verificar_otp", "checkin_foto"}:
            permission_classes = (RequirePermission("agenda.citas.editar"),)
        else:
            permission_classes = (RequirePermission("agenda.citas.ver"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if self.action in {"recordatorios_pendientes", "marcar_recordatorio_enviado"}:
            return queryset.order_by("fecha_inicio")
        if user.rol != "superadmin":
            queryset = queryset.filter(sede__clinica=user.clinica)

        estado = self.request.query_params.get("estado")
        estado_confirmacion = self.request.query_params.get("estado_confirmacion")
        profesional = self.request.query_params.get("profesional")
        sede = self.request.query_params.get("sede")
        fecha_inicio_date = self.request.query_params.get("fecha_inicio__date")
        canal_origen = self.request.query_params.get("canal_origen")

        if estado:
            queryset = queryset.filter(estado=estado)
        if estado_confirmacion:
            queryset = queryset.filter(estado_confirmacion=estado_confirmacion)
        if profesional:
            queryset = queryset.filter(profesional_id=profesional)
        if sede:
            queryset = queryset.filter(sede_id=sede)
        if fecha_inicio_date:
            queryset = queryset.filter(fecha_inicio__date=fecha_inicio_date)
        if canal_origen:
            queryset = queryset.filter(canal_origen=canal_origen)

        return queryset.order_by("fecha_inicio")

    def perform_create(self, serializer):
        cita = services.crear_cita(serializer.validated_data, self.request.user)
        serializer.instance = cita

    def create(self, request, *args, **kwargs):
        import logging
        logger = logging.getLogger(__name__)
        logger.debug("[citas.create] request.data: %s", request.data)
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            logger.debug("[citas.create] ERROR serializer: %s", exc.detail)
            return Response(normalize_error_response(exc.detail), status=status.HTTP_400_BAD_REQUEST)
        logger.debug("[citas.create] validated_data: %s", serializer.validated_data)
        try:
            self.perform_create(serializer)
        except ValidationError as exc:
            logger.debug("[citas.create] ERROR crear_cita: %s", exc.detail)
            return Response(normalize_error_response(exc.detail), status=status.HTTP_400_BAD_REQUEST)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_update(self, serializer):
        instance = self.get_object()
        data = serializer.validated_data
        servicio = data.get("servicio", instance.servicio)
        sede = data.get("sede", instance.sede)
        paciente = data.get("paciente", instance.paciente)
        profesional = data.get("profesional", instance.profesional)
        fecha_inicio = data.get("fecha_inicio", instance.fecha_inicio)

        duracion_min = instance.duracion_min or 0
        if "servicio" in data and data.get("servicio"):
            duracion_min = data["servicio"].duracion_min
        elif "duracion_min" in data and data.get("duracion_min"):
            duracion_min = data["duracion_min"]

        fecha_fin = services.calcular_fecha_fin(fecha_inicio, duracion_min)

        if paciente.clinica_id != sede.clinica_id:
            raise ValidationError({"error": "El paciente no pertenece a la clinica de la sede."})
        if servicio and servicio.clinica_id != sede.clinica_id:
            raise ValidationError({"error": "El servicio no pertenece a la clinica de la sede."})
        if profesional.clinica_id != sede.clinica_id:
            raise ValidationError({"error": "El profesional no pertenece a la clinica de la sede."})
        if not services.verificar_horario_sede(sede, fecha_inicio, fecha_fin):
            raise ValidationError({"error": "La cita esta fuera del horario de la sede."})
        if not services.verificar_horario_profesional(profesional.id, sede.id, fecha_inicio, fecha_fin):
            raise ValidationError({"error": "La cita esta fuera del horario del colaborador."})
        if not services.verificar_disponibilidad_profesional(
            profesional.id,
            fecha_inicio,
            fecha_fin,
            excluir_cita_id=instance.id,
        ):
            raise ValidationError({"error": "El profesional no esta disponible en ese horario."})

        serializer.save(
            fecha_fin=fecha_fin,
            duracion_min=duracion_min,
            canal_confirmacion=paciente.canal_confirmacion,
        )

    @action(detail=True, methods=["post"], url_path="cambiar_estado")
    def cambiar_estado(self, request, pk=None):
        cita = self.get_object()
        serializer = CambiarEstadoSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning(
                "DEBUG cambiar_estado 400 serializer | cita_id=%s estado_actual=%s payload=%s errors=%s",
                cita.id,
                cita.estado,
                request.data,
                serializer.errors,
            )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        nuevo_estado = serializer.validated_data["estado"]
        medio = serializer.validated_data.get("medio", "")
        nota = serializer.validated_data.get("nota", "")
        if cita.estado == Cita.Estado.CONFIRMADA and nuevo_estado == Cita.Estado.EN_CURSO:
            logger.warning(
                "DEBUG cambiar_estado 400 invalid_transition | cita_id=%s estado_actual=%s nuevo_estado=%s payload=%s",
                cita.id,
                cita.estado,
                nuevo_estado,
                request.data,
            )
            return Response(
                {
                    "error": "La cita debe pasar primero por en_espera antes de iniciar la atencion.",
                    "code": "INVALID_TRANSITION",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if nuevo_estado not in FLUJOS_ESTADO[cita.estado]:
            logger.warning(
                "DEBUG cambiar_estado 400 flujo_no_valido | cita_id=%s estado_actual=%s nuevo_estado=%s payload=%s",
                cita.id,
                cita.estado,
                nuevo_estado,
                request.data,
            )
            raise ValidationError({"error": "El flujo de estado no es valido."})

        if nuevo_estado == Cita.Estado.EN_CURSO:
            info = build_consentimiento_info(cita)
            if not info["todos_firmados"]:
                pendientes = [item["template_nombre"] for item in info["consentimientos"] if not item["vigente"]]
                logger.warning(
                    "DEBUG cambiar_estado 400 consentimiento_requerido | cita_id=%s paciente_id=%s pendientes=%s payload=%s",
                    cita.id,
                    cita.paciente_id,
                    pendientes,
                    request.data,
                )
                return Response(
                    {
                        "error": "El paciente tiene consentimientos pendientes de firma.",
                        "code": "CONSENTIMIENTO_REQUERIDO",
                        "pendientes": pendientes,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        cita.estado = nuevo_estado
        update_fields = ["estado", "updated_at"]

        if nuevo_estado == Cita.Estado.EN_CURSO and cita.fecha_inicio_real is None:
            cita.fecha_inicio_real = timezone.now()
            update_fields.append("fecha_inicio_real")
        if nuevo_estado == Cita.Estado.COMPLETADA and cita.fecha_fin_real is None:
            cita.fecha_fin_real = timezone.now()
            update_fields.append("fecha_fin_real")
        if nuevo_estado == Cita.Estado.CANCELADA:
            cita.motivo_cancelacion = serializer.validated_data.get("motivo_cancelacion", "")
            update_fields.append("motivo_cancelacion")
        if nuevo_estado in {Cita.Estado.CANCELADA, Cita.Estado.NO_ASISTIO}:
            cita.fecha_inicio_real = None
            cita.fecha_fin_real = None
            update_fields.extend(["fecha_inicio_real", "fecha_fin_real"])
        if nuevo_estado == Cita.Estado.EN_ESPERA:
            cita.fecha_inicio_real = None
            update_fields.append("fecha_inicio_real")

        cita.save(update_fields=list(dict.fromkeys(update_fields)))
        if nuevo_estado in {
            Cita.Estado.CONFIRMADA,
            Cita.Estado.EN_ESPERA,
            Cita.Estado.CANCELADA,
            Cita.Estado.NO_ASISTIO,
            Cita.Estado.EN_CURSO,
        }:
            crear_registro_confirmacion(
                cita=cita,
                estado_resultante=nuevo_estado,
                usuario=request.user,
                medio=medio,
                nota=nota,
            )
        return Response(CitaSerializer(cita).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="slots_disponibles", pagination_class=None)
    def slots_disponibles(self, request, *args, **kwargs):
        import logging
        from apps.cotizaciones.models import ItemCotizacion
        from django.db.models import Max

        logger = logging.getLogger(__name__)

        profesional_id = request.query_params.get("profesional_id")
        sede_id = request.query_params.get("sede_id")
        fecha = request.query_params.get("fecha")
        servicio_id = request.query_params.get("servicio_id")
        item_cotizacion_id = request.query_params.get("item_cotizacion_id")
        duracion_min_param = request.query_params.get("duracion_min")

        logger.debug(
            "[slots_disponibles] params: profesional_id=%s, sede_id=%s, fecha=%s, "
            "servicio_id=%s, item_cotizacion_id=%s, duracion_min=%s, user=%s, rol=%s, clinica=%s",
            profesional_id, sede_id, fecha, servicio_id, item_cotizacion_id, duracion_min_param,
            request.user.id, getattr(request.user, "rol", None), getattr(request.user, "clinica_id", None),
        )

        if not all([profesional_id, sede_id, fecha]):
            logger.debug("[slots_disponibles] ERROR: faltan params obligatorios")
            raise ValidationError({"error": "profesional_id, sede_id y fecha son obligatorios."})
        if not any([servicio_id, item_cotizacion_id, duracion_min_param]):
            logger.debug("[slots_disponibles] ERROR: falta servicio_id, item_cotizacion_id o duracion_min")
            raise ValidationError(
                {"error": "Se requiere servicio_id, item_cotizacion_id o duracion_min.", "code": "MISSING_DURATION"}
            )

        sede_qs = Sede.objects.select_related("clinica").all()
        profesional_qs = User.objects.filter(es_profesional=True)
        if request.user.rol != "superadmin":
            sede_qs = sede_qs.filter(clinica=request.user.clinica)
            profesional_qs = profesional_qs.filter(clinica=request.user.clinica)

        try:
            sede = sede_qs.get(id=sede_id)
            logger.debug("[slots_disponibles] sede encontrada: %s (clinica=%s)", sede.id, sede.clinica_id)
        except Sede.DoesNotExist as exc:
            logger.debug("[slots_disponibles] ERROR: sede %s no encontrada para clinica del user", sede_id)
            raise ValidationError({"sede_id": "La sede no pertenece a tu clinica."}) from exc

        try:
            profesional = profesional_qs.get(id=profesional_id)
            logger.debug("[slots_disponibles] profesional encontrado: %s (clinica=%s)", profesional.id, profesional.clinica_id)
        except User.DoesNotExist as exc:
            logger.debug("[slots_disponibles] ERROR: profesional %s no encontrado para clinica del user", profesional_id)
            raise ValidationError({"profesional_id": "El profesional no pertenece a tu clinica."}) from exc

        if profesional.clinica_id != sede.clinica_id:
            logger.debug(
                "[slots_disponibles] ERROR: clinica profesional (%s) != clinica sede (%s)",
                profesional.clinica_id, sede.clinica_id,
            )
            raise ValidationError({"profesional_id": "El profesional no pertenece a la clinica de la sede."})

        # Resolver duracion_min según la forma
        duracion_min = None

        if servicio_id:
            servicio_qs = Servicio.objects.all()
            if request.user.rol != "superadmin":
                servicio_qs = servicio_qs.filter(clinica=request.user.clinica)
            try:
                servicio = servicio_qs.get(id=servicio_id)
            except Servicio.DoesNotExist as exc:
                logger.debug("[slots_disponibles] ERROR: servicio %s no encontrado", servicio_id)
                raise ValidationError({"servicio_id": "El servicio no pertenece a tu clinica."}) from exc
            if servicio.clinica_id != sede.clinica_id:
                logger.debug(
                    "[slots_disponibles] ERROR: clinica servicio (%s) != clinica sede (%s)",
                    servicio.clinica_id, sede.clinica_id,
                )
                raise ValidationError({"servicio_id": "El servicio no pertenece a la clinica de la sede."})
            duracion_min = servicio.duracion_min
            logger.debug("[slots_disponibles] duracion_min desde servicio: %s", duracion_min)

        elif item_cotizacion_id:
            try:
                item = (
                    ItemCotizacion.objects
                    .select_related("tratamiento", "servicio", "cotizacion")
                    .get(id=item_cotizacion_id)
                )
                logger.debug(
                    "[slots_disponibles] item encontrado: %s, tratamiento=%s, servicio=%s, cotizacion.clinica=%s",
                    item.id, item.tratamiento_id, item.servicio_id, item.cotizacion.clinica_id,
                )
            except ItemCotizacion.DoesNotExist as exc:
                logger.debug("[slots_disponibles] ERROR: item_cotizacion %s no existe", item_cotizacion_id)
                raise ValidationError({"item_cotizacion_id": "El item no existe."}) from exc
            if request.user.rol != "superadmin" and item.cotizacion.clinica_id != request.user.clinica_id:
                logger.debug(
                    "[slots_disponibles] ERROR: clinica item (%s) != clinica user (%s)",
                    item.cotizacion.clinica_id, request.user.clinica_id,
                )
                raise ValidationError({"item_cotizacion_id": "El item no pertenece a tu clinica."})
            if item.tratamiento_id:
                from django.db.models import Sum
                tipos_qs = item.tratamiento.tipos_sesion.filter(es_compromiso=True, activo=True)
                resultado = tipos_qs.aggregate(max_duracion=Max("duracion_min"))
                duracion_min = resultado["max_duracion"] or 0
                logger.debug("[slots_disponibles] duracion_min desde tipos_sesion.duracion_min: %s", duracion_min)
                if not duracion_min:
                    # Tipos con duracion_min=0: sumar duraciones de sus procedimientos
                    resultado_proc = (
                        tipos_qs
                        .annotate(duracion_procedimientos=Sum("procedimientos__procedimiento__duracion_min"))
                        .aggregate(max_duracion_proc=Max("duracion_procedimientos"))
                    )
                    duracion_min = resultado_proc["max_duracion_proc"] or 0
                    logger.debug("[slots_disponibles] duracion_min desde procedimientos del tipo_sesion: %s", duracion_min)
            if not duracion_min and item.servicio_id:
                duracion_min = item.servicio.duracion_min
                logger.debug("[slots_disponibles] duracion_min desde item.servicio: %s", duracion_min)
            if not duracion_min:
                logger.debug(
                    "[slots_disponibles] ERROR: item %s sin duracion (tratamiento=%s, servicio=%s)",
                    item_cotizacion_id, item.tratamiento_id, item.servicio_id,
                )
                if item.tratamiento_id:
                    raise ValidationError(
                        {"item_cotizacion_id": "Los tipos de sesión del tratamiento tienen duracion_min=0. Configurá la duración en el tratamiento.", "code": "MISSING_DURATION"}
                    )
                raise ValidationError(
                    {"item_cotizacion_id": "El item no tiene duracion configurada.", "code": "MISSING_DURATION"}
                )

        else:
            try:
                duracion_min = int(duracion_min_param)
            except (ValueError, TypeError) as exc:
                logger.debug("[slots_disponibles] ERROR: duracion_min_param=%s no es entero", duracion_min_param)
                raise ValidationError({"duracion_min": "Debe ser un entero positivo."}) from exc
            if duracion_min < 5:
                logger.debug("[slots_disponibles] ERROR: duracion_min=%s < 5", duracion_min)
                raise ValidationError({"duracion_min": "Debe ser al menos 5 minutos."})

        logger.debug("[slots_disponibles] llamando get_slots_disponibles: profesional=%s, sede=%s, fecha=%s, duracion=%s", profesional.id, sede.id, fecha, duracion_min)
        fecha_date = datetime.strptime(fecha, "%Y-%m-%d").date()
        slots = services.get_slots_disponibles(profesional.id, sede.id, fecha_date, duracion_min)
        logger.debug("[slots_disponibles] slots encontrados: %s", slots)
        return Response([slot.isoformat() for slot in slots], status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="hoy", pagination_class=None)
    def hoy(self, request, *args, **kwargs):
        hoy = timezone.localdate()
        queryset = self.get_queryset().filter(fecha_inicio__date=hoy)
        if request.user.rol != "superadmin" and request.user.clinica_id:
            queryset = queryset.filter(sede__clinica=request.user.clinica)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["patch"], url_path="confirmar_manual")
    def confirmar_manual(self, request, pk=None):
        serializer = ConfirmarManualSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cita = confirmar_manual(
            self.get_object(),
            request.user,
            medio=serializer.validated_data.get("medio", ""),
            nota=serializer.validated_data.get("nota", ""),
        )
        return Response(self.get_serializer(cita).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="registros_confirmacion", pagination_class=None)
    def registros_confirmacion(self, request, pk=None):
        cita = self.get_object()
        registros = cita.registros_confirmacion.select_related("usuario").all()
        serializer = RegistroConfirmacionSerializer(registros, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="recordatorios_pendientes", pagination_class=None)
    def recordatorios_pendientes(self, request, *args, **kwargs):
        secret = request.headers.get("X-N8N-Secret", "")
        if not settings.N8N_WEBHOOK_SECRET or secret != settings.N8N_WEBHOOK_SECRET:
            return Response({"error": "No autorizado.", "code": "N8N_UNAUTHORIZED"}, status=status.HTTP_401_UNAUTHORIZED)

        now = timezone.now()
        estados_validos = [Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA]

        # Agrupar clínicas con recordatorios automáticos por intervalo
        by_interval: defaultdict[int, list] = defaultdict(list)
        for clinica in Clinica.objects.filter(activo=True, recordatorios_automaticos=True).values("id", "intervalo_recordatorio_horas"):
            by_interval[clinica["intervalo_recordatorio_horas"]].append(clinica["id"])

        # Construir filtro dinámico por intervalo de cada clínica (ventana ±1h)
        q_auto = Q()
        for horas, clinic_ids in by_interval.items():
            inicio = now + timedelta(hours=horas - 1)
            fin = now + timedelta(hours=horas + 1)
            q_auto |= Q(sede__clinica_id__in=clinic_ids, fecha_inicio__gte=inicio, fecha_inicio__lte=fin)

        base_qs = Cita.objects.select_related("paciente", "servicio", "profesional", "sede", "sede__clinica")

        citas_auto = base_qs.filter(
            q_auto,
            estado__in=estados_validos,
            recordatorio_enviado=False,
            recordatorio_manual_pendiente=False,
        ) if q_auto else base_qs.none()

        citas_manuales = base_qs.filter(
            recordatorio_manual_pendiente=True,
            estado__in=estados_validos,
        )

        # Unir y deduplicar por ID (una cita puede estar en ambos si coincide el intervalo y tiene flag manual)
        seen = set()
        citas: list[Cita] = []
        for cita in list(citas_manuales) + list(citas_auto):
            if cita.id not in seen:
                seen.add(cita.id)
                citas.append(cita)

        serializer = RecordatorioPendienteSerializer(citas, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="marcar_recordatorio_enviado")
    def marcar_recordatorio_enviado(self, request, pk=None):
        secret = request.headers.get("X-N8N-Secret", "")
        if not settings.N8N_WEBHOOK_SECRET or secret != settings.N8N_WEBHOOK_SECRET:
            return Response({"error": "No autorizado.", "code": "N8N_UNAUTHORIZED"}, status=status.HTTP_401_UNAUTHORIZED)

        cita = self.get_object()
        cita.recordatorio_enviado = True
        cita.recordatorio_manual_pendiente = False
        if cita.estado_confirmacion == Cita.EstadoConfirmacion.SIN_ENVIAR:
            cita.estado_confirmacion = Cita.EstadoConfirmacion.ENVIADO
        cita.save(update_fields=["recordatorio_enviado", "recordatorio_manual_pendiente", "estado_confirmacion", "updated_at"])
        return Response(self.get_serializer(cita).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="solicitar_recordatorio")
    def solicitar_recordatorio(self, request, pk=None):
        cita = self.get_object()
        if cita.estado in {Cita.Estado.CANCELADA, Cita.Estado.COMPLETADA, Cita.Estado.NO_ASISTIO}:
            return Response(
                {"error": "No se puede solicitar recordatorio para una cita en este estado.", "code": "ESTADO_INVALIDO"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cita.recordatorio_manual_pendiente = True
        cita.recordatorio_enviado = False
        cita.save(update_fields=["recordatorio_manual_pendiente", "recordatorio_enviado", "updated_at"])
        return Response(self.get_serializer(cita).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="enviar_recordatorio_inmediato")
    def enviar_recordatorio_inmediato(self, request, pk=None):
        cita = self.get_object()
        if cita.estado in {Cita.Estado.CANCELADA, Cita.Estado.COMPLETADA, Cita.Estado.NO_ASISTIO}:
            return Response(
                {"error": "No se puede enviar recordatorio para una cita en este estado.", "code": "ESTADO_INVALIDO"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cita_qs = Cita.objects.select_related("paciente", "servicio", "profesional", "sede", "sede__clinica").get(pk=cita.pk)
        payload = RecordatorioPendienteSerializer(cita_qs).data
        payload["tipo_recordatorio"] = "manual"
        try:
            enviar_recordatorio_cita_webhook(dict(payload))
        except Exception as exc:
            logger.error("Error al enviar recordatorio inmediato cita=%s: %s", cita.pk, exc)
            return Response(
                {"error": "No se pudo contactar el servicio de notificaciones. Intenta de nuevo.", "code": "WEBHOOK_ERROR"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        cita.recordatorio_enviado = True
        cita.recordatorio_manual_pendiente = False
        if cita.estado_confirmacion == Cita.EstadoConfirmacion.SIN_ENVIAR:
            cita.estado_confirmacion = Cita.EstadoConfirmacion.ENVIADO
        cita.save(update_fields=["recordatorio_enviado", "recordatorio_manual_pendiente", "estado_confirmacion", "updated_at"])
        return Response(self.get_serializer(cita).data, status=status.HTTP_200_OK)

    def _request_ip(self, request):
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")

    @action(detail=True, methods=["post"], url_path="iniciar_checkin")
    def iniciar_checkin(self, request, pk=None):
        cita = self.get_object()
        try:
            otp, enviado = iniciar_checkin_otp_cita(cita, self._request_ip(request))
        except http_requests.RequestException:
            return Response(
                {"error": "No se pudo contactar el webhook", "code": "WEBHOOK_ERROR"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except AgendaError as exc:
            return Response({"error": str(exc), "code": exc.code, **exc.extra}, status=status.HTTP_400_BAD_REQUEST)
        telefono = cita.paciente.telefono
        if telefono and len(telefono) >= 4:
            telefono_enmascarado = "*" * (len(telefono) - 4) + telefono[-4:]
        else:
            telefono_enmascarado = None
        payload = {"expira_en": otp.expira_en, "telefono_enmascarado": telefono_enmascarado}
        payload["otp_enviado" if enviado else "otp_activo"] = True
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="verificar_otp")
    def verificar_otp(self, request, pk=None):
        cita = self.get_object()
        codigo = request.data.get("codigo", "")
        if not codigo:
            raise ValidationError({"codigo": "Este campo es obligatorio."})
        try:
            cita = verificar_otp_cita(cita, codigo, self._request_ip(request))
        except AgendaError as exc:
            return Response({"error": str(exc), "code": exc.code, **exc.extra}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"ok": True}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="checkin_foto")
    def checkin_foto(self, request, pk=None):
        cita = self.get_object()
        foto = request.FILES.get("foto")
        if foto is None:
            raise ValidationError({"foto": "Debes adjuntar una foto."})
        if foto.content_type not in {"image/jpeg", "image/png", "image/jpg"}:
            raise ValidationError({"foto": "Solo se permiten imagenes JPEG o PNG."})
        if foto.size > 5 * 1024 * 1024:
            raise ValidationError({"foto": "La foto no puede superar 5MB."})
        try:
            cita = registrar_checkin_foto_cita(cita, foto, self._request_ip(request))
        except AgendaError as exc:
            return Response({"error": str(exc), "code": exc.code, **exc.extra}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"ok": True}, status=status.HTTP_200_OK)


class ConfirmacionPublicaView(APIView):
    authentication_classes = ()
    permission_classes = ()

    def get(self, request, token, *args, **kwargs):
        try:
            cita = confirmar_cita(token)
        except ValueError as exc:
            return Response({"ok": False, "error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "ok": True,
                "paciente_nombre": cita.paciente.nombre_completo,
                "servicio_nombre": cita.servicio.nombre,
                "fecha_inicio": cita.fecha_inicio,
                "profesional_nombre": cita.profesional.nombre_completo,
            },
            status=status.HTTP_200_OK,
        )


class BloqueoAgendaViewSet(ModelViewSet):
    serializer_class = BloqueoAgendaSerializer
    queryset = BloqueoAgenda.objects.select_related("profesional", "sede", "sede__clinica").all()
    ordering_fields = ("fecha_inicio", "created_at")

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [RequirePermission("agenda.bloqueos.ver")()]
        return [RequirePermission("agenda.bloqueos.gestionar")()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(sede__clinica=user.clinica)

        profesional = self.request.query_params.get("profesional")
        sede = self.request.query_params.get("sede")
        fecha_inicio_date = self.request.query_params.get("fecha_inicio__date")

        if profesional:
            queryset = queryset.filter(profesional_id=profesional)
        if sede:
            queryset = queryset.filter(sede_id=sede)
        if fecha_inicio_date:
            queryset = queryset.filter(fecha_inicio__date=fecha_inicio_date)
        return queryset.order_by("fecha_inicio")
