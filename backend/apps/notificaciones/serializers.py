from rest_framework import serializers

from apps.notificaciones.models import AsignacionWhatsappSede, NotificacionFallida


class NotificacionFallidaSerializer(serializers.ModelSerializer):
    paciente_nombre = serializers.SerializerMethodField()
    tipo_notificacion_display = serializers.CharField(source="get_tipo_notificacion_display", read_only=True)

    class Meta:
        model = NotificacionFallida
        fields = (
            "id",
            "tipo_notificacion",
            "tipo_notificacion_display",
            "telefono",
            "paciente",
            "paciente_nombre",
            "motivo",
            "resuelta",
            "resuelta_en",
            "created_at",
        )
        read_only_fields = fields

    def get_paciente_nombre(self, obj):
        return obj.paciente.nombre_completo if obj.paciente_id else ""


class NotificacionFallidaCallbackSerializer(serializers.Serializer):
    clinica_id = serializers.UUIDField()
    paciente_id = serializers.UUIDField(required=False, allow_null=True)
    tipo_notificacion = serializers.ChoiceField(choices=NotificacionFallida.Tipo.choices)
    telefono = serializers.CharField(required=False, allow_blank=True, default="")
    motivo = serializers.CharField(required=False, allow_blank=True, default="")


class EmailSendSerializer(serializers.Serializer):
    to = serializers.ListField(
        child=serializers.EmailField(),
        allow_empty=False,
    )
    subject = serializers.CharField(max_length=255)
    body = serializers.CharField()
    html_body = serializers.CharField(required=False, allow_blank=True)
    from_email = serializers.EmailField(required=False, allow_blank=False)
    cc = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        allow_empty=True,
    )
    bcc = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        allow_empty=True,
    )
    reply_to = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        allow_empty=True,
    )


class EmailConfigSerializer(serializers.Serializer):
    provider = serializers.CharField()
    backend = serializers.CharField()
    host = serializers.CharField()
    port = serializers.IntegerField()
    username = serializers.CharField()
    use_tls = serializers.BooleanField()
    use_ssl = serializers.BooleanField()
    timeout = serializers.IntegerField()
    default_from_email = serializers.EmailField()
    configured = serializers.BooleanField()


class AsignacionSedeSerializer(serializers.Serializer):
    sede_id = serializers.UUIDField()
    tipo = serializers.ChoiceField(choices=AsignacionWhatsappSede.Tipo.choices)
    numero_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs["tipo"] == AsignacionWhatsappSede.Tipo.NUMERO and not attrs.get("numero_id"):
            raise serializers.ValidationError({"numero_id": "Elige el número de esta sede."})
        return attrs


class WhatsappPropioConfigSerializer(serializers.Serializer):
    pago_meta_configurado = serializers.BooleanField(required=False)
    numero_por_defecto_id = serializers.UUIDField(required=False)
    asignaciones = AsignacionSedeSerializer(many=True, required=False)


class WhatsappConectarSerializer(serializers.Serializer):
    """Resultado del Embedded Signup de Meta (evento WA_EMBEDDED_SIGNUP)."""

    evento = serializers.CharField(max_length=60)
    code = serializers.CharField(max_length=1000)
    waba_id = serializers.CharField(max_length=64)
    phone_number_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    business_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
