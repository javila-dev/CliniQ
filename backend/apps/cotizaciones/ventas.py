"""Ventas: las cotizaciones aceptadas vistas como contrato.

No hay modelo ``Venta``: una venta es una ``Cotizacion`` aceptada (con su
cartera). Este endpoint solo da la lista de ventas; el detalle usa el de
cotizaciones (``/cotizaciones/{id}/``) y sus acciones. Ver
docs/plan-funnel-comercial.md.
"""

from datetime import date
from decimal import Decimal

from django.db.models import DecimalField, Exists, ExpressionWrapper, F, OuterRef, Prefetch, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.users.permissions import RequirePermission


_DINERO = DecimalField(max_digits=14, decimal_places=2)
_ITEM_SUBTOTAL = ExpressionWrapper(
    F("num_citas") * F("valor_unitario") * (Decimal("1") - F("descuento_porcentaje") / Decimal("100")),
    output_field=_DINERO,
)


def _suma_por_cotizacion(queryset, campo):
    """Subconsulta con la suma de ``campo`` por cotización (evita multiplicar filas con joins)."""
    return Coalesce(
        Subquery(queryset.values("cotizacion_ref").annotate(s=Sum(campo)).values("s")[:1], output_field=_DINERO),
        Value(Decimal("0")),
        output_field=_DINERO,
    )


def ventas_queryset(clinica=None):
    """Ventas que cuentan: aceptadas, activas y que no son datos previos migrados."""
    queryset = Cotizacion.objects.filter(estado=Cotizacion.Estado.ACEPTADA, activo=True, es_migracion=False)
    if clinica is not None:
        queryset = queryset.filter(clinica=clinica)
    return queryset


class VentaListSerializer(serializers.ModelSerializer):
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True)
    vendedor_nombre = serializers.CharField(source="profesional.nombre_completo", read_only=True, default=None)
    sede_nombre = serializers.CharField(source="sede.nombre", read_only=True, default=None)
    total = serializers.SerializerMethodField()
    total_pagado = serializers.SerializerMethodField()
    saldo_pendiente = serializers.SerializerMethodField()
    en_mora = serializers.BooleanField(source="_en_mora", read_only=True)
    cartera_id = serializers.SerializerMethodField()
    sesiones = serializers.SerializerMethodField()

    class Meta:
        model = Cotizacion
        fields = (
            "id",
            "paciente",
            "paciente_nombre",
            "profesional",
            "vendedor_nombre",
            "sede",
            "sede_nombre",
            "aceptada_en",
            "total",
            "total_pagado",
            "saldo_pendiente",
            "en_mora",
            "cartera_id",
            "sesiones",
        )
        read_only_fields = fields

    def _items(self, obj):
        return [item for item in obj.items.all() if item.activo]

    def get_total(self, obj):
        return f"{Decimal(obj.total_venta):.2f}"

    def get_total_pagado(self, obj):
        return f"{Decimal(obj.pagado_venta):.2f}"

    def get_saldo_pendiente(self, obj):
        return f"{Decimal(obj.saldo_venta):.2f}"

    def get_cartera_id(self, obj):
        cartera = getattr(obj, "cartera", None)
        return str(cartera.id) if cartera else None

    def get_sesiones(self, obj):
        """Sesiones del paquete: ``{"completadas", "total"}``, o None si no vende sesiones."""
        total = completadas = 0
        for item in self._items(obj):
            if item.tipo == ItemCotizacion.Tipo.INSUMO or not item.tiene_cupo_propio:
                continue
            total += item.num_sesiones_efectivas()
            completadas += item.sesiones_previas_consumidas + sum(
                1 for cita in item.citas.all() if cita.estado == "completada"
            )
        return {"completadas": completadas, "total": total} if total else None


