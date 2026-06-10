from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.proveedores.models import OrdenCompra, Proveedor
from apps.proveedores.serializers import (
    OrdenCompraSerializer,
    ProveedorSerializer,
    RecepcionOrdenSerializer,
)
from apps.proveedores.services import recibir_orden
from apps.users.permissions import HasClinicamente, RequirePermission


class ProveedorViewSet(HasClinicamente, ModelViewSet):
    serializer_class = ProveedorSerializer
    queryset = Proveedor.objects.select_related("clinica").all().order_by("nombre")
    search_fields = ("nombre", "nit", "contacto", "telefono", "email")
    ordering_fields = ("nombre", "created_at")
    filterset_fields = ("categoria", "activo", "clinica")

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [RequirePermission("proveedores.gestionar")()]
        return [RequirePermission("proveedores.ver")()]

    def perform_destroy(self, instance):
        instance.activo = False
        instance.save(update_fields=["activo", "updated_at"])


class OrdenCompraViewSet(ModelViewSet):
    serializer_class = OrdenCompraSerializer
    queryset = OrdenCompra.objects.select_related(
        "proveedor",
        "proveedor__clinica",
        "sede",
        "created_by",
    ).prefetch_related("items__insumo")
    search_fields = ("numero", "proveedor__nombre", "notas")
    ordering_fields = ("fecha", "created_at", "numero")
    filterset_fields = ("estado", "proveedor", "sede", "activo")

    def get_permissions(self):
        if self.action == "recibir":
            return [RequirePermission("proveedores.ordenes.recibir")()]
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [RequirePermission("proveedores.ordenes.gestionar")()]
        return [RequirePermission("proveedores.ordenes.ver")()]

    def get_queryset(self):
        queryset = super().get_queryset().order_by("-fecha", "-created_at")
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(proveedor__clinica=user.clinica)

        fecha = self.request.query_params.get("fecha")
        proveedor = self.request.query_params.get("proveedor")
        sede = self.request.query_params.get("sede")
        estado = self.request.query_params.get("estado")

        if fecha:
            queryset = queryset.filter(fecha=fecha)
        if proveedor:
            queryset = queryset.filter(proveedor_id=proveedor)
        if sede:
            queryset = queryset.filter(sede_id=sede)
        if estado:
            queryset = queryset.filter(estado=estado)
        return queryset

    def perform_destroy(self, instance):
        instance.activo = False
        if instance.estado != OrdenCompra.Estado.CANCELADA:
            instance.estado = OrdenCompra.Estado.CANCELADA
        instance.save(update_fields=["activo", "estado", "updated_at"])

    @action(detail=True, methods=["post"], url_path="recibir")
    def recibir(self, request, pk=None):
        orden = self.get_object()
        serializer = RecepcionOrdenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        orden = recibir_orden(
            orden_id=orden.id,
            items_recibidos=serializer.validated_data["items_recibidos"],
            user=request.user,
        )
        data = self.get_serializer(orden).data
        return Response(data, status=status.HTTP_200_OK)
