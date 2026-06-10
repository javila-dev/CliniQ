import logging
from uuid import UUID

from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.clinicas.models import (
    Clinica,
    PasoProtocolo,
    Sede,
    Servicio,
    ServicioConsentimiento,
    TipoSesion,
    TipoSesionProcedimiento,
    TratamientoCatalogo,
    TratamientoProcedimiento,
)
from apps.clinicas.serializers import (
    ClinicaRecordatorioConfigSerializer,
    ClinicaSerializer,
    ClinicaSlotIntervalSerializer,
    MiClinicaSerializer,
    PasoProtocoloSerializer,
    ProcedimientoSerializer,
    SedeSerializer,
    ServicioSerializer,
    ServicioConsentimientoSerializer,
    TipoSesionSerializer,
    TratamientoCatalogoSerializer,
    sede_tiene_citas,
)
from apps.configuracion.models import DocumensoConsentimientoTemplate
from apps.core.storage import delete_public_file, get_public_url, upload_public_file
from apps.users.permissions import HasClinicamente, RequirePermission


logger = logging.getLogger(__name__)


class ClinicaViewSet(ModelViewSet):
    serializer_class = ClinicaSerializer
    http_method_names = ["get", "patch", "post", "delete", "head", "options"]
    search_fields = ("nombre", "nit")
    ordering_fields = ("nombre", "created_at")
    queryset = Clinica.objects.prefetch_related("sedes").all().order_by("nombre")

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol == "superadmin":
            return queryset
        if user.clinica_id:
            return queryset.filter(id=user.clinica_id)
        return queryset.none()

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed("POST")

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed("DELETE")

    def get_permissions(self):
        if self.action in {"partial_update", "update", "slot_interval", "recordatorio_config", "mi_clinica_logo", "clinica_logo"}:
            permission_classes = (RequirePermission("clinicas.editar"),)
        else:
            permission_classes = (RequirePermission("clinicas.ver"),)
        return [permission() for permission in permission_classes]

    def get_serializer_class(self):
        if self.action == "slot_interval":
            return ClinicaSlotIntervalSerializer
        if self.action == "recordatorio_config":
            return ClinicaRecordatorioConfigSerializer
        if self.action == "mi_clinica":
            return MiClinicaSerializer
        return super().get_serializer_class()

    def _get_request_clinica(self):
        user = self.request.user
        if user.rol == "superadmin":
            clinica_id = self.request.query_params.get("clinica_id") or self.request.data.get("clinica_id")
            if clinica_id:
                return get_object_or_404(Clinica.objects.prefetch_related("sedes"), id=clinica_id)
            if user.clinica_id:
                return get_object_or_404(Clinica.objects.prefetch_related("sedes"), id=user.clinica_id)
            raise ValidationError({"error": "Debes indicar clinica_id para esta operacion.", "code": "CLINICA_REQUERIDA"})
        if user.clinica_id:
            return get_object_or_404(Clinica.objects.prefetch_related("sedes"), id=user.clinica_id)
        raise ValidationError({"error": "El usuario no tiene una clinica asociada.", "code": "CLINICA_NO_ASIGNADA"})

    @action(detail=True, methods=["get", "patch"], url_path="slot_interval")
    def slot_interval(self, request, pk=None):
        clinica = self.get_object()
        if request.method.lower() == "patch":
            serializer = self.get_serializer(clinica, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
        else:
            serializer = self.get_serializer(clinica)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "patch"], url_path="recordatorio_config")
    def recordatorio_config(self, request, pk=None):
        clinica = self.get_object()
        if request.method.lower() == "patch":
            serializer = self.get_serializer(clinica, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
        else:
            serializer = self.get_serializer(clinica)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def mi_clinica(self, request):
        clinica = self._get_request_clinica()
        serializer = self.get_serializer(clinica)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def _save_or_delete_logo(self, request, clinica):
        if request.method.lower() == "post":
            logo = request.FILES.get("logo")
            if logo is None:
                raise ValidationError({"logo": "Debes adjuntar un archivo en el campo logo."})
            if logo.content_type not in {"image/png", "image/jpeg", "image/jpg"}:
                raise ValidationError({"logo": "Solo se permiten archivos PNG o JPG."})
            previous_path = clinica.logo.name if clinica.logo else ""
            path = clinica.logo.field.generate_filename(clinica, logo.name)
            upload_public_file(logo.read(), path, logo.content_type or "application/octet-stream")
            clinica.logo = path
            clinica.save(update_fields=["logo", "updated_at"])
            if previous_path and previous_path != path:
                delete_public_file(previous_path)
            return Response({"logo_url": get_public_url(path)}, status=status.HTTP_200_OK)

        if clinica.logo:
            delete_public_file(clinica.logo.name)
            clinica.logo = None
            clinica.save(update_fields=["logo", "updated_at"])
        return Response({"logo_url": None}, status=status.HTTP_200_OK)

    def mi_clinica_logo(self, request):
        clinica = self._get_request_clinica()
        return self._save_or_delete_logo(request, clinica)

    def clinica_logo(self, request, pk=None):
        clinica = self.get_object()
        return self._save_or_delete_logo(request, clinica)


class SedeViewSet(HasClinicamente, ModelViewSet):
    serializer_class = SedeSerializer
    search_fields = ("nombre", "ciudad", "direccion")
    ordering_fields = ("nombre", "ciudad", "created_at")
    queryset = Sede.objects.select_related("clinica").all().order_by("nombre")

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update"}:
            permission_classes = (RequirePermission("sedes.gestionar"),)
        elif self.action == "destroy":
            permission_classes = (RequirePermission("sedes.eliminar"),)
        else:
            permission_classes = (RequirePermission("sedes.ver"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        activa = self.request.query_params.get("activa")
        ciudad = self.request.query_params.get("ciudad")
        clinica = self.request.query_params.get("clinica")

        if activa is not None:
            queryset = queryset.filter(activo=activa.lower() == "true")
        if ciudad:
            queryset = queryset.filter(ciudad__iexact=ciudad)
        if clinica and self.request.user.rol == "superadmin":
            queryset = queryset.filter(clinica_id=clinica)
        return queryset

    def perform_destroy(self, instance):
        if sede_tiene_citas(instance):
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"error": "No se puede eliminar una sede con citas asociadas."})
        instance.delete()


class ClinicaWriteMixin:
    def _get_write_clinica(self):
        clinica_header = self.request.headers.get("X-Clinica-Id", "").strip()
        clinica_id = clinica_header or self.request.data.get("clinica")
        user = self.request.user

        if clinica_id:
            clinica = get_object_or_404(Clinica, id=clinica_id)
            if user.rol != "superadmin" and str(clinica.id) != str(user.clinica_id):
                raise ValidationError({"clinica": "No tienes permiso para asignar recursos a esta clinica."})
            return clinica

        if getattr(user, "clinica_id", None):
            return get_object_or_404(Clinica, id=user.clinica_id)

        raise ValidationError(
            {
                "clinica": "Debes enviar X-Clinica-Id para esta operacion.",
                "code": "CLINICA_REQUERIDA",
            }
        )


class ServicioViewSet(ClinicaWriteMixin, HasClinicamente, ModelViewSet):
    serializer_class = ServicioSerializer
    search_fields = ("nombre", "descripcion")
    ordering_fields = ("nombre", "precio", "duracion_min", "created_at")
    queryset = Servicio.objects.select_related("clinica").prefetch_related(
        Prefetch(
            "pasos_protocolo",
            queryset=PasoProtocolo.objects.filter(activo=True).order_by("orden"),
            to_attr="_pasos_protocolo_prefetched",
        ),
        Prefetch(
            "consentimientos_requeridos_set",
            queryset=ServicioConsentimiento.objects.filter(activo=True).select_related("template").order_by("orden"),
            to_attr="_consentimientos_requeridos_prefetched",
        ),
    ).all().order_by("nombre")

    def get_permissions(self):
        if self.action in {
            "create",
            "update",
            "partial_update",
            "destroy",
            "eliminar_consentimiento",
            "reordenar_consentimientos",
            "paso_detalle",
            "reordenar_pasos",
        }:
            permission_classes = (RequirePermission("servicios.gestionar"),)
        elif self.action in {"consentimientos", "pasos"} and self.request.method.lower() == "post":
            permission_classes = (RequirePermission("servicios.gestionar"),)
        else:
            permission_classes = (RequirePermission("servicios.ver"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        activo = self.request.query_params.get("activo")
        clinica = self.request.query_params.get("clinica")
        tiene_protocolo = self.request.query_params.get("tiene_protocolo")

        if activo is not None:
            queryset = queryset.filter(activo=activo.lower() == "true")
        if clinica and self.request.user.rol == "superadmin":
            queryset = queryset.filter(clinica_id=clinica)
        if tiene_protocolo is not None:
            queryset = queryset.filter(tiene_protocolo=tiene_protocolo.lower() == "true")
        return queryset

    def _debug_validation_error(self, request, serializer, *, instance=None):
        logger.warning(
            "Servicio validation failed path=%s method=%s user_id=%s role=%s instance_id=%s payload=%s errors=%s",
            request.path,
            request.method,
            getattr(request.user, "id", None),
            getattr(request.user, "rol", None),
            getattr(instance, "id", None) if instance is not None else None,
            request.data,
            serializer.errors,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            self._debug_validation_error(request, serializer)
            raise ValidationError(serializer.errors)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if not serializer.is_valid():
            self._debug_validation_error(request, serializer, instance=instance)
            raise ValidationError(serializer.errors)
        self.perform_update(serializer)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(clinica=self._get_write_clinica())

    def _parse_template_uuid(self, raw_template_id):
        try:
            return UUID(str(raw_template_id))
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValidationError(
                {
                    "template_id": (
                        "Debes enviar el UUID del template configurado en la clinica. "
                        "No uses el id numerico de Documenso."
                    )
                }
            ) from exc

    def _resolve_consentimiento_template(self, servicio, *, template_id=None, template_token=None, tipo=None):
        queryset = DocumensoConsentimientoTemplate.objects.filter(clinica_id=servicio.clinica_id, activo=True)

        if template_id not in (None, ""):
            parsed_template_id = self._parse_template_uuid(template_id)
            template = queryset.filter(id=parsed_template_id).first()
            if template is None:
                raise ValidationError({"template_id": "No existe un template activo configurado con ese id para la clinica."})
            return template

        if template_token:
            template = queryset.filter(template_token=template_token).first()
            if template is None:
                raise ValidationError({"template_token": "No existe un template activo configurado con ese token para la clinica."})
            return template

        if tipo:
            templates = list(queryset.filter(tipo=tipo).order_by("-updated_at", "-created_at")[:2])
            if not templates:
                raise ValidationError({"tipo": "No existe un template activo configurado con ese tipo para la clinica."})
            if len(templates) > 1:
                raise ValidationError(
                    {"tipo": "Hay multiples templates activos con ese tipo. Usa template_id o template_token."}
                )
            return templates[0]

        raise ValidationError(
            {
                "template_id": (
                    "Debes enviar template_id, template_token o tipo para asociar el consentimiento requerido."
                )
            }
        )

    @action(detail=False, methods=["get"], url_path="activos", pagination_class=None)
    def activos(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset().filter(activo=True))
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"], url_path="consentimientos")
    def consentimientos(self, request, pk=None):
        servicio = self.get_object()
        if request.method.lower() == "get":
            relaciones = servicio.consentimientos_requeridos_set.select_related("template").filter(activo=True).order_by("orden")
            return Response(ServicioConsentimientoSerializer(relaciones, many=True).data, status=status.HTTP_200_OK)

        template_id = request.data.get("template_id") or request.data.get("template")
        template_token = request.data.get("template_token")
        tipo = request.data.get("tipo")
        orden = request.data.get("orden") or servicio.consentimientos_requeridos_set.filter(activo=True).count() + 1
        logger.warning(
            "DEBUG procedimiento consentimiento POST | user_id=%s servicio_id=%s clinica_id=%s payload=%s template_id=%s template_token=%s tipo=%s orden=%s",
            getattr(request.user, "id", None),
            servicio.id,
            servicio.clinica_id,
            request.data,
            template_id,
            template_token,
            tipo,
            orden,
        )
        try:
            template = self._resolve_consentimiento_template(
                servicio,
                template_id=template_id,
                template_token=template_token,
                tipo=tipo,
            )
        except ValidationError as exc:
            logger.warning(
                "DEBUG procedimiento consentimiento 400 | user_id=%s servicio_id=%s clinica_id=%s payload=%s errors=%s",
                getattr(request.user, "id", None),
                servicio.id,
                servicio.clinica_id,
                request.data,
                exc.detail,
            )
            raise
        relacion, created = ServicioConsentimiento.objects.get_or_create(
            servicio=servicio,
            template=template,
            defaults={"orden": orden},
        )
        if not created:
            if not relacion.activo:
                relacion.activo = True
            relacion.orden = orden
            relacion.save(update_fields=["activo", "orden", "updated_at"])
        logger.warning(
            "DEBUG procedimiento consentimiento OK | user_id=%s servicio_id=%s relacion_id=%s template_uuid=%s template_token=%s created=%s orden=%s activo=%s",
            getattr(request.user, "id", None),
            servicio.id,
            relacion.id,
            relacion.template_id,
            relacion.template.template_token,
            created,
            relacion.orden,
            relacion.activo,
        )
        return Response(ServicioConsentimientoSerializer(relacion).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=["delete"], url_path=r"consentimientos/(?P<template_id>[^/.]+)")
    def eliminar_consentimiento(self, request, pk=None, template_id=None):
        servicio = self.get_object()
        parsed_template_id = self._parse_template_uuid(template_id)
        relacion = get_object_or_404(
            ServicioConsentimiento.objects.filter(servicio=servicio, template_id=parsed_template_id, activo=True)
        )
        relacion.activo = False
        relacion.save(update_fields=["activo", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="consentimientos/reordenar")
    def reordenar_consentimientos(self, request, pk=None):
        servicio = self.get_object()
        items = request.data if isinstance(request.data, list) else request.data.get("items", [])
        if not isinstance(items, list):
            raise ValidationError({"items": "Debe ser una lista."})
        with transaction.atomic():
            for item in items:
                template_id = item.get("template_id") or item.get("template")
                template_token = item.get("template_token")
                tipo = item.get("tipo")
                orden = item.get("orden")
                if orden in (None, ""):
                    raise ValidationError({"error": "Cada item debe incluir orden."})
                template = self._resolve_consentimiento_template(
                    servicio,
                    template_id=template_id,
                    template_token=template_token,
                    tipo=tipo,
                )
                updated = ServicioConsentimiento.objects.filter(
                    servicio=servicio,
                    template=template,
                    activo=True,
                ).update(orden=orden)
                if not updated:
                    identificador = template_id or template_token or tipo
                    raise ValidationError({"error": f"No existe template asociado: {identificador}"})
        return Response({"ok": True}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"], url_path="pasos")
    def pasos(self, request, pk=None):
        servicio = self.get_object()
        if request.method.lower() == "get":
            pasos = servicio.pasos_protocolo.filter(activo=True).order_by("orden")
            return Response(PasoProtocoloSerializer(pasos, many=True).data, status=status.HTTP_200_OK)

        serializer = PasoProtocoloSerializer(data={**request.data, "servicio": str(servicio.id)})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch", "delete"], url_path=r"pasos/(?P<paso_id>[^/.]+)")
    def paso_detalle(self, request, pk=None, paso_id=None):
        servicio = self.get_object()
        paso = get_object_or_404(PasoProtocolo.objects.filter(servicio=servicio), id=paso_id)
        if request.method.lower() == "patch":
            serializer = PasoProtocoloSerializer(paso, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)

        if paso.sesiones_protocolo.exclude(estado="pendiente").exists():
            raise ValidationError({"error": "No se puede desactivar un paso con sesiones ya ejecutadas o inasistidas."})
        paso.activo = False
        paso.save(update_fields=["activo", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="pasos/reordenar")
    def reordenar_pasos(self, request, pk=None):
        servicio = self.get_object()
        items = request.data if isinstance(request.data, list) else request.data.get("items", [])
        if not isinstance(items, list):
            raise ValidationError({"items": "Debe ser una lista."})
        with transaction.atomic():
            offset = servicio.pasos_protocolo.count() + len(items) + 100
            for item in items:
                paso_id = item.get("id")
                if not paso_id:
                    raise ValidationError({"error": "Cada item debe incluir id y orden."})
                updated = PasoProtocolo.objects.filter(servicio=servicio, id=paso_id).update(
                    orden=item.get("orden", 0) + offset
                )
                if not updated:
                    raise ValidationError({"error": f"No existe paso: {paso_id}"})
            for item in items:
                paso_id = item.get("id")
                orden = item.get("orden")
                if not paso_id or not orden:
                    raise ValidationError({"error": "Cada item debe incluir id y orden."})
                updated = PasoProtocolo.objects.filter(servicio=servicio, id=paso_id).update(orden=orden)
                if not updated:
                    raise ValidationError({"error": f"No existe paso: {paso_id}"})
        return Response({"ok": True}, status=status.HTTP_200_OK)


class ProcedimientoViewSet(ServicioViewSet):
    serializer_class = ProcedimientoSerializer


class TratamientoCatalogoViewSet(ClinicaWriteMixin, HasClinicamente, ModelViewSet):
    serializer_class = TratamientoCatalogoSerializer
    search_fields = ("nombre", "descripcion")
    ordering_fields = ("nombre", "precio_estimado", "created_at")
    queryset = TratamientoCatalogo.objects.select_related("clinica").prefetch_related(
        Prefetch(
            "tipos_sesion",
            queryset=TipoSesion.objects.filter(activo=True).prefetch_related(
                Prefetch(
                    "procedimientos",
                    queryset=TipoSesionProcedimiento.objects.filter(activo=True)
                    .select_related("procedimiento")
                    .order_by("orden"),
                )
            ).order_by("orden"),
        )
    ).all().order_by("nombre")

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy", "agregar_tipo", "editar_tipo", "eliminar_tipo"}:
            permission_classes = (RequirePermission("servicios.gestionar"),)
        else:
            permission_classes = (RequirePermission("servicios.ver"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        activo = self.request.query_params.get("activo")
        clinica = self.request.query_params.get("clinica")
        if activo is not None:
            queryset = queryset.filter(activo=activo.lower() == "true")
        if clinica and self.request.user.rol == "superadmin":
            queryset = queryset.filter(clinica_id=clinica)
        return queryset

    def _debug_request(self, request, *, instance=None):
        logger.warning(
            "DEBUG tratamiento catalogo request | path=%s method=%s user_id=%s role=%s instance_id=%s payload=%s",
            request.path,
            request.method,
            getattr(request.user, "id", None),
            getattr(request.user, "rol", None),
            getattr(instance, "id", None) if instance is not None else None,
            request.data,
        )

    def _debug_validation_error(self, request, errors, *, instance=None):
        logger.warning(
            "DEBUG tratamiento catalogo 400 | path=%s method=%s user_id=%s role=%s instance_id=%s payload=%s errors=%s",
            request.path,
            request.method,
            getattr(request.user, "id", None),
            getattr(request.user, "rol", None),
            getattr(instance, "id", None) if instance is not None else None,
            request.data,
            errors,
        )

    def create(self, request, *args, **kwargs):
        self._debug_request(request)
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            self._debug_validation_error(request, serializer.errors)
            raise ValidationError(serializer.errors)
        try:
            self.perform_create(serializer)
        except ValidationError as exc:
            self._debug_validation_error(request, exc.detail)
            raise
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        serializer.save(clinica=self._get_write_clinica())

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        self._debug_request(request, instance=instance)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if not serializer.is_valid():
            self._debug_validation_error(request, serializer.errors, instance=instance)
            raise ValidationError(serializer.errors)
        try:
            self.perform_update(serializer)
        except ValidationError as exc:
            self._debug_validation_error(request, exc.detail, instance=instance)
            raise
        return Response(serializer.data, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        instance.activo = False
        instance.save(update_fields=["activo", "updated_at"])

    @action(detail=False, methods=["get"], url_path="activos", pagination_class=None)
    def activos(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset().filter(activo=True))
        payload = [
            {
                "id": str(tratamiento.id),
                "nombre": tratamiento.nombre,
                "precio_estimado": tratamiento.precio_estimado,
                "total_sesiones": tratamiento.total_sesiones,
            }
            for tratamiento in queryset
        ]
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="tipos")
    def agregar_tipo(self, request, pk=None):
        tratamiento = self.get_object()
        serializer = TipoSesionSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        tipo = serializer.save(tratamiento=tratamiento)
        return Response(TipoSesionSerializer(tipo).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path=r"tipos/(?P<tipo_id>[^/.]+)")
    def editar_tipo(self, request, pk=None, tipo_id=None):
        tratamiento = self.get_object()
        tipo = get_object_or_404(TipoSesion.objects.filter(tratamiento=tratamiento, activo=True), id=tipo_id)
        serializer = TipoSesionSerializer(tipo, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(TipoSesionSerializer(tipo).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["delete"], url_path=r"tipos/(?P<tipo_id>[^/.]+)")
    def eliminar_tipo(self, request, pk=None, tipo_id=None):
        tratamiento = self.get_object()
        tipo = get_object_or_404(TipoSesion.objects.filter(tratamiento=tratamiento, activo=True), id=tipo_id)
        tipo.activo = False
        tipo.save(update_fields=["activo", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
