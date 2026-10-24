from rest_framework.permissions import BasePermission

from apps.users.authorization import user_has_permission, user_is_tenant_admin


def get_clinica_activa(request):
    """
    Devuelve la clínica efectiva para la request.
    - Superadmin: lee el header X-Active-Clinica (None si no viene).
    - Resto de roles: usa request.user.clinica.
    """
    from apps.clinicas.models import Clinica
    user = request.user
    if user.rol == "superadmin":
        clinica_id = request.META.get("HTTP_X_ACTIVE_CLINICA")
        if not clinica_id:
            return None
        try:
            return Clinica.objects.get(id=clinica_id, activo=True)
        except (Clinica.DoesNotExist, ValueError):
            return None
    return getattr(user, "clinica", None)


class IsSuperAdmin(BasePermission):
    message = "Solo un superadmin puede realizar esta accion."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.rol == "superadmin")


class IsAdmin(BasePermission):
    message = "Solo un administrador puede realizar esta accion."

    def has_permission(self, request, view):
        return user_is_tenant_admin(request.user)


class PuedeGestionarAyuda(BasePermission):
    """Editar el centro de ayuda: superadmin o equipo interno (is_staff de Django)."""

    message = "Solo el equipo interno puede editar el centro de ayuda."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.rol == "superadmin" or user.is_staff)
        )


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


def RequireAnyPermission(*permission_keys):
    """Pasa si el usuario tiene al menos una de las claves."""

    class DynamicAnyPermission(BasePermission):
        message = "No tienes permiso para realizar esta accion."

        def has_permission(self, request, view):
            return any(user_has_permission(request.user, key, request=request) for key in permission_keys)

    DynamicAnyPermission.__name__ = "RequireAnyPermission_" + "_".join(k.replace(".", "_") for k in permission_keys)
    return DynamicAnyPermission


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
        # Confirmar la cita es parte de gestionar la agenda (igual que
        # confirmar_manual y no_confirmo): basta con poder crear o editar citas.
        if getattr(view, "action", None) == "cambiar_estado" and request.data.get("estado") == "confirmada":
            if any(
                user_has_permission(user, clave, request=request)
                for clave in ("agenda.citas.crear", "agenda.citas.editar")
            ):
                return True
        # Quien atiende pacientes (check del usuario, sea cual sea su rol) puede
        # mover el estado de sus propias citas.
        return bool(getattr(user, "es_profesional", False)) and getattr(obj, "profesional_id", None) == user.id


class PuedeGestionarLlegada(BasePermission):
    """Pasos del asistente de llegada (check-in, OTP, foto, registro de asistencia).

    Los hace quien edita citas o quien atiende esa cita: el profesional que recibe
    a su paciente marcaba "Llegó" y el asistente se cortaba en el check-in (QA-02).
    """

    message = "No tienes permiso para registrar la llegada de esta cita."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user_has_permission(user, "agenda.citas.editar", request=request):
            return True
        return bool(getattr(user, "es_profesional", False)) and getattr(obj, "profesional_id", None) == user.id


class PuedeVerCitas(BasePermission):
    """Ver citas: con "Ver la agenda", o quien atiende pacientes (solo las suyas;
    el viewset las acota). Sin esto, un rol que atiende sin ver la agenda tenía
    Atenciones y su dashboard vacíos sin aviso (QA-06)."""

    message = "No tienes permiso para realizar esta accion."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated):
            return False
        return user_has_permission(user, "agenda.citas.ver", request=request) or bool(getattr(user, "es_profesional", False))


class HasClinicamente:
    def get_queryset(self):
        qs = super().get_queryset()
        clinica = get_clinica_activa(self.request)
        if clinica is None:
            return qs.none()
        return qs.filter(clinica=clinica)
