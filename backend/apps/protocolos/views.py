import requests
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
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
from apps.users.permissions import IsAdmin, IsAdminOrProfesional, RequireAnyPermission


PERMISOS_VER_TRATAMIENTOS = ("pacientes.ver", "agenda.citas.ver", "historia.ver")


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
            # Lo usan la ficha del paciente, la agenda (sesiones por agendar) y la
            # atención: basta con ver cualquiera de esas pantallas (M4-28).
            return [RequireAnyPermission(*PERMISOS_VER_TRATAMIENTOS)()]
        if self.action == "destroy":
            return [IsAdmin()]
        # Crear o editar un tratamiento: quien agenda o quien atiende. Antes
        # IsAdminOrRecepcion dejaba pasar a cualquier rol personalizado (todos
        # guardan "recepcion" como rol fijo), aunque solo viera la agenda.
        return [RequireAnyPermission("agenda.citas.crear", "historia.notas.crear")()]

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
        if self.action in {"marcar_completado", "marcar_completada", "marcar_inasistencia"}:
            return [IsAdminOrProfesional()]
        # Consentimientos de la sesión, check-in y OTP: los usa la llegada del
        # paciente (agenda) y la atención (M4-28).
        return [RequireAnyPermission(*PERMISOS_VER_TRATAMIENTOS)()]

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
    @transaction.atomic
    def marcar_completado(self, request, pk=None):
        sesion = self.get_object()
        # Con la fila bloqueada y una sola vez: repetirlo pisaba la fecha, el
        # profesional y los procedimientos de una sesión ya cerrada (AT-20).
        sesion = SesionProcedimiento.objects.select_for_update().get(pk=sesion.pk)
        if sesion.estado == SesionProcedimiento.Estado.COMPLETADO:
            raise ValidationError({"error": "La sesión ya está completada.", "code": "SESION_COMPLETADA"})
        cita = None
        profesional = None
        cita_id = request.data.get("cita_id") or request.data.get("cita")
        profesional_id = request.data.get("profesional_id")
        if cita_id:
            cita_qs = Cita.objects.all()
            if request.user.rol != "superadmin":
                cita_qs = cita_qs.filter(sede__clinica=request.user.clinica)
            cita = get_object_or_404(cita_qs, id=cita_id)
            if cita.paciente_id != sesion.tratamiento.paciente_id:
                raise ValidationError({"cita_id": "La cita es de otro paciente.", "code": "CITA_DE_OTRO_PACIENTE"})
        if profesional_id:
            profesional_qs = User.objects.all()
            if request.user.rol != "superadmin":
                profesional_qs = profesional_qs.filter(clinica=request.user.clinica)
            profesional = get_object_or_404(profesional_qs, id=profesional_id)
        elif getattr(request.user, "es_profesional", False):
            profesional = request.user
        else:
            # Lo completa un admin u otro rol en nombre del profesional: se conserva
            # el de la cita o el que ya tenía la sesión (antes quedaba en blanco).
            profesional = (
                (cita.profesional if cita else None)
                or (sesion.cita.profesional if sesion.cita_id else None)
                or sesion.profesional
            )
        try:
            sesion = marcar_sesion_completada(
                sesion,
                cita=cita,
                profesional=profesional,
                observaciones=request.data.get("observaciones", ""),
                fecha=request.data.get("fecha"),
                hora=request.data.get("hora"),
                procedimientos_ejecutados=self._procedimientos_de_la_clinica(
                    request, request.data.get("procedimientos_ejecutados", []),
                ),
                forzar_sin_consentimiento=bool(request.data.get("forzar_sin_consentimiento")),
                motivo=request.data.get("motivo", ""),
            )
        except ProtocolosError as exc:
            return Response({"error": str(exc), "code": exc.code, **exc.extra}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(sesion).data, status=status.HTTP_200_OK)

    @staticmethod
    def _procedimientos_de_la_clinica(request, ids):
        """Los procedimientos ejecutados tienen que ser del catálogo de la clínica (AT-20)."""
        from django.core.exceptions import ValidationError as DjangoValidationError

        from apps.clinicas.models import Servicio

        if not ids:
            return []
        procedimientos = Servicio.objects.filter(id__in=ids)
        if request.user.rol != "superadmin":
            procedimientos = procedimientos.filter(clinica=request.user.clinica)
        try:
            procedimientos = list(procedimientos)
        except (DjangoValidationError, ValueError, TypeError):
            procedimientos = []
        if len(procedimientos) != len(set(map(str, ids))):
            raise ValidationError({
                "procedimientos_ejecutados": "Hay procedimientos que no son del catálogo de la clínica.",
            })
        return procedimientos

    @action(detail=True, methods=["post"], url_path="marcar_completada")
    def marcar_completada(self, request, pk=None):
        return self.marcar_completado(request, pk=pk)

    @action(detail=True, methods=["post"], url_path="marcar_inasistencia")
    def marcar_inasistencia(self, request, pk=None):
        sesion = self.get_object()
        # Una sesión ya completada no se convierte en inasistencia (M4-28).
        if sesion.estado == SesionProcedimiento.Estado.COMPLETADO:
            raise ValidationError({"error": "La sesión ya está completada.", "code": "SESION_COMPLETADA"})
        sesion.estado = SesionProcedimiento.Estado.INASISTENCIA
        sesion.observaciones = request.data.get("observaciones", sesion.observaciones)
        sesion.save(update_fields=["estado", "observaciones", "updated_at"])
        return Response(self.get_serializer(sesion).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="consentimientos")
    def consentimientos(self, request, pk=None):
        sesion = self.get_object()
        cita_id = request.query_params.get("cita_id")
        return Response(consentimiento_status_sesion(sesion, cita_id=cita_id), status=status.HTTP_200_OK)

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
