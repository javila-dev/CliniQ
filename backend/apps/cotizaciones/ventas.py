"""Ventas: las cotizaciones aceptadas vistas como contrato.

No hay modelo ``Venta``: una venta es una ``Cotizacion`` aceptada (con su
cartera). Este endpoint solo da la lista de ventas; el detalle usa el de
cotizaciones (``/cotizaciones/{id}/``) y sus acciones. Ver
docs/plan-funnel-comercial.md.
"""

from datetime import date
from decimal import Decimal

from django.db.models import DecimalField, Exists, OuterRef, Prefetch, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.users.permissions import RequirePermission


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

    def _total(self, obj):
        return sum((item.subtotal for item in self._items(obj)), Decimal("0.00"))

    def get_total(self, obj):
        return f"{self._total(obj):.2f}"

    def get_total_pagado(self, obj):
        return f"{Decimal(obj._total_pagado):.2f}"

    def get_saldo_pendiente(self, obj):
        return f"{self._total(obj) - Decimal(obj._total_pagado):.2f}"

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
    ordering_fields = ("aceptada_en",)
    ordering = ("-aceptada_en",)
    # Solo la lista: el detalle de una venta es el de la cotización.
    http_method_names = ["get", "head", "options"]

    def get_permissions(self):
        # Mismo permiso que cotizaciones: nadie pierde acceso a lo que ya veía.
        return [RequirePermission("cotizaciones.ver")()]

    def get_queryset(self):
        from apps.agenda.models import Cita
        from apps.cartera.models import CUOTA_PENDIENTE_EXPR, CuotaCartera

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
        queryset = queryset.annotate(
            _en_mora=Exists(cuota_vencida),
            _total_pagado=Coalesce(
                Sum("cobros__pagos__valor", filter=~Q(cobros__estado="anulado")),
                Decimal("0"),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
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
