from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica

User = get_user_model()

CLIENT_ID = "test-google-client-id.apps.googleusercontent.com"
URL = "/api/v1/auth/google/"


def _idinfo(email, *, verified=True):
    return {
        "email": email,
        "email_verified": verified,
        "aud": CLIENT_ID,
        "iss": "https://accounts.google.com",
        "sub": "1234567890",
    }


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
class GoogleLoginTests(TestCase):
    def setUp(self):
        cache.clear()
        self.clinica = Clinica.objects.create(nombre="Clinica Google", nit="901222333")
        self.user = User.objects.create_user(
            email="Dra.Ana@example.com",
            password="Secret123!",
            first_name="Ana",
            last_name="Ruiz",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )

    def tearDown(self):
        cache.clear()

    def _post(self, credential="fake-id-token"):
        return APIClient().post(
            URL, {"credential": credential}, format="json", HTTP_USER_AGENT="pytest"
        )

    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_usuario_existente_recibe_tokens(self, mock_verify):
        mock_verify.return_value = _idinfo("dra.ana@example.com")

        res = self._post()

        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertIn("access", body)
        self.assertIn("refresh", body)
        self.assertEqual(body["user"]["email"], "Dra.Ana@example.com")
        self.assertEqual(body["user"]["clinica_id"], str(self.clinica.id))
        self.user.refresh_from_db()
        self.assertTrue(self.user.sesion_actual_id)

    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_match_es_case_insensitive(self, mock_verify):
        mock_verify.return_value = _idinfo("DRA.ANA@EXAMPLE.COM")

        res = self._post()

        self.assertEqual(res.status_code, 200, res.content)

    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_correo_no_registrado_no_crea_usuario(self, mock_verify):
        mock_verify.return_value = _idinfo("desconocido@gmail.com")

        res = self._post()

        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()["code"], "USER_NOT_FOUND")
        self.assertFalse(User.objects.filter(email__iexact="desconocido@gmail.com").exists())

    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_correo_no_verificado_es_401(self, mock_verify):
        mock_verify.return_value = _idinfo("dra.ana@example.com", verified=False)

        res = self._post()

        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()["code"], "GOOGLE_EMAIL_UNVERIFIED")

    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_token_invalido_es_401(self, mock_verify):
        mock_verify.side_effect = ValueError("Token expired")

        res = self._post()

        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()["code"], "GOOGLE_TOKEN_INVALID")

    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_usuario_desactivado_es_403(self, mock_verify):
        mock_verify.return_value = _idinfo("dra.ana@example.com")
        self.user.activo = False
        self.user.save(update_fields=["activo"])

        res = self._post()

        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()["code"], "USER_NOT_FOUND")

    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_clinica_inactiva_es_403(self, mock_verify):
        mock_verify.return_value = _idinfo("dra.ana@example.com")
        self.clinica.activo = False
        self.clinica.save(update_fields=["activo"])

        res = self._post()

        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()["code"], "CLINICA_INACTIVA")

    def test_sin_credential_es_400(self):
        res = self._post(credential="")

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["code"], "GOOGLE_CREDENTIAL_MISSING")


class GoogleLoginNoConfiguradoTests(TestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="")
    def test_sin_configurar_es_503(self):
        res = APIClient().post(
            URL, {"credential": "x"}, format="json", HTTP_USER_AGENT="pytest"
        )
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json()["code"], "GOOGLE_LOGIN_NOT_CONFIGURED")
