"""Firma del profesional capturada desde el celular con un enlace temporal (QR)."""
import base64
import io
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica
from apps.core.models import LogAccion
from apps.users.models import CapturaFirmaToken

User = get_user_model()


def _png_data_url(ancho=300, alto=100, formato="PNG") -> str:
    from PIL import Image

    buffer = io.BytesIO()
    modo = "RGBA" if formato == "PNG" else "RGB"
    Image.new(modo, (ancho, alto)).save(buffer, format=formato)
    # Siempre con prefijo PNG: el caso a rechazar es un contenido que no es PNG.
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


@override_settings(MINIO_PUBLIC_BUCKET="", MEDIA_ROOT=tempfile.gettempdir())
class CapturaFirmaMovilTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Captura", nit="900222111")
        self.profesional = User.objects.create_user(
            email="captura@example.com", password="secret123", first_name="Eva", last_name="Rios",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )

    def _crear_token(self):
        self.client.force_authenticate(self.profesional)
        response = self.client.post("/api/v1/auth/me/captura-firma/")
        self.assertEqual(response.status_code, 201, response.content)
        self.client.force_authenticate(None)
        return response.json()["token"]

    def _estado(self, token):
        self.client.force_authenticate(self.profesional)
        data = self.client.get(f"/api/v1/auth/me/captura-firma/{token}/estado/").json()
        self.client.force_authenticate(None)
        return data

    def test_flujo_completo_desde_el_celular(self):
        token = self._crear_token()
        self.assertEqual(self._estado(token)["estado"], "pendiente")

        publica = self.client.get(f"/api/v1/auth/firma-movil/{token}/")
        self.assertEqual(publica.status_code, 200)
        self.assertEqual(publica.json()["nombre"], "Eva Rios")

        response = self.client.post(
            f"/api/v1/auth/firma-movil/{token}/", {"imagen": _png_data_url()}, format="json",
            HTTP_USER_AGENT="Celular de Eva",
        )
        self.assertEqual(response.status_code, 200, response.content)

        self.profesional.refresh_from_db()
        self.assertTrue(self.profesional.firma_digital.name.endswith(".png"))
        estado = self._estado(token)
        self.assertEqual(estado["estado"], "completado")
        self.assertTrue(estado["firma_url"])
        self.assertTrue(
            LogAccion.objects.filter(accion="usuario.firma_capturada", usuario=self.profesional).exists()
        )

    def test_el_enlace_es_de_un_solo_uso(self):
        token = self._crear_token()
        self.client.post(f"/api/v1/auth/firma-movil/{token}/", {"imagen": _png_data_url()}, format="json")

        segunda = self.client.post(f"/api/v1/auth/firma-movil/{token}/", {"imagen": _png_data_url()}, format="json")

        self.assertEqual(segunda.status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/auth/firma-movil/{token}/").status_code, 404)

    def test_enlace_vencido_no_sirve(self):
        token = self._crear_token()
        CapturaFirmaToken.objects.filter(token=token).update(expira_en=timezone.now() - timedelta(seconds=1))

        response = self.client.post(f"/api/v1/auth/firma-movil/{token}/", {"imagen": _png_data_url()}, format="json")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(self._estado(token)["estado"], "vencido")

    def test_un_nuevo_qr_invalida_el_anterior(self):
        anterior = self._crear_token()
        self._crear_token()

        self.assertEqual(self.client.get(f"/api/v1/auth/firma-movil/{anterior}/").status_code, 404)

    def test_rechaza_imagenes_que_no_son_png(self):
        token = self._crear_token()

        response = self.client.post(
            f"/api/v1/auth/firma-movil/{token}/", {"imagen": _png_data_url(formato="JPEG")}, format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.profesional.refresh_from_db()
        self.assertFalse(self.profesional.firma_digital)

    def test_el_estado_solo_lo_ve_el_dueno(self):
        token = self._crear_token()
        otro = User.objects.create_user(email="otro-captura@example.com", password="x", clinica=self.clinica)
        self.client.force_authenticate(otro)

        response = self.client.get(f"/api/v1/auth/me/captura-firma/{token}/estado/")

        self.assertEqual(response.status_code, 404)

    def test_usuario_sin_perfil_profesional_no_puede_generar_qr(self):
        recepcion = User.objects.create_user(
            email="recepcion-captura@example.com", password="x", rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.client.force_authenticate(recepcion)

        self.assertEqual(self.client.post("/api/v1/auth/me/captura-firma/").status_code, 403)


@override_settings(MINIO_PUBLIC_BUCKET="", MEDIA_ROOT=tempfile.gettempdir())
class EliminarFirmaTests(TestCase):
    """Enviar la firma vacía desde el perfil la elimina (antes respondía 200 sin borrar nada)."""

    def setUp(self):
        from apps.core.storage import upload_public_file

        self.clinica = Clinica.objects.create(nombre="Clinica Eliminar", nit="900222333")
        self.user = User.objects.create_user(
            email="eliminar-firma@example.com", password="x", rol=User.Role.PROFESIONAL,
            clinica=self.clinica, es_profesional=True,
        )
        self.path = upload_public_file(b"png", "firmas_profesionales/eliminar-test.png")
        self.user.firma_digital = self.path
        self.user.save()
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _assert_eliminada(self, response):
        from apps.core.storage import read_public_file

        self.assertEqual(response.status_code, 200, response.content)
        self.user.refresh_from_db()
        self.assertFalse(self.user.firma_digital)
        self.assertIsNone(response.json()["firma_digital_url"])
        self.assertIsNone(read_public_file(self.path))

    def test_multipart_vacio_elimina_la_firma(self):
        self._assert_eliminada(self.client.patch("/api/v1/auth/me/", {"firma_digital": ""}, format="multipart"))

    def test_json_null_elimina_la_firma(self):
        self._assert_eliminada(self.client.patch("/api/v1/auth/me/", {"firma_digital": None}, format="json"))

    def test_guardar_otros_datos_no_toca_la_firma(self):
        self.client.patch("/api/v1/auth/me/", {"telefono": "3000000000"}, format="json")
        self.user.refresh_from_db()
        self.assertEqual(self.user.firma_digital.name, self.path)
