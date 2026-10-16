from collections import defaultdict
from datetime import datetime, time, timedelta
import hmac
import uuid
import logging

from django.conf import settings
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

import requests as http_requests

from apps.agenda import services
from apps.agenda.confirmacion import (
    confirmar_cita,
    confirmar_manual,
    crear_registro_confirmacion,
    registrar_no_confirmo,
)
from apps.agenda.models import BloqueoAgenda, Cita, RegistroConfirmacion
from apps.agenda.services import AgendaError, iniciar_checkin_otp_cita, registrar_checkin_foto_cita, verificar_otp_cita
from apps.agenda.serializers import (
    BloqueoAgendaSerializer,
    CambiarEstadoSerializer,
    CitaSerializer,
    ConfirmarManualSerializer,
    NoConfirmoSerializer,
    RecordatorioPendienteSerializer,
    RegistroConfirmacionSerializer,
    build_consentimiento_info,
)
from apps.clinicas.models import Clinica, Sede, Servicio
from apps.core.logging import registrar_accion
from apps.core.pagination import PaginacionAgenda
from apps.notificaciones.models import EnvioWhatsApp
from apps.notificaciones.services import (
    NumeroPropioNoDisponibleError,
    WhatsAppNoDisponibleError,
    enviar_whatsapp,
    pidio_numero_cliniq,
    registrar_envio_whatsapp,
    resolver_ruta_whatsapp,
    uso_whatsapp_mes_actual,
)
from apps.pacientes.serializers import enmascarar_cola
from apps.users.authorization import (
    puede_atender_la_cita,
    sede_ids_para_filtro,
    user_has_permission,
    user_sede_ids_acotadas,
    ve_solo_su_agenda,
)
from apps.users.models import User
from apps.users.permissions import (
    CanChangeAppointmentState,
    PuedeGestionarLlegada,
    PuedeVerCitas,
    RequireAnyPermission,
    RequirePermission,
    get_clinica_activa,
)


logger = logging.getLogger(__name__)


def _filtrar_por_disponibilidad_whatsapp(citas: list[Cita]) -> list[Cita]:
    """Deja solo las citas cuya clinica puede enviar WhatsApp: addon activo y, si
    tiene cupo mensual, solo tantas citas como envios le queden (en el orden
    recibido). El descuento real ocurre en marcar_recordatorio_enviado."""
    restantes_por_clinica: dict = {}
    resultado = []
    for cita in citas:
        clinica = cita.sede.clinica
        if clinica.id not in restantes_por_clinica:
            uso = uso_whatsapp_mes_actual(clinica)
            if not uso["habilitado"]:
                restantes_por_clinica[clinica.id] = 0
            else:
                restantes_por_clinica[clinica.id] = None if uso["sin_limite"] else uso["envios_restantes"]
        restantes = restantes_por_clinica[clinica.id]
        if restantes is None:
            resultado.append(cita)
        elif restantes > 0:
            resultado.append(cita)
            restantes_por_clinica[clinica.id] = restantes - 1
    return resultado


