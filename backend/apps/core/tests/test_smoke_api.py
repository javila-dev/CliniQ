"""Smoke tests: rutas principales responden y auth/permisos básicos funcionan."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.tests.factories import ClinicaFixtureMixin

User = get_user_model()


class ApiSmokeTests(ClinicaFixtureMixin, TestCase):
    PROTECTED_LIST_ENDPOINTS = (
        "/api/v1/pacientes/",
        "/api/v1/agenda/citas/",
        "/api/v1/cotizaciones/",
        "/api/v1/cartera/",
        "/api/v1/colaboradores/",
        "/api/v1/cobros/cobros/",
        "/api/v1/protocolos/tratamientos/",
        "/api/v1/clinicas/sedes/",
        "/api/v1/historia-clinica/historias/",
    )

    def setUp(self):
        self.client = APIClient()
        self.crear_clinica_base(nit="900000101")
        self.crear_superadmin()

    def test_protected_endpoints_rechazan_sin_auth(self):
        for url in self.PROTECTED_LIST_ENDPOINTS:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertIn(response.status_code, {401, 403}, msg=f"{url} -> {response.status_code}")

    def test_protected_endpoints_responden_con_superadmin(self):
        self.client.force_authenticate(self.superadmin)
        for url in self.PROTECTED_LIST_ENDPOINTS:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200, msg=f"{url} -> {response.status_code} {response.content[:200]}")

    def test_auth_login_rechaza_credenciales_invalidas(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {"email": "noexiste@test.com", "password": "wrong"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_auth_login_acepta_credenciales_validas(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.superadmin.email, "password": "Secret123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json())
        self.assertIn("user", response.json())

    def test_auth_me_requiere_token(self):
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 401)

    def test_recepcion_no_puede_impersonar(self):
        recepcion = User.objects.create_user(
            email="recep@test.com",
            password="Secret123!",
            first_name="Recep",
            last_name="Test",
            rol=User.Role.RECEPCION,
            clinica=self.clinica,
        )
        self.client.force_authenticate(recepcion)
        response = self.client.post(f"/api/v1/auth/impersonate/{self.profesional.id}/", format="json")
        self.assertIn(response.status_code, {403, 404})
