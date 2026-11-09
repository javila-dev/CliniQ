from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.clinicas.models import Clinica
from apps.core.models import LogAccion
from apps.users.models import PasswordResetToken
from apps.users.services import create_password_reset_token

User = get_user_model()
URL = "/api/v1/admin/soporte/cambiar-correo/"
MOTIVO = "Perdió el acceso; la dueña confirmó por WhatsApp"


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SoporteCambiarCorreoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-correo@example.com", password="secret123", first_name="Root", rol=User.Role.SUPERADMIN,
        )
        self.clinica = Clinica.objects.create(nombre="Clinica Correo", nit="900333444")
        self.usuario = User.objects.create_user(
            email="perdido@example.com", password="Secret123!", first_name="Ana", last_name="Pérez",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.client.force_authenticate(self.superadmin)

    def _post(self, **extra):
        datos = {"usuario": str(self.usuario.id), "correo_nuevo": "Nuevo@Example.com ", "motivo": MOTIVO}
        datos.update(extra)
        return self.client.post(URL, datos, format="json")

    def test_solo_superadmin(self):
        admin = User.objects.create_user(
            email="admin-correo@example.com", password="secret123", rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client.force_authenticate(admin)
        self.assertEqual(self._post().status_code, 403)
        self.usuario.refresh_from_db()
        self.assertEqual(self.usuario.email, "perdido@example.com")

    def test_cambia_el_correo_normalizado_y_registra_la_accion(self):
        res = self._post(enviar_enlace=False, cerrar_sesiones=False)
        self.assertEqual(res.status_code, 200, res.data)
        self.usuario.refresh_from_db()
        self.assertEqual(self.usuario.email, "nuevo@example.com")
        self.assertEqual(res.data["correo_anterior"], "perdido@example.com")
        self.assertIsNone(res.data["enlace"])
        # Puede entrar con el correo nuevo y la misma contraseña.
        self.assertTrue(self.usuario.check_password("Secret123!"))

        log = LogAccion.objects.get(accion="usuario.cambiar_correo")
        self.assertEqual(log.clinica, self.clinica)
        self.assertEqual(log.usuario, self.superadmin)
        self.assertEqual(log.objeto_id, str(self.usuario.id))
        self.assertEqual(log.detalle["correo_anterior"], "perdido@example.com")
        self.assertEqual(log.detalle["correo_nuevo"], "nuevo@example.com")
        self.assertEqual(log.detalle["motivo"], MOTIVO)

        recientes = self.client.get(URL, {"clinica": str(self.clinica.id)})
        self.assertEqual(recientes.status_code, 200)
        self.assertEqual(recientes.data[0]["correo_nuevo"], "nuevo@example.com")

    def test_envia_enlace_de_restablecer_al_correo_nuevo(self):
        res = self._post()
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["enlace"]["tipo"], "restablecer")
        self.assertTrue(res.data["enlace"]["email_enviado"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["nuevo@example.com"])
        self.assertIn(res.data["enlace"]["url"], mail.outbox[0].body)

    def test_invitacion_pendiente_recibe_invitacion(self):
        invitado = User.objects.create_user(
            email="invitado@example.com", password=None, rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        invitado.set_unusable_password()
        invitado.save()
        res = self._post(usuario=str(invitado.id), correo_nuevo="invitado-nuevo@example.com")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["enlace"]["tipo"], "invitacion")
        self.assertEqual(mail.outbox[-1].to, ["invitado-nuevo@example.com"])

    def test_anula_enlaces_viejos_y_cierra_sesiones(self):
        viejo = create_password_reset_token(self.usuario)
        refresh = RefreshToken.for_user(self.usuario)
        self.usuario.sesion_actual_id = "sesion-vieja"
        self.usuario.save(update_fields=["sesion_actual_id"])

        res = self._post(enviar_enlace=False)
        self.assertEqual(res.status_code, 200, res.data)

        viejo.refresh_from_db()
        self.assertFalse(viejo.activo)
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=refresh["jti"]).exists())
        self.usuario.refresh_from_db()
        self.assertNotEqual(self.usuario.sesion_actual_id, "sesion-vieja")

    def test_usuario_desactivado_no_recibe_enlace(self):
        self.usuario.activo = False
        self.usuario.save(update_fields=["activo"])
        res = self._post()
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIsNone(res.data["enlace"])
        self.assertEqual(len(mail.outbox), 0)

    def test_validaciones(self):
        User.objects.create_user(email="ocupado@example.com", password="x", clinica=self.clinica)
        casos = [
            ({"correo_nuevo": "OCUPADO@example.com"}, "CORREO_EN_USO"),
            ({"correo_nuevo": "Perdido@Example.com"}, "CORREO_IGUAL"),
            ({"correo_nuevo": "no-es-correo"}, "CORREO_INVALIDO"),
            ({"correo_nuevo": ""}, "CORREO_REQUERIDO"),
            ({"motivo": "corto"}, "MOTIVO_REQUERIDO"),
            ({"usuario": str(self.superadmin.id)}, "USUARIO_SIN_CLINICA"),
        ]
        for extra, code in casos:
            res = self._post(**extra)
            self.assertEqual(res.status_code, 400, (extra, res.data))
            self.assertEqual(res.data["code"], code, extra)
        self.assertEqual(self._post(usuario="no-uuid").status_code, 404)
        self.usuario.refresh_from_db()
        self.assertEqual(self.usuario.email, "perdido@example.com")
        self.assertFalse(PasswordResetToken.objects.filter(user=self.usuario).exists())
