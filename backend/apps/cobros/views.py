from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.clinicas.models import Servicio
from apps.cobros.models import Cobro, ItemCobro, PagoRecibido
from apps.cobros.serializers import (
    CobroCreateSerializer,
    CobroSerializer,
    ItemCobroCreateSerializer,
    ItemCobroSerializer,
    PagoCreateSerializer,
    PagoRecibidoSerializer,
)
from apps.cobros.services import agregar_item_cobro, registrar_pago, reversar_pago
from apps.core.logging import registrar_accion
from apps.inventario.models import Insumo
from apps.users.authorization import user_sede_ids_acotadas
from apps.users.permissions import PuedeGestionarLlegada, RequirePermission, get_clinica_activa
from rest_framework.permissions import BasePermission
from django.utils import timezone
import logging
import uuid

logger = logging.getLogger(__name__)


class PuedeCrearCobro(BasePermission):
    """Crear un cobro: con "cobros.crear", o el cobro de una cita que se está
    preparando, por quien maneja Preparar paciente para esa cita.

    El pago es un paso de la preparación sin el que no se inicia la atención:
    quien puede preparar al paciente tiene que poder cobrar (decisión del
    21/10/2026). El precio sigue validado contra la lista de precios."""

    message = "No tienes permiso para registrar cobros."

    def has_permission(self, request, view):
        if RequirePermission("cobros.crear")().has_permission(request, view):
            return True
        from apps.agenda.models import Cita

        cita_id = request.data.get("cita") if hasattr(request, "data") else None
        if not cita_id or not getattr(request.user, "is_authenticated", False):
            return False
        clinica = get_clinica_activa(request)
        if clinica is None:
            return False
        try:
            cita = Cita.objects.filter(
                id=cita_id,
                sede__clinica=clinica,
                estado__in=[Cita.Estado.CONFIRMADA, Cita.Estado.EN_ESPERA],
            ).first()
        except (ValueError, DjangoValidationError):
            return False
        if cita is None:
            return False
        # Solo el cobro de esa cita: mismo paciente y sede, sin otro origen.
        if str(request.data.get("paciente", cita.paciente_id)) != str(cita.paciente_id):
            return False
        if str(request.data.get("sede", cita.sede_id)) != str(cita.sede_id):
            return False
        if request.data.get("origen", Cobro.Origen.CITA) != Cobro.Origen.CITA:
            return False
        # Solo el procedimiento de la cita (sin insumos ni otros servicios).
        items = request.data.get("items") or []
        if not isinstance(items, list) or any(
            not isinstance(item, dict) or item.get("tipo") != "servicio"
            or str(item.get("servicio")) != str(cita.servicio_id)
            for item in items
        ):
            return False
        return PuedeGestionarLlegada().has_object_permission(request, view, cita)


