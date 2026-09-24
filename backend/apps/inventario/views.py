from django.db.models import Prefetch
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from apps.clinicas.models import Sede
from apps.inventario.models import CategoriaInsumo, Insumo, MovimientoInventario, StockInsumoSede
from apps.inventario.serializers import (
    AjusteStockSerializer,
    CategoriaInsumoSerializer,
    InsumoSerializer,
    MovimientoInventarioSerializer,
)
from apps.inventario.services import registrar_ajuste
from apps.users.authorization import sede_ids_para_filtro, user_has_permission
from apps.users.permissions import HasClinicamente, RequirePermission, get_clinica_activa


class PuedeListarInsumos(BasePermission):
    """Permite listar/ver insumos a quien puede gestionar inventario o solo registrar consumo en atencion."""

    def has_permission(self, request, view):
        return (
            user_has_permission(request.user, "inventario.ver", request=request)
            or user_has_permission(request.user, "inventario.consumo.registrar", request=request)
        )


class CategoriaInsumoViewSet(HasClinicamente, ModelViewSet):
    serializer_class = CategoriaInsumoSerializer
    queryset = CategoriaInsumo.objects.select_related("clinica").all()
    search_fields = ("nombre",)
    ordering_fields = ("nombre", "created_at")

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [RequirePermission("inventario.categorias.gestionar")()]
        return [RequirePermission("inventario.ver")()]

    def perform_create(self, serializer):
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            raise ValidationError({"clinica": "No hay una clínica activa."})
        serializer.save(clinica=clinica)


class InsumoViewSet(HasClinicamente, ModelViewSet):
    serializer_class = InsumoSerializer
    queryset = Insumo.objects.select_related("clinica", "categoria").all()
    search_fields = ("nombre", "descripcion")
    ordering_fields = ("nombre", "created_at")
    filterset_fields = ("es_consumo_interno", "es_venta_retail", "categoria", "activo")

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [RequirePermission("inventario.insumos.gestionar")()]
        if self.action == "ajustar_stock":
            return [RequirePermission("inventario.ajustar_stock")()]
        if self.action in {"list", "retrieve"}:
            return [PuedeListarInsumos()]
        return [RequirePermission("inventario.ver")()]

    def _sede_en_contexto(self):
        """Sede cuyo stock se muestra: la pedida por query param, o la primera
        sede activa de la clinica si no se especifico ninguna. Un usuario acotado
        a sedes solo puede consultar las suyas."""
        sede_id = self.request.query_params.get("sede")
        clinica = get_clinica_activa(self.request)
        sedes = Sede.objects.select_related("clinica")
        if clinica is not None:
            sedes = sedes.filter(clinica=clinica)
        sede_ids = sede_ids_para_filtro(self.request.user, sede_id)
        if sede_ids is not None:
            sedes = sedes.filter(id__in=sede_ids)
        if sede_id:
            return sedes.filter(pk=sede_id).first()
        if clinica is None:
            return None
        return sedes.filter(activo=True).order_by("created_at").first()

    def get_queryset(self):
        queryset = super().get_queryset()
        sede = self._sede_en_contexto()
        if sede is not None:
            queryset = queryset.prefetch_related(
                Prefetch(
                    "stocks_por_sede",
                    queryset=StockInsumoSede.objects.filter(sede=sede),
                    to_attr="_stock_prefetched",
                )
            )
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["sede"] = self._sede_en_contexto()
        return context

    def perform_create(self, serializer):
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            raise ValidationError({"clinica": "No hay una clínica activa."})
        serializer.save(clinica=clinica)

    @action(detail=False, methods=["get"], url_path="alertas_stock", pagination_class=None)
    def alertas_stock(self, request):
        sede = self._sede_en_contexto()
        if sede is None:
            return Response(
                {"error": "No hay una sede para consultar alertas de stock.", "code": "SEDE_REQUERIDA"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = self.get_queryset().filter(activo=True)
        serializer = self.get_serializer(qs, many=True)
        alertas = [item for item in serializer.data if item["stock_bajo"]]
        return Response(alertas)

    @action(detail=True, methods=["post"], url_path="ajustar_stock")
    def ajustar_stock(self, request, pk=None):
        insumo = self.get_object()
        serializer = AjusteStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not sede_ids_para_filtro(request.user, serializer.validated_data["sede"].id):
            raise PermissionDenied("No tienes acceso a esa sede.")
        movimiento = registrar_ajuste(
            insumo=insumo,
            sede=serializer.validated_data["sede"],
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
    filterset_fields = ("tipo", "origen", "insumo", "sede")
    search_fields = ("motivo", "realizado_por__first_name", "realizado_por__last_name")
    ordering_fields = ("fecha",)

    def get_queryset(self):
        qs = MovimientoInventario.objects.select_related(
            "insumo", "sede", "realizado_por"
        ).order_by("-fecha")
        user = self.request.user
        if user.rol != "superadmin":
            qs = qs.filter(insumo__clinica=user.clinica)
        sede_ids = sede_ids_para_filtro(user)
        if sede_ids is not None:
            qs = qs.filter(sede_id__in=sede_ids)
        insumo_id = self.request.query_params.get("insumo")
        if insumo_id:
            qs = qs.filter(insumo_id=insumo_id)
        return qs
