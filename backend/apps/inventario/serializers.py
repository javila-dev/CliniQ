from decimal import Decimal

from rest_framework import serializers

from apps.inventario.models import CategoriaInsumo, Insumo, MovimientoInventario


class CategoriaInsumoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaInsumo
        fields = (
            "id",
            "clinica",
            "nombre",
            "descripcion",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class InsumoSerializer(serializers.ModelSerializer):
    stock_bajo = serializers.BooleanField(read_only=True)
    valor_stock = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Insumo
        fields = (
            "id",
            "clinica",
            "categoria",
            "nombre",
            "descripcion",
            "es_consumo_interno",
            "es_venta_retail",
            "unidad_medida",
            "stock_actual",
            "stock_minimo",
            "costo_promedio",
            "precio_venta",
            "requiere_lote",
            "activo",
            "stock_bajo",
            "valor_stock",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "stock_actual", "costo_promedio", "created_at", "updated_at")

    def validate(self, attrs):
        es_consumo_interno = attrs.get("es_consumo_interno", getattr(self.instance, "es_consumo_interno", True))
        es_venta_retail = attrs.get("es_venta_retail", getattr(self.instance, "es_venta_retail", False))
        if not es_consumo_interno and not es_venta_retail:
            raise serializers.ValidationError(
                "El insumo debe ser de consumo interno, venta retail, o ambos."
            )
        return attrs


class AjusteStockSerializer(serializers.Serializer):
    cantidad_nueva = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0"))
    motivo = serializers.CharField(max_length=500)


class MovimientoInventarioSerializer(serializers.ModelSerializer):
    insumo_nombre = serializers.CharField(source="insumo.nombre", read_only=True)
    realizado_por_nombre = serializers.CharField(
        source="realizado_por.get_full_name", read_only=True
    )

    class Meta:
        model = MovimientoInventario
        fields = (
            "id",
            "insumo",
            "insumo_nombre",
            "tipo",
            "cantidad",
            "costo_unitario",
            "costo_promedio_resultante",
            "stock_resultante",
            "origen",
            "referencia_id",
            "referencia_tipo",
            "motivo",
            "realizado_por",
            "realizado_por_nombre",
            "fecha",
        )
        read_only_fields = fields
