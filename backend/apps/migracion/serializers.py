from decimal import Decimal

from rest_framework import serializers

from apps.clinicas.models import FormaDePago
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
    medio_pago = serializers.PrimaryKeyRelatedField(queryset=FormaDePago.objects.filter(activo=True))
    fecha = serializers.DateField()

    def validate_medio_pago(self, value):
        clinica = self.context.get("clinica")
        if clinica is not None and value.clinica_id != clinica.id:
            raise serializers.ValidationError("La forma de pago no pertenece a esta clínica.")
        return value


class CuotaPlanSerializer(serializers.Serializer):
    valor_esperado = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    fecha_esperada = serializers.DateField(required=False, allow_null=True)
    tipo = serializers.PrimaryKeyRelatedField(queryset=FormaDePago.objects.filter(activo=True))
    descripcion = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate_tipo(self, value):
        clinica = self.context.get("clinica")
        if clinica is not None and value.clinica_id != clinica.id:
            raise serializers.ValidationError("La forma de pago no pertenece a esta clínica.")
        return value


# Mismos campos que MedicionAntropometrica (menos paciente/nota/cita/fecha),
# compartidos entre el serializer y el service para no listarlos dos veces.
CAMPOS_MEDICION = (
    "peso_kg", "talla_cm",
    "presion_sistolica", "presion_diastolica",
    "frecuencia_cardiaca", "frecuencia_respiratoria",
    "temperatura_c", "saturacion_oxigeno",
    "cintura_cm", "cadera_cm", "brazo_cm", "muslo_cm",
    "abdomen_alto_cm", "abdomen_medio_cm", "abdomen_bajo_cm",
    "pierna_derecha_alto_cm", "pierna_derecha_bajo_cm",
    "pierna_izquierda_alto_cm", "pierna_izquierda_bajo_cm",
    "grasa_corporal_pct", "masa_muscular_kg", "grasa_visceral", "agua_corporal_pct",
)


class MedicionHistoricaSerializer(serializers.Serializer):
    """Una medición antropométrica tomada antes de usar CliniQ — mismos
    campos que la pestaña Seguimiento de la historia clínica. Queda ahí,
    sin cita ni nota asociada."""

    fecha = serializers.DateField()
    peso_kg = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    talla_cm = serializers.DecimalField(max_digits=5, decimal_places=1, required=False, allow_null=True)
    presion_sistolica = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    presion_diastolica = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    frecuencia_cardiaca = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    frecuencia_respiratoria = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    temperatura_c = serializers.DecimalField(max_digits=4, decimal_places=1, required=False, allow_null=True)
    saturacion_oxigeno = serializers.DecimalField(max_digits=4, decimal_places=1, required=False, allow_null=True)
    cintura_cm = serializers.DecimalField(max_digits=5, decimal_places=1, required=False, allow_null=True)
    cadera_cm = serializers.DecimalField(max_digits=5, decimal_places=1, required=False, allow_null=True)
    brazo_cm = serializers.DecimalField(max_digits=5, decimal_places=1, required=False, allow_null=True)
    muslo_cm = serializers.DecimalField(max_digits=5, decimal_places=1, required=False, allow_null=True)
    abdomen_alto_cm = serializers.DecimalField(max_digits=5, decimal_places=1, required=False, allow_null=True)
    abdomen_medio_cm = serializers.DecimalField(max_digits=5, decimal_places=1, required=False, allow_null=True)
    abdomen_bajo_cm = serializers.DecimalField(max_digits=5, decimal_places=1, required=False, allow_null=True)
    pierna_derecha_alto_cm = serializers.DecimalField(max_digits=5, decimal_places=1, required=False, allow_null=True)
    pierna_derecha_bajo_cm = serializers.DecimalField(max_digits=5, decimal_places=1, required=False, allow_null=True)
    pierna_izquierda_alto_cm = serializers.DecimalField(max_digits=5, decimal_places=1, required=False, allow_null=True)
    pierna_izquierda_bajo_cm = serializers.DecimalField(max_digits=5, decimal_places=1, required=False, allow_null=True)
    grasa_corporal_pct = serializers.DecimalField(max_digits=4, decimal_places=1, required=False, allow_null=True)
    masa_muscular_kg = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    grasa_visceral = serializers.DecimalField(max_digits=4, decimal_places=1, required=False, allow_null=True)
    agua_corporal_pct = serializers.DecimalField(max_digits=4, decimal_places=1, required=False, allow_null=True)

    def validate(self, attrs):
        if not any(attrs.get(k) is not None for k in CAMPOS_MEDICION):
            raise serializers.ValidationError("Cada registro necesita al menos una medida.")
        return attrs


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
    mediciones_historicas = MedicionHistoricaSerializer(many=True, required=False, default=list)

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
