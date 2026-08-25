import asyncio

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.agenda.models import Cita
from apps.clinicas.models import TratamientoCatalogo
from apps.pacientes import face_client, face_service
from apps.pacientes.carga_masiva import CargaMasivaError, procesar_carga_masiva_pacientes
from apps.pacientes.models import AntecedentePaciente, CheckIn, ConfiguracionFacial, Paciente
from apps.pacientes.serializers import (
    AntecedentePacienteSerializer,
    BusquedaPacienteSerializer,
    PacienteSerializer,
)
from apps.historia_clinica.models import ConsentimientoInformado
from apps.historia_clinica.serializers import ConsentimientoInformadoSerializer
from apps.protocolos.models import ConsentimientoPaciente
from apps.protocolos.serializers import ConsentimientoPacienteSerializer
from apps.users.permissions import HasClinicamente, RequirePermission, get_clinica_activa


class PacienteViewSet(HasClinicamente, ModelViewSet):
    serializer_class = PacienteSerializer
    queryset = Paciente.objects.select_related("clinica").all()
    search_fields = ("nombres", "apellidos", "numero_documento", "telefono", "email")
    ordering_fields = ("apellidos", "nombres", "created_at")

    def get_permissions(self):
        if self.action == "destroy":
            permission_classes = (RequirePermission("pacientes.eliminar"),)
        elif self.action in {"create", "carga_masiva"}:
            permission_classes = (RequirePermission("pacientes.crear"),)
        elif self.action in {"update", "partial_update"}:
            permission_classes = (RequirePermission("pacientes.editar"),)
        elif self.action == "antecedentes":
            if self.request.method == "GET":
                permission_classes = (RequirePermission("pacientes.antecedentes.ver"),)
            else:
                permission_classes = (RequirePermission("pacientes.antecedentes.editar"),)
        elif self.action in {"consentimientos", "subir_pdf_consentimiento", "verificar_consentimientos"}:
            permission_classes = (RequirePermission("pacientes.ver"),)
        elif self.action == "enrollment":
            permission_classes = (RequirePermission("pacientes.editar"),)
        elif self.action == "checkin":
            permission_classes = (RequirePermission("pacientes.ver"),)
        else:
            permission_classes = (RequirePermission("pacientes.ver"),)
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        activo = self.request.query_params.get("activo")
        sexo = self.request.query_params.get("sexo")
        canal_confirmacion = self.request.query_params.get("canal_confirmacion")
        tipo_documento = self.request.query_params.get("tipo_documento")

        if activo is not None:
            queryset = queryset.filter(activo=activo.lower() == "true")
        if sexo:
            queryset = queryset.filter(sexo=sexo)
        if canal_confirmacion:
            queryset = queryset.filter(canal_confirmacion=canal_confirmacion)
        if tipo_documento:
            queryset = queryset.filter(tipo_documento=tipo_documento)
        return queryset.order_by("apellidos", "nombres")

    def perform_create(self, serializer):
        clinica = serializer.validated_data.get("clinica") or get_clinica_activa(self.request)
        if clinica is None:
            raise ValidationError(
                {"clinica": "El usuario autenticado no tiene una clinica asociada."}
            )
        serializer.save(clinica=clinica)

    @action(detail=False, methods=["post"], url_path="carga_masiva", parser_classes=[MultiPartParser])
    def carga_masiva(self, request):
        archivo = request.FILES.get("archivo")
        if archivo is None:
            return Response({"error": "Se requiere el campo 'archivo'."}, status=status.HTTP_400_BAD_REQUEST)

        clinica = get_clinica_activa(request)
        if clinica is None:
            return Response(
                {"error": "El usuario autenticado no tiene una clinica asociada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            resultado = procesar_carga_masiva_pacientes(archivo, clinica=clinica, context={"request": request})
        except CargaMasivaError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(resultado, status=status.HTTP_200_OK)

    def _can_manage_antecedentes(self, paciente):
        user = self.request.user
        if user.rol in {"admin", "superadmin"}:
            return True
        if user.rol != "profesional":
            return False
        return Cita.objects.filter(
            paciente=paciente,
            profesional=user,
        ).exclude(estado=Cita.Estado.CANCELADA).exists()

    @action(detail=False, methods=["get"], url_path="buscar", pagination_class=None)
    def buscar(self, request, *args, **kwargs):
        query = request.query_params.get("q", "").strip()
        if len(query) < 3:
            return Response([], status=status.HTTP_200_OK)

        queryset = self.get_queryset().filter(
            Q(nombres__icontains=query)
            | Q(apellidos__icontains=query)
            | Q(numero_documento__icontains=query)
        )[:10]
        serializer = BusquedaPacienteSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "put", "patch"], url_path="antecedentes")
    def antecedentes(self, request, pk=None):
        paciente = self.get_object()
        if not self._can_manage_antecedentes(paciente):
            return Response({"error": "No autorizado.", "code": "FORBIDDEN"}, status=status.HTTP_403_FORBIDDEN)

        if request.method == "GET":
            try:
                antecedentes = paciente.antecedentes
            except AntecedentePaciente.DoesNotExist:
                return Response(
                    {"error": "Sin antecedentes registrados", "code": "NOT_FOUND"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            serializer = AntecedentePacienteSerializer(antecedentes)
            return Response(serializer.data, status=status.HTTP_200_OK)

        partial = request.method == "PATCH"
        try:
            instance = paciente.antecedentes
        except AntecedentePaciente.DoesNotExist:
            instance = None

        serializer = AntecedentePacienteSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        if request.method == "PUT":
            if instance is None:
                antecedentes = serializer.save(paciente=paciente)
            else:
                antecedentes = serializer.save()
        else:
            if instance is None:
                antecedentes = serializer.save(paciente=paciente)
            else:
                antecedentes = serializer.save()

        response_serializer = AntecedentePacienteSerializer(antecedentes)
        return Response(
            response_serializer.data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get", "post"], url_path="consentimientos")
    def consentimientos(self, request, pk=None):
        paciente = self.get_object()
        if request.method == "GET":
            # Consentimientos manuales (modelo legado)
            qs_manual = ConsentimientoPaciente.objects.filter(paciente=paciente).select_related("procedimiento")
            manual = ConsentimientoPacienteSerializer(qs_manual, many=True, context={"request": request}).data

            # Consentimientos Documenso (modelo nuevo) — solo los firmados
            qs_documenso = ConsentimientoInformado.objects.filter(
                paciente=paciente, firmado=True
            ).select_related("plantilla")
            serialized = ConsentimientoInformadoSerializer(
                qs_documenso, many=True, context={"request": request}
            ).data
            documenso = []
            for c_obj, c_data in zip(qs_documenso, serialized):
                documenso.append({
                    "id": str(c_obj.id),
                    "template_token": c_obj.documenso_template_token or "",
                    "template_nombre": c_data.get("template_nombre") or c_data.get("documenso_template_nombre") or "",
                    "procedimiento": None,
                    "procedimiento_nombre": None,
                    "fecha_firma": c_data.get("fecha_firma"),
                    "vigencia_hasta": c_data.get("fecha_vencimiento"),
                    "metodo": "documenso",
                    "archivo_url": c_data.get("archivo_url") or "",
                    "documenso_envelope_id": c_obj.documenso_document_id,
                    "notas": c_obj.notas,
                    "estado": c_data.get("vigente") and "vigente" or "vencido",
                    "created_at": c_data.get("created_at"),
                })

            return Response(list(manual) + documenso)

        serializer = ConsentimientoPacienteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save(paciente=paciente, registrado_por=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="consentimientos/verificar")
    def verificar_consentimientos(self, request, pk=None):
        paciente = self.get_object()
        tratamiento_id = request.query_params.get("tratamiento")
        if not tratamiento_id:
            raise ValidationError({"tratamiento": "Este query param es obligatorio."})
        tratamiento = get_object_or_404(TratamientoCatalogo, id=tratamiento_id)
        payload = []
        for tipo in tratamiento.tipos_sesion.filter(activo=True).order_by("orden"):
            for tp in tipo.procedimientos.filter(activo=True).select_related("procedimiento"):
                procedimiento = tp.procedimiento
                for relacion in procedimiento.consentimientos_requeridos_set.filter(activo=True).select_related("template"):
                    consentimiento = (
                        ConsentimientoPaciente.objects.filter(
                            paciente=paciente,
                            template_token=relacion.template.template_token,
                        )
                        .order_by("-fecha_firma", "-created_at")
                        .first()
                    )
                    if consentimiento is None:
                        estado = "faltante"
                    elif consentimiento.vigente:
                        estado = "vigente"
                    else:
                        estado = "vencido"
                    payload.append(
                        {
                            "template_nombre": relacion.template.get_tipo_display(),
                            "template_token": relacion.template.template_token,
                            "procedimiento": procedimiento.nombre,
                            "estado": estado,
                        }
                    )
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path=r"consentimientos/(?P<consentimiento_id>[^/.]+)/subir_pdf")
    def subir_pdf_consentimiento(self, request, pk=None, consentimiento_id=None):
        paciente = self.get_object()
        consentimiento = get_object_or_404(ConsentimientoPaciente, id=consentimiento_id, paciente=paciente)
        archivo = request.FILES.get("archivo")
        if archivo is None:
            raise ValidationError({"archivo": "Debes adjuntar un archivo."})
        consentimiento.archivo = archivo
        consentimiento.save(update_fields=["archivo", "updated_at"])
        return Response(ConsentimientoPacienteSerializer(consentimiento, context={"request": request}).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="enrollment",
        parser_classes=[MultiPartParser],
    )
    def enrollment(self, request, pk=None):
        paciente = self.get_object()

        if not paciente.clinica.facial_verificacion_habilitada:
            return Response(
                {"error": "El módulo de verificación facial no está habilitado para esta clínica.", "code": "FACIAL_NO_HABILITADO"},
                status=status.HTTP_403_FORBIDDEN,
            )

        foto = request.FILES.get("photo")
        if foto is None:
            return Response({"error": "Se requiere el campo 'photo'."}, status=status.HTTP_400_BAD_REQUEST)

        config, _ = ConfiguracionFacial.objects.get_or_create(clinica=paciente.clinica)

        try:
            resultado_raw = asyncio.run(face_client.validate_enrollment(foto.read(), foto.name, config=config))
        except Exception as exc:
            return Response(
                {"error": f"Error al contactar el servicio de reconocimiento facial: {exc}"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        evaluacion = face_service.evaluar_enrollment(config, resultado_raw)

        if not evaluacion["valid"]:
            return Response(
                {
                    "valid": False,
                    "errors": evaluacion["errors"],
                    "warnings": evaluacion["warnings"],
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        # Guardar foto en MinIO y embedding en el paciente
        foto.seek(0)
        paciente.foto_control = foto  # usa DEFAULT_FILE_STORAGE (MinIO)
        paciente.embedding_facial = evaluacion["embedding"]
        paciente.embedding_actualizado_en = timezone.now()
        paciente.save(update_fields=["foto_control", "embedding_facial", "embedding_actualizado_en", "updated_at"])  # foto_control → MinIO vía DEFAULT_FILE_STORAGE

        return Response(
            {
                "valid": True,
                "warnings": evaluacion["warnings"],
                "message": "Foto de control registrada correctamente.",
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="checkin",
        parser_classes=[MultiPartParser],
    )
    def checkin(self, request, pk=None):
        paciente = self.get_object()

        if not paciente.clinica.facial_verificacion_habilitada:
            return Response(
                {"error": "El módulo de verificación facial no está habilitado para esta clínica.", "code": "FACIAL_NO_HABILITADO"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if paciente.embedding_facial is None:
            return Response(
                {
                    "error": "El paciente no tiene foto de control registrada.",
                    "code": "ENROLLMENT_REQUIRED",
                },
                status=status.HTTP_428_PRECONDITION_REQUIRED,
            )

        foto = request.FILES.get("live_photo")
        if foto is None:
            return Response({"error": "Se requiere el campo 'live_photo'."}, status=status.HTTP_400_BAD_REQUEST)

        config, _ = ConfiguracionFacial.objects.get_or_create(clinica=paciente.clinica)

        try:
            resultado_raw = asyncio.run(
                face_client.verify(foto.read(), [float(x) for x in paciente.embedding_facial], config=config)
            )
        except Exception as exc:
            return Response(
                {"error": f"Error al contactar el servicio de reconocimiento facial: {exc}"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        resultado = face_service.evaluar_checkin(config, resultado_raw)

        cita_id = request.data.get("cita_id")
        cita = None
        if cita_id:
            cita = Cita.objects.filter(id=cita_id, paciente=paciente).first()

        foto.seek(0)
        checkin = CheckIn(
            paciente=paciente,
            cita=cita,
            score=resultado["score"],
            confidence=resultado["confidence"],
            match=resultado["match"],
            requiere_confirmacion=resultado["requiere_confirmacion"],
            det_score_live=resultado["det_score_live"],
            realizado_por=request.user,
        )
        checkin.foto_live.save(f"checkin_{paciente.id}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.jpg", foto, save=True)

        return Response(resultado, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="checkins")
    def checkins(self, request, pk=None):
        paciente = self.get_object()
        qs = paciente.checkins.select_related("cita", "realizado_por").order_by("-created_at")
        from apps.pacientes.serializers import CheckInSerializer
        return Response(CheckInSerializer(qs, many=True, context={"request": request}).data)
