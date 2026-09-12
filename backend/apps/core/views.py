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
        if usuario := params.get("usuario"):
            queryset = queryset.filter(usuario_id=usuario)
        if fecha_desde := params.get("fecha_desde"):
            queryset = queryset.filter(created_at__date__gte=fecha_desde)
        if fecha_hasta := params.get("fecha_hasta"):
            queryset = queryset.filter(created_at__date__lte=fecha_hasta)

        return queryset


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
