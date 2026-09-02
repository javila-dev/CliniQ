from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from apps.caja.models import Caja, CategoriaGasto, GastoCaja, SesionCaja
from apps.caja.serializers import (
    AbrirSesionSerializer,
    CajaSerializer,
    CategoriaGastoSerializer,
    CerrarSesionSerializer,
    GastoCajaSerializer,
    SesionCajaSerializer,
)
from apps.clinicas.models import Sede
from apps.cobros.models import Cobro, PagoRecibido
from apps.users.permissions import RequirePermission, get_clinica_activa


def _ingresos_efectivo(sede, desde, hasta):
    """Σ de pagos en efectivo de cobros no anulados de la sede, en la ventana."""
    return (
        PagoRecibido.objects.filter(
            cobro__sede=sede,
            medio_pago="efectivo",
            fecha__gte=desde,
            fecha__lte=hasta,
        )
        .exclude(cobro__estado=Cobro.Estado.ANULADO)
        .exclude(es_migracion=True)  # los pagos previos no pasan por el cajón
        .aggregate(total=Sum("valor"))["total"]
        or 0
    )


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
        clinica = get_clinica_activa(self.request)
        if clinica is not None:
            qs = qs.filter(clinica=clinica)
        elif self.request.user.rol != "superadmin":
            qs = qs.none()
        return qs

    def perform_create(self, serializer):
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            raise ValidationError({"clinica": "No hay una clínica activa.", "code": "CLINICA_REQUERIDA"})
        serializer.save(clinica=clinica)


class CajaViewSet(ModelViewSet):
    """Configuración de la caja de cada sede (una por sede)."""

    queryset = Caja.objects.select_related("sede", "responsable").all()
    serializer_class = CajaSerializer
    filterset_fields = ("sede", "activa")

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [RequirePermission("caja.cajas.gestionar")()]
        return [RequirePermission("caja.cierre.ver")()]

    def get_queryset(self):
        qs = super().get_queryset()
        clinica = get_clinica_activa(self.request)
        if clinica is not None:
            qs = qs.filter(sede__clinica=clinica)
        elif self.request.user.rol != "superadmin":
            qs = qs.none()
        return qs

    def _check_sede_clinica(self, sede):
        clinica = get_clinica_activa(self.request)
        if clinica is not None and sede.clinica_id != clinica.id:
            raise ValidationError({"sede": "La sede no pertenece a la clínica activa.", "code": "SEDE_OTRA_CLINICA"})

    def perform_create(self, serializer):
        self._check_sede_clinica(serializer.validated_data["sede"])
        serializer.save()

    def perform_update(self, serializer):
        sede = serializer.validated_data.get("sede", serializer.instance.sede)
        self._check_sede_clinica(sede)
        serializer.save()


