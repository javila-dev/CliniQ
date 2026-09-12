from rest_framework.permissions import BasePermission

from apps.core.models import ConfiguracionGlobal
from apps.users.permissions import PuedeGestionarAyuda


class PuedeVerAyuda(BasePermission):
    """
    Lectura del centro de ayuda: siempre permitida para quien lo gestiona
    (superadmin / is_staff, así pueden preparar contenido antes de activarlo),
    y para el resto solo cuando ConfiguracionGlobal.centro_ayuda_habilitado
    está en True.
    """

    message = "El centro de ayuda todavía no está habilitado para tu clínica."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if PuedeGestionarAyuda().has_permission(request, view):
            return True
        return ConfiguracionGlobal.get_solo().centro_ayuda_habilitado
