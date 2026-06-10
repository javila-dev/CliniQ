from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class ClinicScopedJWTAuthentication(JWTAuthentication):
    header_name = "HTTP_X_CLINICA_ID"

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, token = result
        if getattr(user, "rol", None) == "superadmin":
            return user, token

        if not getattr(user, "clinica_id", None):
            raise AuthenticationFailed("El usuario autenticado no tiene una clinica asociada.")

        clinica_header = request.META.get(self.header_name, "").strip()
        if not clinica_header:
            raise AuthenticationFailed("El header X-Clinica-Id es obligatorio.")

        if clinica_header != str(user.clinica_id):
            raise AuthenticationFailed("El header X-Clinica-Id no coincide con la clinica del usuario.")

        return user, token
