from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.cartera.models import AcuerdoPago, Cartera, CuotaCartera


class CuotaCarteraSerializer(serializers.ModelSerializer):
    aprobada_por_nombre = serializers.CharField(
        source="aprobada_por.nombre_completo", read_only=True, allow_null=True
    )
    saldo_pendiente = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )
    vencida = serializers.BooleanField(read_only=True)
    acuerdo_numero = serializers.IntegerField(source="acuerdo.numero", read_only=True, allow_null=True)

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
            "anulada",
            "acuerdo_numero",
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
            "es_migracion",
            "created_at",
        )

    def _cuotas_vivas(self, obj):
        # Excluye las anuladas por un acuerdo de pago. Usa la cache del prefetch.
        return [c for c in obj.cuotas.all() if not c.anulada]

    def get_cuotas_total(self, obj):
        return len(self._cuotas_vivas(obj))

    def get_cuotas_pagadas(self, obj):
        # "Pagada" = cubierta por completo (un abono parcial no cuenta).
        return sum(1 for c in self._cuotas_vivas(obj) if c.saldo_pendiente <= 0)

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
        # (las cuotas sin fecha quedan al final). Se ignoran las anuladas por acuerdo.
        for c in obj.cuotas.all():
            if c.anulada:
                continue
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


class AcuerdoDocumentoSerializer(serializers.Serializer):
    """Estado de firma del acta de un acuerdo (subconjunto de Consentimiento)."""

    id = serializers.UUIDField(read_only=True)
    estado = serializers.CharField(read_only=True)
    firmado_en = serializers.DateTimeField(read_only=True)
    documenso_signing_token = serializers.CharField(read_only=True)
    documenso_documento_id = serializers.CharField(read_only=True)


class AcuerdoPagoSerializer(serializers.ModelSerializer):
    estado_display = serializers.CharField(source="get_estado_display", read_only=True)
    creado_por_nombre = serializers.CharField(
        source="creado_por.nombre_completo", read_only=True, allow_null=True
    )
    documento = AcuerdoDocumentoSerializer(read_only=True)
    cuotas_nuevas = serializers.SerializerMethodField()

    class Meta:
        model = AcuerdoPago
        fields = (
            "id",
            "cartera",
            "numero",
            "motivo",
            "estado",
            "estado_display",
            "saldo_al_proponer",
            "plan_propuesto",
            "vigente_desde",
            "creado_por_nombre",
            "motivo_anulacion",
            "anulado_en",
            "documento",
            "cuotas_nuevas",
            "created_at",
        )
        read_only_fields = fields

    def get_cuotas_nuevas(self, obj):
        if obj.estado != AcuerdoPago.Estado.VIGENTE:
            return []
        return CuotaCarteraSerializer(
            obj.cuotas.filter(anulada=False).order_by("fecha_esperada", "created_at"),
            many=True,
        ).data


class CarteraDetailSerializer(CarteraListSerializer):
    cuotas = serializers.SerializerMethodField()
    acuerdos = serializers.SerializerMethodField()
    acuerdo_pendiente = serializers.SerializerMethodField()

    class Meta(CarteraListSerializer.Meta):
        fields = CarteraListSerializer.Meta.fields + ("cuotas", "acuerdos", "acuerdo_pendiente")

    def get_cuotas(self, obj):
        # Solo el plan vigente: las cuotas anuladas por un acuerdo no se muestran.
        vivas = [c for c in obj.cuotas.all() if not c.anulada]
        return CuotaCarteraSerializer(vivas, many=True).data

    def get_acuerdos(self, obj):
        return AcuerdoPagoSerializer(
            obj.acuerdos.all().order_by("-created_at"), many=True
        ).data

    def get_acuerdo_pendiente(self, obj):
        pendiente = next(
            (a for a in obj.acuerdos.all() if a.estado == AcuerdoPago.Estado.PENDIENTE_FIRMA),
            None,
        )
        return AcuerdoPagoSerializer(pendiente).data if pendiente else None


class CuotaPropuestaSerializer(serializers.Serializer):
    tipo = serializers.ChoiceField(choices=CuotaCartera.Tipo.choices)
    descripcion = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    valor_esperado = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    fecha_esperada = serializers.DateField()


class CrearAcuerdoPagoSerializer(serializers.Serializer):
    cartera = serializers.PrimaryKeyRelatedField(queryset=Cartera.objects.all())
    motivo = serializers.CharField(max_length=2000)
    cuotas = CuotaPropuestaSerializer(many=True, allow_empty=False)


class AnularAcuerdoPagoSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=2000)


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
