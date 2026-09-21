from decimal import Decimal

from rest_framework import serializers

from apps.clinicas.models import Sede
from apps.inventario.models import CategoriaInsumo, Insumo, MovimientoInventario, StockInsumoSede


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
        read_only_fields = ("id", "clinica", "created_at", "updated_at")


class InsumoSerializer(serializers.ModelSerializer):
    """El insumo (catalogo) se comparte entre sedes; el stock no.

    `stock_actual`, `costo_promedio`, `stock_bajo` y `valor_stock` reflejan
    la sede en contexto (`self.context["sede"]`, resuelta por la vista a
    partir de `?sede=` o la primera sede activa de la clinica). Sin sede en
    contexto no hay como responder "cuanto stock hay", asi que quedan en 0.
    """

    stock_actual = serializers.SerializerMethodField()
    costo_promedio = serializers.SerializerMethodField()
    stock_bajo = serializers.SerializerMethodField()
    valor_stock = serializers.SerializerMethodField()
    categoria_nombre = serializers.CharField(source="categoria.nombre", read_only=True, default=None)

    class Meta:
        model = Insumo
        fields = (
            "id",
            "clinica",
            "categoria",
            "categoria_nombre",
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
            "permite_stock_negativo",
            "activo",
            "stock_bajo",
            "valor_stock",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "clinica", "created_at", "updated_at")

    def _stock_row(self, obj) -> StockInsumoSede | None:
        sede = self.context.get("sede")
        if sede is None:
            return None
        prefetched = getattr(obj, "_stock_prefetched", None)
        if prefetched is not None:
            return prefetched[0] if prefetched else None
        return StockInsumoSede.objects.filter(insumo=obj, sede=sede).first()

    def get_stock_actual(self, obj) -> str:
        row = self._stock_row(obj)
        return str(row.stock_actual if row else Decimal("0"))

    def get_costo_promedio(self, obj) -> str:
        row = self._stock_row(obj)
        return str(row.costo_promedio if row else Decimal("0"))

    def get_stock_bajo(self, obj) -> bool:
        row = self._stock_row(obj)
        stock = row.stock_actual if row else Decimal("0")
        return stock <= obj.stock_minimo

    def get_valor_stock(self, obj) -> str:
        row = self._stock_row(obj)
        return str(row.valor_stock if row else Decimal("0"))

    def validate(self, attrs):
        es_consumo_interno = attrs.get("es_consumo_interno", getattr(self.instance, "es_consumo_interno", True))
        es_venta_retail = attrs.get("es_venta_retail", getattr(self.instance, "es_venta_retail", False))
        if not es_consumo_interno and not es_venta_retail:
            raise serializers.ValidationError(
                "El insumo debe ser de consumo interno, venta retail, o ambos."
            )
        return attrs


class AjusteStockSerializer(serializers.Serializer):
    sede = serializers.PrimaryKeyRelatedField(queryset=Sede.objects.all())
    cantidad_nueva = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0"))
    motivo = serializers.CharField(max_length=500)


class MovimientoInventarioSerializer(serializers.ModelSerializer):
    insumo_nombre = serializers.CharField(source="insumo.nombre", read_only=True)
    sede_nombre = serializers.CharField(source="sede.nombre", read_only=True)
    realizado_por_nombre = serializers.CharField(
        source="realizado_por.get_full_name", read_only=True
    )
    contexto = serializers.SerializerMethodField()

    class Meta:
        model = MovimientoInventario
        fields = (
            "id",
            "insumo",
            "insumo_nombre",
            "sede",
            "sede_nombre",
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
            "contexto",
            "fecha",
        )
        read_only_fields = fields

    def get_contexto(self, obj):
        """Detalle legible del origen del movimiento (a que compra, atencion
        o cobro corresponde), resuelto a partir de referencia_tipo/referencia_id."""
        if not obj.referencia_id or not obj.referencia_tipo:
            return None

        if obj.referencia_tipo == "orden_compra":
            from apps.proveedores.models import OrdenCompra

            orden = (
                OrdenCompra.objects.select_related("proveedor")
                .filter(pk=obj.referencia_id)
                .first()
            )
            if not orden:
                return None
            return {
                "tipo": "orden_compra",
                "orden_id": str(orden.id),
                "orden_numero": orden.numero,
                "proveedor_nombre": orden.proveedor.nombre,
                "numero_factura_proveedor": orden.numero_factura_proveedor or None,
            }

        if obj.referencia_tipo == "nota_clinica":
            from apps.historia_clinica.models import NotaClinica
            from apps.protocolos.services import contexto_sesion_para_cita

            nota = (
                NotaClinica.objects.select_related("historia__paciente", "cita", "cita__servicio")
                .filter(pk=obj.referencia_id)
                .first()
            )
            if not nota:
                return None

            servicio_nombre = None
            if nota.cita_id and nota.cita.servicio_id:
                servicio_nombre = nota.cita.servicio.nombre
            elif nota.cita_id:
                ctx = contexto_sesion_para_cita(nota.cita)
                if ctx:
                    servicio_nombre = ctx["tipo_sesion_nombre"] or ctx["tratamiento_nombre"]

            return {
                "tipo": "nota_clinica",
                "paciente_id": str(nota.historia.paciente_id),
                "paciente_nombre": nota.historia.paciente.nombre_completo,
                "cita_id": str(nota.cita_id) if nota.cita_id else None,
                "cita_fecha": nota.cita.fecha_inicio if nota.cita_id else None,
                "servicio_nombre": servicio_nombre,
            }

        if obj.referencia_tipo == "obsequio_cotizacion":
            from apps.cotizaciones.models import Cotizacion

            cotizacion = Cotizacion.objects.select_related("paciente").filter(pk=obj.referencia_id).first()
            if not cotizacion:
                return None
            return {
                "tipo": "obsequio",
                "cotizacion_id": str(cotizacion.id),
                "cotizacion_referencia": str(cotizacion.id)[:8].upper(),
                "paciente_id": str(cotizacion.paciente_id),
                "paciente_nombre": cotizacion.paciente.nombre_completo,
            }

        if obj.referencia_tipo == "cobro":
            from apps.cobros.models import Cobro

            cobro = (
                Cobro.objects.select_related("paciente", "cotizacion")
                .filter(pk=obj.referencia_id)
                .first()
            )
            if not cobro:
                return None
            return {
                "tipo": "cobro",
                "cobro_id": str(cobro.id),
                "paciente_id": str(cobro.paciente_id),
                "paciente_nombre": cobro.paciente.nombre_completo,
                "origen": cobro.origen,
                "cotizacion_id": str(cobro.cotizacion_id) if cobro.cotizacion_id else None,
                "cotizacion_numero": str(cobro.cotizacion_id)[:8].upper() if cobro.cotizacion_id else None,
            }

        return None
