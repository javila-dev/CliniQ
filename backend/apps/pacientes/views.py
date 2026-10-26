import asyncio
import re
import unicodedata
import uuid

from django.db.models import CharField, Count, Func, Q, Value
from django.db.models.functions import Concat
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
from apps.users.authorization import atiende_solo_lo_propio
from apps.users.permissions import HasClinicamente, RequireAnyPermission, RequirePermission, get_clinica_activa


MAX_PDF_CONSENTIMIENTO = 20 * 1024 * 1024


class Unaccent(Func):
    """unaccent() de Postgres (extensión creada en la migración 0010)."""

    function = "unaccent"
    output_field = CharField()


def sin_tildes(texto: str) -> str:
    """Mismo criterio que unaccent(): "Gómez" -> "Gomez", "Muñoz" -> "Munoz"."""
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def es_uuid(valor) -> bool:
    try:
        uuid.UUID(str(valor))
    except (TypeError, ValueError):
        return False
    return True


def validar_archivo_pdf(archivo):
    """Un consentimiento firmado es un PDF: se revisa el contenido, no solo el nombre."""
    if archivo.size > MAX_PDF_CONSENTIMIENTO:
        raise ValidationError({"archivo": "El archivo no puede superar 20 MB."})
    inicio = archivo.read(5)
    archivo.seek(0)
    if inicio != b"%PDF-":
        raise ValidationError({"archivo": "El archivo debe ser un PDF."})


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
        elif self.action == "consentimientos" and self.request.method == "GET":
            # Consultar sigue con "ver pacientes" (la ficha y la cotización lo usan).
            permission_classes = (RequirePermission("pacientes.ver"),)
        elif self.action in {"consentimientos", "subir_pdf_consentimiento"}:
            # Registrar un consentimiento o subir su PDF es un acto legal: antes
            # bastaba con "ver pacientes".
            permission_classes = (RequirePermission("historia.consentimientos.gestionar"),)
        elif self.action == "verificar_consentimientos":
            permission_classes = (RequirePermission("pacientes.ver"),)
        elif self.action == "posibles_duplicados":
            # Lo consulta el formulario de crear/editar paciente.
            permission_classes = (
                RequireAnyPermission("pacientes.crear", "pacientes.editar", "pacientes.ver"),
            )
        elif self.action == "enrollment":
            permission_classes = (RequirePermission("pacientes.foto_control.cambiar"),)
        elif self.action == "eliminar_foto_control":
            permission_classes = (RequirePermission("pacientes.foto_control.eliminar"),)
        elif self.action in {"checkin", "omitir_verificacion"}:
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
        # El permiso (ver/editar antecedentes) ya lo exige get_permissions. Quien
        # atiende pacientes, además, solo edita los de pacientes que ha atendido. Antes
        # se miraba el rol fijo y un rol personalizado con el permiso quedaba fuera.
        user = self.request.user
        if not atiende_solo_lo_propio(user):
            return True
        return Cita.objects.filter(
            paciente=paciente,
            profesional=user,
        ).exclude(estado=Cita.Estado.CANCELADA).exists()

    @action(detail=False, methods=["get"], url_path="buscar", pagination_class=None)
    def buscar(self, request, *args, **kwargs):
        query = request.query_params.get("q", "").strip()
        if len(query) < 3:
            return Response([], status=status.HTTP_200_OK)

        queryset = self.get_queryset()
        compacto = re.sub(r"[\s+()\-.]", "", query)
        if compacto.isdigit():
            # Documento o teléfono ("300 123 4567", "+57 300..."): antes el
            # teléfono no se buscaba (M2-21). Los 10 últimos dígitos encuentran
            # también los teléfonos guardados sin indicativo.
            queryset = queryset.filter(
                Q(numero_documento__contains=compacto)
                | Q(telefono__contains=compacto)
                | Q(telefono__contains=compacto[-10:])
            )
        else:
            # Palabra por palabra y sin tildes: "Gómez Ana" o "Gomez" no
            # encontraban a "Ana Gómez" (M2-21). Cada palabra debe aparecer en
            # nombres, apellidos, documento o teléfono.
            queryset = queryset.annotate(
                texto_busqueda=Unaccent(
                    Concat("nombres", Value(" "), "apellidos", Value(" "), "numero_documento", Value(" "), "telefono")
                ),
            )
            for palabra in query.split():
                queryset = queryset.filter(texto_busqueda__icontains=sin_tildes(palabra))
        queryset = queryset[:20]
        serializer = BusquedaPacienteSerializer(
            queryset, many=True, context=self.get_serializer_context()
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="posibles_duplicados", pagination_class=None)
    def posibles_duplicados(self, request):
        """Pacientes con el mismo teléfono o correo. Es solo un aviso: los
        familiares comparten teléfono y el duplicado real es el documento (M2-20)."""
        digitos = re.sub(r"\D", "", request.query_params.get("telefono", ""))
        email = request.query_params.get("email", "").strip()
        condicion = Q()
        if len(digitos) >= 7:
            # Los 10 últimos dígitos: algunos teléfonos quedaron sin +57.
            condicion |= Q(telefono__endswith=digitos[-10:])
        if "@" in email:
            condicion |= Q(email__iexact=email)
        if not condicion:
            return Response([], status=status.HTTP_200_OK)

        queryset = self.get_queryset().filter(condicion)
        excluir = request.query_params.get("excluir")
        if excluir and es_uuid(excluir):
            queryset = queryset.exclude(pk=excluir)
        payload = [
            {
                "id": str(p.id),
                "nombre_completo": p.nombre_completo,
                "coincide_telefono": len(digitos) >= 7 and p.telefono.endswith(digitos[-10:]),
                "coincide_email": "@" in email and (p.email or "").lower() == email.lower(),
            }
            for p in queryset[:5]
        ]
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="resumen", pagination_class=None)
    def resumen(self, request):
        """Totales de la clínica para las tarjetas del listado: antes Activos e
        Inactivos mostraban siempre "—" (M2-26)."""
        # Sin los filtros de get_queryset (activo, sexo...): son totales de la clínica.
        clinica = get_clinica_activa(request)
        totales = Paciente.objects.filter(clinica=clinica).aggregate(
            total=Count("id"),
            activos=Count("id", filter=Q(activo=True)),
        )
        total = totales["total"] or 0
        activos = totales["activos"] or 0
        return Response({"total": total, "activos": activos, "inactivos": total - activos})

    @action(detail=True, methods=["get", "put", "patch"], url_path="antecedentes")
    def antecedentes(self, request, pk=None):
        paciente = self.get_object()
        # Leer sigue la misma regla que la historia (quien la ve, ve sus notas de
        # cualquier paciente); escribir, solo en pacientes que ha atendido.
        if request.method != "GET" and not self._can_manage_antecedentes(paciente):
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
                    "pdf_pendiente": bool(
                        not c_obj.archivo and c_obj.documenso_document_id and not c_obj.pendiente_firma_profesional
                    ),
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
        # Antes no se filtraba por clínica y un id mal formado daba 500 (M2-23).
        if not es_uuid(tratamiento_id):
            raise ValidationError({"tratamiento": "El tratamiento no es válido."})
        tratamiento = get_object_or_404(TratamientoCatalogo, id=tratamiento_id, clinica=paciente.clinica)
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
        validar_archivo_pdf(archivo)
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

    @action(detail=True, methods=["delete"], url_path="foto-control")
    def eliminar_foto_control(self, request, pk=None):
        paciente = self.get_object()

        if not paciente.foto_control:
            return Response(
                {"error": "El paciente no tiene foto de control registrada.", "code": "FOTO_CONTROL_INEXISTENTE"},
                status=status.HTTP_404_NOT_FOUND,
            )

        paciente.foto_control.delete(save=False)
        paciente.embedding_facial = None
        paciente.embedding_actualizado_en = None
        paciente.save(update_fields=["foto_control", "embedding_facial", "embedding_actualizado_en", "updated_at"])

        return Response(status=status.HTTP_204_NO_CONTENT)

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

    @action(detail=True, methods=["post"], url_path="omitir_verificacion")
    def omitir_verificacion(self, request, pk=None):
        """"Continuar sin verificar" en Preparar paciente, cuando el servicio facial
        no responde. La verificación es un paso obligatorio para iniciar la
        atención: el salto queda registrado con quién lo hizo."""
        from apps.core.logging import registrar_accion

        paciente = self.get_object()
        cita = Cita.objects.filter(id=request.data.get("cita_id"), paciente=paciente).first()
        if cita is None:
            raise ValidationError({"cita_id": "Cita no encontrada para este paciente."})
        checkin = CheckIn.objects.create(
            paciente=paciente,
            cita=cita,
            score=0,
            confidence=CheckIn.Confidence.BAJA,
            match=False,
            det_score_live=0,
            omitido=True,
            realizado_por=request.user,
        )
        registrar_accion(request, "checkin.omitido", cita, {"checkin_id": str(checkin.id)})
        return Response({"omitido": True}, status=status.HTTP_201_CREATED)
