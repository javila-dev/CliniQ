from datetime import date, datetime, time
from decimal import Decimal

from django.db import transaction
from django.db.models import DecimalField, ExpressionWrapper, F, OuterRef, Prefetch, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet, ReadOnlyModelViewSet

from apps.cartera.models import AcuerdoPago, CUOTA_PENDIENTE_EXPR, Cartera, CuotaCartera, CuotaCarteraLog
from apps.cartera.serializers import (
    AcuerdoPagoSerializer,
    AnularAcuerdoPagoSerializer,
    CarteraDetailSerializer,
    CarteraListSerializer,
    CrearAcuerdoPagoSerializer,
    CuotaCarteraSerializer,
    ModificarPlazoCuotaSerializer,
    RegistrarPagoCuotaSerializer,
)
from apps.cartera.services import anular_acuerdo_pago, aplicar_acuerdo_pago_por_firma, crear_acuerdo_pago
from apps.cobros.models import Cobro
from apps.cobros.services import registrar_pago
from apps.core.logging import registrar_accion
from apps.users.permissions import RequirePermission, get_clinica_activa


class CarteraPagination(PageNumberPagination):
    # Permite que el listado pida más filas (p. ej. la vista de "cuotas
    # vencidas", que necesita todas las carteras con saldo).
    page_size_query_param = "page_size"
    max_page_size = 500


