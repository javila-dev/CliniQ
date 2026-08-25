from rest_framework import serializers

from apps.configuracion.models import (
    HISTORIA_TABS_DISPONIBLES,
    ConfiguracionCartera,
    ConfiguracionHistoria,
    ConfiguracionRegistroPublico,
    ConfiguracionSignosVitales,
    ConfiguracionWizard,
    DocumensoConsentimientoTemplate,
)
from apps.pacientes.models import ConfiguracionFacial


class ConfiguracionCarteraSerializer(serializers.ModelSerializer):
    plantilla_compromiso_pago_nombre = serializers.CharField(
        source="plantilla_compromiso_pago.nombre", read_only=True, default=None,
    )

    class Meta:
        model = ConfiguracionCartera
        fields = (
            "requiere_consentimiento_promocional",
            "plantilla_compromiso_pago",
            "plantilla_compromiso_pago_nombre",
            "updated_at",
        )
        read_only_fields = ("plantilla_compromiso_pago_nombre", "updated_at")

    def validate(self, attrs):
        plantilla = attrs.get("plantilla_compromiso_pago", getattr(self.instance, "plantilla_compromiso_pago", None))
        requiere = attrs.get(
            "requiere_consentimiento_promocional",
            getattr(self.instance, "requiere_consentimiento_promocional", False),
        )
        if requiere and not plantilla:
            raise serializers.ValidationError(
                {"plantilla_compromiso_pago": "Selecciona una plantilla antes de activar este requisito."}
            )
        if plantilla and plantilla.clinica_id != self.instance.clinica_id:
            raise serializers.ValidationError(
                {"plantilla_compromiso_pago": "La plantilla no pertenece a tu clinica."}
            )
        return attrs


class DocumensoConsentimientoTemplateSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()
    tiene_pdf = serializers.SerializerMethodField()
    tiene_campos = serializers.SerializerMethodField()

    class Meta:
        model = DocumensoConsentimientoTemplate
        fields = (
            "id",
            "nombre",
            "tipo",
            "label",
            "template_token",
            "tiene_pdf",
            "tiene_campos",
            "campos",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "label", "tiene_pdf", "tiene_campos", "created_at", "updated_at")

    def get_label(self, obj):
        if obj.nombre:
            return obj.nombre
        choices = dict(DocumensoConsentimientoTemplate._meta.get_field("tipo").choices)
        return choices.get(obj.tipo, obj.tipo)

    def get_tiene_pdf(self, obj):
        return bool(obj.pdf_file)

    def get_tiene_campos(self, obj):
        return bool(obj.campos)

    def create(self, validated_data):
        validated_data["clinica"] = self.context["clinica"]
        return super().create(validated_data)


class PlantillaConsentimientoUploadSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=200)
    pdf = serializers.FileField()

    def validate_pdf(self, value):
        if not value.name.lower().endswith(".pdf"):
            raise serializers.ValidationError("Solo se aceptan archivos PDF.")
        if value.size > 20 * 1024 * 1024:
            raise serializers.ValidationError("El archivo no puede superar 20 MB.")
        return value


class PlantillaCamposSerializer(serializers.Serializer):
    campos = serializers.ListField(child=serializers.DictField(), allow_empty=True)


class ConfiguracionSignosVitalesSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConfiguracionSignosVitales
        fields = ("campos_extra", "updated_at")
        read_only_fields = ("updated_at",)

    def validate_campos_extra(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Debe ser una lista de objetos.")
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Cada campo extra debe ser un objeto.")
        return value


class ConfiguracionHistoriaSerializer(serializers.ModelSerializer):
    tabs_disponibles = serializers.SerializerMethodField()

    class Meta:
        model = ConfiguracionHistoria
        fields = ("tabs_activos", "tabs_disponibles", "updated_at")
        read_only_fields = ("tabs_disponibles", "updated_at")

    def get_tabs_disponibles(self, obj):
        activos = self._normalize_tabs(obj.tabs_activos)
        return [
            {
                "slug": slug,
                "label": label,
                "activo": slug in activos,
                "obligatorio": obligatorio,
            }
            for slug, label, obligatorio in HISTORIA_TABS_DISPONIBLES
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["tabs_activos"] = self._normalize_tabs(instance.tabs_activos)
        return data

    def validate_tabs_activos(self, value):
        return self._normalize_tabs(value)

    def _normalize_tabs(self, value):
        disponibles = {slug: (label, obligatorio) for slug, label, obligatorio in HISTORIA_TABS_DISPONIBLES}
        if not isinstance(value, list) or len(value) == 0:
            return [slug for slug, _, _ in HISTORIA_TABS_DISPONIBLES]

        selected = value
        normalized = []
        for slug in selected:
            if slug in disponibles and slug not in normalized:
                normalized.append(slug)
        if "datos-generales" not in normalized:
            normalized.insert(0, "datos-generales")
        return normalized


class ConfiguracionWizardSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConfiguracionWizard
        fields = ("paso_checkin", "paso_pago", "paso_firma_asistencia", "paso_verificacion_facial", "updated_at")
        read_only_fields = ("updated_at",)


class ConfiguracionFacialSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConfiguracionFacial
        fields = (
            "umbral_alta",
            "umbral_media",
            "checkin_automatico",
            "min_det_score",
            "min_blur_score",
            "min_brightness",
            "max_brightness",
            "max_yaw",
            "max_pitch",
            "max_roll",
            "min_face_area_pct",
            "updated_at",
        )
        read_only_fields = ("updated_at",)

    def validate(self, data):
        umbral_alta = data.get("umbral_alta", self.instance.umbral_alta if self.instance else 0.85)
        umbral_media = data.get("umbral_media", self.instance.umbral_media if self.instance else 0.70)
        if umbral_media >= umbral_alta:
            raise serializers.ValidationError(
                {"umbral_media": "El umbral de confianza media debe ser menor al umbral de confianza alta."}
            )
        return data


class ConfiguracionRegistroPublicoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConfiguracionRegistroPublico
        fields = ("tab_personal_requerido", "tab_salud_requerido", "updated_at")
        read_only_fields = ("updated_at",)
