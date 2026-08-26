from datetime import date

from rest_framework import serializers

from apps.core.storage import get_signed_url
from .models import (
    AntecedentesObesidad,
    MedicionAntropometrica,
    ObjetivoObesidad,
    ResultadoLaboratorio,
    TratamientoFarmacologico,
)


class AntecedentesObesidadSerializer(serializers.ModelSerializer):
    class Meta:
        model = AntecedentesObesidad
        fields = (
            "id",
            "historia",
            "peso_maximo_kg",
            "peso_minimo_adulto_kg",
            "intentos_previos",
            "comorbilidades",
            "medicamentos_actuales",
            "antecedente_familiar",
            "actividad_fisica",
            "patron_alimentario",
            "factores_emocionales",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_comorbilidades(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Debe ser una lista.")
        return value


class ObjetivoObesidadSerializer(serializers.ModelSerializer):
    por_perder_kg = serializers.SerializerMethodField()

    class Meta:
        model = ObjetivoObesidad
        fields = (
            "id",
            "paciente",
            "cotizacion",
            "peso_inicial_kg",
            "peso_objetivo_kg",
            "por_perder_kg",
            "fecha_inicio",
            "fecha_objetivo",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "por_perder_kg", "created_at", "updated_at")

    def get_por_perder_kg(self, obj):
        return float(obj.peso_inicial_kg - obj.peso_objetivo_kg)

    def validate(self, attrs):
        peso_inicial  = attrs.get("peso_inicial_kg",  getattr(self.instance, "peso_inicial_kg",  None))
        peso_objetivo = attrs.get("peso_objetivo_kg", getattr(self.instance, "peso_objetivo_kg", None))
        if peso_inicial and peso_objetivo and peso_objetivo >= peso_inicial:
            raise serializers.ValidationError(
                {"peso_objetivo_kg": "El peso objetivo debe ser menor al peso inicial."}
            )
        fecha_inicio   = attrs.get("fecha_inicio",   getattr(self.instance, "fecha_inicio",   None))
        fecha_objetivo = attrs.get("fecha_objetivo", getattr(self.instance, "fecha_objetivo", None))
        if fecha_inicio and fecha_objetivo and fecha_objetivo <= fecha_inicio:
            raise serializers.ValidationError(
                {"fecha_objetivo": "La fecha objetivo debe ser posterior al inicio."}
            )
        return attrs


class MedicionAntropometricaSerializer(serializers.ModelSerializer):
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
        if value <= 0 or value > 500:
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


class ResultadoLaboratorioSerializer(serializers.ModelSerializer):
    archivo_url = serializers.SerializerMethodField()

    class Meta:
        model = ResultadoLaboratorio
        fields = (
            "id",
            "paciente",
            "fecha",
            "tipo",
            "archivo",
            "archivo_url",
            "valores",
            "observaciones",
            "registrado_por",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "archivo_url", "created_at", "updated_at")
        extra_kwargs = {"archivo": {"write_only": True, "required": False}}

    def get_archivo_url(self, obj):
        if not obj.archivo:
            return None
        return get_signed_url(obj.archivo.name)

    def validate(self, attrs):
        request = self.context.get("request")
        if request and not attrs.get("registrado_por"):
            attrs["registrado_por"] = request.user
        return attrs


class TratamientoFarmacologicoSerializer(serializers.ModelSerializer):
    indicado_por_nombre = serializers.CharField(
        source="indicado_por.get_full_name", read_only=True
    )
    vigente = serializers.SerializerMethodField()

    class Meta:
        model = TratamientoFarmacologico
        fields = (
            "id",
            "paciente",
            "nota",
            "medicamento",
            "principio_activo",
            "dosis",
            "via",
            "frecuencia",
            "fecha_inicio",
            "fecha_fin",
            "indicado_por",
            "indicado_por_nombre",
            "motivo_suspension",
            "vigente",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "indicado_por_nombre", "vigente", "created_at", "updated_at")

    def get_vigente(self, obj):
        return obj.activo and (obj.fecha_fin is None or obj.fecha_fin >= date.today())

    def validate(self, attrs):
        request = self.context.get("request")
        if request and not attrs.get("indicado_por"):
            attrs["indicado_por"] = request.user
        fecha_inicio = attrs.get("fecha_inicio", getattr(self.instance, "fecha_inicio", None))
        fecha_fin    = attrs.get("fecha_fin",    getattr(self.instance, "fecha_fin",    None))
        if fecha_inicio and fecha_fin and fecha_fin < fecha_inicio:
            raise serializers.ValidationError(
                {"fecha_fin": "La fecha de fin no puede ser anterior al inicio."}
            )
        return attrs


# ── Vista de progreso ─────────────────────────────────────────────────────────

class ProgresoObesidadSerializer(serializers.Serializer):
    objetivo       = ObjetivoObesidadSerializer(allow_null=True)
    mediciones     = MedicionAntropometricaSerializer(many=True)
    farmacologico  = TratamientoFarmacologicoSerializer(many=True)
