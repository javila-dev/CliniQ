from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class ConsoleUsuariosTests(TestCase):
    """Usuarios de plataforma (superadmin / staff), sin clinica. Solo superadmin gestiona."""

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-console@example.com", password="secret123",
            first_name="Root", last_name="Console", rol=User.Role.SUPERADMIN,
        )
        self.interno = User.objects.create_user(
            email="interno-console@example.com", password="secret123",
            first_name="Equipo", last_name="Interno", rol=User.Role.RECEPCION,
            is_staff=True,
        )
        self.clinica = Clinica.objects.create(nombre="Clinica Console", nit="900111222")
        self.admin_tenant = User.objects.create_user(
            email="admin-tenant@example.com", password="secret123",
            first_name="Admin", last_name="Tenant", rol=User.Role.ADMIN, clinica=self.clinica,
        )

    def test_solo_superadmin_puede_listar(self):
        for user, esperado in ((self.interno, 403), (self.admin_tenant, 403), (self.superadmin, 200)):
            self.client.force_authenticate(user)
            res = self.client.get("/api/v1/admin/usuarios/")
            self.assertEqual(res.status_code, esperado, user.email)

    def test_listado_excluye_usuarios_con_clinica(self):
        self.client.force_authenticate(self.superadmin)
        res = self.client.get("/api/v1/admin/usuarios/")
        emails = {u["email"] for u in res.data["results"]}
        self.assertIn(self.superadmin.email, emails)
        self.assertIn(self.interno.email, emails)
        self.assertNotIn(self.admin_tenant.email, emails)

    def test_crear_usuario_staff(self):
        self.client.force_authenticate(self.superadmin)
        res = self.client.post("/api/v1/admin/usuarios/", {
            "email": "nuevo-staff@example.com", "first_name": "Nueva", "last_name": "Staff",
            "es_superadmin": False,
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertFalse(res.data["es_superadmin"])
        self.assertTrue(res.data["is_staff"])
        self.assertTrue(res.data["invitacion_pendiente"])

        creado = User.objects.get(email="nuevo-staff@example.com")
        self.assertIsNone(creado.clinica)
        self.assertTrue(creado.is_staff)
        self.assertFalse(creado.is_superuser)
        self.assertEqual(creado.rol, "recepcion")
        self.assertFalse(creado.has_usable_password())
        self.assertEqual(len(mail.outbox), 1)

    def test_crear_usuario_superadmin(self):
        self.client.force_authenticate(self.superadmin)
        res = self.client.post("/api/v1/admin/usuarios/", {
            "email": "nuevo-root@example.com", "first_name": "Nueva", "es_superadmin": True,
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        creado = User.objects.get(email="nuevo-root@example.com")
        self.assertEqual(creado.rol, "superadmin")
        self.assertTrue(creado.is_staff)
        self.assertTrue(creado.is_superuser)

    def test_no_permite_email_duplicado(self):
        self.client.force_authenticate(self.superadmin)
        res = self.client.post("/api/v1/admin/usuarios/", {
            "email": self.interno.email, "first_name": "Dup",
        }, format="json")
        self.assertEqual(res.status_code, 400)

    def test_no_staff_no_puede_crear(self):
        self.client.force_authenticate(self.interno)
        res = self.client.post("/api/v1/admin/usuarios/", {
            "email": "x@example.com", "first_name": "X",
        }, format="json")
        self.assertEqual(res.status_code, 403)

    def test_desactivar_y_no_puede_autodesactivarse(self):
        self.client.force_authenticate(self.superadmin)
        res = self.client.patch(f"/api/v1/admin/usuarios/{self.interno.id}/", {"activo": False}, format="json")
        self.assertEqual(res.status_code, 200)
        self.interno.refresh_from_db()
        self.assertFalse(self.interno.activo)

        res = self.client.patch(f"/api/v1/admin/usuarios/{self.superadmin.id}/", {"activo": False}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_reenviar_invitacion_solo_si_no_activo_su_cuenta(self):
        self.client.force_authenticate(self.superadmin)
        res = self.client.post(f"/api/v1/admin/usuarios/{self.interno.id}/reenviar_invitacion/")
        self.assertEqual(res.status_code, 200)

        from django.utils import timezone
        self.interno.last_login = timezone.now()
        self.interno.save(update_fields=["last_login"])
        res = self.client.post(f"/api/v1/admin/usuarios/{self.interno.id}/reenviar_invitacion/")
        self.assertEqual(res.status_code, 400)
