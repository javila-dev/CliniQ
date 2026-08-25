from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica

User = get_user_model()


class LoginThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Throttle", nit="901222333")
        self.user = User.objects.create_user(
            email="throttle@example.com",
            password="Secret123!",
            first_name="Test",
            last_name="Throttle",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )

    def tearDown(self):
        cache.clear()

    def test_login_bloquea_tras_superar_el_limite_de_intentos(self):
        # LoginThrottle permite 10/min por IP.
        for _ in range(10):
            response = self.client.post(
                "/api/v1/auth/login/",
                {"email": "throttle@example.com", "password": "incorrecta"},
                format="json",
            )
            self.assertEqual(response.status_code, 401)

        blocked = self.client.post(
            "/api/v1/auth/login/",
            {"email": "throttle@example.com", "password": "incorrecta"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)

    def test_login_correcto_no_se_ve_afectado_por_intentos_previos_fallidos(self):
        for _ in range(5):
            self.client.post(
                "/api/v1/auth/login/",
                {"email": "throttle@example.com", "password": "incorrecta"},
                format="json",
            )

        ok = self.client.post(
            "/api/v1/auth/login/",
            {"email": "throttle@example.com", "password": "Secret123!"},
            format="json",
        )
        self.assertEqual(ok.status_code, 200)


class PasswordResetThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    def test_recuperar_password_bloquea_tras_superar_el_limite(self):
        # PasswordResetRequestThrottle permite 5/hour por IP.
        for _ in range(5):
            response = self.client.post(
                "/api/v1/auth/recuperar-password/",
                {"email": "quien-sea@example.com"},
                format="json",
            )
            self.assertNotEqual(response.status_code, 429)

        blocked = self.client.post(
            "/api/v1/auth/recuperar-password/",
            {"email": "quien-sea@example.com"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)


class ThrottleIdentificaClienteRealTests(TestCase):
    """
    NUM_PROXIES=1 le dice a DRF que hay un solo proxy de confianza (Traefik)
    delante de Django, asi que debe usar el ULTIMO tramo de X-Forwarded-For
    (el que agrega el proxy) para identificar al cliente, no el header completo.
    Sin esto, un atacante puede mandar un X-Forwarded-For distinto en cada
    intento y resetear su propio limite cada vez.
    """

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Throttle IP", nit="901222444")
        self.user = User.objects.create_user(
            email="throttle-ip@example.com",
            password="Secret123!",
            first_name="Test",
            last_name="ThrottleIp",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )

    def tearDown(self):
        cache.clear()

    def test_variar_el_prefijo_de_x_forwarded_for_no_esquiva_el_limite(self):
        # Mismo "salto real" (el que agregaria Traefik), prefijo distinto en
        # cada intento -- simula a un atacante intentando resetear su cupo.
        for i in range(10):
            response = self.client.post(
                "/api/v1/auth/login/",
                {"email": "throttle-ip@example.com", "password": "incorrecta"},
                format="json",
                HTTP_X_FORWARDED_FOR=f"10.0.0.{i}, 203.0.113.5",
            )
            self.assertEqual(response.status_code, 401)

        blocked = self.client.post(
            "/api/v1/auth/login/",
            {"email": "throttle-ip@example.com", "password": "incorrecta"},
            format="json",
            HTTP_X_FORWARDED_FOR="10.0.0.99, 203.0.113.5",
        )
        self.assertEqual(blocked.status_code, 429)

    def test_dos_clientes_reales_distintos_no_comparten_cupo(self):
        for _ in range(10):
            self.client.post(
                "/api/v1/auth/login/",
                {"email": "throttle-ip@example.com", "password": "incorrecta"},
                format="json",
                HTTP_X_FORWARDED_FOR="malicioso, 203.0.113.5",
            )

        # Otro cliente real (ultimo salto distinto) no deberia estar bloqueado.
        otro_cliente = self.client.post(
            "/api/v1/auth/login/",
            {"email": "throttle-ip@example.com", "password": "incorrecta"},
            format="json",
            HTTP_X_FORWARDED_FOR="cualquier-cosa, 198.51.100.9",
        )
        self.assertEqual(otro_cliente.status_code, 401)
