from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class ClinicScopedJWTAuthentication(JWTAuthentication):
    header_name = "HTTP_X_CLINICA_ID"

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, token = result

        # Token de suplantación del superadmin: vale solo mientras esa suplantación
        # siga abierta (al terminarla se revoca de inmediato).
        suplantacion = token.get("suplantacion")
        if suplantacion:
            from apps.users.models import SesionSuplantacion

            if not SesionSuplantacion.objects.filter(id=suplantacion, terminada_en__isnull=True).exists():
                raise AuthenticationFailed(
                    {"error": "La sesión como este usuario terminó.", "code": "SUPLANTACION_TERMINADA"}
                )

        # Sesion unica: si el usuario inicio sesion en otro dispositivo despues
        # de que se emitiera este token, su 'sid' ya no coincide con la sesion
        # vigente. sesion_actual_id vacio = usuario aun no paso por un login
        # posterior a este feature, no se bloquea (evita romper tokens ya emitidos).
        sesion_actual = getattr(user, "sesion_actual_id", "") or ""
        if sesion_actual and token.get("sid") != sesion_actual:
            detail = "Tu sesion se cerro porque iniciaste sesion en otro dispositivo"
            dispositivo = getattr(user, "sesion_actual_dispositivo", "")
            if dispositivo:
                detail += f" ({dispositivo})"
            raise AuthenticationFailed({"error": detail + ".", "code": "SESION_CERRADA_OTRO_DISPOSITIVO"})

        if getattr(user, "rol", None) == "superadmin":
            return user, token

        if not getattr(user, "clinica_id", None):
            raise AuthenticationFailed("El usuario autenticado no tiene una clinica asociada.")

        clinica_header = request.META.get(self.header_name, "").strip()
        if not clinica_header:
            raise AuthenticationFailed("El header X-Clinica-Id es obligatorio.")

        if clinica_header != str(user.clinica_id):
            raise AuthenticationFailed("El header X-Clinica-Id no coincide con la clinica del usuario.")

        # Prueba vencida, solo lectura o suspendida: aplica a todas las vistas,
        # declaren o no sus propios permisos.
        from apps.suscripciones.acceso import verificar_acceso
        from apps.suscripciones.activacion import registrar_actividad

        verificar_acceso(request, user, token)
        registrar_actividad(user, token)

        return user, token
