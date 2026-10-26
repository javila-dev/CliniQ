from rest_framework import serializers

from .models import MedicionAntropometrica
from apps.core.clinica_scope import AcotadoAClinicaMixin


class MedicionAntropometricaSerializer(AcotadoAClinicaMixin, serializers.ModelSerializer):
    tomado_por_nombre = serializers.CharField(
        source="tomado_por.get_full_name", read_only=True
    )

    class Meta:
        model = MedicionAntropometrica
        fields = (
            "id",
            "paciente",
            "nota",
            "cita",
            "fecha",
            "peso_kg",
            "talla_cm",
            "imc",
            "cintura_cm",
            "cadera_cm",
            "icc",
            "brazo_cm",
            "muslo_cm",
            "abdomen_alto_cm",
            "abdomen_medio_cm",
            "abdomen_bajo_cm",
            "pierna_derecha_alto_cm",
            "pierna_derecha_bajo_cm",
            "pierna_izquierda_alto_cm",
            "pierna_izquierda_bajo_cm",
            "grasa_corporal_pct",
            "masa_muscular_kg",
            "grasa_visceral",
            "agua_corporal_pct",
            "presion_sistolica",
            "presion_diastolica",
            "frecuencia_cardiaca",
            "frecuencia_respiratoria",
            "temperatura_c",
            "saturacion_oxigeno",
            "campos_adicionales",
            "tomado_por",
            "tomado_por_nombre",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "imc", "icc", "tomado_por_nombre", "created_at", "updated_at")
        extra_kwargs = {"tomado_por": {"required": False}}

    def validate_peso_kg(self, value):
        if value is not None and (value <= 0 or value > 500):
            raise serializers.ValidationError("Peso fuera de rango válido.")
        return value

    def validate_talla_cm(self, value):
        if value is not None and (value <= 0 or value > 250):
            raise serializers.ValidationError("Talla fuera de rango válido.")
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        if request and not attrs.get("tomado_por"):
            attrs["tomado_por"] = request.user
        return attrs