class CarteraViewSet(ReadOnlyModelViewSet):
    # Las cuotas anuladas (reemplazadas por un acuerdo de pago) no se muestran ni
    # cuentan: el prefetch ya las excluye para saldo/mora/listado.
    queryset = (
        Cartera.objects.select_related("cotizacion", "paciente")
        .prefetch_related(
            Prefetch(
                "cuotas",
                queryset=CuotaCartera.objects.filter(anulada=False).order_by("fecha_esperada", "created_at"),
            ),
            "acuerdos",
            "acuerdos__documento",
        )
        .all()
    )
    serializer_class = CarteraListSerializer
    pagination_class = CarteraPagination
    # Búsqueda por nombre / documento del paciente (?search=).
    search_fields = ("paciente__nombres", "paciente__apellidos", "paciente__numero_documento")
    # Orden por columna (?ordering=). `total_cobrado` / `saldo` /
    # `proxima_cuota_fecha` son anotaciones que agrega `_annotate_orden`.
    ordering_fields = (
        "paciente__apellidos",
        "total",
        "total_cobrado",
        "saldo",
        "proxima_cuota_fecha",
        "created_at",
    )
    ordering = ("-created_at",)

    def get_permissions(self):
        return [RequirePermission("cartera.ver")()]

    def _annotate_orden(self, queryset):
        """Anotaciones para ordenar por cobrado / saldo / próximo pago. Solo se
        usan en el listado: en `resumen` romperían los `Sum` por el join a cuotas."""
        proxima_subq = (
            CuotaCartera.objects.filter(cartera=OuterRef("pk"), anulada=False)
            .annotate(pend=CUOTA_PENDIENTE_EXPR)
            .filter(pend__gt=0)
            .order_by("fecha_esperada", "created_at")
            .values("fecha_esperada")[:1]
        )
        queryset = queryset.annotate(
            total_cobrado=Coalesce(
                Sum("cuotas__valor_pagado"),
                Value(Decimal("0")),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
            proxima_cuota_fecha=Subquery(proxima_subq),
        )
        return queryset.annotate(
            saldo=ExpressionWrapper(
                F("total") - F("total_cobrado"),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
        )

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        # Scope por clínica activa (header X-Active-Clinica para superadmin;
        # user.clinica para el resto). None = superadmin sin clínica -> global.
        clinica = get_clinica_activa(self.request)
        if clinica is not None:
            queryset = queryset.filter(paciente__clinica=clinica)
        elif user.rol != "superadmin":
            queryset = queryset.none()

        paciente = self.request.query_params.get("paciente")
        estado = self.request.query_params.get("estado")
        sede_id = self.request.query_params.get("sede_id")
        if paciente:
            queryset = queryset.filter(paciente_id=paciente)
        if sede_id:
            queryset = queryset.filter(cotizacion__sede_id=sede_id)
        if estado in {"pagada", "vencida", "pendiente"}:
            queryset = self._filter_by_estado(queryset, estado)
        if self.action == "list":
            queryset = self._annotate_orden(queryset)
        return queryset

    def _filter_by_estado(self, queryset, estado):
        today = timezone.localdate()
        matched_ids = []
        for cartera in queryset:
            is_pagada = cartera.saldo_pendiente <= 0
            is_vencida = (
                cartera.cuotas.filter(anulada=False)
                .annotate(pendiente=CUOTA_PENDIENTE_EXPR)
                .filter(pendiente__gt=0, fecha_esperada__lt=today)
                .exists()
            )
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
        # Acota las KPI a las carteras generadas desde una fecha (aceptación de
        # la cotización). Solo aplica al resumen, no al listado.
        desde_raw = request.query_params.get("desde")
        if desde_raw:
            try:
                desde = date.fromisoformat(desde_raw)
            except ValueError:
                desde = None
            if desde:
                queryset = queryset.filter(created_at__date__gte=desde)
        total_cartera = queryset.aggregate(s=Sum("total"))["s"] or Decimal("0")
        total_cobrado = sum((item.total_pagado for item in queryset), Decimal("0"))
        saldo_pendiente = total_cartera - total_cobrado
        cuotas_vencidas_qs = (
            CuotaCartera.objects.filter(
                cartera__in=queryset,
                anulada=False,
                fecha_esperada__lt=timezone.localdate(),
            )
            .annotate(pendiente=CUOTA_PENDIENTE_EXPR)
            .filter(pendiente__gt=0)
        )
        cuotas_vencidas = cuotas_vencidas_qs.count()
        cuotas_vencidas_valor = cuotas_vencidas_qs.aggregate(s=Sum("pendiente"))["s"] or Decimal("0")
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
        if self.action == "aprobar_excepcion":
            return [RequirePermission("cartera.aprobar_excepcion")()]
        if self.action == "partial_update":
            return [RequirePermission("cartera.modificar_plazo")()]
        return [RequirePermission("cartera.registrar_pago")()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        clinica = get_clinica_activa(self.request)
        if clinica is not None:
            queryset = queryset.filter(cartera__paciente__clinica=clinica)
        elif user.rol != "superadmin":
            queryset = queryset.none()
        return queryset

    def _guard_acuerdo_pendiente(self, cuota):
        pendiente = cuota.cartera.acuerdos.filter(
            estado=AcuerdoPago.Estado.PENDIENTE_FIRMA
        ).first()
        if pendiente is not None:
            raise ValidationError({
                "error": "Hay un acuerdo de pago pendiente de firma en esta cartera. "
                         "Fírmalo o cancélalo antes de mover o cobrar cuotas.",
                "code": "ACUERDO_PENDIENTE_FIRMA",
                "detalle": {"acuerdo_id": str(pendiente.id), "numero": pendiente.numero},
            })

    @transaction.atomic
    def partial_update(self, request, pk=None):
        cuota = self.get_object()
        if cuota.pagada:
            raise ValidationError({"error": "No se puede modificar una cuota ya pagada.", "code": "CUOTA_YA_PAGADA"})
        self._guard_acuerdo_pendiente(cuota)
        serializer = ModificarPlazoCuotaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data
        logs = []
        if "fecha_vencimiento" in datos:
            logs.append(CuotaCarteraLog(
                cuota=cuota,
                campo="fecha_vencimiento",
                valor_anterior=str(cuota.fecha_esperada) if cuota.fecha_esperada else "",
                valor_nuevo=str(datos["fecha_vencimiento"]),
                modificado_por=request.user,
            ))
            cuota.fecha_esperada = datos["fecha_vencimiento"]
        if "monto" in datos:
            logs.append(CuotaCarteraLog(
                cuota=cuota,
                campo="monto",
                valor_anterior=str(cuota.valor_esperado),
                valor_nuevo=str(datos["monto"]),
                modificado_por=request.user,
            ))
            cuota.valor_esperado = datos["monto"]
        update_fields = ["updated_at"]
        if "fecha_vencimiento" in datos:
            update_fields.append("fecha_esperada")
        if "monto" in datos:
            update_fields.append("valor_esperado")
        cuota.save(update_fields=update_fields)
        CuotaCarteraLog.objects.bulk_create(logs)
        registrar_accion(request, "cuota.modificar_plazo", cuota, {k: str(v) for k, v in datos.items()})
        return Response(CuotaCarteraSerializer(cuota).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["patch"], url_path="registrar_pago")
    @transaction.atomic
    def registrar_pago(self, request, pk=None):
        cuota = self.get_object()
        if cuota.saldo_pendiente <= 0:
            raise ValidationError({"error": "La cuota ya fue cobrada por completo.", "code": "CUOTA_YA_PAGADA"})
        self._guard_acuerdo_pendiente(cuota)
        serializer = RegistrarPagoCuotaSerializer(data=request.data, context={"cuota": cuota})
        serializer.is_valid(raise_exception=True)
        # Los pagos se acumulan: un abono parcial no cierra la cuota, solo baja
        # su saldo. La cuota queda `pagada` cuando lo acumulado cubre lo esperado.
        abono = serializer.validated_data["valor_pagado"]
        cuota.valor_pagado = Decimal(cuota.valor_pagado or 0) + abono
        cuota.fecha_pago = serializer.validated_data["fecha_pago"]
        cuota.medio_pago = serializer.validated_data["medio_pago"]
        nueva_obs = serializer.validated_data.get("observaciones", "")
        if nueva_obs:
            cuota.observaciones = (
                f"{cuota.observaciones}\n{nueva_obs}".strip() if cuota.observaciones else nueva_obs
            )
        cuota.pagada = cuota.saldo_pendiente <= 0
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
        registrar_accion(request, "cuota.cobrar", cuota, {
            "valor_pagado": str(cuota.valor_pagado),
            "medio_pago": cuota.medio_pago,
            "cobro_id": str(cobro.id),
        })
        return Response(
            {
                "cuota": CuotaCarteraSerializer(cuota).data,
                "cobro_id": str(cobro.id),
                "pago_id": str(pago.id),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="aprobar_excepcion")
    def aprobar_excepcion(self, request, pk=None):
        cuota = self.get_object()
        if cuota.pagada:
            raise ValidationError({"error": "La cuota ya fue pagada.", "code": "CUOTA_YA_PAGADA"})
        if cuota.excepcion_aprobada:
            raise ValidationError({"error": "La excepcion ya fue aprobada.", "code": "EXCEPCION_YA_APROBADA"})
        cuota.excepcion_aprobada = True
        cuota.aprobada_por = request.user
        cuota.save(update_fields=["excepcion_aprobada", "aprobada_por", "updated_at"])
        return Response(CuotaCarteraSerializer(cuota).data, status=status.HTTP_200_OK)


class AcuerdoPagoViewSet(GenericViewSet):
    """Acuerdos de pago (renegociación del plan de cuotas de una cartera).

    - ``GET  /cartera/acuerdos/?cartera={id}`` — historial.
    - ``POST /cartera/acuerdos/`` — crea el acuerdo en ``pendiente_firma`` y
      genera el acta firmable. NO altera la cartera todavía.
    - ``POST /cartera/acuerdos/{id}/anular/`` — cancela un acuerdo aún no firmado.
    - ``POST /cartera/acuerdos/{id}/verificar-firma/`` — consulta Documenso y,
      si el acta ya está firmada, aplica el acuerdo.
    """

    queryset = AcuerdoPago.objects.select_related(
        "cartera", "cartera__paciente", "cartera__cotizacion", "documento", "creado_por"
    ).all()
    serializer_class = AcuerdoPagoSerializer

    def get_permissions(self):
        if self.action == "list":
            return [RequirePermission("cartera.ver")()]
        return [RequirePermission("cartera.modificar_plazo")()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        clinica = get_clinica_activa(self.request)
        if clinica is not None:
            queryset = queryset.filter(cartera__paciente__clinica=clinica)
        elif user.rol != "superadmin":
            queryset = queryset.none()
        cartera_id = self.request.query_params.get("cartera")
        if cartera_id:
            queryset = queryset.filter(cartera_id=cartera_id)
        return queryset

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request, *args, **kwargs):
        serializer = CrearAcuerdoPagoSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        cartera = serializer.validated_data["cartera"]
        acuerdo = crear_acuerdo_pago(
            cartera,
            motivo=serializer.validated_data["motivo"],
            cuotas=serializer.validated_data["cuotas"],
            request=request,
        )
        return Response(
            AcuerdoPagoSerializer(acuerdo, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="anular")
    def anular(self, request, pk=None):
        acuerdo = self.get_object()
        serializer = AnularAcuerdoPagoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        acuerdo = anular_acuerdo_pago(
            acuerdo, motivo=serializer.validated_data["motivo"], request=request
        )
        return Response(
            AcuerdoPagoSerializer(acuerdo, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="verificar-firma")
    def verificar_firma(self, request, pk=None):
        from apps.consentimientos.services import verificar_firma_compromiso_pago_en_documenso

        acuerdo = self.get_object()
        if acuerdo.documento_id is not None:
            verificar_firma_compromiso_pago_en_documenso(acuerdo.documento)
            aplicar_acuerdo_pago_por_firma(acuerdo.documento)
        acuerdo.refresh_from_db()
        return Response(
            AcuerdoPagoSerializer(acuerdo, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )
