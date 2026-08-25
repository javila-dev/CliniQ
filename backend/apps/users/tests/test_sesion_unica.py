from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica

User = get_user_model()


class SesionUnicaTests(TestCase):
    def setUp(self):
        cache.clear()
        self.clinica = Clinica.objects.create(nombre="Clinica Sesion Unica", nit="901333444")
        self.user = User.objects.create_user(
            email="sesion-unica@example.com",
            password="Secret123!",
            first_name="Sesion",
            last_name="Unica",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )

    def tearDown(self):
        cache.clear()

    def _login(self, client, user_agent=""):
        response = client.post(
            "/api/v1/auth/login/",
            {"email": "sesion-unica@example.com", "password": "Secret123!"},
            format="json",
            HTTP_USER_AGENT=user_agent,
        )
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_segundo_login_cierra_la_sesion_del_primer_dispositivo(self):
        cliente_a = APIClient()
        tokens_a = self._login(cliente_a, user_agent="Mozilla/5.0 Windows Chrome/120.0")
        cliente_a.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens_a['access']}", HTTP_X_CLINICA_ID=str(self.clinica.id))

        # El dispositivo A puede usar la API con su token recien emitido.
        ok = cliente_a.get("/api/v1/auth/me/")
        self.assertEqual(ok.status_code, 200)

        cliente_b = APIClient()
        self._login(cliente_b, user_agent="Mozilla/5.0 (iPhone) Safari/604.1")

        # La siguiente peticion del dispositivo A (con el token viejo) debe
        # rechazarse con el codigo especifico, no un 401 generico cualquiera.
        rechazado = cliente_a.get("/api/v1/auth/me/")
        self.assertEqual(rechazado.status_code, 401)
        self.assertEqual(rechazado.json()["code"], "SESION_CERRADA_OTRO_DISPOSITIVO")
        self.assertIn("iOS", rechazado.json()["error"])

    def test_login_unico_no_bloquea_al_propio_dispositivo(self):
        cliente = APIClient()
        tokens = self._login(cliente)
        cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}", HTTP_X_CLINICA_ID=str(self.clinica.id))

        for _ in range(3):
            response = cliente.get("/api/v1/auth/me/")
            self.assertEqual(response.status_code, 200)

    def test_refresh_token_del_dispositivo_anterior_queda_invalidado(self):
        cliente_a = APIClient()
        tokens_a = self._login(cliente_a)

        cliente_b = APIClient()
        self._login(cliente_b)

        refresh_fallido = cliente_a.post(
            "/api/v1/auth/refresh/", {"refresh": tokens_a["refresh"]}, format="json"
        )
        self.assertEqual(refresh_fallido.status_code, 401)

    def test_refrescar_sin_una_sesion_nueva_de_por_medio_sigue_funcionando(self):
        cliente = APIClient()
        tokens = self._login(cliente)

        refresh_ok = cliente.post("/api/v1/auth/refresh/", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(refresh_ok.status_code, 200)

        nuevo_access = refresh_ok.json()["access"]
        cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {nuevo_access}", HTTP_X_CLINICA_ID=str(self.clinica.id))
        response = cliente.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 200)
