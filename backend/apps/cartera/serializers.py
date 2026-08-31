from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.cartera.models import Cartera, CuotaCartera


class CuotaCarteraSerializer(serializers.ModelSerializer):
    aprobada_por_nombre = serializers.CharField(
        source="aprobada_por.nombre_completo", read_only=True, allow_null=True
    )
    saldo_pendiente = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )
    vencida = serializers.BooleanField(read_only=True)

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
            "saldo_pendiente",
            "vencida",
            "fecha_pago",
            "medio_pago",
            "observaciones",
            "excepcion_aprobada",
            "aprobada_por",
            "aprobada_por_nombre",
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
    en_mora = serializers.SerializerMethodField()
    mora_dias = serializers.SerializerMethodField()
    mora_valor = serializers.SerializerMethodField()

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
            "en_mora",
            "mora_dias",
            "mora_valor",
            "created_at",
        )

    def get_cuotas_total(self, obj):
        return obj.cuotas.count()

    def get_cuotas_pagadas(self, obj):
        # "Pagada" = cubierta por completo (un abono parcial no cuenta).
        return sum(1 for c in obj.cuotas.all() if c.saldo_pendiente <= 0)

    def _resumen_cuotas(self, obj):
        """Calcula una sola vez por cartera: próxima cuota con saldo y mora."""
        cached = getattr(obj, "_resumen_cuotas_cache", None)
        if cached is not None:
            return cached
        hoy = timezone.localdate()
        proxima = None
        mora_dias = 0
        mora_valor = Decimal("0")
        # obj.cuotas.all() respeta el orden del modelo: fecha_esperada, created_at
        # (las cuotas sin fecha quedan al final).
        for c in obj.cuotas.all():
            pendiente = c.saldo_pendiente
            if pendiente <= 0:
                continue
            if proxima is None:
                proxima = c
            if c.fecha_esperada and c.fecha_esperada < hoy:
                mora_dias = max(mora_dias, (hoy - c.fecha_esperada).days)
                mora_valor += pendiente
        cached = {
            "proxima": proxima,
            "mora_dias": mora_dias,
            "mora_valor": mora_valor,
            "en_mora": mora_dias > 0,
        }
        obj._resumen_cuotas_cache = cached
        return cached

    def get_proxima_cuota_fecha(self, obj):
        proxima = self._resumen_cuotas(obj)["proxima"]
        return proxima.fecha_esperada if proxima else None

    def get_proxima_cuota_valor(self, obj):
        proxima = self._resumen_cuotas(obj)["proxima"]
        return f"{proxima.saldo_pendiente:.2f}" if proxima else None

    def get_en_mora(self, obj):
        return self._resumen_cuotas(obj)["en_mora"]

    def get_mora_dias(self, obj):
        return self._resumen_cuotas(obj)["mora_dias"]

    def get_mora_valor(self, obj):
        return f"{self._resumen_cuotas(obj)['mora_valor']:.2f}"


class CarteraDetailSerializer(CarteraListSerializer):
    cuotas = CuotaCarteraSerializer(many=True, read_only=True)

    class Meta(CarteraListSerializer.Meta):
        fields = CarteraListSerializer.Meta.fields + ("cuotas",)


class ModificarPlazoCuotaSerializer(serializers.Serializer):
    fecha_vencimiento = serializers.DateField(required=False)
    monto = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"), required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Se debe enviar al menos fecha_vencimiento o monto.")
        return attrs


class RegistrarPagoCuotaSerializer(serializers.Serializer):
    valor_pagado = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    fecha_pago = serializers.DateField()
    medio_pago = serializers.CharField(max_length=50)
    referencia = serializers.CharField(max_length=100, required=False, allow_blank=True)
    observaciones = serializers.CharField(max_length=300, required=False, allow_blank=True)

    def validate(self, attrs):
        cuota = self.context["cuota"]
        # Se compara contra el saldo pendiente (permite abonos parciales y varios
        # pagos sobre la misma cuota hasta cubrirla).
        if attrs["valor_pagado"] > cuota.saldo_pendiente:
            raise serializers.ValidationError(
                {
                    "error": "El valor pagado supera el saldo pendiente de la cuota.",
                    "code": "PAGO_EXCEDE_CUOTA",
                }
            )
        if attrs["fecha_pago"] > timezone.localdate():
            raise serializers.ValidationError({"fecha_pago": "La fecha de pago no puede ser futura."})
        return attrs
