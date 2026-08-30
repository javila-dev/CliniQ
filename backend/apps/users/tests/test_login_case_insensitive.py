from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica

User = get_user_model()


class LoginCaseInsensitiveTests(TestCase):
    def setUp(self):
        cache.clear()
        self.clinica = Clinica.objects.create(nombre="Clinica Login CI", nit="901555666")
        # Email guardado con mayúsculas en la parte local.
        self.user = User.objects.create_user(
            email="Jorge.Avila@example.com",
            password="Secret123!",
            first_name="Jorge",
            last_name="Avila",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )

    def tearDown(self):
        cache.clear()

    def _login(self, email):
        return APIClient().post(
            "/api/v1/auth/login/",
            {"email": email, "password": "Secret123!"},
            format="json",
            HTTP_USER_AGENT="pytest",
        )

    def test_login_con_otra_capitalizacion(self):
        for email in ("jorge.avila@example.com", "JORGE.AVILA@EXAMPLE.COM", "  Jorge.Avila@example.com  "):
            with self.subTest(email=email):
                cache.clear()
                res = self._login(email)
                self.assertEqual(res.status_code, 200, res.content)
                self.assertIn("access", res.json())

    def test_password_incorrecta_sigue_fallando(self):
        res = APIClient().post(
            "/api/v1/auth/login/",
            {"email": "jorge.avila@example.com", "password": "malísima"},
            format="json",
            HTTP_USER_AGENT="pytest",
        )
        self.assertEqual(res.status_code, 401)
