from datetime import datetime, time
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet, ReadOnlyModelViewSet

from apps.cartera.models import Cartera, CuotaCartera
from apps.cartera.serializers import (
    CarteraDetailSerializer,
    CarteraListSerializer,
    CuotaCarteraSerializer,
    RegistrarPagoCuotaSerializer,
)
from apps.cobros.models import Cobro
from apps.cobros.services import registrar_pago
from apps.users.permissions import RequirePermission


class CarteraViewSet(ReadOnlyModelViewSet):
    queryset = Cartera.objects.select_related("cotizacion", "paciente").prefetch_related("cuotas").all()
    serializer_class = CarteraListSerializer
    pagination_class = None

    def get_permissions(self):
        return [RequirePermission("cartera.ver")()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(paciente__clinica=user.clinica)

        paciente = self.request.query_params.get("paciente")
        estado = self.request.query_params.get("estado")
        sede_id = self.request.query_params.get("sede_id")
        if paciente:
            queryset = queryset.filter(paciente_id=paciente)
        if sede_id:
            queryset = queryset.filter(cotizacion__sede_id=sede_id)
        if estado in {"pagada", "vencida", "pendiente"}:
            queryset = self._filter_by_estado(queryset, estado)
        return queryset

    def _filter_by_estado(self, queryset, estado):
        today = timezone.localdate()
        matched_ids = []
        for cartera in queryset:
            is_pagada = cartera.saldo_pendiente <= 0
            is_vencida = cartera.cuotas.filter(pagada=False, fecha_esperada__lt=today).exists()
            is_pendiente = not is_pagada and not is_vencida
            if (estado == "pagada" and is_pagada) or (estado == "vencida" and is_vencida) or (
                estado == "pendiente" and is_pendiente
            ):
                matched_ids.append(cartera.id)
        return queryset.filter(id__in=matched_ids)

    def get_serializer_class(self):
        if self.action == "retrieve":
            return CarteraDetailSerializer
        return CarteraListSerializer

    def _money(self, value):
        return f"{Decimal(value):.2f}"

    @action(detail=False, methods=["get"], url_path="resumen", pagination_class=None)
    def resumen(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        total_cartera = queryset.aggregate(s=Sum("total"))["s"] or Decimal("0")
        total_cobrado = sum((item.total_pagado for item in queryset), Decimal("0"))
        saldo_pendiente = total_cartera - total_cobrado
        cuotas_vencidas_qs = CuotaCartera.objects.filter(
            cartera__in=queryset,
            pagada=False,
            fecha_esperada__lt=timezone.localdate(),
        )
        cuotas_vencidas = cuotas_vencidas_qs.count()
        cuotas_vencidas_valor = cuotas_vencidas_qs.aggregate(s=Sum("valor_esperado"))["s"] or Decimal("0")
        return Response(
            {
                "total_cartera": self._money(total_cartera),
                "total_cobrado": self._money(total_cobrado),
                "saldo_pendiente": self._money(saldo_pendiente),
                "cuotas_vencidas": cuotas_vencidas,
                "cuotas_vencidas_valor": self._money(cuotas_vencidas_valor),
            },
            status=status.HTTP_200_OK,
        )


class CuotaCarteraViewSet(GenericViewSet):
    queryset = CuotaCartera.objects.select_related("cartera", "cartera__paciente", "cartera__cotizacion").all()
    serializer_class = CuotaCarteraSerializer

    def get_permissions(self):
        return [RequirePermission("cartera.registrar_pago")()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(cartera__paciente__clinica=user.clinica)
        return queryset

    @action(detail=True, methods=["patch"], url_path="registrar_pago")
    @transaction.atomic
    def registrar_pago(self, request, pk=None):
        cuota = self.get_object()
        if cuota.pagada:
            raise ValidationError({"error": "La cuota ya fue pagada.", "code": "CUOTA_YA_PAGADA"})
        serializer = RegistrarPagoCuotaSerializer(data=request.data, context={"cuota": cuota})
        serializer.is_valid(raise_exception=True)
        cuota.valor_pagado = serializer.validated_data["valor_pagado"]
        cuota.fecha_pago = serializer.validated_data["fecha_pago"]
        cuota.medio_pago = serializer.validated_data["medio_pago"]
        cuota.observaciones = serializer.validated_data.get("observaciones", "")
        cuota.pagada = True
        cuota.registrado_por = request.user
        cuota.save(
            update_fields=[
                "valor_pagado",
                "fecha_pago",
                "medio_pago",
                "observaciones",
                "pagada",
                "registrado_por",
                "updated_at",
            ]
        )
        cartera = cuota.cartera
        cotizacion = cartera.cotizacion
        cobro = (
            Cobro.objects.filter(cotizacion=cotizacion, origen=Cobro.Origen.COTIZACION)
            .exclude(estado=Cobro.Estado.ANULADO)
            .order_by("-created_at")
            .first()
        )
        if cobro is None:
            sede = cotizacion.sede or cotizacion.clinica.sedes.filter(activo=True).order_by("created_at").first()
            if sede is None:
                raise ValidationError({"error": "La cotizacion no tiene una sede asociada.", "code": "SEDE_REQUERIDA"})
            cobro = Cobro.objects.create(
                origen=Cobro.Origen.COTIZACION,
                cotizacion=cotizacion,
                paciente=cartera.paciente,
                profesional=cotizacion.profesional,
                sede=sede,
                fecha=timezone.now(),
                notas=f"Ingreso generado desde cuota de cartera {cuota.id}.",
                created_by=request.user,
            )
        pago = registrar_pago(
            cobro=cobro,
            pago_data={
                "medio_pago": serializer.validated_data["medio_pago"],
                "valor": serializer.validated_data["valor_pagado"],
                "referencia": serializer.validated_data.get("referencia", ""),
                "fecha": timezone.make_aware(datetime.combine(serializer.validated_data["fecha_pago"], time.min)),
            },
            user=request.user,
        )
        cuota.refresh_from_db()
        cobro.refresh_from_db()
        return Response(
            {
                "cuota": CuotaCarteraSerializer(cuota).data,
                "cobro_id": str(cobro.id),
                "pago_id": str(pago.id),
            },
            status=status.HTTP_200_OK,
        )
