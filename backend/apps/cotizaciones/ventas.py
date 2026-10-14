"""Ventas: las cotizaciones aceptadas vistas como contrato.

No hay modelo ``Venta``: una venta es una ``Cotizacion`` aceptada (con su
cartera). Este endpoint solo da la lista de ventas; el detalle usa el de
cotizaciones (``/cotizaciones/{id}/``) y sus acciones. Ver
docs/plan-funnel-comercial.md.
"""

import uuid
from datetime import date
from decimal import Decimal

from django.db.models import (
    Count, DecimalField, Exists, ExpressionWrapper, F, OuterRef, Prefetch, Q, Subquery, Sum, Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.users.authorization import sede_ids_para_filtro, ve_solo_su_actividad_comercial
from apps.users.permissions import RequirePermission, get_clinica_activa


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


def _uuid_param(params, nombre):
    """Valor UUID de un parámetro de la URL; 400 (no 500) si viene mal formado."""
    valor = params.get(nombre)
    if not valor:
        return None
    try:
        return uuid.UUID(str(valor))
    except ValueError:
        raise ValidationError({"error": f"El filtro '{nombre}' no es valido.", "code": "FILTRO_INVALIDO"})


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
        from apps.clinicas.models import TipoSesion
        from apps.cobros.models import Cobro, PagoRecibido
        from apps.protocolos.models import TratamientoPaciente

        user = self.request.user
        queryset = ventas_queryset(get_clinica_activa(self.request))
        # Igual que el listado de cotizaciones: quien atiende pacientes sin permiso
        # de ver toda la sede solo ve lo que vendió.
        if ve_solo_su_actividad_comercial(user, self.request):
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
        # Mismo alcance por sede que los KPIs del dashboard: un usuario limitado a
        # unas sedes solo ve sus ventas, y no puede pedir las de otra sede.
        sede_ids = sede_ids_para_filtro(user, _uuid_param(params, "sede"))
        if sede_ids is not None:
            queryset = queryset.filter(sede_id__in=sede_ids)
        if vendedor := _uuid_param(params, "vendedor"):
            queryset = queryset.filter(profesional_id=vendedor)
        if paciente := _uuid_param(params, "paciente"):
            queryset = queryset.filter(paciente_id=paciente)

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

        # Lo que leen get_sesiones / num_sesiones_efectivas, precargado: antes cada
        # ítem tratamiento consultaba su seguimiento, sus obsequios y el catálogo (M5-19).
        seguimientos = TratamientoPaciente.objects.annotate(
            _n_sesiones_vendidas=Count("sesiones", filter=Q(sesiones__item_obsequio__isnull=True)),
        ).order_by("created_at")
        return queryset.select_related("paciente", "profesional", "sede", "cartera").prefetch_related(
            Prefetch(
                "items",
                queryset=ItemCotizacion.objects.select_related("tratamiento").prefetch_related(
                    Prefetch("citas", queryset=Cita.objects.exclude(estado=Cita.Estado.CANCELADA)),
                    Prefetch(
                        "obsequios",
                        queryset=ItemCotizacion.objects.filter(activo=True, es_obsequio=True, agendable=True),
                        to_attr="_obsequios_agendables",
                    ),
                    Prefetch("tratamientos_paciente", queryset=seguimientos, to_attr="_seguimientos_vendidos"),
                    Prefetch(
                        "tratamiento__tipos_sesion",
                        queryset=TipoSesion.objects.filter(es_compromiso=True, activo=True),
                        to_attr="_tipos_sesion_compromiso",
                    ),
                ),
            ),
        )

    @action(detail=False, methods=["get"], url_path="vendedores")
    def vendedores(self, request):
        """Profesionales que tienen ventas, para el filtro de la lista."""
        from apps.users.models import User

        user = request.user
        ventas = ventas_queryset(get_clinica_activa(request))
        if ve_solo_su_actividad_comercial(user, request):
            ventas = ventas.filter(profesional=user)
        sede_ids = sede_ids_para_filtro(user)
        if sede_ids is not None:
            ventas = ventas.filter(sede_id__in=sede_ids)
        usuarios = User.objects.filter(pk__in=ventas.exclude(profesional=None).values("profesional_id"))
        vendedores = [{"id": str(u.id), "nombre": u.nombre_completo} for u in usuarios]
        vendedores.sort(key=lambda v: v["nombre"].lower())
        return Response(vendedores)
