import base64
import logging

import requests
from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.core.files.storage import default_storage
from django.db.models import Count
from django.db.models import Q
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import mixins, serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet, ModelViewSet, ReadOnlyModelViewSet
from weasyprint import HTML

from apps.historia_clinica.models import (
    ConsentimientoInformado,
    FotoClinica,
    HistoriaClinica,
    NotaClinica,
    OrdenMedica,
    PlantillaOrden,
    ResultadoExamen,
    SignosVitales,
)
from apps.historia_clinica.serializers import (
    ConsentimientoInformadoSerializer,
    FotoClinicaSerializer,
    HistoriaClinicaDetalleSerializer,
    HistoriaClinicaResumenSerializer,
    NotaClinicaSerializer,
    NotaClinicaUpdateSerializer,
    OrdenMedicaSerializer,
    PlantillaOrdenSerializer,
    ResultadoExamenSerializer,
    SignosVitalesSerializer,
    generar_url_firmada_storage,
)
from apps.historia_clinica.services import (
    DocumensoIntegrationError,
    descargar_pdf_documenso,
    guardar_pdf_firmado,
    iniciar_firma_consentimiento,
    marcar_consentimiento_firmado,
)
from apps.core.storage import read_public_file
from apps.notificaciones.services import enviar_documento_whatsapp_webhook
from apps.users.authorization import user_is_tenant_admin
from apps.users.permissions import IsAdmin, RequirePermission


logger = logging.getLogger(__name__)


def user_can_manage_order_templates(user) -> bool:
    if user_is_tenant_admin(user):
        return True
    rol_dinamico = getattr(user, "rol_dinamico", None)
    return bool(rol_dinamico and rol_dinamico.slug == "coordinador")


def _imagen_b64(path: str) -> str | None:
    if not path:
        return None
    data = read_public_file(path)
    if not data:
        return None
    return base64.b64encode(data).decode()


def _edad_detallada(fecha_nac, referencia=None) -> str:
    referencia = referencia or timezone.localdate()
    delta = relativedelta(referencia, fecha_nac)
    return f"{delta.years} años {delta.months} meses {delta.days} días"


def build_orden_pdf_context(orden: OrdenMedica) -> dict:
    clinica = orden.historia.clinica
    paciente = orden.historia.paciente
    profesional = orden.profesional
    sede = orden.cita.sede if orden.cita_id else None
    fecha_local = timezone.localtime(orden.created_at)

    dx_nombre = (orden.plantilla_origen.nombre if orden.plantilla_origen_id else "ORDEN MÉDICA").upper()

    sede_info = ""
    if sede:
        sede_info = f"{sede.direccion} | {sede.ciudad}"
    elif clinica.sedes.filter(activo=True).exists():
        primera = clinica.sedes.filter(activo=True).order_by("created_at").first()
        sede_info = f"{primera.direccion} | {primera.ciudad}" if primera else ""

    logo_b64 = _imagen_b64(clinica.logo.name if clinica.logo else "")
    firma_b64 = None
    if profesional and profesional.firma_digital:
        firma_b64 = _imagen_b64(profesional.firma_digital.name)

    tipo_doc_display = dict(paciente.TipoDocumento.choices).get(paciente.tipo_documento, paciente.tipo_documento)
    sexo_display = dict(paciente.Sexo.choices).get(paciente.sexo, paciente.sexo)

    profesional_cc_line = ""
    profesional_tp = ""
    profesional_especialidades = ""
    if profesional:
        profesional_tp = getattr(profesional, "registro_profesional", "") or ""
        try:
            colaborador = profesional.colaborador
            cc = colaborador.numero_documento or ""
            if cc:
                profesional_cc_line = f"CC No. {cc}"
            especialidades = colaborador.especialidades.values_list("nombre", flat=True)
            profesional_especialidades = ", ".join(especialidades)
        except Exception:
            pass

    nombre_consulta = ""
    if orden.cita_id and orden.cita.servicio_nombre:
        nombre_consulta = orden.cita.servicio_nombre

    return {
        "dx_nombre": dx_nombre,
        "clinica_nombre": clinica.nombre,
        "sede_info": sede_info,
        "logo_b64": logo_b64,
        "firma_b64": firma_b64,
        "paciente_nombre_completo": paciente.nombre_completo,
        "paciente_nombres": paciente.nombres,
        "paciente_apellidos": paciente.apellidos,
        "paciente_tipo_doc": tipo_doc_display,
        "paciente_numero_doc": paciente.numero_documento,
        "paciente_fecha_nac": paciente.fecha_nacimiento.strftime("%d/%m/%Y"),
        "paciente_edad": _edad_detallada(paciente.fecha_nacimiento, fecha_local.date()),
        "paciente_sexo": sexo_display,
        "paciente_ciudad": paciente.ciudad,
        "paciente_direccion": paciente.direccion,
        "paciente_telefono": paciente.telefono,
        "fecha_atencion": fecha_local.strftime("%d/%m/%Y %H:%M:%S"),
        "nombre_consulta": nombre_consulta,
        "fecha_prescripcion": fecha_local.strftime("%d/%m/%Y %H:%M"),
        "contenido": orden.contenido,
        "profesional_nombre": profesional.nombre_completo if profesional else "",
        "profesional_cc_line": profesional_cc_line,
        "profesional_tp": profesional_tp,
        "profesional_especialidades": profesional_especialidades,
    }