def _n8n_secret_ok(request) -> bool:
    """Valida el header X-N8N-Secret con comparación de tiempo constante."""
    expected = settings.N8N_WEBHOOK_SECRET or ""
    received = request.headers.get("X-N8N-Secret", "")
    if not expected:
        return False
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))


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
    pagination_class = PaginacionAgenda
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
        "cobro",
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
        elif self.action in {"cambiar_estado", "firma_profesional", "firma_profesional_documento", "completar_atencion"}:
            permission_classes = (CanChangeAppointmentState,)
        elif self.action == "destroy":
            permission_classes = (RequirePermission("agenda.citas.eliminar"),)
        elif self.action in {"confirmar_manual", "no_confirmo"}:
            # Registrar la llamada de confirmación es parte de gestionar la agenda:
            # quien puede crear o editar citas puede confirmarlas.
            permission_classes = (RequireAnyPermission("agenda.citas.crear", "agenda.citas.editar"),)
        elif self.action in {"solicitar_recordatorio", "enviar_recordatorio_inmediato"}:
            permission_classes = (RequirePermission("agenda.citas.editar"),)
        elif self.action in {
            "iniciar_checkin", "verificar_otp", "checkin_foto",
            "enviar_firma_asistencia", "iniciar_registro_asistencia", "enviar_link_firma_asistencia",
            "recuperar_pdf_asistencia", "confirmar_firma_asistencia", "verificar_firma_asistencia",
        }:
            # Editar citas, o atender esa cita (el profesional recibe a su paciente).
            permission_classes = (PuedeGestionarLlegada,)
        elif self.action in {"list", "retrieve"}:
            permission_classes = (PuedeVerCitas,)
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
        # La agenda de toda la sede la ve quien agenda; quien atiende sin ese
        # permiso ve solo la suya. Las pantallas del paciente (?paciente=) y el
        # detalle de una cita muestran todo: su historial no se acota. Las
        # acciones sobre citas ajenas las frenan sus propios permisos.
        if (
            self.action in {"list", "hoy"}
            and not self.request.query_params.get("paciente")
            and ve_solo_su_agenda(user, request=self.request)
        ):
            queryset = queryset.filter(profesional=user)

        estado = self.request.query_params.get("estado")
        estado_in = self.request.query_params.get("estado__in")
        estado_confirmacion = self.request.query_params.get("estado_confirmacion")
        profesional = self.request.query_params.get("profesional")
        profesionales = self.request.query_params.get("profesional__in")
        sede = self.request.query_params.get("sede")
        fecha_inicio_date = self.request.query_params.get("fecha_inicio__date")
        fecha_inicio_date_gte = self.request.query_params.get("fecha_inicio__date__gte")
        fecha_inicio_date_lte = self.request.query_params.get("fecha_inicio__date__lte")
        fecha_inicio_date_lt = self.request.query_params.get("fecha_inicio__date__lt")
        canal_origen = self.request.query_params.get("canal_origen")
        paciente = self.request.query_params.get("paciente")
        firma_asistencia_estado = self.request.query_params.get("firma_asistencia_estado")

        if estado:
            queryset = queryset.filter(estado=estado)
        if estado_in:
            queryset = queryset.filter(estado__in=[e.strip() for e in estado_in.split(",") if e.strip()])
        if estado_confirmacion:
            queryset = queryset.filter(estado_confirmacion=estado_confirmacion)
        if profesionales:
            queryset = queryset.filter(
                profesional_id__in=[item.strip() for item in profesionales.split(",") if item.strip()]
            )
        elif profesional:
            queryset = queryset.filter(profesional_id=profesional)
        sede_ids = sede_ids_para_filtro(user, sede)
        if sede_ids is not None:
            queryset = queryset.filter(sede_id__in=sede_ids)
        if fecha_inicio_date:
            queryset = queryset.filter(fecha_inicio__date=fecha_inicio_date)
        if fecha_inicio_date_gte:
            queryset = queryset.filter(fecha_inicio__date__gte=fecha_inicio_date_gte)
        if fecha_inicio_date_lte:
            queryset = queryset.filter(fecha_inicio__date__lte=fecha_inicio_date_lte)
        if fecha_inicio_date_lt:
            queryset = queryset.filter(fecha_inicio__date__lt=fecha_inicio_date_lt)
        if canal_origen:
            queryset = queryset.filter(canal_origen=canal_origen)
        if paciente:
            queryset = queryset.filter(paciente_id=paciente)
        if firma_asistencia_estado:
            queryset = queryset.filter(firma_asistencia_estado=firma_asistencia_estado)

        return queryset.order_by("fecha_inicio")

    def _confirmo_cruce_paciente(self):
        return str(self.request.data.get("confirmar_cruce_paciente", "")).lower() in {"true", "1"}

    def perform_create(self, serializer):
        cita = services.crear_cita(
            serializer.validated_data, self.request.user,
            avisar_cruce_paciente=not self._confirmo_cruce_paciente(),
        )
        serializer.instance = cita
        registrar_accion(self.request, "cita.crear", cita, {"estado": cita.estado})

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

    ESTADOS_CERRADOS = {Cita.Estado.COMPLETADA, Cita.Estado.CANCELADA, Cita.Estado.NO_ASISTIO}

    @transaction.atomic
    def perform_destroy(self, instance):
        # Una cita con cobro o atención registrada no se borra (respondía 500 por
        # la relación protegida): se cancela (M3-29).
        from django.db.models import ProtectedError

        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError({
                "error": "Esta cita tiene cobros o una atención registrada y no se puede eliminar. Cancélala en su lugar.",
                "code": "CITA_CON_REGISTROS",
            })

    # El bloqueo de la agenda del profesional (select_for_update) exige una
    # transacción: sin ella todo PATCH de una cita respondía 500 (AG-01).
    @transaction.atomic
    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.estado in self.ESTADOS_CERRADOS:
            raise ValidationError({
                "error": "La cita ya está cerrada y no se puede editar.",
                "code": "CITA_CERRADA",
            })
        data = serializer.validated_data
        servicio = data.get("servicio", instance.servicio)
        sede = data.get("sede", instance.sede)
        paciente = data.get("paciente", instance.paciente)
        profesional = data.get("profesional", instance.profesional)
        fecha_inicio = data.get("fecha_inicio", instance.fecha_inicio)

        # Duración actual de la cita tal como está en la agenda. Las citas viejas
        # pueden no tener duracion_min: antes se usaba 0 y editar cualquier cosa
        # (una nota, el profesional) dejaba la hora de fin igual a la de inicio.
        duracion_actual = int((instance.fecha_fin - instance.fecha_inicio).total_seconds() // 60)
        duracion_min = instance.duracion_min or duracion_actual
        servicio_nombre = instance.servicio_nombre
        cambia_duracion = False
        if "servicio" in data and data.get("servicio") and data["servicio"].id != instance.servicio_id:
            duracion_min = data["servicio"].duracion_min
            # Cambió el procedimiento: la agenda mostraba el nombre anterior.
            servicio_nombre = data["servicio"].nombre
            cambia_duracion = True
        elif "duracion_min" in data and data.get("duracion_min") and data["duracion_min"] != instance.duracion_min:
            duracion_min = data["duracion_min"]
            cambia_duracion = True

        if fecha_inicio == instance.fecha_inicio and not cambia_duracion:
            # Ni la hora ni la duración cambian: la hora de fin queda tal cual.
            fecha_fin = instance.fecha_fin
            duracion_min = instance.duracion_min or duracion_actual
        else:
            fecha_fin = services.calcular_fecha_fin(fecha_inicio, duracion_min)

        if paciente.clinica_id != sede.clinica_id:
            raise ValidationError({"error": "El paciente no pertenece a la clinica de la sede."})
        if servicio and servicio.clinica_id != sede.clinica_id:
            raise ValidationError({"error": "El procedimiento no pertenece a la clinica de la sede."})
        if profesional.clinica_id != sede.clinica_id:
            raise ValidationError({"error": "El profesional no pertenece a la clinica de la sede."})
        services._bloquear_agenda_del_profesional(profesional.id)
        services.validar_horario_cita(
            sede=sede,
            profesional=profesional,
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
            excluir_cita_id=instance.id,
        )
        if (fecha_inicio != instance.fecha_inicio or fecha_fin != instance.fecha_fin) and not self._confirmo_cruce_paciente():
            services.avisar_si_paciente_tiene_otra_cita(paciente, fecha_inicio, fecha_fin, excluir_cita_id=instance.id)

        fecha_anterior = instance.fecha_inicio
        extra = {}
        if fecha_inicio != fecha_anterior:
            # Nueva fecha: el recordatorio y la confirmación eran de la anterior.
            extra = {
                "recordatorio_enviado": False,
                "recordatorio_manual_pendiente": False,
                "estado_confirmacion": Cita.EstadoConfirmacion.SIN_ENVIAR,
            }
        serializer.save(
            fecha_fin=fecha_fin,
            duracion_min=duracion_min,
            servicio_nombre=servicio_nombre,
            canal_confirmacion=paciente.canal_confirmacion,
            **extra,
        )
        if serializer.instance.fecha_inicio != fecha_anterior:
            registrar_accion(
                self.request,
                "cita.reagendar",
                serializer.instance,
                {
                    "fecha_anterior": fecha_anterior.isoformat(),
                    "fecha_nueva": serializer.instance.fecha_inicio.isoformat(),
                },
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
        if cita.estado == Cita.Estado.EN_CURSO and nuevo_estado == Cita.Estado.EN_CURSO:
            # Ya se inició (doble clic, otra pestaña o la cola de espera): no es un error.
            return Response(CitaSerializer(cita).data, status=status.HTTP_200_OK)
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
        # Una cita pendiente cuya hora ya pasó sin confirmarse también puede cerrarse como no asistió.
        pendiente_vencida = (
            cita.estado == Cita.Estado.PENDIENTE
            and nuevo_estado == Cita.Estado.NO_ASISTIO
            and cita.fecha_inicio <= timezone.now()
        )
        if nuevo_estado not in FLUJOS_ESTADO[cita.estado] and not pendiente_vencida:
            logger.warning(
                "DEBUG cambiar_estado 400 flujo_no_valido | cita_id=%s estado_actual=%s nuevo_estado=%s payload=%s",
                cita.id,
                cita.estado,
                nuevo_estado,
                request.data,
            )
            raise ValidationError({"error": "El flujo de estado no es valido."})

        if nuevo_estado in {Cita.Estado.EN_CURSO, Cita.Estado.COMPLETADA} and not puede_atender_la_cita(request.user, cita):
            raise PermissionDenied("Solo quien atiende esta cita puede iniciar o cerrar la atención.")

        if nuevo_estado == Cita.Estado.EN_CURSO:
            # Bloqueo duro por mora: si la cotización que originó la cita (o
            # cualquier cartera del paciente) tiene cuotas vencidas y la clínica
            # activó bloquear_agenda_por_deuda, no se puede iniciar la atención.
            # Sin excepción en el wizard: se resuelve pagando o aprobando la
            # excepción desde Cartera.
            services._validar_deuda_paciente(
                cita.paciente, cita.sede.clinica, accion="iniciar la atención"
            )

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

            # El paciente ya firmó; falta la firma del profesional que atiende (mismo sobre).
            from apps.historia_clinica.firma_profesional import (
                consentimientos_pendientes_firma_profesional,
                serializar_pendiente,
            )

            pendientes_profesional = consentimientos_pendientes_firma_profesional(cita)
            if pendientes_profesional:
                return Response(
                    {
                        "error": "Hay consentimientos pendientes de la firma del profesional.",
                        "code": "FIRMA_PROFESIONAL_REQUERIDA",
                        "documentos": [serializar_pendiente(c) for c in pendientes_profesional],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Cancelar una cita ya cobrada: se avisa y se pregunta qué hacer con el cobro
        # (decisión del 15/10/2026). Antes el ingreso quedaba cobrado sin aviso (AG-15).
        anular_cobro = False
        if nuevo_estado == Cita.Estado.CANCELADA:
            from apps.cobros.models import Cobro

            cobro = Cobro.objects.filter(cita=cita).exclude(estado=Cobro.Estado.ANULADO).first()
            if cobro is not None and cobro.pagos.exists():
                accion_cobro = request.data.get("accion_cobro")
                puede_anular = user_has_permission(request.user, "cobros.anular", request=request)
                if accion_cobro not in {"mantener", "anular"}:
                    return Response(
                        {
                            "error": "Esta cita ya tiene un cobro con pagos. Elige qué hacer con el cobro al cancelarla.",
                            "code": "CITA_CON_COBRO_PAGADO",
                            "cobro": {"id": str(cobro.id), "total_pagado": str(cobro.pagos.aggregate(t=Sum("valor"))["t"] or 0)},
                            "puede_anular": puede_anular,
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if accion_cobro == "anular":
                    if not puede_anular:
                        raise PermissionDenied("Tu rol no puede anular cobros. Cancela la cita manteniendo el cobro.")
                    anular_cobro = cobro

        estado_anterior = cita.estado
        cita.estado = nuevo_estado
        update_fields = ["estado", "updated_at"]

        if nuevo_estado == Cita.Estado.CONFIRMADA and cita.estado_confirmacion != Cita.EstadoConfirmacion.CONFIRMADO:
            # Se confirma tras contactar al paciente: es su confirmación, no un paso aparte.
            cita.estado_confirmacion = Cita.EstadoConfirmacion.CONFIRMADO
            cita.confirmado_por = request.user
            cita.confirmado_en = timezone.now()
            update_fields.extend(["estado_confirmacion", "confirmado_por", "confirmado_en"])

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

        with transaction.atomic():
            if anular_cobro:
                from apps.cobros.models import Cobro
                from apps.cobros.services import reversar_pago

                for pago in list(anular_cobro.pagos.all()):
                    reversar_pago(cobro=anular_cobro, pago=pago)
                Cobro.objects.filter(pk=anular_cobro.pk).update(estado=Cobro.Estado.ANULADO, updated_at=timezone.now())
                registrar_accion(request, "cobro.anular", anular_cobro, {"motivo": "Cita cancelada", "cita_id": str(cita.id)})
            cita.save(update_fields=list(dict.fromkeys(update_fields)))

        if nuevo_estado in {Cita.Estado.CANCELADA, Cita.Estado.NO_ASISTIO}:
            # Liberar las sesiones de tratamiento vinculadas a esta cita para que
            # puedan reagendarse ("no asistió" tampoco consume la sesión). El cupo del ítem de cotización ya queda libre vía
            # citas_no_canceladas(); esto suelta además el FK de la SesionProcedimiento,
            # que si no bloquea el reagendado con SESION_YA_VINCULADA.
            from apps.protocolos.models import SesionProcedimiento

            cita.sesiones_protocolo.filter(
                estado=SesionProcedimiento.Estado.PENDIENTE
            ).update(cita=None, updated_at=timezone.now())

            # Los insumos registrados en la atención vuelven al stock. No solo si
            # estaba en curso: tras "Desiniciar" la cita queda en espera con los
            # consumos de su nota, y al cancelarla se quedaban descontados (AT-07).
            from apps.historia_clinica.models import ConsumoInsumo
            from apps.historia_clinica.services import eliminar_consumo_insumo

            for consumo in ConsumoInsumo.objects.filter(nota__cita=cita, activo=True):
                try:
                    with transaction.atomic():
                        eliminar_consumo_insumo(consumo, request.user)
                except ValidationError:
                    # Ya lo devolvió otra petición a la vez.
                    continue

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
        if nuevo_estado == Cita.Estado.CANCELADA:
            registrar_accion(request, "cita.cancelar", cita, {"motivo": cita.motivo_cancelacion})
        elif nuevo_estado == Cita.Estado.COMPLETADA:
            registrar_accion(request, "cita.completar", cita)
        return Response(CitaSerializer(cita).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="completar_atencion")
    def completar_atencion(self, request, pk=None):
        """Cierra la atención en una sola transacción: marca la sesión del
        tratamiento (si la hay), completa la nota y pasa la cita a completada.

        Antes eran tres llamadas desde la pantalla: si fallaba la última, la nota
        quedaba completada con la cita en curso y la atención se trababa; al
        recargar se creaba una nota nueva vacía (AT-03). Es idempotente.
        """
        from apps.historia_clinica.autoria import exigir_documentable
        from apps.historia_clinica.models import NotaClinica
        from apps.protocolos.models import SesionProcedimiento
        from apps.protocolos.services import ProtocolosError, _sesion_vinculada_o_pendiente, marcar_sesion_completada

        with transaction.atomic():
            cita = Cita.objects.select_for_update().get(pk=self.get_object().pk)
            if cita.estado == Cita.Estado.COMPLETADA:
                return Response(CitaSerializer(cita).data, status=status.HTTP_200_OK)
            if not puede_atender_la_cita(request.user, cita):
                raise PermissionDenied("Solo quien atiende esta cita puede cerrar la atención.")
            if cita.estado != Cita.Estado.EN_CURSO:
                raise ValidationError({"error": "La atención no está en curso.", "code": "INVALID_TRANSITION"})

            notas = NotaClinica.objects.filter(cita=cita, activo=True).order_by("-created_at")
            nota_id = request.data.get("nota")
            nota = notas.filter(id=nota_id).first() if nota_id else notas.first()
            if nota is None:
                raise ValidationError({"error": "La atención no tiene nota.", "code": "NOTA_REQUERIDA"})
            exigir_documentable(request.user, nota, en_borrador=False)

            sesion = _sesion_vinculada_o_pendiente(cita)
            if sesion is not None and sesion.estado == SesionProcedimiento.Estado.PENDIENTE:
                validos = {str(sesion.procedimiento_id)} if sesion.procedimiento_id else set()
                if sesion.tipo_sesion_id:
                    validos |= {
                        str(pid) for pid in sesion.tipo_sesion.procedimientos.filter(activo=True)
                        .values_list("procedimiento_id", flat=True)
                    }
                pedidos = [str(p) for p in (request.data.get("procedimientos_ejecutados") or [])]
                ejecutados = [p for p in pedidos if p in validos] or sorted(validos)
                try:
                    marcar_sesion_completada(
                        sesion, cita=cita,
                        # La sesión es del profesional de la cita, no de quien la cierra (AT-11).
                        profesional=cita.profesional or sesion.profesional,
                        procedimientos_ejecutados=ejecutados,
                    )
                except ProtocolosError as exc:
                    transaction.set_rollback(True)
                    return Response({"error": str(exc), "code": exc.code, **exc.extra}, status=status.HTTP_400_BAD_REQUEST)

            # Todas las notas de la cita se cierran: un borrador duplicado no queda abierto.
            for abierta in notas.filter(estado=NotaClinica.EstadoNota.BORRADOR):
                abierta.estado = NotaClinica.EstadoNota.COMPLETADA
                abierta.save(update_fields=["estado", "updated_at"])

            cita.estado = Cita.Estado.COMPLETADA
            update_fields = ["estado", "updated_at"]
            if cita.fecha_fin_real is None:
                cita.fecha_fin_real = timezone.now()
                update_fields.append("fecha_fin_real")
            cita.save(update_fields=update_fields)
        registrar_accion(request, "cita.completar", cita)
        return Response(CitaSerializer(cita).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"], url_path="firma_profesional")
    def firma_profesional(self, request, pk=None):
        """Consentimientos de la cita pendientes de la firma del profesional.

        GET: documentos pendientes y si el usuario puede firmar (con el motivo si no).
        POST: firma todos los pendientes con la firma, nombre y TP del perfil del usuario.
        """
        from apps.core.logging import get_client_ip
        from apps.core.storage import get_public_url
        from apps.historia_clinica.firma_profesional import (
            MOTIVO_SIN_FIRMA,
            FirmaNoDisponibleError,
            consentimientos_pendientes_firma_profesional,
            firmar_consentimientos_profesional,
            motivo_no_puede_firmar,
            serializar_pendiente,
        )

        cita = self.get_object()
        user = request.user
        pendientes = consentimientos_pendientes_firma_profesional(cita)
        motivo = motivo_no_puede_firmar(user, cita, pendientes)

        if request.method == "GET":
            return Response(
                {
                    "documentos": [serializar_pendiente(c) for c in pendientes],
                    "puede_firmar": motivo is None,
                    "motivo": motivo,
                    "profesional": {
                        "nombre": user.nombre_completo,
                        "registro_profesional": user.registro_profesional,
                        "firma_url": get_public_url(user.firma_digital.name) if user.firma_digital else None,
                    },
                },
                status=status.HTTP_200_OK,
            )

        if motivo is not None:
            return Response(motivo, status=status.HTTP_400_BAD_REQUEST)

        ip = get_client_ip(request)
        user_agent = request.META.get("HTTP_USER_AGENT", "")
        try:
            resultados = firmar_consentimientos_profesional(cita, user, ip=ip, user_agent=user_agent)
        except FirmaNoDisponibleError as exc:
            return Response({"code": MOTIVO_SIN_FIRMA, "error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        for resultado in resultados:
            registrar_accion(
                request,
                "consentimiento.firma_profesional" if resultado["ok"] else "consentimiento.firma_profesional_fallida",
                cita,
                {
                    "consentimiento_id": resultado["id"],
                    "documento": resultado["nombre"],
                    "user_agent": user_agent,
                    **({"error": resultado["error"]} if not resultado["ok"] else {}),
                },
            )

        fallidos = [r for r in resultados if not r["ok"]]
        cuerpo = {"resultados": resultados, "consentimiento_info": build_consentimiento_info(cita)}
        if fallidos:
            cuerpo.update(
                error="No se pudo firmar: " + ", ".join(r["nombre"] for r in fallidos) + ". Intenta de nuevo.",
                code="FIRMA_PROFESIONAL_FALLIDA",
            )
            return Response(cuerpo, status=status.HTTP_502_BAD_GATEWAY)
        return Response(cuerpo, status=status.HTTP_200_OK)

    @action(
        detail=True, methods=["get"],
        url_path=r"firma_profesional/documento/(?P<consentimiento_id>[0-9a-f-]+)",
    )
    def firma_profesional_documento(self, request, pk=None, consentimiento_id=None):
        """PDF de un consentimiento pendiente de la firma del profesional, para leerlo antes de firmar.

        Mientras falta el profesional Documenso no entrega el PDF con la firma del paciente:
        se muestra el documento de la plantilla (su contenido completo).
        """
        from django.http import HttpResponse

        from apps.historia_clinica.firma_profesional import (
            consentimientos_pendientes_firma_profesional,
            pdf_para_firma_profesional,
        )

        cita = self.get_object()
        consentimiento = next(
            (c for c in consentimientos_pendientes_firma_profesional(cita) if str(c.id) == consentimiento_id),
            None,
        )
        if consentimiento is None:
            return Response({"error": "Documento no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        pdf_bytes = pdf_para_firma_profesional(consentimiento)
        if not pdf_bytes:
            return Response({"error": "No se pudo obtener el documento."}, status=status.HTTP_502_BAD_GATEWAY)

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="consentimiento-{consentimiento.id}.pdf"'
        return response

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
        # Al editar una cita, su propio horario no cuenta como ocupado.
        cita_id = request.query_params.get("cita_id")

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
        clinica_activa = get_clinica_activa(request)
        if clinica_activa is not None:
            sede_qs = sede_qs.filter(clinica=clinica_activa)
            profesional_qs = profesional_qs.filter(clinica=clinica_activa)

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
            if clinica_activa is not None:
                servicio_qs = servicio_qs.filter(clinica=clinica_activa)
            try:
                servicio = servicio_qs.get(id=servicio_id)
            except Servicio.DoesNotExist as exc:
                logger.debug("[slots_disponibles] ERROR: servicio %s no encontrado", servicio_id)
                raise ValidationError({"servicio_id": "El procedimiento no pertenece a tu clinica."}) from exc
            if servicio.clinica_id != sede.clinica_id:
                logger.debug(
                    "[slots_disponibles] ERROR: clinica servicio (%s) != clinica sede (%s)",
                    servicio.clinica_id, sede.clinica_id,
                )
                raise ValidationError({"servicio_id": "El procedimiento no pertenece a la clinica de la sede."})
            duracion_min = servicio.duracion_min
            logger.debug("[slots_disponibles] duracion_min desde servicio: %s", duracion_min)

        elif item_cotizacion_id:
            try:
                item = (
                    ItemCotizacion.objects
                    .select_related("tratamiento", "servicio", "procedimiento", "cotizacion")
                    .get(id=item_cotizacion_id)
                )
                logger.debug(
                    "[slots_disponibles] item encontrado: %s, tratamiento=%s, servicio=%s, cotizacion.clinica=%s",
                    item.id, item.tratamiento_id, item.servicio_id, item.cotizacion.clinica_id,
                )
            except ItemCotizacion.DoesNotExist as exc:
                logger.debug("[slots_disponibles] ERROR: item_cotizacion %s no existe", item_cotizacion_id)
                raise ValidationError({"item_cotizacion_id": "El item no existe."}) from exc
            if clinica_activa is not None and item.cotizacion.clinica_id != clinica_activa.id:
                logger.debug(
                    "[slots_disponibles] ERROR: clinica item (%s) != clinica user (%s)",
                    item.cotizacion.clinica_id, request.user.clinica_id,
                )
                raise ValidationError({"item_cotizacion_id": "El item no pertenece a tu clinica."})
            sesion_id = request.query_params.get("sesion_ejecutada_id")
            if item.tratamiento_id and sesion_id:
                # Con la sesión elegida, su duración: antes los horarios se
                # calculaban con la sesión más larga del paquete (AG-07).
                from apps.agenda.services import duracion_de_sesion
                from apps.protocolos.models import SesionProcedimiento

                sesion = (
                    SesionProcedimiento.objects
                    .select_related("tipo_sesion", "procedimiento")
                    .filter(id=sesion_id, tratamiento__paciente__clinica_id=item.cotizacion.clinica_id)
                    .first()
                )
                if sesion is not None:
                    duracion_min = duracion_de_sesion(sesion)[0] or None
            if item.tratamiento_id and not duracion_min:
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
            if not duracion_min and item.procedimiento_efectivo_id:
                duracion_min = item.procedimiento_efectivo.duracion_min
                logger.debug("[slots_disponibles] duracion_min desde el procedimiento del item: %s", duracion_min)
            if not duracion_min:
                logger.debug(
                    "[slots_disponibles] ERROR: item %s sin duracion (tratamiento=%s, servicio=%s)",
                    item_cotizacion_id, item.tratamiento_id, item.servicio_id,
                )
                if item.tratamiento_id:
                    raise ValidationError(
                        {"item_cotizacion_id": "Los tipos de sesión de este tratamiento no tienen duración. Configura la duración en Catálogo → Tratamientos.", "code": "MISSING_DURATION"}
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
        try:
            fecha_date = datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValidationError({"fecha": "Usa el formato AAAA-MM-DD."}) from exc
        excluir_cita_id = None
        if cita_id:
            try:
                excluir_cita_id = (
                    Cita.objects.filter(id=uuid.UUID(cita_id), sede__clinica=sede.clinica)
                    .values_list("id", flat=True).first()
                )
            except ValueError as exc:
                raise ValidationError({"cita_id": "Identificador de cita inválido."}) from exc
        slots = services.get_slots_disponibles(
            profesional.id, sede.id, fecha_date, duracion_min, excluir_cita_id=excluir_cita_id,
        )
        logger.debug("[slots_disponibles] slots encontrados: %s", slots)
        return Response([slot.isoformat() for slot in slots], status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="hoy", pagination_class=None)
    def hoy(self, request, *args, **kwargs):
        hoy = timezone.localdate()
        queryset = self.get_queryset().filter(fecha_inicio__date=hoy)
        clinica_hoy = get_clinica_activa(request)
        if clinica_hoy is not None:
            queryset = queryset.filter(sede__clinica=clinica_hoy)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="sin_confirmar_proximo_dia_habil", pagination_class=None)
    def sin_confirmar_proximo_dia_habil(self, request, *args, **kwargs):
        """Citas sin confirmar del próximo día que la sede trabaja, para el aviso del dashboard y la agenda."""
        clinica = get_clinica_activa(request)
        if clinica is None:
            return Response({"total": 0, "fecha_desde": None, "fecha_hasta": None})
        # Mismos filtros que la agenda (sede y profesionales) para que el aviso no
        # cuente citas que el usuario no puede ver en el calendario.
        sede_ids = sede_ids_para_filtro(request.user, request.query_params.get("sede"))
        profesionales = request.query_params.get("profesional__in", "")
        profesional_ids = [p.strip() for p in profesionales.split(",") if p.strip()] or None
        if ve_solo_su_agenda(request.user, request=request):
            profesional_ids = [request.user.id]
        return Response(services.citas_sin_confirmar_proximo_dia_habil(clinica, sede_ids, profesional_ids))

    @action(detail=True, methods=["patch"], url_path="confirmar_manual")
    def confirmar_manual(self, request, pk=None):
        serializer = ConfirmarManualSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cita = self.get_object()
        # Como "no confirmó": solo citas que siguen por venir. Por API se confirmaba
        # una cita cancelada o ya atendida (AG-14).
        if cita.estado not in {Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA}:
            raise ValidationError({
                "error": "Solo se confirma una cita pendiente o confirmada.", "code": "CITA_NO_CONFIRMABLE",
            })
        cita = confirmar_manual(
            cita,
            request.user,
            medio=serializer.validated_data.get("medio", ""),
            nota=serializer.validated_data.get("nota", ""),
        )
        return Response(self.get_serializer(cita).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="no_confirmo")
    def no_confirmo(self, request, pk=None):
        """Se contactó al paciente pero no confirmó: la cita sigue igual, queda el registro."""
        cita = self.get_object()
        if cita.estado not in {Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA}:
            raise ValidationError({"error": "Solo se registra en citas pendientes o confirmadas."})
        serializer = NoConfirmoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cita = registrar_no_confirmo(
            cita,
            request.user,
            medio=serializer.validated_data.get("medio", ""),
            nota=serializer.validated_data["nota"],
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
        if not _n8n_secret_ok(request):
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

        citas = _filtrar_por_disponibilidad_whatsapp(citas)
        serializer = RecordatorioPendienteSerializer(citas, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="marcar_recordatorio_enviado")
    def marcar_recordatorio_enviado(self, request, pk=None):
        if not _n8n_secret_ok(request):
            return Response({"error": "No autorizado.", "code": "N8N_UNAUTHORIZED"}, status=status.HTTP_401_UNAUTHORIZED)

        pk = self.get_object().pk
        with transaction.atomic():
            # Bloqueo de fila: si n8n reintenta o llama dos veces en paralelo, solo
            # la primera llamada descuenta cupo.
            cita = Cita.objects.select_for_update().select_related("sede__clinica", "paciente").get(pk=pk)
            ya_marcada = cita.recordatorio_enviado and not cita.recordatorio_manual_pendiente
            if not ya_marcada:
                cita.recordatorio_enviado = True
                cita.recordatorio_manual_pendiente = False
                if cita.estado_confirmacion == Cita.EstadoConfirmacion.SIN_ENVIAR:
                    cita.estado_confirmacion = Cita.EstadoConfirmacion.ENVIADO
                cita.save(update_fields=["recordatorio_enviado", "recordatorio_manual_pendiente", "estado_confirmacion", "updated_at"])
                registrar_envio_whatsapp(cita.sede.clinica, EnvioWhatsApp.Tipo.RECORDATORIO_CITA, paciente=cita.paciente)
        return Response(self.get_serializer(self.get_object()).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="solicitar_recordatorio")
    def solicitar_recordatorio(self, request, pk=None):
        cita = self.get_object()
        if cita.estado not in {Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA}:
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
        if cita.estado not in {Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA}:
            return Response(
                {"error": "No se puede enviar recordatorio para una cita en este estado.", "code": "ESTADO_INVALIDO"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cita_qs = Cita.objects.select_related("paciente", "servicio", "profesional", "sede", "sede__clinica").get(pk=cita.pk)
        try:
            ruta = resolver_ruta_whatsapp(
                cita_qs.sede.clinica, cita_qs.sede,
                tipo=EnvioWhatsApp.Tipo.RECORDATORIO_CITA, paciente=cita_qs.paciente, cita=cita_qs,
                usar_numero_cliniq=pidio_numero_cliniq(request),
            )
        except WhatsAppNoDisponibleError as exc:
            return Response({"error": str(exc), "code": exc.code}, status=status.HTTP_403_FORBIDDEN)
        payload = RecordatorioPendienteSerializer(cita_qs).data
        payload["tipo_recordatorio"] = "manual"
        try:
            enviar_whatsapp(
                ruta=ruta, tipo=EnvioWhatsApp.Tipo.RECORDATORIO_CITA, paciente=cita_qs.paciente, payload=dict(payload),
            )
        except WhatsAppNoDisponibleError as exc:
            # NUMERO_PROPIO_NO_DISPONIBLE: el numero de la clinica fallo; el usuario confirma si usa el de CliniQ.
            return Response({"error": str(exc), "code": exc.code}, status=status.HTTP_403_FORBIDDEN)
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
        logger.debug(
            "[iniciar_checkin] cita_id=%s | estado=%s | user=%s",
            cita.id, cita.estado, request.user.id,
        )
        try:
            otp, enviado = iniciar_checkin_otp_cita(cita, self._request_ip(request))
        except http_requests.RequestException as exc:
            logger.error(
                "[iniciar_checkin] 502 webhook error | cita_id=%s | exc=%s",
                cita.id, exc,
            )
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

    @action(detail=True, methods=["post"], url_path="enviar_firma_asistencia")
    def enviar_firma_asistencia(self, request, pk=None):
        from apps.consentimientos.models import PlantillaAsistencia
        from apps.consentimientos.services import enviar_firma_asistencia_cita
        from apps.historia_clinica.services import DocumensoIntegrationError

        cita = self.get_object()
        template_id = request.data.get("template_id")
        if not template_id:
            raise ValidationError({"template_id": "Este campo es requerido."})

        plantilla = PlantillaAsistencia.objects.filter(
            id=template_id, activo=True, clinica=cita.sede.clinica
        ).first()
        if plantilla is None:
            raise ValidationError({"template_id": "Plantilla no encontrada o inactiva."})

        try:
            result = enviar_firma_asistencia_cita(cita, plantilla)
        except DocumensoIntegrationError as exc:
            return Response({"error": str(exc), "code": "DOCUMENSO_ERROR"}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="iniciar_registro_asistencia")
    def iniciar_registro_asistencia(self, request, pk=None):
        from apps.consentimientos.services import iniciar_registro_asistencia_documenso
        from apps.historia_clinica.services import DocumensoIntegrationError

        cita = self.get_object()
        logger.debug(
            "[iniciar_registro_asistencia] cita_id=%s | estado=%s | user=%s",
            cita.id, cita.estado, request.user.id,
        )
        try:
            result = iniciar_registro_asistencia_documenso(cita)
        except DocumensoIntegrationError as exc:
            logger.error(
                "[iniciar_registro_asistencia] 502 | cita_id=%s | error=%s",
                cita.id, exc,
            )
            return Response({"error": str(exc), "code": "DOCUMENSO_ERROR"}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="enviar_link_firma_asistencia")
    def enviar_link_firma_asistencia(self, request, pk=None):
        from apps.consentimientos.services import iniciar_registro_asistencia_documenso
        from apps.historia_clinica.services import DocumensoIntegrationError, url_firma_documenso
        cita = self.get_object()
        try:
            result = iniciar_registro_asistencia_documenso(cita)
        except DocumensoIntegrationError as exc:
            return Response({"error": str(exc), "code": "DOCUMENSO_ERROR"}, status=status.HTTP_502_BAD_GATEWAY)

        link = url_firma_documenso(result.get("signing_token") or "")
        if not link:
            return Response(
                {"error": "No se pudo obtener el enlace de firma de Documenso.", "code": "DOCUMENSO_ERROR"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        telefono = (getattr(cita.paciente, "telefono", "") or "").strip()
        enviado = False
        if telefono:
            try:
                enviar_whatsapp(
                    clinica=cita.sede.clinica,
                    sede=cita.sede,
                    cita=cita,
                    tipo=EnvioWhatsApp.Tipo.FIRMA_DOCUMENTO,
                    paciente=cita.paciente,
                    documento_tipo="registro de asistencia",
                    link=link,
                    metadata={"cita_id": str(cita.id)},
                    usar_numero_cliniq=pidio_numero_cliniq(request),
                )
                enviado = True
            except NumeroPropioNoDisponibleError as exc:
                return Response(
                    {"error": str(exc), "code": exc.code, "signing_url": link, "telefono": enmascarar_cola(telefono)},
                    status=status.HTTP_409_CONFLICT,
                )
            except (ValueError, WhatsAppNoDisponibleError, http_requests.RequestException):
                # Sin WhatsApp el link igual se devuelve para copiarlo.
                pass

        return Response({"enviado": enviado, "signing_url": link, "telefono": enmascarar_cola(telefono)}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="confirmar_firma_asistencia")
    def confirmar_firma_asistencia(self, request, pk=None):
        """
        Confirmación eager de firma de asistencia disparada por el frontend cuando
        el embed de Documenso reporta onDocumentCompleted. Marca el estado como
        'firmada' de inmediato sin esperar el webhook de Documenso (que puede llegar
        tarde o fallar). El webhook sigue siendo el canal para guardar el PDF firmado.
        """
        from apps.consentimientos.services import (
            RESPUESTA_FIRMA_NO_CONFIRMADA,
            confirmar_firma_con_documenso,
            verificar_firma_asistencia_en_documenso,
        )

        cita = self.get_object()
        # Se confirma con Documenso: antes cualquier llamada la marcaba firmada sin
        # verificar nada (AG-12). Si Documenso aún no lo reporta, el asistente sigue
        # esperando y el webhook la marca al llegar.
        if not confirmar_firma_con_documenso(lambda: verificar_firma_asistencia_en_documenso(cita) == "firmada"):
            return Response(RESPUESTA_FIRMA_NO_CONFIRMADA, status=status.HTTP_409_CONFLICT)
        cita.refresh_from_db()
        logger.info(
            "[confirmar_firma_asistencia] firma verificada en Documenso | cita_id=%s | user=%s",
            cita.id, request.user.id,
        )
        serializer = self.get_serializer(cita)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="verificar_firma_asistencia")
    def verificar_firma_asistencia(self, request, pk=None):
        """
        Consulta el estado del documento directamente en Documenso y reconcilia
        firma_asistencia_estado. Respaldo manual para cuando el webhook de
        Documenso tarda o no llega (el paciente firmo desde su celular via el
        link de WhatsApp).
        """
        from apps.consentimientos.services import verificar_firma_asistencia_en_documenso

        cita = self.get_object()
        verificar_firma_asistencia_en_documenso(cita)
        cita.refresh_from_db()
        serializer = self.get_serializer(cita)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="recuperar_pdf_asistencia")
    def recuperar_pdf_asistencia(self, request, pk=None):
        from apps.consentimientos.services import recuperar_pdf_asistencia as _recuperar

        cita = self.get_object()
        if cita.firma_asistencia_estado != "firmada":
            return Response(
                {"error": "La cita no tiene firma completada.", "code": "FIRMA_NO_COMPLETADA"},
                status=status.HTTP_409_CONFLICT,
            )
        if cita.firma_asistencia_archivo:
            serializer = self.get_serializer(cita)
            return Response(serializer.data, status=status.HTTP_200_OK)
        ok = _recuperar(cita)
        if not ok:
            return Response(
                {
                    "error": "El PDF firmado aún no está disponible en Documenso. Inténtalo de nuevo en unos segundos.",
                    "code": "DOCUMENSO_ERROR",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        cita.refresh_from_db()
        serializer = self.get_serializer(cita)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="registro_asistencia_pdf")
    def registro_asistencia_pdf(self, request, pk=None):
        from apps.agenda.pdf import render_registro_asistencia_pdf

        cita = self.get_object()
        pdf_bytes = render_registro_asistencia_pdf(cita)
        nombre = f"registro_asistencia_CIT-{str(cita.id)[:8].upper()}.pdf"
        from django.http import HttpResponse
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{nombre}"'
        return response


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
                # Citas de paquete o libres no tienen servicio (antes daba 500).
                "servicio_nombre": cita.servicio_nombre or (cita.servicio.nombre if cita.servicio_id else ""),
                "fecha_inicio": cita.fecha_inicio,
                "profesional_nombre": cita.profesional.nombre_completo,
            },
            status=status.HTTP_200_OK,
        )


class PuedeVerBloqueos(BasePermission):
    message = "No tienes permiso para realizar esta accion."

    def has_permission(self, request, view):
        from apps.users.authorization import user_has_permission

        return any(
            user_has_permission(request.user, clave, request=request)
            for clave in ("agenda.bloqueos.ver", "agenda.citas.ver")
        )


class BloqueoAgendaViewSet(ModelViewSet):
    serializer_class = BloqueoAgendaSerializer
    queryset = BloqueoAgenda.objects.select_related(
        "profesional", "sede", "sede__clinica", "clinica", "creado_por", "aprobado_por"
    ).all()
    ordering_fields = ("fecha_inicio", "created_at")

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            # Quien ve la agenda necesita ver los horarios bloqueados para agendar;
            # sin `agenda.bloqueos.ver` solo ve los aprobados (ver get_queryset).
            return [PuedeVerBloqueos()]
        if self.action in {"aprobar", "rechazar"}:
            return [RequirePermission("agenda.aprobar_bloqueo")()]
        # Quien ve la agenda puede solicitar un bloqueo (queda pendiente hasta
        # que alguien con agenda.aprobar_bloqueo lo acepte). Editar o borrar
        # se acota en _puede_modificar.
        return [RequireAnyPermission("agenda.crear_bloqueo", "agenda.citas.ver")()]

    def get_queryset(self):
        from apps.users.authorization import user_has_permission

        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(
                Q(sede__clinica=user.clinica) | Q(clinica=user.clinica)
            )

        profesional = self.request.query_params.get("profesional")
        sede = self.request.query_params.get("sede")
        fecha_inicio_date = self.request.query_params.get("fecha_inicio__date")
        estado = self.request.query_params.get("estado")

        if profesional:
            queryset = queryset.filter(profesional_id=profesional)
        sede_ids = sede_ids_para_filtro(user, sede)
        if sede_ids is not None:
            # Los bloqueos sin sede aplican a toda la clinica: se incluyen
            # tambien al filtrar por una sede (antes desaparecian, M3-28). Una
            # sede sin acceso no devuelve nada.
            if sede_ids:
                queryset = queryset.filter(Q(sede_id__in=sede_ids) | Q(sede__isnull=True))
            else:
                queryset = queryset.none()
        if fecha_inicio_date:
            queryset = queryset.filter(fecha_inicio__date=fecha_inicio_date)
        # Rango de días (YYYY-MM-DD, ambos incluidos): trae todo bloqueo que se
        # cruce con el rango, también los de varios días que empezaron antes.
        # Sin esto la agenda leía la primera página de todos los bloqueos
        # históricos y los nuevos no aparecían.
        desde = self._fecha_param("desde")
        hasta = self._fecha_param("hasta")
        tz = timezone.get_current_timezone()
        if desde:
            queryset = queryset.filter(fecha_fin__gt=timezone.make_aware(datetime.combine(desde, time.min), tz))
        if hasta:
            queryset = queryset.filter(
                fecha_inicio__lt=timezone.make_aware(datetime.combine(hasta + timedelta(days=1), time.min), tz)
            )
        if estado:
            queryset = queryset.filter(estado=estado)
        if self.action in {"list", "retrieve"} and not user_has_permission(
            user, "agenda.bloqueos.ver", request=self.request
        ):
            # Sin "ver bloqueos": los aprobados y sus propias solicitudes, para
            # que quien pidió un bloqueo vea si se lo aprobaron.
            queryset = queryset.filter(Q(estado=BloqueoAgenda.Estado.APROBADO) | Q(creado_por=user))
        return queryset.order_by("fecha_inicio")

    def _fecha_param(self, nombre):
        valor = self.request.query_params.get(nombre)
        if not valor:
            return None
        try:
            return datetime.strptime(valor, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValidationError({nombre: "Usa el formato AAAA-MM-DD."}) from exc

    def perform_create(self, serializer):
        from apps.users.authorization import user_has_permission

        user = self.request.user
        sede = serializer.validated_data.get("sede")
        clinica = getattr(sede, "clinica", None) or getattr(user, "clinica", None)
        # Un usuario acotado solo bloquea sus sedes; el bloqueo de toda la
        # clinica (sin sede) queda para quien ve todas.
        acotadas = user_sede_ids_acotadas(user)
        if acotadas is not None and (sede is None or sede.id not in acotadas):
            raise PermissionDenied("Solo puedes crear bloqueos en tus sedes.")

        if user_has_permission(user, "agenda.aprobar_bloqueo", request=self.request):
            estado = BloqueoAgenda.Estado.APROBADO
        else:
            estado = BloqueoAgenda.Estado.PENDIENTE

        self._avisar_citas_afectadas(serializer.validated_data, sede, clinica)
        serializer.save(creado_por=user, clinica=clinica, estado=estado)

    def _avisar_citas_afectadas(self, datos, sede, clinica):
        """Un bloqueo encima de citas ya agendadas no las cancela: antes se creaba
        sin decir nada. Si hay citas en ese horario se pide confirmar, con la
        lista, para que recepción las reprograme."""
        if str(self.request.data.get("confirmar_citas_afectadas", "")).lower() in {"true", "1"}:
            return
        citas = Cita.objects.filter(
            fecha_inicio__lt=datos["fecha_fin"],
            fecha_fin__gt=datos["fecha_inicio"],
            estado__in=[Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA, Cita.Estado.EN_ESPERA],
        )
        if datos.get("profesional"):
            citas = citas.filter(profesional=datos["profesional"])
        elif sede is not None:
            citas = citas.filter(sede=sede)
        else:
            citas = citas.filter(sede__clinica=clinica)
        afectadas = list(citas.select_related("paciente").order_by("fecha_inicio")[:20])
        if not afectadas:
            return
        total = citas.count()
        raise ValidationError({
            "error": f"Hay {total} cita{'s' if total != 1 else ''} en ese horario. El bloqueo no las cancela: "
                     "reprográmalas o confirma para crearlo de todas formas.",
            "code": "BLOQUEO_CON_CITAS",
            "citas": [
                {
                    "id": str(c.id),
                    "paciente": c.paciente.nombre_completo,
                    "fecha_inicio": timezone.localtime(c.fecha_inicio).isoformat(),
                }
                for c in afectadas
            ],
        })

    def _puede_modificar(self, bloqueo):
        """Editar o borrar un bloqueo: quien gestiona bloqueos, o quien lo creó
        mientras siga pendiente. Antes bastaba con "crear bloqueo" para cambiar o
        borrar bloqueos aprobados de otros."""
        from apps.users.authorization import user_has_permission

        user = self.request.user
        if user_has_permission(user, "agenda.bloqueos.gestionar", request=self.request):
            return
        if bloqueo.creado_por_id == user.id and bloqueo.estado == BloqueoAgenda.Estado.PENDIENTE:
            return
        raise PermissionDenied("Solo puedes modificar tus bloqueos pendientes de aprobación.")

    def perform_update(self, serializer):
        from apps.users.authorization import user_has_permission

        self._puede_modificar(serializer.instance)
        bloqueo = serializer.instance
        datos = {
            campo: serializer.validated_data.get(campo, getattr(bloqueo, campo))
            for campo in ("sede", "profesional", "fecha_inicio", "fecha_fin")
        }
        # Lo mismo que al crear: un usuario acotado no lo mueve a otra sede ni lo
        # extiende a toda la clínica con sede vacía (AG-11).
        acotadas = user_sede_ids_acotadas(self.request.user)
        if acotadas is not None and (datos["sede"] is None or datos["sede"].id not in acotadas):
            raise PermissionDenied("Solo puedes dejar bloqueos en tus sedes.")
        if any(datos[campo] != getattr(bloqueo, campo) for campo in datos):
            clinica = getattr(datos["sede"], "clinica", None) or bloqueo.clinica or self.request.user.clinica
            self._avisar_citas_afectadas(datos, datos["sede"], clinica)
        # Un bloqueo aprobado que edita alguien sin permiso de aprobar vuelve a revisión.
        if serializer.instance.estado == BloqueoAgenda.Estado.APROBADO and not user_has_permission(
            self.request.user, "agenda.aprobar_bloqueo", request=self.request
        ):
            serializer.save(estado=BloqueoAgenda.Estado.PENDIENTE, aprobado_por=None, aprobado_en=None)
            return
        serializer.save()

    def perform_destroy(self, instance):
        self._puede_modificar(instance)
        instance.delete()

    @action(detail=True, methods=["post"], url_path="aprobar")
    def aprobar(self, request, pk=None):
        bloqueo = self.get_object()
        if bloqueo.estado == BloqueoAgenda.Estado.APROBADO:
            return Response({"detail": "El bloqueo ya está aprobado."}, status=status.HTTP_400_BAD_REQUEST)
        # Mientras estuvo pendiente se pudieron agendar citas en ese horario: se
        # muestran antes de aprobar, como al crearlo (AG-11).
        self._avisar_citas_afectadas(
            {"profesional": bloqueo.profesional, "fecha_inicio": bloqueo.fecha_inicio, "fecha_fin": bloqueo.fecha_fin},
            bloqueo.sede, bloqueo.clinica or getattr(bloqueo.sede, "clinica", None),
        )
        bloqueo.estado = BloqueoAgenda.Estado.APROBADO
        bloqueo.aprobado_por = request.user
        bloqueo.aprobado_en = timezone.now()
        bloqueo.save(update_fields=["estado", "aprobado_por", "aprobado_en", "updated_at"])
        return Response(BloqueoAgendaSerializer(bloqueo, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="rechazar")
    def rechazar(self, request, pk=None):
        bloqueo = self.get_object()
        if bloqueo.estado == BloqueoAgenda.Estado.RECHAZADO:
            return Response({"detail": "El bloqueo ya está rechazado."}, status=status.HTTP_400_BAD_REQUEST)
        bloqueo.estado = BloqueoAgenda.Estado.RECHAZADO
        bloqueo.aprobado_por = request.user
        bloqueo.aprobado_en = timezone.now()
        bloqueo.save(update_fields=["estado", "aprobado_por", "aprobado_en", "updated_at"])
        return Response(BloqueoAgendaSerializer(bloqueo, context={"request": request}).data)
