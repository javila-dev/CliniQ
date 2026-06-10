from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.caja.models import CategoriaGasto, CierreCaja, GastoCaja
from apps.caja.serializers import (
    CategoriaGastoSerializer,
    CierreCajaSerializer,
    GastoCajaSerializer,
    RechazarGastoSerializer,
)
from apps.cobros.models import Cobro, PagoRecibido
from apps.users.permissions import RequirePermission


class CategoriaGastoViewSet(ModelViewSet):
    queryset = CategoriaGasto.objects.select_related("clinica").all()
    serializer_class = CategoriaGastoSerializer
    filterset_fields = ("activa",)
    search_fields = ("nombre",)

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [RequirePermission("caja.categorias.gestionar")()]
        return [RequirePermission("caja.categorias.ver")()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            qs = qs.filter(clinica=user.clinica)
        return qs


class GastoCajaViewSet(ModelViewSet):
    queryset = GastoCaja.objects.select_related(
        "sede", "categoria", "registrado_por", "aprobado_por"
    ).all()
    serializer_class = GastoCajaSerializer
    filterset_fields = ("estado", "fecha", "categoria", "sede")
    ordering_fields = ("fecha", "valor", "created_at")

    def get_permissions(self):
        if self.action in ("aprobar", "rechazar"):
            return [RequirePermission("caja.gastos.aprobar")()]
        if self.action in ("update", "partial_update", "destroy"):
            return [RequirePermission("caja.gastos.editar")()]
        if self.action == "create":
            return [RequirePermission("caja.gastos.registrar")()]
        return [RequirePermission("caja.gastos.ver")()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            qs = qs.filter(sede__clinica=user.clinica)
        return qs

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user)

    def perform_destroy(self, instance):
        if instance.estado == GastoCaja.Estado.APROBADO:
            raise ValidationError(
                {"error": "No se puede eliminar un gasto aprobado.", "code": "GASTO_APROBADO"}
            )
        instance.delete()

    @action(detail=True, methods=["post"], permission_classes=[RequirePermission("caja.gastos.aprobar")])
    def aprobar(self, request, pk=None):
        gasto = self.get_object()
        if gasto.estado != GastoCaja.Estado.PENDIENTE:
            raise ValidationError(
                {"error": "Solo se pueden aprobar gastos en estado pendiente.", "code": "ESTADO_INVALIDO"}
            )
        gasto.estado = GastoCaja.Estado.APROBADO
        gasto.aprobado_por = request.user
        gasto.aprobado_en = timezone.now()
        gasto.save(update_fields=["estado", "aprobado_por", "aprobado_en"])
        return Response(GastoCajaSerializer(gasto).data)

    @action(detail=True, methods=["post"], permission_classes=[RequirePermission("caja.gastos.aprobar")])
    def rechazar(self, request, pk=None):
        gasto = self.get_object()
        if gasto.estado != GastoCaja.Estado.PENDIENTE:
            raise ValidationError(
                {"error": "Solo se pueden rechazar gastos en estado pendiente.", "code": "ESTADO_INVALIDO"}
            )
        serializer = RechazarGastoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        gasto.estado = GastoCaja.Estado.RECHAZADO
        gasto.motivo_rechazo = serializer.validated_data["motivo_rechazo"]
        gasto.save(update_fields=["estado", "motivo_rechazo"])
        return Response(GastoCajaSerializer(gasto).data)


class CierreCajaViewSet(ModelViewSet):
    queryset = CierreCaja.objects.select_related("sede", "cerrado_por").all()
    serializer_class = CierreCajaSerializer
    filterset_fields = ("sede", "fecha")
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        if self.action == "create":
            return [RequirePermission("caja.cierre.realizar")()]
        return [RequirePermission("caja.cierre.ver")()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            qs = qs.filter(sede__clinica=user.clinica)
        return qs

    def perform_create(self, serializer):
        sede = serializer.validated_data["sede"]
        fecha = serializer.validated_data["fecha"]

        if CierreCaja.objects.filter(sede=sede, fecha=fecha).exists():
            raise ValidationError(
                {
                    "error": "Ya existe un cierre de caja para esta sede y fecha.",
                    "code": "CIERRE_DUPLICADO",
                }
            )

        total_cobros = (
            PagoRecibido.objects.filter(
                cobro__sede=sede,
                cobro__estado=Cobro.Estado.PAGADO,
                fecha__date=fecha,
            ).aggregate(total=Sum("valor"))["total"]
            or 0
        )

        total_gastos = (
            GastoCaja.objects.filter(
                sede=sede,
                estado=GastoCaja.Estado.APROBADO,
                fecha=fecha,
            ).aggregate(total=Sum("valor"))["total"]
            or 0
        )

        efectivo_contado = serializer.validated_data["efectivo_contado"]

        total_efectivo_cobros = (
            PagoRecibido.objects.filter(
                cobro__sede=sede,
                cobro__estado=Cobro.Estado.PAGADO,
                fecha__date=fecha,
                medio_pago="efectivo",
            ).aggregate(total=Sum("valor"))["total"]
            or 0
        )
        diferencia = efectivo_contado - total_efectivo_cobros + total_gastos

        serializer.save(
            cerrado_por=self.request.user,
            total_cobros=total_cobros,
            total_gastos=total_gastos,
            diferencia=diferencia,
        )

    @action(detail=False, methods=["get"], url_path="resumen_dia")
    def resumen_dia(self, request):
        sede_id = request.query_params.get("sede_id")
        fecha_str = request.query_params.get("fecha")

        if not sede_id:
            raise ValidationError({"error": "sede_id es requerido.", "code": "SEDE_REQUERIDA"})

        from apps.clinicas.models import Sede
        try:
            if request.user.rol != "superadmin":
                sede = Sede.objects.get(id=sede_id, clinica=request.user.clinica)
            else:
                sede = Sede.objects.get(id=sede_id)
        except Sede.DoesNotExist:
            raise ValidationError({"error": "Sede no encontrada.", "code": "SEDE_NOT_FOUND"})

        from datetime import date
        if fecha_str:
            try:
                from datetime import datetime
                fecha = datetime.strptime(fecha_str, "%Y-%m-%d").date()
            except ValueError:
                raise ValidationError({"error": "Formato de fecha inválido. Use YYYY-MM-DD.", "code": "FECHA_INVALIDA"})
        else:
            fecha = date.today()

        cierre = CierreCaja.objects.filter(sede=sede, fecha=fecha).first()

        pagos_qs = PagoRecibido.objects.filter(
            cobro__sede=sede,
            cobro__estado=Cobro.Estado.PAGADO,
            fecha__date=fecha,
        )

        total_cobros = pagos_qs.aggregate(total=Sum("valor"))["total"] or 0

        por_medio = list(
            pagos_qs.values("medio_pago").annotate(total=Sum("valor")).order_by("medio_pago")
        )

        total_gastos_aprobados = (
            GastoCaja.objects.filter(sede=sede, estado=GastoCaja.Estado.APROBADO, fecha=fecha)
            .aggregate(total=Sum("valor"))["total"]
            or 0
        )

        gastos_pendientes = GastoCaja.objects.filter(
            sede=sede, estado=GastoCaja.Estado.PENDIENTE, fecha=fecha
        ).count()

        return Response(
            {
                "fecha": fecha,
                "sede": str(sede.id),
                "sede_nombre": sede.nombre,
                "total_cobros": total_cobros,
                "total_gastos": total_gastos_aprobados,
                "gastos_pendientes_aprobacion": gastos_pendientes,
                "por_medio_pago": por_medio,
                "caja_cerrada": cierre is not None,
                "cierre_id": str(cierre.id) if cierre else None,
            }
        )
