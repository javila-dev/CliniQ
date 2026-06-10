from decimal import Decimal

from rest_framework import serializers

from apps.cobros.models import Cobro, ItemCobro, PagoRecibido


class PagoRecibidoSerializer(serializers.ModelSerializer):
    recibido_por_nombre = serializers.CharField(
        source="recibido_por.get_full_name", read_only=True
    )

    class Meta:
        model = PagoRecibido
        fields = (
            "id",
            "cobro",
            "medio_pago",
            "valor",
            "referencia",
            "fecha",
            "recibido_por",
            "recibido_por_nombre",
            "created_at",
        )
        read_only_fields = ("id", "cobro", "recibido_por", "created_at")


class ItemCobroSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemCobro
        fields = (
            "id",
            "cobro",
            "tipo",
            "servicio",
            "insumo",
            "descripcion",
            "cantidad",
            "precio_unitario",
            "costo_unitario",
            "subtotal",
            "created_at",
        )
        read_only_fields = ("id", "cobro", "costo_unitario", "subtotal", "created_at")


class ItemCobroCreateSerializer(serializers.Serializer):
    tipo = serializers.ChoiceField(choices=ItemCobro.TipoItem.choices)
    servicio = serializers.UUIDField(required=False, allow_null=True)
    insumo = serializers.UUIDField(required=False, allow_null=True)
    descripcion = serializers.CharField(max_length=200, required=False, allow_blank=True)
    cantidad = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"))
    precio_unitario = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))

    def validate(self, attrs):
        tipo = attrs["tipo"]
        if tipo == ItemCobro.TipoItem.SERVICIO and not attrs.get("servicio"):
            raise serializers.ValidationError(
                {"servicio": "Requerido para ítems de tipo servicio."}
            )
        if tipo in {ItemCobro.TipoItem.INSUMO_CONSUMO, ItemCobro.TipoItem.PRODUCTO_RETAIL}:
            if not attrs.get("insumo"):
                raise serializers.ValidationError(
                    {"insumo": "Requerido para ítems de tipo insumo."}
                )
        return attrs


class PagoCreateSerializer(serializers.Serializer):
    medio_pago = serializers.ChoiceField(choices=PagoRecibido.MedioPago.choices)
    valor = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    referencia = serializers.CharField(max_length=100, required=False, allow_blank=True)
    fecha = serializers.DateTimeField(required=False)


class CobroSerializer(serializers.ModelSerializer):
    items = ItemCobroSerializer(many=True, read_only=True)
    pagos = PagoRecibidoSerializer(many=True, read_only=True)
    saldo_pendiente = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    paciente_nombre = serializers.CharField(
        source="paciente.nombre_completo", read_only=True
    )
    profesional_nombre = serializers.CharField(source="profesional.nombre_completo", read_only=True)
    sede_nombre = serializers.CharField(source="sede.nombre", read_only=True)
    cotizacion_numero = serializers.SerializerMethodField()

    class Meta:
        model = Cobro
        fields = (
            "id",
            "origen",
            "cotizacion",
            "cotizacion_numero",
            "cita",
            "paciente",
            "paciente_nombre",
            "profesional",
            "profesional_nombre",
            "sede",
            "sede_nombre",
            "fecha",
            "subtotal",
            "descuento",
            "total",
            "estado",
            "notas",
            "saldo_pendiente",
            "items",
            "pagos",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "subtotal",
            "total",
            "estado",
            "saldo_pendiente",
            "created_by",
            "created_at",
            "updated_at",
        )

    def get_cotizacion_numero(self, obj):
        if not obj.cotizacion_id:
            return None
        return f"COT-{str(obj.cotizacion_id)[:8].upper()}"


class CobroCreateSerializer(serializers.ModelSerializer):
    items = ItemCobroCreateSerializer(many=True, required=False)

    class Meta:
        model = Cobro
        fields = ("origen", "cotizacion", "cita", "paciente", "profesional", "sede", "notas", "descuento", "items")

    def validate(self, attrs):
        origen = attrs.get("origen", Cobro.Origen.CITA)
        cita = attrs.get("cita")
        cotizacion = attrs.get("cotizacion")

        if origen == Cobro.Origen.CITA:
            if not cita:
                raise serializers.ValidationError({"cita": "Requerida cuando el origen es cita."})
            if cotizacion:
                raise serializers.ValidationError({"cotizacion": "Debe estar vacia cuando el origen es cita."})
        elif origen == Cobro.Origen.COTIZACION:
            if not cotizacion:
                raise serializers.ValidationError({"cotizacion": "Requerida cuando el origen es cotizacion."})
            if cita:
                raise serializers.ValidationError({"cita": "Debe estar vacia cuando el origen es cotizacion."})

        if cita and hasattr(cita, "cobro"):
            raise serializers.ValidationError(
                {"cita": "Esta cita ya tiene un cobro asociado."}
            )
        return attrs
