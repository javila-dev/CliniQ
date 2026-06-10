from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from apps.inventario.models import CategoriaInsumo, Insumo, MovimientoInventario
from apps.inventario.serializers import (
    AjusteStockSerializer,
    CategoriaInsumoSerializer,
    InsumoSerializer,
    MovimientoInventarioSerializer,
)
from apps.inventario.services import registrar_ajuste
from apps.users.permissions import HasClinicamente, RequirePermission


class CategoriaInsumoViewSet(HasClinicamente, ModelViewSet):
    serializer_class = CategoriaInsumoSerializer
    queryset = CategoriaInsumo.objects.select_related("clinica").all()
    search_fields = ("nombre",)
    ordering_fields = ("nombre", "created_at")

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [RequirePermission("inventario.categorias.gestionar")()]
        return [RequirePermission("inventario.ver")()]


class InsumoViewSet(HasClinicamente, ModelViewSet):
    serializer_class = InsumoSerializer
    queryset = Insumo.objects.select_related("clinica", "categoria").all()
    search_fields = ("nombre", "descripcion")
    ordering_fields = ("nombre", "stock_actual", "created_at")
    filterset_fields = ("es_consumo_interno", "es_venta_retail", "categoria", "activo")

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [RequirePermission("inventario.insumos.gestionar")()]
        if self.action == "ajustar_stock":
            return [RequirePermission("inventario.ajustar_stock")()]
        return [RequirePermission("inventario.ver")()]

    @action(detail=False, methods=["get"], url_path="alertas_stock", pagination_class=None)
    def alertas_stock(self, request):
        qs = self.get_queryset().filter(activo=True)
        alertas = [i for i in qs if i.stock_bajo]
        serializer = self.get_serializer(alertas, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="ajustar_stock")
    def ajustar_stock(self, request, pk=None):
        insumo = self.get_object()
        serializer = AjusteStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        movimiento = registrar_ajuste(
            insumo=insumo,
            cantidad_nueva=serializer.validated_data["cantidad_nueva"],
            user=request.user,
            motivo=serializer.validated_data["motivo"],
        )
        return Response(
            MovimientoInventarioSerializer(movimiento).data,
            status=status.HTTP_200_OK,
        )


class KardexViewSet(ReadOnlyModelViewSet):
    serializer_class = MovimientoInventarioSerializer
    permission_classes = (RequirePermission("inventario.kardex.ver"),)
    filterset_fields = ("tipo", "origen", "insumo")
    ordering_fields = ("fecha",)

    def get_queryset(self):
        qs = MovimientoInventario.objects.select_related(
            "insumo", "realizado_por"
        ).order_by("-fecha")
        user = self.request.user
        if user.rol != "superadmin":
            qs = qs.filter(insumo__clinica=user.clinica)
        insumo_id = self.request.query_params.get("insumo")
        if insumo_id:
            qs = qs.filter(insumo_id=insumo_id)
        return qs
