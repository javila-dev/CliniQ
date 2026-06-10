from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.clinicas.models import Clinica


User = get_user_model()


class ImpersonateUserApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Soporte", nit="901000111")
        self.superadmin = User.objects.create_user(
            email="root@example.com",
            password="Secret123!",
            first_name="Root",
            last_name="Support",
            rol=User.Role.SUPERADMIN,
        )
        self.admin = User.objects.create_user(
            email="admin@clinica.com",
            password="Secret123!",
            first_name="Ana",
            last_name="Admin",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )
        self.target = User.objects.create_user(
            email="recepcion@clinica.com",
            password="Secret123!",
            first_name="Rosa",
            last_name="Recepcion",
            rol=User.Role.RECEPCION,
            clinica=self.clinica,
        )

    def test_superadmin_can_impersonate_target_user(self):
        self.client.force_authenticate(self.superadmin)

        response = self.client.post(f"/api/v1/auth/impersonate/{self.target.id}/", format="json")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["user"]["id"], str(self.target.id))
        self.assertEqual(body["user"]["email"], self.target.email)
        self.assertEqual(body["user"]["clinica_id"], str(self.clinica.id))
        self.assertEqual(body["user"]["rol"], self.target.rol)
        self.assertIn("access", body)
        self.assertIn("refresh", body)

        token = AccessToken(body["access"])
        self.assertEqual(token["user_id"], str(self.target.id))
        self.assertEqual(token["rol"], self.target.rol)
        self.assertEqual(token["clinica_id"], str(self.clinica.id))

    def test_non_superadmin_gets_403(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(f"/api/v1/auth/impersonate/{self.target.id}/", format="json")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "SUPERADMIN_REQUIRED")

    def test_superadmin_cannot_impersonate_self(self):
        self.client.force_authenticate(self.superadmin)

        response = self.client.post(f"/api/v1/auth/impersonate/{self.superadmin.id}/", format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "CANNOT_IMPERSONATE_SELF")

    def test_returns_404_when_target_user_does_not_exist(self):
        self.client.force_authenticate(self.superadmin)

        response = self.client.post("/api/v1/auth/impersonate/11111111-1111-1111-1111-111111111111/", format="json")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "USER_NOT_FOUND")
