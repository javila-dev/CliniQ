from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica

User = get_user_model()


class LoginCuentaInactivaTests(TestCase):
    """El login distingue 'clave incorrecta' de 'cuenta sin activar / desactivada'
    para no mandar a un usuario recien invitado a revisar su contrasena.
    """

    def setUp(self):
        cache.clear()
        self.clinica = Clinica.objects.create(nombre="Clinica Inactiva", nit="901222333")

    def tearDown(self):
        cache.clear()

    def _login(self, email, password):
        return APIClient().post(
            "/api/v1/auth/login/",
            {"email": email, "password": password},
            format="json",
            HTTP_USER_AGENT="pytest",
        )

    def test_usuario_invitado_sin_activar_recibe_mensaje_claro(self):
        # Alta por invitacion: inactivo y sin contrasena utilizable.
        user = User.objects.create_user(
            email="invitada@example.com",
            password=None,
            first_name="Ana",
            last_name="Invitada",
            rol=User.Role.RECEPCION,
            clinica=self.clinica,
        )
        user.activo = False
        user.is_active = False
        user.save(update_fields=["activo", "is_active"])

        res = self._login("invitada@example.com", "cualquier-cosa")

        self.assertEqual(res.status_code, 403, res.content)
        self.assertEqual(res.json()["code"], "ACCOUNT_NOT_ACTIVATED")

    def test_usuario_desactivado_con_password_recibe_mensaje_de_desactivada(self):
        user = User.objects.create_user(
            email="exempleada@example.com",
            password="Secret123!",
            first_name="Eva",
            last_name="Exempleada",
            rol=User.Role.RECEPCION,
            clinica=self.clinica,
        )
        user.activo = False
        user.is_active = False
        user.save(update_fields=["activo", "is_active"])

        res = self._login("exempleada@example.com", "Secret123!")

        self.assertEqual(res.status_code, 403, res.content)
        self.assertEqual(res.json()["code"], "ACCOUNT_DISABLED")

    def test_password_incorrecta_en_cuenta_activa_sigue_siendo_401(self):
        User.objects.create_user(
            email="activa@example.com",
            password="Secret123!",
            first_name="Rosa",
            last_name="Activa",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )

        res = self._login("activa@example.com", "clave-mala")

        self.assertEqual(res.status_code, 401, res.content)
        self.assertEqual(res.json()["code"], "INVALID_CREDENTIALS")

    def test_email_inexistente_sigue_siendo_401_generico(self):
        res = self._login("nadie@example.com", "lo-que-sea")

        self.assertEqual(res.status_code, 401, res.content)
        self.assertEqual(res.json()["code"], "INVALID_CREDENTIALS")
