import asyncio

from rest_framework import serializers, status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.clinicas.models import Clinica
from apps.configuracion.models import ConfiguracionWizard
from apps.configuracion.registro_publico import registro_publico_config_as_dict, validate_registro_publico_tabs
from apps.core.storage import get_public_url
from apps.pacientes import face_client, face_service
from apps.pacientes.models import ConfiguracionFacial, Paciente
from apps.pacientes.serializers import PacienteSerializer
from django.utils import timezone


class RegistroPublicoThrottle(SimpleRateThrottle):
    rate = "20/hour"

    def get_cache_key(self, request, view):
        return f"registro_publico_{self.get_ident(request)}"


def get_clinica_by_token(token):
    if not token:
        return None
    try:
        return Clinica.objects.get(token_registro_publico=token, activo=True)
    except Clinica.DoesNotExist:
        return None


def find_duplicate_paciente(clinica, *, tipo_documento, numero_documento, telefono, email):
    if Paciente.objects.filter(
        clinica=clinica,
        tipo_documento=tipo_documento,
        numero_documento=numero_documento,
    ).exists():
        return (
            "numero_documento",
            "Ya existe un paciente registrado con ese documento en esta clinica.",
        )
    if Paciente.objects.filter(clinica=clinica, telefono=telefono).exists():
        return (
            "telefono",
            "Ya existe un paciente registrado con ese telefono en esta clinica.",
        )
    email = (email or "").strip()
    if email and Paciente.objects.filter(clinica=clinica, email__iexact=email).exists():
        return (
            "email",
            "Ya existe un paciente registrado con ese email en esta clinica.",
        )
    return None


class RegistroPublicoPacienteSerializer(PacienteSerializer):
    token = serializers.CharField(write_only=True)

    class Meta(PacienteSerializer.Meta):
        fields = PacienteSerializer.Meta.fields + ("token",)
        read_only_fields = PacienteSerializer.Meta.read_only_fields

    def validate_token(self, value):
        clinica = get_clinica_by_token(value)
        if clinica is None:
            raise serializers.ValidationError("Token de registro invalido.")
        self.context["clinica_registro"] = clinica
        return value

    def validate(self, attrs):
        attrs.pop("token", None)
        clinica = self.context.get("clinica_registro")
        if clinica is None:
            raise serializers.ValidationError({"token": "Token de registro invalido."})
        if attrs.get("autoriza_datos") is not True:
            raise serializers.ValidationError(
                {"autoriza_datos": "Debes autorizar el tratamiento de datos para registrar el paciente."}
            )

        duplicate = find_duplicate_paciente(
            clinica,
            tipo_documento=attrs.get("tipo_documento"),
            numero_documento=attrs.get("numero_documento"),
            telefono=attrs.get("telefono"),
            email=attrs.get("email"),
        )
        if duplicate:
            campo, mensaje = duplicate
            raise serializers.ValidationError(
                {
                    "error": mensaje,
                    "code": "PACIENTE_YA_EXISTE",
                    "campo": campo,
                }
            )

        tab_error = validate_registro_publico_tabs(clinica, attrs)
        if tab_error:
            raise serializers.ValidationError(tab_error)

        attrs["clinica"] = clinica
        return attrs

    def create(self, validated_data):
        return Paciente.objects.create(**validated_data)


