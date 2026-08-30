from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class CaseInsensitiveEmailBackend(ModelBackend):
    """Autentica por email sin distinguir mayúsculas/minúsculas.

    El identificador de acceso es el correo, así que ``Jorge@x.com`` y
    ``jorge@x.com`` deben resolver al mismo usuario. El ``ModelBackend`` por
    defecto hace un match exacto (``email = ...``), que en Postgres es
    sensible a mayúsculas.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        User = get_user_model()
        if username is None:
            username = kwargs.get(User.USERNAME_FIELD)
        if not username or password is None:
            return None

        username = username.strip()
        try:
            user = User.objects.get(email__iexact=username)
        except User.DoesNotExist:
            # Igualar el coste de hashear para no filtrar por timing si el
            # usuario existe o no.
            User().set_password(password)
            return None
        except User.MultipleObjectsReturned:
            # Colisión por diferencia de mayúsculas (unique es case-sensitive).
            # Preferir un usuario activo y, entre esos, el más antiguo.
            user = (
                User.objects.filter(email__iexact=username)
                .order_by("-is_active", "date_joined")
                .first()
            )

        if user and user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