class SesionCajaViewSet(ReadOnlyModelViewSet):
    """Aperturas y cierres de caja. Listado + acciones abrir / cerrar / actual."""

    queryset = SesionCaja.objects.select_related(
        "caja", "caja__sede", "abierta_por", "cerrada_por"
    ).all()
    serializer_class = SesionCajaSerializer
    filterset_fields = ("caja", "estado")
    ordering_fields = ("abierta_en", "cerrada_en")

    def get_permissions(self):
        if self.action in ("abrir", "cerrar"):
            return [RequirePermission("caja.cierre.realizar")()]
        return [RequirePermission("caja.cierre.ver")()]

    def get_queryset(self):
        qs = super().get_queryset()
        clinica = get_clinica_activa(self.request)
        if clinica is not None:
            qs = qs.filter(caja__sede__clinica=clinica)
        elif self.request.user.rol != "superadmin":
            qs = qs.none()
        sede_id = self.request.query_params.get("sede")
        if sede_id:
            qs = qs.filter(caja__sede_id=sede_id)
        return qs

    def _caja_de(self, caja_id):
        try:
            return Caja.objects.select_related("sede").get(pk=caja_id)
        except Caja.DoesNotExist:
            raise ValidationError({"caja": "Caja no encontrada.", "code": "CAJA_NOT_FOUND"})

    @action(detail=False, methods=["get"], url_path="actual")
    def actual(self, request):
        """Estado de la caja de una sede: su config + la sesión abierta (si hay)
        con el balance en vivo."""
        sede_id = request.query_params.get("sede")
        if not sede_id:
            raise ValidationError({"sede": "sede es requerido.", "code": "SEDE_REQUERIDA"})
        clinica = get_clinica_activa(request)
        try:
            sede_qs = Sede.objects.filter(id=sede_id)
            if clinica is not None:
                sede_qs = sede_qs.filter(clinica=clinica)
            sede = sede_qs.get()
        except Sede.DoesNotExist:
            raise ValidationError({"sede": "Sede no encontrada.", "code": "SEDE_NOT_FOUND"})

        caja = Caja.objects.filter(sede=sede).select_related("sede", "responsable").first()
        if caja is None:
            return Response({"caja": None, "sesion": None})

        sesion = caja.sesion_abierta
        payload = {"caja": CajaSerializer(caja).data, "sesion": None}
        if sesion is not None:
            ahora = timezone.now()
            desde = self._ventana_desde(sesion)
            ingresos = _ingresos_efectivo(sede, desde, ahora)
            egresos = (
                GastoCaja.objects.filter(sesion=sesion).aggregate(t=Sum("valor"))["t"] or 0
            )
            esperado = sesion.monto_apertura + ingresos - egresos
            data = SesionCajaSerializer(sesion).data
            data.update({
                "total_ingresos": f"{ingresos:.2f}",
                "total_egresos": f"{egresos:.2f}",
                "esperado": f"{esperado:.2f}",
            })
            payload["sesion"] = data
        return Response(payload)

    def _ventana_desde(self, sesion):
        """Inicio de la ventana de ingresos: el último cierre previo de la misma
        caja (para no perder efectivo entre sesiones), o la apertura si es la 1ª."""
        prev = (
            SesionCaja.objects.filter(caja=sesion.caja, estado=SesionCaja.Estado.CERRADA)
            .exclude(pk=sesion.pk)
            .order_by("-cerrada_en")
            .first()
        )
        return prev.cerrada_en if prev and prev.cerrada_en else sesion.abierta_en

    @action(detail=False, methods=["post"], url_path="abrir")
    def abrir(self, request):
        ser = AbrirSesionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        caja = self._caja_de(ser.validated_data["caja"])

        clinica = get_clinica_activa(request)
        if clinica is not None and caja.sede.clinica_id != clinica.id:
            raise PermissionDenied("La caja no pertenece a la clínica activa.")
        if not caja.activa:
            raise ValidationError({"caja": "La caja está inactiva.", "code": "CAJA_INACTIVA"})
        if caja.sesion_abierta is not None:
            raise ValidationError({"caja": "La caja ya tiene una sesión abierta.", "code": "CAJA_YA_ABIERTA"})

        monto = ser.validated_data.get("monto_apertura")
        if monto is None:
            monto = caja.monto_apertura_sugerido

        sesion = SesionCaja.objects.create(
            caja=caja,
            estado=SesionCaja.Estado.ABIERTA,
            monto_apertura=monto,
            abierta_por=request.user,
        )
        return Response(SesionCajaSerializer(sesion).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="cerrar")
    def cerrar(self, request, pk=None):
        sesion = self.get_object()
        if sesion.estado != SesionCaja.Estado.ABIERTA:
            raise ValidationError({"error": "La sesión ya está cerrada.", "code": "SESION_YA_CERRADA"})

        ser = CerrarSesionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        ahora = timezone.now()
        sede = sesion.caja.sede
        desde = self._ventana_desde(sesion)
        ingresos = _ingresos_efectivo(sede, desde, ahora)
        egresos = GastoCaja.objects.filter(sesion=sesion).aggregate(t=Sum("valor"))["t"] or 0
        esperado = sesion.monto_apertura + ingresos - egresos
        contado = ser.validated_data["efectivo_contado"]

        sesion.estado = SesionCaja.Estado.CERRADA
        sesion.total_ingresos = ingresos
        sesion.total_egresos = egresos
        sesion.esperado = esperado
        sesion.efectivo_contado = contado
        sesion.diferencia = contado - esperado
        sesion.observaciones = ser.validated_data.get("observaciones", "")
        sesion.cerrada_por = request.user
        sesion.cerrada_en = ahora
        sesion.save()
        return Response(SesionCajaSerializer(sesion).data)


class GastoCajaViewSet(ModelViewSet):
    queryset = GastoCaja.objects.select_related(
        "sede", "categoria", "registrado_por", "sesion"
    ).all()
    serializer_class = GastoCajaSerializer
    filterset_fields = ("fecha", "categoria", "sede", "sesion")
    ordering_fields = ("fecha", "valor", "created_at")

    def get_permissions(self):
        if self.action in ("update", "partial_update", "destroy"):
            return [RequirePermission("caja.gastos.editar")()]
        if self.action == "create":
            return [RequirePermission("caja.gastos.registrar")()]
        return [RequirePermission("caja.gastos.ver")()]

    def get_queryset(self):
        qs = super().get_queryset()
        clinica = get_clinica_activa(self.request)
        if clinica is not None:
            qs = qs.filter(sede__clinica=clinica)
        elif self.request.user.rol != "superadmin":
            qs = qs.none()
        fecha_gte = self.request.query_params.get("fecha__gte")
        fecha_lte = self.request.query_params.get("fecha__lte")
        if fecha_gte:
            qs = qs.filter(fecha__gte=fecha_gte)
        if fecha_lte:
            qs = qs.filter(fecha__lte=fecha_lte)
        return qs

    def perform_create(self, serializer):
        sede = serializer.validated_data.get("sede")
        clinica = get_clinica_activa(self.request)
        if clinica is not None and sede is not None and sede.clinica_id != clinica.id:
            raise ValidationError({"sede": "La sede no pertenece a la clínica activa.", "code": "SEDE_OTRA_CLINICA"})

        caja = Caja.objects.filter(sede=sede, activa=True).first()
        if caja is None:
            raise ValidationError({"sede": "La sede no tiene una caja configurada.", "code": "CAJA_NO_CONFIGURADA"})
        sesion = caja.sesion_abierta
        if sesion is None:
            raise ValidationError({"error": "La caja está cerrada. Ábrela para registrar gastos.", "code": "CAJA_CERRADA"})

        serializer.save(registrado_por=self.request.user, sesion=sesion)

    def _assert_editable(self, gasto):
        user = self.request.user
        if gasto.sesion_id and gasto.sesion.estado == SesionCaja.Estado.CERRADA:
            raise ValidationError({"error": "La sesión de caja ya fue cerrada.", "code": "SESION_CERRADA"})
        if not user.es_admin and gasto.registrado_por_id != user.id:
            raise PermissionDenied("Solo puedes modificar gastos que registraste.")

    def perform_update(self, serializer):
        self._assert_editable(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._assert_editable(instance)
        instance.delete()