class RegistroPublicoClinicaView(APIView):
    authentication_classes = ()
    permission_classes = ()
    throttle_classes = (RegistroPublicoThrottle,)

    def get(self, request, *args, **kwargs):
        token = request.query_params.get("token", "").strip()
        if not token:
            return Response(
                {
                    "error": "El query param token es obligatorio.",
                    "code": "TOKEN_REQUERIDO",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        clinica = get_clinica_by_token(token)
        if clinica is None:
            return Response(
                {"error": "Token de registro invalido.", "code": "TOKEN_INVALIDO"},
                status=status.HTTP_404_NOT_FOUND,
            )
        wizard, _ = ConfiguracionWizard.objects.get_or_create(clinica=clinica)
        return Response(
            {
                "clinica_id": str(clinica.id),
                "clinica_nombre": clinica.nombre,
                "logo_url": get_public_url(clinica.logo.name) if clinica.logo else None,
                "paso_verificacion_facial": wizard.paso_verificacion_facial,
                **registro_publico_config_as_dict(clinica),
            },
            status=status.HTTP_200_OK,
        )


class RegistroPublicoPacienteView(APIView):
    authentication_classes = ()
    permission_classes = ()
    throttle_classes = (RegistroPublicoThrottle,)

    def post(self, request, *args, **kwargs):
        serializer = RegistroPublicoPacienteSerializer(data=request.data)
        if not serializer.is_valid():
            detail = serializer.errors
            code = detail.get("code") if isinstance(detail, dict) else None
            if isinstance(code, list):
                code = code[0]
            if code == "PACIENTE_YA_EXISTE":
                normalized = {}
                for key, value in detail.items():
                    normalized[key] = value[0] if isinstance(value, list) and len(value) == 1 else value
                return Response(normalized, status=status.HTTP_400_BAD_REQUEST)
            if isinstance(detail, dict):
                code = detail.get("code")
                if isinstance(code, list):
                    code = code[0]
                if code in {"TAB_PERSONAL_REQUERIDO", "TAB_SALUD_REQUERIDO"}:
                    normalized = {}
                    for key, value in detail.items():
                        normalized[key] = value[0] if isinstance(value, list) and len(value) == 1 else value
                    return Response(normalized, status=status.HTTP_400_BAD_REQUEST)
            token_errors = detail.get("token") if isinstance(detail, dict) else None
            if token_errors:
                return Response(
                    {"error": "Token de registro invalido.", "code": "TOKEN_INVALIDO"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

        paciente = serializer.save()
        return Response(
            {
                "id": str(paciente.id),
                "nombre_completo": paciente.nombre_completo,
                "clinica_nombre": paciente.clinica.nombre,
            },
            status=status.HTTP_201_CREATED,
        )


class RegistroPublicoEnrollmentView(APIView):
    """Enrollment de foto de control desde el autoregistro público.

    El token actúa como credencial: valida que el paciente pertenece a la clínica
    identificada por ese token, evitando que cualquiera suba fotos de pacientes ajenos.
    """
    authentication_classes = ()
    permission_classes = ()
    throttle_classes = (RegistroPublicoThrottle,)
    parser_classes = (MultiPartParser,)

    def post(self, request, paciente_id, *args, **kwargs):
        token = request.data.get("token", "").strip()
        clinica = get_clinica_by_token(token)
        if clinica is None:
            return Response(
                {"error": "Token de registro invalido.", "code": "TOKEN_INVALIDO"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            paciente = Paciente.objects.get(id=paciente_id, clinica=clinica)
        except Paciente.DoesNotExist:
            return Response({"error": "Paciente no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        if not clinica.facial_verificacion_habilitada:
            return Response(
                {"error": "El módulo de verificación facial no está habilitado para esta clínica.", "code": "FACIAL_NO_HABILITADO"},
                status=status.HTTP_403_FORBIDDEN,
            )

        foto = request.FILES.get("photo")
        if foto is None:
            return Response({"error": "Se requiere el campo 'photo'."}, status=status.HTTP_400_BAD_REQUEST)

        config, _ = ConfiguracionFacial.objects.get_or_create(clinica=clinica)

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
                {"valid": False, "errors": evaluacion["errors"], "warnings": evaluacion["warnings"]},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        foto.seek(0)
        paciente.foto_control = foto
        paciente.embedding_facial = evaluacion["embedding"]
        paciente.embedding_actualizado_en = timezone.now()
        paciente.save(update_fields=["foto_control", "embedding_facial", "embedding_actualizado_en", "updated_at"])

        return Response(
            {"valid": True, "warnings": evaluacion["warnings"], "message": "Foto de control registrada."},
            status=status.HTTP_200_OK,
        )