def render_order_pdf(orden: OrdenMedica) -> bytes:
    context = build_orden_pdf_context(orden)
    html = render_to_string("historia_clinica/pdf_orden_medica.html", context)
    return HTML(string=html, base_url="/").write_pdf()


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


class HistoriaClinicaViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, GenericViewSet):
    serializer_class = HistoriaClinicaResumenSerializer
    queryset = HistoriaClinica.objects.select_related("paciente", "clinica").prefetch_related("notas").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(clinica=user.clinica)
        paciente_id = self.request.query_params.get("paciente")
        if paciente_id:
            queryset = queryset.filter(paciente_id=paciente_id)
        return queryset

    def get_permissions(self):
        return [RequirePermission("historia.ver")()]

    def get_serializer_class(self):
        if self.action in {"retrieve", "partial_update"}:
            return HistoriaClinicaDetalleSerializer
        return HistoriaClinicaResumenSerializer

    def partial_update(self, request, *args, **kwargs):
        # H26.4: motivo_consulta y plan_manejo ahora viven en NotaClinica, no en HistoriaClinica.
        rejected = [f for f in ("motivo_consulta", "plan_manejo") if f in request.data]
        if rejected:
            return Response(
                {
                    "error": "Estos campos ya no son editables en la historia. Usa PATCH /notas/{id}/ para actualizar la nota activa.",
                    "code": "CAMPOS_DEPRECADOS",
                    "campos": rejected,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=["get"], url_path="notas")
    def notas(self, request, pk=None):
        historia = self.get_object()
        notas = (
            historia.notas
            .select_related("firmada_por", "cita", "cita__profesional")
            .prefetch_related("fotos", "examenes", "ordenes")
            .all()
        )
        serializer = NotaClinicaSerializer(notas, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="galeria")
    def galeria(self, request, pk=None):
        historia = self.get_object()
        fotos = (
            FotoClinica.objects.filter(nota__historia=historia)
            .select_related("nota", "nota__cita", "nota__cita__servicio")
            .order_by("-created_at")
        )

        zona = request.query_params.get("zona")
        tipo = request.query_params.get("tipo")
        cita = request.query_params.get("cita")
        if zona:
            fotos = fotos.filter(zona__icontains=zona)
        if tipo:
            fotos = fotos.filter(tipo=tipo)
        if cita:
            fotos = fotos.filter(nota__cita_id=cita)

        por_tipo_qs = fotos.values("tipo").annotate(total=Count("id"))
        por_tipo = {item["tipo"]: item["total"] for item in por_tipo_qs}
        payload = []
        for foto in fotos:
            servicio_nombre = None
            if foto.nota.cita_id and foto.nota.cita.servicio_id:
                servicio_nombre = foto.nota.cita.servicio.nombre
            payload.append(
                {
                    "id": str(foto.id),
                    "nota": str(foto.nota_id),
                    "cita": str(foto.nota.cita_id) if foto.nota.cita_id else None,
                    "cita_fecha": foto.nota.cita.fecha_inicio if foto.nota.cita_id else None,
                    "servicio_nombre": servicio_nombre,
                    "tipo": foto.tipo,
                    "zona": foto.zona,
                    "descripcion": foto.descripcion,
                    "url_firmada": generar_url_firmada_storage(foto.archivo),
                    "created_at": foto.created_at,
                }
            )

        return Response(
            {
                "total": len(payload),
                "por_tipo": {
                    "antes": por_tipo.get(FotoClinica.TipoFoto.ANTES, 0),
                    "durante": por_tipo.get(FotoClinica.TipoFoto.DURANTE, 0),
                    "despues": por_tipo.get(FotoClinica.TipoFoto.DESPUES, 0),
                },
                "fotos": payload,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"], url_path="evolucion-signos")
    def evolucion_signos(self, request, pk=None):
        historia = self.get_object()
        signos = historia.signos_vitales.order_by("created_at")
        campos_base = [
            "peso_kg",
            "altura_cm",
            "imc",
            "tension_sistolica",
            "tension_diastolica",
            "frecuencia_cardiaca",
            "frecuencia_respiratoria",
            "temperatura_c",
            "saturacion_oxigeno",
        ]
        campos = [
            campo
            for campo in campos_base
            if signos.exclude(**{f"{campo}__isnull": True}).exists()
        ]
        series = []
        for registro in signos:
            row = {"fecha": registro.created_at}
            for campo in campos:
                value = getattr(registro, campo)
                if value is not None:
                    row[campo] = float(value) if hasattr(value, "__float__") else value
            series.append(row)
        return Response({"campos": campos, "series": series}, status=status.HTTP_200_OK)


class NotaClinicaViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    GenericViewSet,
):
    serializer_class = NotaClinicaSerializer
    queryset = NotaClinica.objects.select_related(
        "historia",
        "historia__clinica",
        "firmada_por",
        "cita",
        "cita__profesional",
    ).prefetch_related("fotos", "examenes", "ordenes").all()
    http_method_names = ["get", "post", "patch"]

    def get_permissions(self):
        if self.action in {"create", "partial_update", "completar"}:
            permission_classes = (RequirePermission("historia.notas.crear"),)
        else:
            permission_classes = (RequirePermission("historia.ver"),)
        return [permission() for permission in permission_classes]

    def get_serializer_class(self):
        if self.action == "partial_update":
            return NotaClinicaUpdateSerializer
        return NotaClinicaSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(historia__clinica=user.clinica)
        historia_id = self.request.query_params.get("historia")
        if historia_id:
            queryset = queryset.filter(historia_id=historia_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(estado=NotaClinica.EstadoNota.BORRADOR)

    @action(detail=True, methods=["post"], url_path="completar")
    def completar(self, request, pk=None):
        nota = self.get_object()
        if nota.estado == NotaClinica.EstadoNota.COMPLETADA:
            return Response(
                {"error": "La nota ya está completada.", "code": "NOTA_YA_COMPLETADA"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        nota.estado = NotaClinica.EstadoNota.COMPLETADA
        nota.save(update_fields=["estado", "updated_at"])
        serializer = NotaClinicaSerializer(nota, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class SignosVitalesViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    GenericViewSet,
):
    serializer_class = SignosVitalesSerializer
    queryset = SignosVitales.objects.select_related(
        "historia",
        "historia__clinica",
        "cita",
        "registrado_por",
    ).all()
    http_method_names = ["get", "post", "delete"]

    def get_permissions(self):
        if self.action == "create":
            return [RequirePermission("historia.notas.crear")()]
        if self.action == "destroy":
            return [IsAdmin()]
        return [RequirePermission("historia.ver")()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(historia__clinica=user.clinica)
        historia_id = self.request.query_params.get("historia")
        if self.action == "list":
            if not historia_id:
                return queryset.none()
            queryset = queryset.filter(historia_id=historia_id)
        elif historia_id:
            queryset = queryset.filter(historia_id=historia_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user)


class FotoClinicaViewSet(mixins.CreateModelMixin, mixins.DestroyModelMixin, GenericViewSet):
    serializer_class = FotoClinicaSerializer
    queryset = FotoClinica.objects.select_related("nota", "nota__historia", "nota__historia__clinica").all()

    def get_permissions(self):
        if self.action == "destroy":
            permission_classes = (RequirePermission("historia.fotos.eliminar"),)
        else:
            permission_classes = (RequirePermission("historia.fotos.subir"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(nota__historia__clinica=user.clinica)
        return queryset

    def perform_create(self, serializer):
        nota = serializer.validated_data["nota"]
        user = self.request.user
        if user.rol == "profesional":
            if not nota.cita or nota.cita.profesional_id != user.id:
                raise serializers.ValidationError({"nota": "Solo puedes subir fotos a notas de tus propias citas."})
        serializer.save()


class ConsentimientoInformadoViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    GenericViewSet,
):
    serializer_class = ConsentimientoInformadoSerializer
    queryset = ConsentimientoInformado.objects.select_related("paciente", "clinica").all()
    http_method_names = ["get", "post", "patch", "delete"]

    def get_permissions(self):
        if self.action in {"list", "retrieve", "resumen"}:
            permission_classes = (RequirePermission("historia.ver"),)
        else:
            permission_classes = (RequirePermission("historia.consentimientos.gestionar"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(clinica=user.clinica)

        paciente_id = self.request.query_params.get("paciente")
        if self.action == "list":
            if not paciente_id:
                return queryset.none()
            queryset = queryset.filter(paciente_id=paciente_id)
        elif paciente_id:
            queryset = queryset.filter(paciente_id=paciente_id)
        return queryset.order_by("documenso_template_nombre", "tipo")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.firmado:
            return Response(
                {"error": "No se puede eliminar un consentimiento firmado", "code": "CONSENT_SIGNED"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _reusable_consentimiento(self, *, paciente_id: str, template_token: str):
        hoy = timezone.localdate()
        queryset = self.get_queryset().filter(
            paciente_id=paciente_id,
            documenso_template_token=template_token,
        )

        vigente = (
            queryset.filter(firmado=True)
            .filter(Q(fecha_vencimiento__isnull=True) | Q(fecha_vencimiento__gte=hoy))
            .order_by("-fecha_firma", "-created_at")
            .first()
        )
        if vigente:
            return vigente

        borrador_hoy = (
            queryset.filter(firmado=False, created_at__date=hoy)
            .order_by("-created_at")
            .first()
        )
        return borrador_hoy

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            paciente_id = request.data.get("paciente")
            template_token = request.data.get("documenso_template_token")
            logger.warning(
                "DEBUG consentimiento create 400 | user_id=%s payload=%s errors=%s",
                getattr(request.user, "id", None),
                request.data,
                serializer.errors,
            )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        paciente_id = serializer.validated_data["paciente"].id
        template_token = serializer.validated_data["documenso_template_token"]
        existing = self._reusable_consentimiento(
            paciente_id=str(paciente_id),
            template_token=template_token,
        )
        if existing:
            template_nombre = serializer.validated_data.get("documenso_template_nombre")
            notas = serializer.validated_data.get("notas")
            update_fields = []
            if template_nombre and existing.documenso_template_nombre != template_nombre:
                existing.documenso_template_nombre = template_nombre
                update_fields.append("documenso_template_nombre")
            if notas and not existing.notas:
                existing.notas = notas
                update_fields.append("notas")
            if update_fields:
                update_fields.append("updated_at")
                existing.save(update_fields=update_fields)
            response_serializer = self.get_serializer(existing)
            return Response(response_serializer.data, status=status.HTTP_200_OK)

        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=False, methods=["get"], url_path="resumen")
    def resumen(self, request, *args, **kwargs):
        paciente_id = request.query_params.get("paciente")
        if not paciente_id:
            return Response([], status=status.HTTP_200_OK)

        hoy = timezone.localdate()
        existentes_qs = self.get_queryset().filter(paciente_id=paciente_id)
        existentes = {
            item.documenso_template_token or f"legacy:{item.tipo}": item
            for item in existentes_qs
        }
        serializer_context = self.get_serializer_context()
        respuesta = [
            ConsentimientoInformadoSerializer(consentimiento, context=serializer_context).data
            for consentimiento in existentes_qs
        ]

        from apps.agenda.models import Cita

        citas_requeridas = Cita.objects.select_related("servicio").filter(
            paciente_id=paciente_id,
            estado__in=[Cita.Estado.PENDIENTE, Cita.Estado.CONFIRMADA],
            fecha_inicio__date__gte=hoy,
            servicio__consentimientos_requeridos__activo=True,
        ).distinct()

        if request.user.rol != "superadmin":
            citas_requeridas = citas_requeridas.filter(sede__clinica=request.user.clinica)

        for cita in citas_requeridas:
            for template in cita.servicio.consentimientos_requeridos.filter(activo=True):
                key = template.template_token
                if key in existentes:
                    continue
                respuesta.append(
                    {
                        "id": None,
                        "paciente": str(cita.paciente_id),
                        "tipo": template.tipo,
                        "documenso_template_token": template.template_token,
                        "documenso_template_nombre": template.get_tipo_display(),
                        "template_nombre": template.get_tipo_display(),
                        "firmado": False,
                        "vigente": False,
                        "fecha_firma": None,
                        "fecha_vencimiento": None,
                        "documenso_document_id": None,
                        "archivo": None,
                        "url_firmada": "",
                        "vigencia_meses": cita.servicio.vigencia_meses,
                        "notas": "",
                        "created_at": None,
                        "updated_at": None,
                    }
                )
                existentes[key] = True
        return Response(respuesta, status=status.HTTP_200_OK)

    @action(detail=True, methods=["patch"], url_path="completar_firma")
    def completar_firma(self, request, pk=None):
        consentimiento = self.get_object()
        documenso_document_id = request.data.get("documenso_document_id", "")

        if consentimiento.firmado:
            if documenso_document_id and consentimiento.documenso_document_id != documenso_document_id:
                consentimiento.documenso_document_id = documenso_document_id
                consentimiento.save(update_fields=["documenso_document_id", "updated_at"])
            return Response(self.get_serializer(consentimiento).data, status=status.HTTP_200_OK)

        marcar_consentimiento_firmado(
            consentimiento,
            documenso_document_id=documenso_document_id or None,
        )
        return Response(self.get_serializer(consentimiento).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="iniciar_firma")
    def iniciar_firma(self, request, pk=None):
        consentimiento = self.get_object()
        try:
            signing_token, document_id = iniciar_firma_consentimiento(consentimiento)
        except DocumensoIntegrationError as exc:
            return Response(
                {"error": str(exc), "code": "DOCUMENSO_ERROR"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                "signing_token": signing_token,
                "documenso_document_id": document_id,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="reintentar_pdf")
    def reintentar_pdf(self, request, pk=None):
        consentimiento = self.get_object()
        if not consentimiento.documenso_document_id:
            return Response(
                {"error": "El consentimiento no tiene un documento de Documenso asociado.", "code": "SIN_DOCUMENTO"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pdf_bytes = descargar_pdf_documenso(consentimiento.documenso_document_id)
        if not pdf_bytes:
            return Response(
                {"error": "No fue posible descargar el PDF desde Documenso.", "code": "DOCUMENSO_ERROR"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        guardar_pdf_firmado(
            consentimiento,
            pdf_bytes,
            filename=f"consentimiento-documenso-{consentimiento.id}.pdf",
        )
        return Response(self.get_serializer(consentimiento).data, status=status.HTTP_200_OK)


class ResultadoExamenViewSet(ModelViewSet):
    serializer_class = ResultadoExamenSerializer
    queryset = ResultadoExamen.objects.select_related("historia", "historia__clinica", "created_by").distinct()
    http_method_names = ["get", "post", "patch", "delete"]

    def get_permissions(self):
        if self.action in {"create", "partial_update", "destroy"}:
            return [RequirePermission("historia.notas.crear")()]
        return [RequirePermission("historia.ver")()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(historia__clinica=user.clinica)
        historia_id = self.request.query_params.get("historia")
        if self.action == "list":
            if not historia_id:
                return queryset.none()
            queryset = queryset.filter(historia_id=historia_id)
        elif historia_id:
            queryset = queryset.filter(historia_id=historia_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        if instance.archivo:
            default_storage.delete(instance.archivo.name)
        instance.delete()


class PlantillaOrdenViewSet(ModelViewSet):
    serializer_class = PlantillaOrdenSerializer
    queryset = PlantillaOrden.objects.select_related("clinica", "created_by").all()
    http_method_names = ["get", "post", "patch", "delete"]

    def get_permissions(self):
        if self.action in {"create", "partial_update", "destroy"}:
            return [RequirePermission("historia.ver")()]
        return [RequirePermission("historia.ver")()]

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action in {"create", "partial_update", "destroy"} and not user_can_manage_order_templates(request.user):
            self.permission_denied(request, message="Solo admin o coordinador pueden gestionar plantillas.")

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(clinica=user.clinica)
        if self.action == "list":
            activa = self.request.query_params.get("activa", "true")
            if activa.lower() in {"true", "1"}:
                queryset = queryset.filter(activa=True)
            elif activa.lower() in {"false", "0"}:
                queryset = queryset.filter(activa=False)
        return queryset.order_by("nombre", "-created_at")

    def perform_create(self, serializer):
        serializer.save(clinica=self.request.user.clinica, created_by=self.request.user)

    def perform_destroy(self, instance):
        instance.activa = False
        instance.save(update_fields=["activa", "updated_at"])


class OrdenMedicaViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, GenericViewSet):
    serializer_class = OrdenMedicaSerializer
    queryset = OrdenMedica.objects.select_related(
        "historia",
        "historia__paciente",
        "historia__clinica",
        "cita",
        "plantilla_origen",
        "profesional",
    ).prefetch_related("auditorias")
    http_method_names = ["get", "post"]

    def get_permissions(self):
        if self.action in {"create", "enviar_whatsapp"}:
            return [RequirePermission("historia.notas.crear")()]
        return [RequirePermission("historia.ver")()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(historia__clinica=user.clinica)
        historia_id = self.request.query_params.get("historia")
        queryset = queryset.filter(activo=True)
        if self.action == "list":
            if not historia_id:
                return queryset.none()
            queryset = queryset.filter(historia_id=historia_id)
        elif historia_id:
            queryset = queryset.filter(historia_id=historia_id)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except serializers.ValidationError as exc:
            return Response(normalize_error_response(exc.detail), status=status.HTTP_400_BAD_REQUEST)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        orden = self.get_object()
        pdf_bytes = render_order_pdf(orden)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="orden-medica-{orden.id}.pdf"'
        return response

    @action(detail=True, methods=["post"], url_path="enviar_whatsapp")
    def enviar_whatsapp(self, request, pk=None):
        orden = self.get_object()
        if not getattr(settings, "WHATSAPP_OUTBOUND_WEBHOOK_URL", "") and not settings.ORDEN_WEBHOOK_URL:
            return Response(
                {"error": "Webhook no configurado", "code": "WEBHOOK_NOT_CONFIGURED"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        pdf_bytes = render_order_pdf(orden)
        try:
            enviar_documento_whatsapp_webhook(
                paciente=orden.historia.paciente,
                tipo_notificacion="envio_formula",
                pdf_bytes=pdf_bytes,
                nombre_archivo_pdf=f"orden-medica-{orden.id}.pdf",
                metadata={
                    "orden_id": str(orden.id),
                    "historia_id": str(orden.historia_id),
                    "profesional_nombre": orden.profesional.nombre_completo if orden.profesional else "",
                    "fecha": timezone.localtime(orden.created_at).date().isoformat(),
                    "contenido": orden.contenido,
                },
            )
        except ValueError:
            return Response(
                {"error": "Webhook no configurado", "code": "WEBHOOK_NOT_CONFIGURED"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except requests.RequestException as exc:
            logger.exception("Fallo enviando orden médica %s al webhook: %s", orden.id, exc)
            return Response(
                {"error": "No se pudo contactar el webhook", "code": "WEBHOOK_ERROR"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"enviado": True}, status=status.HTTP_200_OK)
