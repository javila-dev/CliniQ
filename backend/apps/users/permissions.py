from rest_framework.permissions import BasePermission

from apps.users.authorization import user_has_permission, user_is_tenant_admin


class IsSuperAdmin(BasePermission):
    message = "Solo un superadmin puede realizar esta accion."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.rol == "superadmin")


class IsAdmin(BasePermission):
    message = "Solo un administrador puede realizar esta accion."

    def has_permission(self, request, view):
        return user_is_tenant_admin(request.user)


class IsProfesional(BasePermission):
    message = "Solo un profesional puede realizar esta accion."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.rol == "profesional")


class IsRecepcion(BasePermission):
    message = "Solo recepcion puede realizar esta accion."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.rol == "recepcion")


class IsAdminOrProfesional(BasePermission):
    message = "Solo administracion o profesionales pueden realizar esta accion."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (
                request.user.rol in {"admin", "superadmin", "profesional"}
                or user_has_permission(request.user, "historia.notas.crear", request=request)
            )
        )


class IsAdminOrRecepcion(BasePermission):
    message = "Solo administracion o recepcion pueden realizar esta accion."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (
                request.user.rol in {"admin", "superadmin", "recepcion"}
                or user_has_permission(request.user, "agenda.citas.crear", request=request)
            )
        )


def RequirePermission(permission_key):
    class DynamicPermission(BasePermission):
        message = "No tienes permiso para realizar esta accion."

        def has_permission(self, request, view):
            return user_has_permission(request.user, permission_key, request=request)

    DynamicPermission.__name__ = f"RequirePermission_{permission_key.replace('.', '_')}"
    return DynamicPermission


class IsSameClinica(BasePermission):
    message = "No tienes acceso a recursos de otra clinica."

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.rol == "superadmin":
            return True
        return getattr(obj, "clinica_id", None) == user.clinica_id


class IsSameSede(BasePermission):
    message = "No tienes acceso a recursos de otra sede."

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.rol == "superadmin":
            return True

        sedes = getattr(user, "sedes", None)
        if sedes is None:
            return False
        if hasattr(sedes, "values_list"):
            return getattr(obj, "sede_id", None) in set(sedes.values_list("id", flat=True))
        return getattr(obj, "sede_id", None) in sedes


class CanChangeAppointmentState(BasePermission):
    message = "No tienes permiso para cambiar el estado de esta cita."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user_has_permission(user, "agenda.citas.cambiar_estado", request=request):
            return True
        return getattr(user, "rol", None) == "profesional" and getattr(obj, "profesional_id", None) == user.id


class HasClinicamente:
    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.rol != "superadmin":
            qs = qs.filter(clinica=self.request.user.clinica)
        return qs
