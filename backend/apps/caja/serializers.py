from rest_framework import serializers

from apps.caja.models import CategoriaGasto, CierreCaja, GastoCaja


class CategoriaGastoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaGasto
        fields = ["id", "clinica", "nombre", "activa", "created_at"]
        read_only_fields = ["id", "created_at"]


class GastoCajaSerializer(serializers.ModelSerializer):
    registrado_por_nombre = serializers.SerializerMethodField()
    aprobado_por_nombre = serializers.SerializerMethodField()
    categoria_nombre = serializers.CharField(source="categoria.nombre", read_only=True)
    sede_nombre = serializers.CharField(source="sede.nombre", read_only=True)

    class Meta:
        model = GastoCaja
        fields = [
            "id",
            "sede",
            "sede_nombre",
            "categoria",
            "categoria_nombre",
            "descripcion",
            "valor",
            "soporte_foto",
            "fecha",
            "estado",
            "motivo_rechazo",
            "registrado_por",
            "registrado_por_nombre",
            "aprobado_por",
            "aprobado_por_nombre",
            "aprobado_en",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "estado",
            "motivo_rechazo",
            "registrado_por",
            "aprobado_por",
            "aprobado_en",
            "created_at",
        ]

    def get_registrado_por_nombre(self, obj):
        return obj.registrado_por.get_full_name() if obj.registrado_por_id else None

    def get_aprobado_por_nombre(self, obj):
        return obj.aprobado_por.get_full_name() if obj.aprobado_por_id else None

    def validate(self, attrs):
        valor = attrs.get("valor", getattr(self.instance, "valor", None))
        soporte_foto = attrs.get("soporte_foto", getattr(self.instance, "soporte_foto", None))
        if valor and valor > 50000 and not soporte_foto:
            raise serializers.ValidationError(
                {
                    "soporte_foto": "Para gastos mayores a $50.000 el soporte fotográfico es obligatorio.",
                    "code": "SOPORTE_REQUERIDO",
                }
            )
        return attrs


class RechazarGastoSerializer(serializers.Serializer):
    motivo_rechazo = serializers.CharField(min_length=5)


class CierreCajaSerializer(serializers.ModelSerializer):
    cerrado_por_nombre = serializers.SerializerMethodField()
    sede_nombre = serializers.CharField(source="sede.nombre", read_only=True)

    class Meta:
        model = CierreCaja
        fields = [
            "id",
            "sede",
            "sede_nombre",
            "fecha",
            "total_cobros",
            "total_gastos",
            "efectivo_contado",
            "diferencia",
            "observaciones",
            "cerrado_por",
            "cerrado_por_nombre",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "total_cobros",
            "total_gastos",
            "diferencia",
            "cerrado_por",
            "created_at",
        ]

    def get_cerrado_por_nombre(self, obj):
        return obj.cerrado_por.get_full_name() if obj.cerrado_por_id else None
