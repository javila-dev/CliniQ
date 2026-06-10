from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.cartera.models import Cartera, CuotaCartera


class CuotaCarteraSerializer(serializers.ModelSerializer):
    class Meta:
        model = CuotaCartera
        fields = (
            "id",
            "tipo",
            "descripcion",
            "valor_esperado",
            "fecha_esperada",
            "pagada",
            "valor_pagado",
            "fecha_pago",
            "medio_pago",
            "observaciones",
        )
        read_only_fields = fields


class CarteraListSerializer(serializers.ModelSerializer):
    cotizacion_id = serializers.UUIDField(read_only=True)
    paciente_id = serializers.UUIDField(read_only=True)
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True)
    total_pagado = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    saldo_pendiente = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    cuotas_total = serializers.SerializerMethodField()
    cuotas_pagadas = serializers.SerializerMethodField()
    proxima_cuota_fecha = serializers.SerializerMethodField()
    proxima_cuota_valor = serializers.SerializerMethodField()

    class Meta:
        model = Cartera
        fields = (
            "id",
            "cotizacion_id",
            "paciente_id",
            "paciente_nombre",
            "total",
            "total_pagado",
            "saldo_pendiente",
            "cuotas_total",
            "cuotas_pagadas",
            "proxima_cuota_fecha",
            "proxima_cuota_valor",
            "created_at",
        )

    def get_cuotas_total(self, obj):
        return obj.cuotas.count()

    def get_cuotas_pagadas(self, obj):
        return obj.cuotas.filter(pagada=True).count()

    def _get_proxima_cuota(self, obj):
        return obj.cuotas.filter(pagada=False).order_by("fecha_esperada", "created_at").first()

    def get_proxima_cuota_fecha(self, obj):
        cuota = self._get_proxima_cuota(obj)
        return cuota.fecha_esperada if cuota else None

    def get_proxima_cuota_valor(self, obj):
        cuota = self._get_proxima_cuota(obj)
        return cuota.valor_esperado if cuota else None


class CarteraDetailSerializer(CarteraListSerializer):
    cuotas = CuotaCarteraSerializer(many=True, read_only=True)

    class Meta(CarteraListSerializer.Meta):
        fields = CarteraListSerializer.Meta.fields + ("cuotas",)


class RegistrarPagoCuotaSerializer(serializers.Serializer):
    valor_pagado = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    fecha_pago = serializers.DateField()
    medio_pago = serializers.CharField(max_length=50)
    referencia = serializers.CharField(max_length=100, required=False, allow_blank=True)
    observaciones = serializers.CharField(max_length=300, required=False, allow_blank=True)

    def validate(self, attrs):
        cuota = self.context["cuota"]
        if attrs["valor_pagado"] > cuota.valor_esperado:
            raise serializers.ValidationError(
                {"error": "El valor pagado supera el valor esperado de la cuota.", "code": "PAGO_EXCEDE_CUOTA"}
            )
        if attrs["fecha_pago"] > timezone.localdate():
            raise serializers.ValidationError({"fecha_pago": "La fecha de pago no puede ser futura."})
        return attrs