class CobroViewSet(ModelViewSet):
    queryset = Cobro.objects.select_related(
        "cita", "cotizacion", "paciente", "profesional", "sede", "created_by"
    ).prefetch_related("items", "pagos").all()
    filterset_fields = ("estado", "sede", "paciente", "profesional", "origen", "cotizacion")
    ordering_fields = ("fecha", "total", "created_at")
    search_fields = ("paciente__nombres", "paciente__apellidos", "paciente__numero_documento")
    # Sin PUT/PATCH: un ingreso se modifica con sus acciones (ítems, pagos, anular),
    # que validan permisos y recalculan totales. Editarlo directo dejaba a quien solo
    # puede ver cobros cambiar fecha, descuento o paciente sin recalcular nada.
    http_method_names = ("get", "post", "delete", "head", "options")

    def get_serializer_class(self):
        if self.action == "create":
            return CobroCreateSerializer
        return CobroSerializer

    def get_permissions(self):
        if self.action == "destroy":
            return [RequirePermission("cobros.anular")()]
        if self.action == "create":
            return [PuedeCrearCobro()]
        if self.action in {"agregar_item", "eliminar_item"}:
            return [RequirePermission("cobros.editar_items")()]
        if self.action == "registrar_pago_action":
            return [RequirePermission("cobros.registrar_pago")()]
        if self.action == "reversar_pago":
            return [RequirePermission("cobros.anular")()]
        return [RequirePermission("cobros.ver")()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        # Scope por clínica activa (header X-Active-Clinica para superadmin;
        # user.clinica para el resto). None = superadmin sin clínica -> global.
        clinica = get_clinica_activa(self.request)
        if clinica is not None:
            qs = qs.filter(sede__clinica=clinica)
        elif user.rol != "superadmin":
            qs = qs.none()
        # Usuarios acotados a sedes (perfil de colaborador) solo ven ingresos de
        # sus sedes; admin o sin sede asignada mantiene el alcance de clínica.
        sedes_ids = user_sede_ids_acotadas(user)
        if sedes_ids is not None:
            qs = qs.filter(sede_id__in=sedes_ids)
        origen = self.request.query_params.get("origen")
        cotizacion = self.request.query_params.get("cotizacion")
        fecha_desde = self.request.query_params.get("fecha_desde")
        fecha_hasta = self.request.query_params.get("fecha_hasta")
        if origen in {Cobro.Origen.CITA, Cobro.Origen.COTIZACION, Cobro.Origen.LIBRE}:
            qs = qs.filter(origen=origen)
        if cotizacion:
            qs = qs.filter(cotizacion_id=cotizacion)
        if fecha_desde:
            qs = qs.filter(fecha__date__gte=fecha_desde)
        if fecha_hasta:
            qs = qs.filter(fecha__date__lte=fecha_hasta)
        return qs

    def _pagos_del_request(self, request):
        """Pagos opcionales que llegan junto con el cobro (`pagos: [{medio_pago, valor}]`).

        Cobrar una cita crea el cobro y sus pagos en una sola transacción: si un
        pago falla no queda un cobro sin pagar que el asistente tome por hecho
        (M6-13), y se puede repartir entre varios medios (M6-14)."""
        datos = request.data.get("pagos")
        if not datos:
            return []
        if not isinstance(datos, list):
            raise ValidationError({"pagos": ["Formato inválido."]})
        serializer = PagoCreateSerializer(data=datos, many=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    def _registrar_pagos(self, cobro, pagos, user):
        for pago_data in pagos:
            registrar_pago(cobro=cobro, pago_data=pago_data, user=user)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        pagos = self._pagos_del_request(request)
        cita_id = request.data.get("cita")
        if cita_id:
            existing = Cobro.objects.filter(cita_id=cita_id).first()
            if existing:
                if pagos:
                    # Reintento de un cobro que quedó sin pagar: se pagan los mismos
                    # medios. Si ya tiene pagos, se revisa en Ingresos.
                    if existing.estado != Cobro.Estado.PENDIENTE:
                        raise ValidationError({
                            "error": "Esta cita ya tiene un cobro registrado. Revísalo en Ingresos.",
                            "code": "COBRO_YA_REGISTRADO",
                        })
                    self._registrar_pagos(existing, pagos, request.user)
                    existing.refresh_from_db()
                return Response(CobroSerializer(existing, context={"request": request}).data, status=status.HTTP_200_OK)

        serializer = CobroCreateSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            logger.warning(
                "DEBUG cobros create 400 | user_id=%s payload=%s errors=%s",
                getattr(request.user, "id", None),
                request.data,
                serializer.errors,
            )
            raise ValidationError(serializer.errors)

        items_data = serializer.validated_data.pop("items", [])
        cita = serializer.validated_data.get("cita")
        profesional = serializer.validated_data.get("profesional")
        if cita and not profesional:
            profesional = cita.profesional

        cobro = serializer.save(created_by=request.user, profesional=profesional)

        for item_data in items_data:
            if item_data.get("servicio"):
                try:
                    item_data["servicio"] = Servicio.objects.get(pk=item_data["servicio"], clinica_id=cobro.sede.clinica_id)
                except Servicio.DoesNotExist:
                    raise ValidationError({"items": {"servicio": "Procedimiento no encontrado."}})
            if item_data.get("insumo"):
                try:
                    item_data["insumo"] = Insumo.objects.get(pk=item_data["insumo"], clinica_id=cobro.sede.clinica_id)
                except Insumo.DoesNotExist:
                    raise ValidationError({"items": {"insumo": "Insumo no encontrado."}})
            agregar_item_cobro(cobro=cobro, item_data=item_data, user=request.user)

        if pagos:
            cobro.refresh_from_db()
            self._registrar_pagos(cobro, pagos, request.user)
        cobro.refresh_from_db()
        return Response(CobroSerializer(cobro, context={"request": request}).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        if instance.pagos.exists():
            raise ValidationError(
                {
                    "error": "No se puede anular un cobro con pagos registrados sin reversarlos primero.",
                    "code": "COBRO_CON_PAGOS",
                }
            )
        instance.estado = Cobro.Estado.ANULADO
        instance.save(update_fields=["estado", "updated_at"])

    @action(detail=True, methods=["post"], url_path="agregar_item")
    def agregar_item(self, request, pk=None):
        cobro = self.get_object()
        if cobro.estado == Cobro.Estado.ANULADO:
            raise ValidationError(
                {"error": "No se puede agregar ítems a un cobro anulado.", "code": "COBRO_ANULADO"}
            )

        serializer = ItemCobroCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Resolver FKs desde UUIDs
        if data.get("servicio"):
            try:
                data["servicio"] = Servicio.objects.get(pk=data["servicio"], clinica_id=cobro.sede.clinica_id)
            except Servicio.DoesNotExist:
                raise ValidationError({"servicio": "Procedimiento no encontrado."})

        if data.get("insumo"):
            try:
                data["insumo"] = Insumo.objects.get(pk=data["insumo"], clinica_id=cobro.sede.clinica_id)
            except Insumo.DoesNotExist:
                raise ValidationError({"insumo": "Insumo no encontrado."})

        item = agregar_item_cobro(cobro=cobro, item_data=data, user=request.user)
        cobro.refresh_from_db()
        return Response(
            {
                "item": ItemCobroSerializer(item).data,
                "cobro": CobroSerializer(cobro, context={"request": request}).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["delete"], url_path="items/(?P<item_pk>[^/.]+)")
    def eliminar_item(self, request, pk=None, item_pk=None):
        cobro = self.get_object()
        if cobro.estado == Cobro.Estado.ANULADO:
            raise ValidationError(
                {"error": "No se puede modificar un cobro anulado.", "code": "COBRO_ANULADO"}
            )
        try:
            item = ItemCobro.objects.get(pk=item_pk, cobro=cobro)
        except ItemCobro.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        item.delete()
        cobro.recalcular_totales()
        from apps.cobros.services import _actualizar_estado_cobro
        cobro.refresh_from_db()
        _actualizar_estado_cobro(cobro)
        cobro.refresh_from_db()
        return Response(CobroSerializer(cobro, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="registrar_pago")
    def registrar_pago_action(self, request, pk=None):
        cobro = self.get_object()
        serializer = PagoCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        pago = registrar_pago(cobro=cobro, pago_data=serializer.validated_data, user=request.user)
        cobro.refresh_from_db()
        return Response(
            {
                "pago": PagoRecibidoSerializer(pago).data,
                "cobro": CobroSerializer(cobro, context={"request": request}).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path=r"pagos/(?P<pago_pk>[^/.]+)/reversar")
    def reversar_pago(self, request, pk=None, pago_pk=None):
        """Revierte un pago mal digitado. Pide el motivo y queda en el log de acciones."""
        cobro = self.get_object()
        pago = PagoRecibido.objects.filter(pk=pago_pk, cobro=cobro).select_related("medio_pago").first()
        if pago is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        motivo = str(request.data.get("motivo") or "").strip()
        if not motivo:
            raise ValidationError({"motivo": ["Indica por qué se reversa el pago."]})
        detalle = {
            "resumen": f"Pago de ${pago.valor:,.0f} reversado".replace(",", "."),
            "valor": str(pago.valor),
            "medio_pago": pago.medio_pago.nombre,
            "fecha_pago": pago.fecha.isoformat(),
            "motivo": motivo,
        }
        cobro = reversar_pago(cobro=cobro, pago=pago)
        registrar_accion(request, "cobro.reversar_pago", cobro, detalle)
        return Response(CobroSerializer(cobro, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="resumen")
    def resumen(self, request):
        qs = self.get_queryset()

        estado = request.query_params.get("estado")
        origen = request.query_params.get("origen")
        search = request.query_params.get("search")
        sede = request.query_params.get("sede")
        fecha_desde = request.query_params.get("fecha_desde")
        fecha_hasta = request.query_params.get("fecha_hasta")

        if estado:
            qs = qs.filter(estado=estado)
        if origen:
            qs = qs.filter(origen=origen)
        if sede:
            qs = qs.filter(sede_id=sede)
        if paciente := request.query_params.get("paciente"):
            # "Ver todos" desde la ficha del paciente: los totales también son suyos.
            try:
                qs = qs.filter(paciente_id=uuid.UUID(paciente))
            except ValueError as exc:
                raise ValidationError({"paciente": "Identificador inválido."}) from exc
        if search:
            qs = qs.filter(Q(paciente__nombres__icontains=search) | Q(paciente__apellidos__icontains=search))

        # Recaudado = pagos recibidos en el periodo (por la fecha del pago). Un
        # cobro de cotización acumula todas las cuotas: filtrar por la fecha del
        # cobro sumaba también las cuotas de meses anteriores.
        pagos = PagoRecibido.objects.filter(
            cobro__in=qs.exclude(estado=Cobro.Estado.ANULADO)
        ).exclude(es_migracion=True)
        if fecha_desde:
            pagos = pagos.filter(fecha__date__gte=fecha_desde)
            qs = qs.filter(fecha__date__gte=fecha_desde)
        if fecha_hasta:
            pagos = pagos.filter(fecha__date__lte=fecha_hasta)
            qs = qs.filter(fecha__date__lte=fecha_hasta)
        total_recaudado = Decimal(pagos.aggregate(t=Sum("valor"))["t"] or 0)

        # Pendiente = total de los cobros del periodo menos todo lo pagado sobre
        # ellos. Dos agregados separados: un Sum con JOIN a pagos repetía el total
        # del cobro una vez por cada pago (pago mixto).
        qs_activo = qs.exclude(estado=Cobro.Estado.ANULADO)
        total_cobrado = Decimal(qs_activo.aggregate(t=Sum("total"))["t"] or 0)
        pagado_cobros = Decimal(
            PagoRecibido.objects.filter(cobro__in=qs_activo).aggregate(t=Sum("valor"))["t"] or 0
        )
        total_pendiente = max(total_cobrado - pagado_cobros, Decimal(0))
        total_cobros   = qs.count()
        total_pagados  = qs.filter(estado=Cobro.Estado.PAGADO).count()
        total_pendientes = qs.filter(estado__in=[Cobro.Estado.PENDIENTE, Cobro.Estado.PAGADO_PARCIAL]).count()

        return Response({
            "total_recaudado":  f"{total_recaudado:.2f}",
            "total_pendiente":  f"{total_pendiente:.2f}",
            "total_cobros":     total_cobros,
            "total_pagados":    total_pagados,
            "total_pendientes": total_pendientes,
        }, status=status.HTTP_200_OK)
