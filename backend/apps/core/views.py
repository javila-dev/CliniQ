import uuid
from datetime import date

from django.db.models import Q
from rest_framework.exceptions import ValidationError
from rest_framework.mixins import ListModelMixin
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet

from apps.core.models import ConfiguracionGlobal, LogAccion
from apps.core.serializers import ConfiguracionGlobalSerializer, LogAccionSerializer
from apps.users.permissions import IsSuperAdmin, RequirePermission


class LogAccionViewSet(ListModelMixin, GenericViewSet):
    serializer_class = LogAccionSerializer
    queryset = LogAccion.objects.select_related("clinica", "usuario").all()

    def get_permissions(self):
        return [RequirePermission("core.ver_log_acciones")()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.rol != "superadmin":
            queryset = queryset.filter(clinica=user.clinica)

        params = self.request.query_params
        if clinica := params.get("clinica"):
            queryset = queryset.filter(clinica_id=clinica)
        if accion := params.get("accion"):
            queryset = queryset.filter(accion=accion)
        if usuario := params.get("usuario", "").strip():
            # La pantalla manda el nombre que se escribe; un id también sirve.
            # Antes se filtraba por usuario_id con el texto y respondía 500.
            try:
                queryset = queryset.filter(usuario_id=uuid.UUID(usuario))
            except ValueError:
                filtro = Q()
                for palabra in usuario.split():
                    filtro &= (
                        Q(usuario__first_name__icontains=palabra)
                        | Q(usuario__last_name__icontains=palabra)
                        | Q(usuario__email__icontains=palabra)
                    )
                queryset = queryset.filter(filtro)
        if fecha_desde := self._fecha(params, "fecha_desde"):
            queryset = queryset.filter(created_at__date__gte=fecha_desde)
        if fecha_hasta := self._fecha(params, "fecha_hasta"):
            queryset = queryset.filter(created_at__date__lte=fecha_hasta)

        return queryset

    @staticmethod
    def _fecha(params, nombre):
        valor = params.get(nombre)
        if not valor:
            return None
        try:
            return date.fromisoformat(valor)
        except ValueError as exc:
            raise ValidationError({nombre: "Usa el formato AAAA-MM-DD."}) from exc


class ConfiguracionGlobalView(APIView):
    """
    GET   /api/v1/core/configuracion-global/  — cualquier usuario autenticado
    PATCH /api/v1/core/configuracion-global/  — solo superadmin
    """

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsSuperAdmin()]
        return [IsAuthenticated()]

    def get(self, request):
        return Response(ConfiguracionGlobalSerializer(ConfiguracionGlobal.get_solo()).data)

    def patch(self, request):
        instance = ConfiguracionGlobal.get_solo()
        serializer = ConfiguracionGlobalSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(actualizado_por=request.user)
        return Response(serializer.data)
