from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.agenda.models import Cita
from apps.clinicas.models import TratamientoCatalogo
from apps.pacientes.models import AntecedentePaciente, Paciente
from apps.pacientes.serializers import (
    AntecedentePacienteSerializer,
    BusquedaPacienteSerializer,
    PacienteSerializer,
)
from apps.protocolos.models import ConsentimientoPaciente
from apps.protocolos.serializers import ConsentimientoPacienteSerializer
from apps.users.permissions import HasClinicamente, RequirePermission


class PacienteViewSet(HasClinicamente, ModelViewSet):
    serializer_class = PacienteSerializer
    queryset = Paciente.objects.select_related("clinica").all()
    search_fields = ("nombres", "apellidos", "numero_documento", "telefono", "email")
    ordering_fields = ("apellidos", "nombres", "created_at")

    def get_permissions(self):
        if self.action == "destroy":
            permission_classes = (RequirePermission("pacientes.eliminar"),)
        elif self.action == "create":
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
        clinica = serializer.validated_data.get("clinica") or getattr(self.request.user, "clinica", None)
        if clinica is None:
            raise ValidationError(
                {"clinica": "El usuario autenticado no tiene una clinica asociada."}
            )
        serializer.save(clinica=clinica)

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
            queryset = ConsentimientoPaciente.objects.filter(paciente=paciente).select_related("procedimiento")
            return Response(ConsentimientoPacienteSerializer(queryset, many=True, context={"request": request}).data)

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
