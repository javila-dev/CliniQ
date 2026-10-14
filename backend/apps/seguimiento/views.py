from datetime import date
from decimal import Decimal

from django.db.models import Count, Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet

from apps.core.logging import registrar_accion
from apps.seguimiento import services
from apps.seguimiento.models import GestionOportunidad, Oportunidad
from apps.seguimiento.serializers import (
    ActualizarOportunidadSerializer,
    ConfigSeguimientoSerializer,
    CrearInteresadoSerializer,
    GestionOportunidadSerializer,
    OportunidadSerializer,
    PerderSerializer,
    RegistrarGestionSerializer,
)
from apps.users.authorization import sede_ids_para_filtro, ve_solo_su_actividad_comercial
from apps.users.permissions import RequireAnyPermission, RequirePermission, get_clinica_activa

PERM_VER = "seguimiento.oportunidades.ver"
PERM_GESTIONAR = "seguimiento.oportunidades.gestionar"


class OportunidadPagination(PageNumberPagination):
    # El tablero del embudo y "Para hoy" piden más de una página de una vez.
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 500


class OportunidadViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    GenericViewSet,
):
    """Bandeja de seguimiento ("Para hoy") y embudo.

    Filtros de la lista: ``para_hoy=1``, ``estado`` (por defecto abiertas),
    ``etapa``, ``tipo`` (``venta`` = nueva/recompra/reactivación), ``mias=1``,
    ``sede``, ``paciente`` y ``q`` (nombre o teléfono).
    """

    serializer_class = OportunidadSerializer
    pagination_class = OportunidadPagination
    filter_backends = ()

    def get_permissions(self):
        if self.action == "detectar":
            return [AllowAny()]  # se valida el secreto de n8n dentro de la acción
        if self.action in {"list", "retrieve", "embudo"} or (
            self.action == "gestiones" and self.request.method == "GET"
        ):
            return [RequirePermission(PERM_VER)()]
        return [RequirePermission(PERM_GESTIONAR)()]

    def _clinica(self):
        clinica = get_clinica_activa(self.request)
        if clinica is None and self.request.user.rol != "superadmin":
            raise ValidationError({"error": "Usuario sin clínica.", "code": "SIN_CLINICA"})
        return clinica

    def _base(self):
        queryset = Oportunidad.objects.filter(activo=True)
        clinica = self._clinica()
        if clinica is not None:
            queryset = queryset.filter(clinica=clinica)
        # Sedes del usuario; las oportunidades sin sede (interesados) las ven todos.
        sede_ids = sede_ids_para_filtro(self.request.user, self.request.query_params.get("sede"))
        if sede_ids is not None:
            queryset = queryset.filter(Q(sede_id__in=sede_ids) | Q(sede__isnull=True))
        # Quien atiende pacientes sin permiso de ver toda la sede: solo los suyos
        # (los que registró, tiene asignados o salen de una venta suya).
        user = self.request.user
        if ve_solo_su_actividad_comercial(user, self.request):
            queryset = queryset.filter(Q(responsable=user) | Q(creada_por=user) | Q(cotizacion__profesional=user))
        return queryset

    def get_queryset(self):
        queryset = self._base().select_related("paciente", "responsable", "cita", "cotizacion").prefetch_related(
            Prefetch(
                "gestiones",
                queryset=GestionOportunidad.objects.select_related("usuario").order_by("-created_at"),
                to_attr="gestiones_recientes",
            ),
        )
        if self.action != "list":
            return queryset

        params = self.request.query_params
        hoy = timezone.localdate()
        # La detección de paquetes atrasados corre una vez al día por clínica.
        clinica = get_clinica_activa(self.request)
        if clinica is not None:
            from apps.seguimiento.deteccion import detectar_si_toca

            detectar_si_toca(clinica)
        estado = params.get("estado", Oportunidad.Estado.ABIERTA)
        if estado != "todas":
            queryset = queryset.filter(estado=estado)
        if params.get("para_hoy") in {"1", "true"}:
            queryset = queryset.filter(estado=Oportunidad.Estado.ABIERTA, proximo_contacto__lte=hoy)
        if params.get("etapa"):
            queryset = queryset.filter(etapa=params["etapa"])
        tipo = params.get("tipo")
        if tipo == "venta":
            queryset = queryset.filter(tipo__in=Oportunidad.TIPOS_VENTA)
        elif tipo:
            queryset = queryset.filter(tipo=tipo)
        if params.get("mias") in {"1", "true"}:
            queryset = queryset.filter(responsable=self.request.user)
        if params.get("paciente"):
            queryset = queryset.filter(paciente_id=params["paciente"])
        q = (params.get("q") or "").strip()
        if q:
            digitos = services.digitos_telefono(q)
            filtro = (
                Q(contacto_nombre__icontains=q)
                | Q(paciente__nombres__icontains=q)
                | Q(paciente__apellidos__icontains=q)
            )
            if len(digitos) >= 4:
                filtro |= Q(contacto_telefono__contains=digitos) | Q(paciente__telefono__contains=digitos)
            queryset = queryset.filter(filtro)
        # Lo más atrasado primero y, a igual fecha, lo de más valor.
        return queryset.order_by("proximo_contacto", "-valor_estimado", "-created_at")

    def _oportunidad(self, pk):
        return get_object_or_404(self._base(), pk=pk)

    def _respuesta(self, oportunidad, codigo=status.HTTP_200_OK):
        oportunidad = self.get_queryset().get(pk=oportunidad.pk)
        return Response(OportunidadSerializer(oportunidad, context=self.get_serializer_context()).data, status=codigo)

    # ── Alta y edición ─────────────────────────────────────────────────────

    def create(self, request, *args, **kwargs):
        clinica = get_clinica_activa(request)
        if clinica is None:
            raise ValidationError({"error": "Elige una clínica.", "code": "SIN_CLINICA"})
        serializer = CrearInteresadoSerializer(data=request.data, context={"request": request, "clinica": clinica})
        serializer.is_valid(raise_exception=True)
        oportunidad = services.crear_interesado(clinica=clinica, usuario=request.user, **serializer.validated_data)
        registrar_accion(request, "seguimiento.crear_interesado", oportunidad, {"nombre": oportunidad.nombre})
        return self._respuesta(oportunidad, status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        oportunidad = self._oportunidad(pk)
        serializer = ActualizarOportunidadSerializer(oportunidad, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return self._respuesta(oportunidad)

    # ── Acciones ───────────────────────────────────────────────────────────

    @action(detail=True, methods=["get", "post"], url_path="gestiones")
    def gestiones(self, request, pk=None):
        oportunidad = self._oportunidad(pk)
        if request.method == "GET":
            gestiones = oportunidad.gestiones.select_related("usuario").all()
            return Response(GestionOportunidadSerializer(gestiones, many=True).data)
        serializer = RegistrarGestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.registrar_gestion(oportunidad, usuario=request.user, **serializer.validated_data)
        return self._respuesta(oportunidad, status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="perder")
    def perder(self, request, pk=None):
        oportunidad = self._oportunidad(pk)
        serializer = PerderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.perder(
            oportunidad, usuario=request.user,
            motivo=serializer.validated_data.get("motivo", ""), nota=serializer.validated_data.get("nota", ""),
        )
        registrar_accion(request, "seguimiento.perder", oportunidad, {"motivo": oportunidad.motivo_perdida})
        return self._respuesta(oportunidad)

    @action(detail=True, methods=["post"], url_path="reabrir")
    def reabrir(self, request, pk=None):
        oportunidad = services.reabrir(self._oportunidad(pk))
        return self._respuesta(oportunidad)

    @action(detail=True, methods=["post"], url_path="vincular_paciente")
    def vincular_paciente(self, request, pk=None):
        from apps.pacientes.models import Paciente

        oportunidad = self._oportunidad(pk)
        paciente = get_object_or_404(
            Paciente, pk=request.data.get("paciente"), clinica_id=oportunidad.clinica_id, activo=True,
        )
        services.vincular_paciente(oportunidad, paciente)
        return self._respuesta(oportunidad)

    @action(detail=False, methods=["post"], url_path="detectar", permission_classes=[AllowAny], authentication_classes=[])
    def detectar(self, request):
        """Detección diaria para todas las clínicas activas (llamado por n8n con X-N8N-Secret)."""
        from apps.agenda.views import _n8n_secret_ok
        from apps.clinicas.models import Clinica
        from apps.seguimiento.deteccion import detectar_paquetes

        if not _n8n_secret_ok(request):
            return Response({"error": "No autorizado."}, status=status.HTTP_403_FORBIDDEN)
        resultado = {}
        for clinica in Clinica.objects.filter(activo=True):
            try:
                resultado[str(clinica.id)] = detectar_paquetes(clinica)
            except Exception as exc:  # una clínica con error no frena a las demás
                resultado[str(clinica.id)] = {"error": str(exc)}
        return Response(resultado)

    # ── Embudo ─────────────────────────────────────────────────────────────

    @action(detail=False, methods=["get"], url_path="embudo")
    def embudo(self, request):
        """Abiertas por etapa (cantidad y valor) y cerradas del mes (o desde ``desde``)."""
        base = self._base().filter(tipo__in=Oportunidad.TIPOS_VENTA)
        hoy = timezone.localdate()
        try:
            desde = date.fromisoformat(request.query_params.get("desde") or "")
        except ValueError:
            desde = hoy.replace(day=1)

        abiertas = base.filter(estado=Oportunidad.Estado.ABIERTA)
        por_etapa = {
            fila["etapa"]: fila
            for fila in abiertas.values("etapa").annotate(cantidad=Count("id"), valor=Sum("valor_estimado"))
        }
        etapas = [
            {
                "etapa": etapa,
                "nombre": nombre,
                "cantidad": por_etapa.get(etapa, {}).get("cantidad", 0),
                "valor": f"{(por_etapa.get(etapa, {}).get('valor') or Decimal('0')):.2f}",
            }
            for etapa, nombre in Oportunidad.Etapa.choices
        ]

        cerradas = base.filter(cerrada_en__date__gte=desde)
        ganadas = cerradas.filter(estado=Oportunidad.Estado.GANADA).aggregate(
            cantidad=Count("id"), valor=Sum("valor_estimado"),
        )
        perdidas = cerradas.filter(estado=Oportunidad.Estado.PERDIDA)
        por_motivo = [
            {"motivo": f["motivo_perdida"], "nombre": Oportunidad.MotivoPerdida(f["motivo_perdida"]).label, "cantidad": f["n"]}
            for f in perdidas.exclude(motivo_perdida="").values("motivo_perdida").annotate(n=Count("id")).order_by("-n")
        ]
        por_origen = [
            {
                "origen": f["origen"],
                "nombre": Oportunidad.Origen(f["origen"]).label,
                "cantidad": f["n"],
                "ganadas": f["g"],
            }
            for f in base.filter(created_at__date__gte=desde)
            .exclude(origen="")
            .values("origen")
            .annotate(n=Count("id"), g=Count("id", filter=Q(estado=Oportunidad.Estado.GANADA)))
            .order_by("-n")
        ]
        return Response({
            "desde": desde.isoformat(),
            "etapas": etapas,
            "ganadas": {"cantidad": ganadas["cantidad"] or 0, "valor": f"{(ganadas['valor'] or Decimal('0')):.2f}"},
            "perdidas": {"cantidad": perdidas.count(), "por_motivo": por_motivo},
            "por_origen": por_origen,
            # Todas las de "Para hoy" (venta y retención), para el contador.
            "para_hoy": self._base().filter(estado=Oportunidad.Estado.ABIERTA, proximo_contacto__lte=hoy).count(),
        })


class ConfigSeguimientoView(APIView):
    """GET/PATCH /seguimiento/config/: reglas del seguimiento de la clínica activa.

    Leer: quien ve el seguimiento. Cambiar: quien edita los datos de la clínica.
    Al cambiarlas, la detección diaria vuelve a correr con las reglas nuevas.
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [RequireAnyPermission(PERM_VER, "clinicas.editar")()]
        return [RequirePermission("clinicas.editar")()]

    def _config(self, request):
        from apps.seguimiento.models import ConfigSeguimiento

        clinica = get_clinica_activa(request)
        if clinica is None:
            raise ValidationError({"error": "Elige una clínica.", "code": "SIN_CLINICA"})
        return ConfigSeguimiento.de(clinica)

    def get(self, request):
        return Response(ConfigSeguimientoSerializer(self._config(request)).data)

    def patch(self, request):
        config = self._config(request)
        serializer = ConfigSeguimientoSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(ultima_deteccion=None)
        return Response(ConfigSeguimientoSerializer(config).data)
