from django.db import models
from django.utils import timezone
from rest_framework import serializers

from apps.agenda.models import BloqueoAgenda, Cita, RegistroConfirmacion
from apps.clinicas.models import Sede
from apps.core.storage import get_signed_url
from apps.historia_clinica.models import ConsentimientoInformado
from apps.protocolos.models import SesionProcedimiento
from apps.users.models import User


class RegistroConfirmacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegistroConfirmacion
        fields = (
            "id",
            "estado_resultante",
            "usuario_nombre",
            "medio",
            "nota",
            "created_at",
        )
        read_only_fields = fields


def _consentimientos_desde_sesion(sesion, paciente_id):
    """Calcula consentimiento_info a partir de los procedimientos de una sesión pre-vinculada."""
    if sesion.tipo_sesion_id:
        procedimientos = [
            tp.procedimiento
            for tp in sesion.tipo_sesion.procedimientos.filter(activo=True)
            .select_related("procedimiento")
            .order_by("orden")
        ]
    elif sesion.procedimiento_id:
        procedimientos = [sesion.procedimiento]
    else:
        return {"todos_firmados": True, "consentimientos": []}

    hoy = timezone.localdate()
    resultado = []
    todos_firmados = True
    seen_tokens = set()

    for procedimiento in procedimientos:
        for relacion in (
            procedimiento.consentimientos_requeridos_set.filter(activo=True)
            .select_related("template")
            .order_by("orden")
        ):
            token = relacion.template.template_token
            if token in seen_tokens:
                continue
            seen_tokens.add(token)
            consentimiento = (
                ConsentimientoInformado.objects.filter(
                    paciente_id=paciente_id,
                    documenso_template_token=token,
                    firmado=True,
                )
                .filter(models.Q(fecha_vencimiento__isnull=True) | models.Q(fecha_vencimiento__gte=hoy))
                .order_by("-fecha_firma", "-created_at")
                .first()
            )
            vigente = consentimiento is not None
            if not vigente:
                todos_firmados = False
            resultado.append(
                {
                    "template_token": token,
                    "template_nombre": relacion.template.get_tipo_display(),
                    "vigente": vigente,
                    "consentimiento_id": str(consentimiento.id) if consentimiento else None,
                    "archivo_url": get_signed_url(consentimiento.archivo.name) if consentimiento and consentimiento.archivo else None,
                }
            )

    if not resultado:
        return {"todos_firmados": True, "consentimientos": []}
    return {"todos_firmados": todos_firmados, "consentimientos": resultado}


def build_consentimiento_info(cita):
    # Si la cita tiene una sesión pendiente pre-vinculada, usar sus procedimientos.
    sesion = (
        cita.sesiones_protocolo.filter(estado=SesionProcedimiento.Estado.PENDIENTE)
        .select_related("tipo_sesion", "procedimiento")
        .first()
    )
    if sesion:
        return _consentimientos_desde_sesion(sesion, cita.paciente_id)

    if not cita.servicio_id:
        return {"todos_firmados": True, "consentimientos": []}
    templates = cita.servicio.consentimientos_requeridos.filter(activo=True)
    if not templates.exists():
        return {"todos_firmados": True, "consentimientos": []}

    hoy = timezone.localdate()
    resultado = []
    todos_firmados = True
    for template in templates:
        consentimiento = (
            ConsentimientoInformado.objects.filter(
                paciente_id=cita.paciente_id,
                documenso_template_token=template.template_token,
                firmado=True,
            )
            .filter(models.Q(fecha_vencimiento__isnull=True) | models.Q(fecha_vencimiento__gte=hoy))
            .order_by("-fecha_firma", "-created_at")
            .first()
        )
        vigente = consentimiento is not None
        if not vigente:
            todos_firmados = False
        resultado.append(
            {
                "template_token": template.template_token,
                "template_nombre": template.get_tipo_display(),
                "vigente": vigente,
                "consentimiento_id": str(consentimiento.id) if consentimiento else None,
                "archivo_url": get_signed_url(consentimiento.archivo.name) if consentimiento and consentimiento.archivo else None,
            }
        )
    return {"todos_firmados": todos_firmados, "consentimientos": resultado}