class VentaViewSet(ReadOnlyModelViewSet):
    serializer_class = VentaListSerializer
    search_fields = ("paciente__nombres", "paciente__apellidos", "paciente__numero_documento")
    # total/pagado/saldo son anotaciones de get_queryset (?ordering=-saldo_venta).
    ordering_fields = ("aceptada_en", "total_venta", "pagado_venta", "saldo_venta")
    ordering = ("-aceptada_en",)
    # Solo la lista: el detalle de una venta es el de la cotización.
    http_method_names = ["get", "head", "options"]

    def get_permissions(self):
        # Mismo permiso que cotizaciones: nadie pierde acceso a lo que ya veía.
        return [RequirePermission("cotizaciones.ver")()]

    def get_queryset(self):
        from apps.agenda.models import Cita
        from apps.cartera.models import CUOTA_PENDIENTE_EXPR, CuotaCartera
        from apps.cobros.models import Cobro, PagoRecibido

        user = self.request.user
        queryset = ventas_queryset(None if user.rol == "superadmin" else user.clinica)
        # Igual que el listado de cotizaciones: un profesional solo ve lo que vendió.
        if user.rol == "profesional":
            queryset = queryset.filter(profesional=user)

        params = self.request.query_params
        desde, hasta = params.get("aceptada_desde"), params.get("aceptada_hasta")
        try:
            if desde:
                queryset = queryset.filter(aceptada_en__date__gte=date.fromisoformat(desde))
            if hasta:
                queryset = queryset.filter(aceptada_en__date__lte=date.fromisoformat(hasta))
        except ValueError:
            raise ValidationError({"error": "Rango de fechas invalido.", "code": "FECHA_INVALIDA"})
        if params.get("sede"):
            queryset = queryset.filter(sede_id=params["sede"])
        if params.get("vendedor"):
            queryset = queryset.filter(profesional_id=params["vendedor"])
        if params.get("paciente"):
            queryset = queryset.filter(paciente_id=params["paciente"])

        cuota_vencida = (
            CuotaCartera.objects.filter(
                cartera__cotizacion=OuterRef("pk"), anulada=False, fecha_esperada__lt=timezone.localdate()
            )
            .annotate(pendiente=CUOTA_PENDIENTE_EXPR)
            .filter(pendiente__gt=0)
        )
        # Mismas reglas que el detalle de la cotización: total = ítems cobrables,
        # pagado = pagos de cobros no anulados.
        items = ItemCotizacion.objects.filter(
            cotizacion=OuterRef("pk"), activo=True, es_obsequio=False,
        ).annotate(cotizacion_ref=F("cotizacion"), subtotal_item=_ITEM_SUBTOTAL)
        pagos = PagoRecibido.objects.filter(
            cobro__cotizacion=OuterRef("pk"),
        ).exclude(cobro__estado=Cobro.Estado.ANULADO).annotate(cotizacion_ref=F("cobro__cotizacion"))
        queryset = queryset.annotate(
            _en_mora=Exists(cuota_vencida),
            total_venta=_suma_por_cotizacion(items, "subtotal_item"),
            pagado_venta=_suma_por_cotizacion(pagos, "valor"),
        ).annotate(
            saldo_venta=ExpressionWrapper(F("total_venta") - F("pagado_venta"), output_field=_DINERO),
        )
        if params.get("con_mora") in {"1", "true"}:
            queryset = queryset.filter(_en_mora=True)

        return queryset.select_related("paciente", "profesional", "sede", "cartera").prefetch_related(
            Prefetch(
                "items",
                queryset=ItemCotizacion.objects.select_related("tratamiento").prefetch_related(
                    Prefetch("citas", queryset=Cita.objects.exclude(estado=Cita.Estado.CANCELADA)),
                ),
            ),
        )

    @action(detail=False, methods=["get"], url_path="vendedores")
    def vendedores(self, request):
        """Profesionales que tienen ventas, para el filtro de la lista."""
        from apps.users.models import User

        user = request.user
        ventas = ventas_queryset(None if user.rol == "superadmin" else user.clinica)
        if user.rol == "profesional":
            ventas = ventas.filter(profesional=user)
        usuarios = User.objects.filter(pk__in=ventas.exclude(profesional=None).values("profesional_id"))
        vendedores = [{"id": str(u.id), "nombre": u.nombre_completo} for u in usuarios]
        vendedores.sort(key=lambda v: v["nombre"].lower())
        return Response(vendedores)
