from rest_framework import serializers

from apps.configuracion.models import (
    HISTORIA_TABS_DISPONIBLES,
    ConfiguracionHistoria,
    ConfiguracionSignosVitales,
    DocumensoConsentimientoTemplate,
)


class DocumensoConsentimientoTemplateSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()

    class Meta:
        model = DocumensoConsentimientoTemplate
        fields = (
            "id",
            "tipo",
            "label",
            "template_token",
            "activo",
            "updated_at",
        )
        read_only_fields = ("id", "label", "updated_at")

    def get_label(self, obj):
        return dict(DocumensoConsentimientoTemplate._meta.get_field("tipo").choices).get(obj.tipo, obj.tipo)

    def create(self, validated_data):
        validated_data["clinica"] = self.context["clinica"]
        return super().create(validated_data)


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