class CitaSerializer(serializers.ModelSerializer):
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True)
    profesional_nombre = serializers.CharField(source="profesional.nombre_completo", read_only=True)
    servicio_nombre = serializers.SerializerMethodField()
    sede_nombre = serializers.CharField(source="sede.nombre", read_only=True)
    ultimo_registro_confirmacion = serializers.SerializerMethodField()
    consentimiento_info = serializers.SerializerMethodField()
    item_cotizacion_id = serializers.UUIDField(read_only=True)
    cotizacion_resumen = serializers.SerializerMethodField()
    sesion_ejecutada = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    sesion_ejecutada_id = serializers.SerializerMethodField()
    checkin_foto_url = serializers.SerializerMethodField()
    servicio_precio = serializers.SerializerMethodField()

    class Meta:
        model = Cita
        fields = (
            "id",
            "paciente",
            "paciente_nombre",
            "sede",
            "sede_nombre",
            "servicio",
            "servicio_nombre",
            "duracion_min",
            "motivo",
            "profesional",
            "profesional_nombre",
            "fecha_inicio",
            "fecha_fin",
            "fecha_inicio_real",
            "fecha_fin_real",
            "estado",
            "estado_confirmacion",
            "canal_confirmacion",
            "canal_origen",
            "notas_internas",
            "motivo_cancelacion",
            "confirmado_por",
            "confirmado_en",
            "recordatorio_enviado",
            "ultimo_registro_confirmacion",
            "consentimiento_info",
            "item_cotizacion",
            "item_cotizacion_id",
            "cotizacion_resumen",
            "sesion_ejecutada",
            "sesion_ejecutada_id",
            "checkin_metodo",
            "checkin_en",
            "checkin_foto_url",
            "servicio_precio",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "fecha_fin",
            "fecha_inicio_real",
            "fecha_fin_real",
            "estado_confirmacion",
            "canal_confirmacion",
            "confirmado_por",
            "confirmado_en",
            "recordatorio_enviado",
            "item_cotizacion_id",
            "sesion_ejecutada_id",
            "checkin_metodo",
            "checkin_en",
            "checkin_foto_url",
            "servicio_precio",
            "created_by",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            "servicio": {"required": False, "allow_null": True},
            "duracion_min": {"required": False, "allow_null": True, "min_value": 5},
            "motivo": {"required": False, "allow_blank": True},
            "item_cotizacion": {"write_only": True, "required": False, "allow_null": True},
        }

    def get_servicio_nombre(self, obj):
        return obj.servicio_nombre or (obj.servicio.nombre if obj.servicio_id else "")

    def get_ultimo_registro_confirmacion(self, obj):
        registro = obj.registros_confirmacion.first()
        if not registro:
            return None
        return RegistroConfirmacionSerializer(registro).data

    def get_consentimiento_info(self, obj):
        return build_consentimiento_info(obj)

    def get_checkin_foto_url(self, obj):
        path = obj.checkin_foto_url or (obj.checkin_foto.name if obj.checkin_foto else "")
        return get_signed_url(path, expires_in=3600) or ""

    def get_servicio_precio(self, obj):
        if obj.servicio_id and obj.servicio:
            return obj.servicio.precio
        return None

    def get_sesion_ejecutada_id(self, obj):
        sesion = obj.sesiones_protocolo.filter(estado=SesionProcedimiento.Estado.PENDIENTE).values_list("id", flat=True).first()
        return str(sesion) if sesion else None

    def get_cotizacion_resumen(self, obj):
        item = obj.item_cotizacion
        if not item:
            return None
        return {
            "cotizacion_id": str(item.cotizacion_id),
            "descripcion": item.descripcion,
            "num_citas": item.num_citas,
            "citas_agendadas": item.citas_no_canceladas(),
            "citas_restantes": item.citas_restantes(),
        }

    def validate_profesional(self, value):
        if not value.es_profesional:
            raise serializers.ValidationError("El usuario asignado debe tener es_profesional=True.")
        return value

    def validate(self, attrs):
        paciente = attrs.get("paciente", getattr(self.instance, "paciente", None))
        sede = attrs.get("sede", getattr(self.instance, "sede", None))
        servicio = attrs.get("servicio", getattr(self.instance, "servicio", None))
        profesional = attrs.get("profesional", getattr(self.instance, "profesional", None))
        item_cotizacion = attrs.get("item_cotizacion", getattr(self.instance, "item_cotizacion", None))
        duracion_min = attrs.get("duracion_min")
        sesion_ejecutada_uuid = attrs.get("sesion_ejecutada")

        # Validar y resolver sesion_ejecutada
        if sesion_ejecutada_uuid:
            try:
                sesion = (
                    SesionProcedimiento.objects.select_related("tratamiento__paciente")
                    .get(id=sesion_ejecutada_uuid)
                )
            except SesionProcedimiento.DoesNotExist:
                raise serializers.ValidationError({"sesion_ejecutada": "La sesión no existe."})
            if paciente and sesion.tratamiento.paciente_id != paciente.id:
                raise serializers.ValidationError(
                    {"error": "La sesión no pertenece al paciente indicado.", "code": "SESION_PACIENTE_MISMATCH"}
                )
            if sesion.estado != SesionProcedimiento.Estado.PENDIENTE:
                raise serializers.ValidationError(
                    {"error": "La sesión no está en estado pendiente.", "code": "SESION_NO_PENDIENTE"}
                )
            if sesion.cita_id is not None:
                raise serializers.ValidationError(
                    {"error": "La sesión ya tiene una cita asignada.", "code": "SESION_YA_VINCULADA"}
                )
            # Reemplazar UUID por la instancia para que services.crear_cita la use directamente
            attrs["sesion_ejecutada"] = sesion

        if not self.instance and not servicio and not item_cotizacion and not duracion_min and not sesion_ejecutada_uuid:
            raise serializers.ValidationError(
                {"error": "Se requiere servicio, item_cotizacion, sesion_ejecutada o duracion_min.", "code": "MISSING_DURATION"}
            )

        if paciente and sede and paciente.clinica_id != sede.clinica_id:
            raise serializers.ValidationError({"paciente": "El paciente no pertenece a la clinica de la sede."})
        if servicio and sede and servicio.clinica_id != sede.clinica_id:
            raise serializers.ValidationError({"servicio": "El servicio no pertenece a la clinica de la sede."})
        if profesional and sede and profesional.clinica_id != sede.clinica_id:
            raise serializers.ValidationError({"profesional": "El profesional no pertenece a la clinica de la sede."})
        if item_cotizacion:
            if item_cotizacion.cotizacion.estado != "aceptada":
                raise serializers.ValidationError(
                    {
                        "error": "Solo se pueden consumir items de cotizaciones aceptadas.",
                        "code": "COTIZACION_NO_ACEPTADA",
                    }
                )
            if sede and item_cotizacion.cotizacion.clinica_id != sede.clinica_id:
                raise serializers.ValidationError({"item_cotizacion": "El item no pertenece a la clinica de la cita."})
            if paciente and item_cotizacion.cotizacion.paciente_id != paciente.id:
                raise serializers.ValidationError({"item_cotizacion": "El item no corresponde al paciente de la cita."})
            if servicio and item_cotizacion.servicio_id and item_cotizacion.servicio_id != servicio.id:
                raise serializers.ValidationError({"item_cotizacion": "El item no corresponde al servicio de la cita."})
            citas_usadas = item_cotizacion.citas_no_canceladas()
            if self.instance and self.instance.item_cotizacion_id == item_cotizacion.id and self.instance.estado != Cita.Estado.CANCELADA:
                citas_usadas = max(0, citas_usadas - 1)
            if citas_usadas >= item_cotizacion.num_citas:
                raise serializers.ValidationError(
                    {"error": "Este item no tiene sesiones disponibles.", "code": "SIN_SESIONES_DISPONIBLES"}
                )
        return attrs


