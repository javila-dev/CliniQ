from decimal import Decimal

from rest_framework import serializers

from apps.migracion.models import LoteMigracion


class SesionRealizadaSerializer(serializers.Serializer):
    """Una sesión que el paciente ya hizo. Si trae ``profesional`` y ``fecha`` se
    crea una Cita completada; si no, solo cuenta como sesión previa consumida."""

    nombre = serializers.CharField(max_length=200, required=False, allow_blank=True)
    servicio = serializers.UUIDField(required=False, allow_null=True)
    profesional = serializers.UUIDField(required=False, allow_null=True)
    fecha = serializers.DateField(required=False, allow_null=True)


class PagoPrevioSerializer(serializers.Serializer):
    valor = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    medio_pago = serializers.ChoiceField(
        choices=["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "otro"],
    )
    fecha = serializers.DateField()


class CuotaPlanSerializer(serializers.Serializer):
    valor_esperado = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    fecha_esperada = serializers.DateField(required=False, allow_null=True)
    tipo = serializers.ChoiceField(
        choices=["efectivo", "transferencia", "cuotas", "financiamiento"],
        default="efectivo",
    )
    descripcion = serializers.CharField(max_length=200, required=False, allow_blank=True)


class TratamientoPrevioSerializer(serializers.Serializer):
    tipo = serializers.ChoiceField(choices=["tratamiento", "procedimiento", "libre"])
    tratamiento = serializers.UUIDField(required=False, allow_null=True)
    servicio = serializers.UUIDField(required=False, allow_null=True)
    descripcion = serializers.CharField(max_length=300)
    num_sesiones_total = serializers.IntegerField(min_value=1)
    precio_total_pactado = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    fecha_inicio = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs["tipo"] == "tratamiento" and not attrs.get("tratamiento"):
            raise serializers.ValidationError({"tratamiento": "Requerido para tipo 'tratamiento'."})
        if attrs["tipo"] == "procedimiento" and not attrs.get("servicio"):
            raise serializers.ValidationError({"servicio": "Requerido para tipo 'procedimiento'."})
        return attrs


class PacienteEnCursoSerializer(serializers.Serializer):
    """Payload del asistente de puesta en marcha para un paciente que viene a
    mitad de un tratamiento / con saldo."""

    paciente = serializers.UUIDField()
    sede = serializers.UUIDField()
    nota = serializers.CharField(max_length=300, required=False, allow_blank=True)

    tratamiento = TratamientoPrevioSerializer()
    sesiones_realizadas = SesionRealizadaSerializer(many=True, required=False, default=list)
    pagos = PagoPrevioSerializer(many=True, required=False, default=list)
    plan_saldo = CuotaPlanSerializer(many=True, required=False, default=list)

    def validate(self, attrs):
        total = attrs["tratamiento"]["precio_total_pactado"]
        pagado = sum((p["valor"] for p in attrs["pagos"]), Decimal("0"))
        plan = sum((c["valor_esperado"] for c in attrs["plan_saldo"]), Decimal("0"))

        if pagado > total:
            raise serializers.ValidationError(
                {"pagos": "Lo pagado supera el total pactado. Corregí el monto o el total.",
                 "code": "PAGADO_MAYOR_QUE_TOTAL"}
            )

        saldo = total - pagado
        if saldo > 0 and plan != saldo:
            raise serializers.ValidationError(
                {"plan_saldo": f"El plan debe sumar el saldo pendiente ({saldo}). Suma {plan}.",
                 "code": "PLAN_NO_CUADRA"}
            )
        if saldo == 0 and plan > 0:
            raise serializers.ValidationError(
                {"plan_saldo": "No hay saldo pendiente; el plan debe ir vacío.", "code": "SIN_SALDO"}
            )

        realizadas = len(attrs["sesiones_realizadas"])
        if realizadas > attrs["tratamiento"]["num_sesiones_total"]:
            raise serializers.ValidationError(
                {"sesiones_realizadas": "Hay más sesiones realizadas que el total del tratamiento.",
                 "code": "SESIONES_EXCEDEN_TOTAL"}
            )
        return attrs


class LoteMigracionSerializer(serializers.ModelSerializer):
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True, default=None)
    creado_por_nombre = serializers.SerializerMethodField()
    revertido = serializers.BooleanField(read_only=True)

    class Meta:
        model = LoteMigracion
        fields = [
            "id", "clinica", "paciente", "paciente_nombre", "tipo", "nota",
            "manifest", "creado_por", "creado_por_nombre",
            "revertido", "revertido_en", "created_at",
        ]
        read_only_fields = fields

    def get_creado_por_nombre(self, obj):
        return obj.creado_por.get_full_name() if obj.creado_por_id else None