class BloqueoAgendaSerializer(serializers.ModelSerializer):
    profesional_nombre = serializers.CharField(source="profesional.nombre_completo", read_only=True)
    sede_nombre = serializers.CharField(source="sede.nombre", read_only=True)

    class Meta:
        model = BloqueoAgenda
        fields = (
            "id",
            "profesional",
            "profesional_nombre",
            "sede",
            "sede_nombre",
            "fecha_inicio",
            "fecha_fin",
            "motivo",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        profesional = attrs.get("profesional", getattr(self.instance, "profesional", None))
        sede = attrs.get("sede", getattr(self.instance, "sede", None))
        fecha_inicio = attrs.get("fecha_inicio", getattr(self.instance, "fecha_inicio", None))
        fecha_fin = attrs.get("fecha_fin", getattr(self.instance, "fecha_fin", None))

        if profesional and not profesional.es_profesional:
            raise serializers.ValidationError({"profesional": "Solo se pueden bloquear agendas de usuarios profesionales."})
        if profesional and sede and profesional.clinica_id != sede.clinica_id:
            raise serializers.ValidationError({"profesional": "El profesional no pertenece a la clinica de la sede."})
        if fecha_inicio and fecha_fin and fecha_fin <= fecha_inicio:
            raise serializers.ValidationError({"fecha_fin": "La fecha fin debe ser mayor a la fecha inicio."})
        return attrs


class CambiarEstadoSerializer(serializers.Serializer):
    estado = serializers.ChoiceField(choices=Cita.Estado.choices)
    motivo_cancelacion = serializers.CharField(required=False, allow_blank=True)
    medio = serializers.ChoiceField(choices=RegistroConfirmacion.Medio.choices, required=False, allow_blank=True)
    nota = serializers.CharField(required=False, allow_blank=True)


class ConfirmarManualSerializer(serializers.Serializer):
    medio = serializers.ChoiceField(choices=RegistroConfirmacion.Medio.choices, required=False, allow_blank=True)
    nota = serializers.CharField(required=False, allow_blank=True)


class RecordatorioPendienteSerializer(serializers.ModelSerializer):
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True)
    paciente_telefono = serializers.CharField(source="paciente.telefono", read_only=True)
    paciente_email = serializers.EmailField(source="paciente.email", read_only=True)
    servicio_nombre = serializers.SerializerMethodField()
    profesional_nombre = serializers.CharField(source="profesional.nombre_completo", read_only=True)
    sede_id = serializers.UUIDField(source="sede.id", read_only=True)
    sede_nombre = serializers.CharField(source="sede.nombre", read_only=True)
    sede_telefono = serializers.CharField(source="sede.telefono", read_only=True)
    clinica_id = serializers.UUIDField(source="sede.clinica.id", read_only=True)
    clinica_nombre = serializers.CharField(source="sede.clinica.nombre", read_only=True)
    tipo_recordatorio = serializers.SerializerMethodField()

    def get_servicio_nombre(self, obj):
        return obj.servicio_nombre or (obj.servicio.nombre if obj.servicio_id else "")

    def get_tipo_recordatorio(self, obj):
        return "manual" if obj.recordatorio_manual_pendiente else "automatico"

    class Meta:
        model = Cita
        fields = (
            "id",
            "clinica_id",
            "clinica_nombre",
            "sede_id",
            "sede_nombre",
            "sede_telefono",
            "paciente_nombre",
            "paciente_telefono",
            "paciente_email",
            "servicio_nombre",
            "profesional_nombre",
            "fecha_inicio",
            "fecha_fin",
            "canal_confirmacion",
            "tipo_recordatorio",
            "estado",
            "estado_confirmacion",
            "recordatorio_enviado",
        )
