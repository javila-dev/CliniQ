from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica
from apps.configuracion.models import ConfiguracionHistoria, ConfiguracionSignosVitales, DocumensoConsentimientoTemplate
from apps.configuracion.services import listar_templates_documenso_disponibles


User = get_user_model()


@override_settings(
    DOCUMENSO_API_URL="https://documenso.2asoft.tech",
    DOCUMENSO_API_KEY="test-api-key",
)
class DocumensoTemplatesDisponiblesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Demo", nit="900123456")
        self.user = User.objects.create_user(
            email="admin@example.com",
            password="secret123",
            first_name="Ada",
            last_name="Lovelace",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )
        self.client.force_authenticate(self.user)
        self.template_toxina = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica,
            tipo="toxina_botulinica",
            template_token="abc123xyz",
        )
        self.template_general = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica,
            tipo="general",
            template_token="def456uvw",
        )

    @patch("apps.configuracion.services.requests.get")
    def test_service_maps_documenso_templates(self, mocked_get):
        mocked_response = Mock()
        mocked_response.json.return_value = {
            "templates": [
                {
                    "id": 42,
                    "title": "Consentimiento Toxina Botulinica",
                    "publicId": "abc123xyz",
                    "ignored": "value",
                }
            ]
        }
        mocked_response.raise_for_status.return_value = None
        mocked_get.return_value = mocked_response

        data = listar_templates_documenso_disponibles(clinica=self.clinica)

        self.assertEqual(
            data,
            [
                {
                    "id": str(self.template_toxina.id),
                    "documenso_id": 42,
                    "nombre": "Consentimiento Toxina Botulinica",
                    "token": "abc123xyz",
                }
            ],
        )
        mocked_get.assert_called_once_with(
            "https://documenso.2asoft.tech/api/v1/templates",
            headers={"Authorization": "Bearer test-api-key"},
            timeout=15,
        )

    @patch("apps.configuracion.services.requests.get")
    def test_list_action_returns_mapped_templates(self, mocked_get):
        mocked_response = Mock()
        mocked_response.json.return_value = {
            "templates": [
                {
                    "id": 42,
                    "title": "Consentimiento Toxina Botulinica",
                    "publicId": "abc123xyz",
                },
                {
                    "id": 43,
                    "title": "Consentimiento General",
                    "publicId": "def456uvw",
                },
            ]
        }
        mocked_response.raise_for_status.return_value = None
        mocked_get.return_value = mocked_response

        response = self.client.get("/api/v1/configuracion/documenso-templates/disponibles/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            [
                {
                    "id": str(self.template_toxina.id),
                    "documenso_id": 42,
                    "nombre": "Consentimiento Toxina Botulinica",
                    "token": "abc123xyz",
                },
                {
                    "id": str(self.template_general.id),
                    "documenso_id": 43,
                    "nombre": "Consentimiento General",
                    "token": "def456uvw",
                },
            ],
        )

    @patch("apps.configuracion.services.requests.get")
    def test_list_action_autocrea_templates_locales_faltantes(self, mocked_get):
        DocumensoConsentimientoTemplate.objects.filter(clinica=self.clinica).delete()
        mocked_response = Mock()
        mocked_response.json.return_value = {
            "templates": [
                {
                    "id": 2,
                    "title": "Consentimiento_Informado_Limpieza_Facial.pdf",
                    "publicId": "F7VX7vFIMPCw9RyPZkT3s",
                },
                {
                    "id": 1,
                    "title": "Consentimiento_Informado_Toxina_Botulinica.pdf",
                    "publicId": "ydYz9B6bo5gSUPC-33QTL",
                },
            ]
        }
        mocked_response.raise_for_status.return_value = None
        mocked_get.return_value = mocked_response

        response = self.client.get("/api/v1/configuracion/documenso-templates/disponibles/")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body), 2)
        self.assertIsNotNone(body[0]["id"])
        self.assertIsNotNone(body[1]["id"])
        self.assertEqual(body[0]["documenso_id"], 2)
        self.assertEqual(body[1]["documenso_id"], 1)
        self.assertTrue(
            DocumensoConsentimientoTemplate.objects.filter(
                clinica=self.clinica,
                template_token="F7VX7vFIMPCw9RyPZkT3s",
                tipo="otros",
            ).exists()
        )
        self.assertTrue(
            DocumensoConsentimientoTemplate.objects.filter(
                clinica=self.clinica,
                template_token="ydYz9B6bo5gSUPC-33QTL",
                tipo="toxina_botulinica",
            ).exists()
        )

    @patch("apps.configuracion.services.requests.get")
    def test_service_maps_public_id_fallback(self, mocked_get):
        mocked_response = Mock()
        mocked_response.json.return_value = {
            "templates": [
                {
                    "id": 99,
                    "title": "Consentimiento Fallback",
                    "public_id": "fallback-token-99",
                }
            ]
        }
        mocked_response.raise_for_status.return_value = None
        mocked_get.return_value = mocked_response

        data = listar_templates_documenso_disponibles(clinica=self.clinica)

        self.assertEqual(data[0]["documenso_id"], 99)
        self.assertEqual(data[0]["nombre"], "Consentimiento Fallback")
        self.assertEqual(data[0]["token"], "fallback-token-99")
        self.assertIsNotNone(data[0]["id"])
        self.assertTrue(
            DocumensoConsentimientoTemplate.objects.filter(
                clinica=self.clinica,
                template_token="fallback-token-99",
                tipo="otros",
            ).exists()
        )

    @patch("apps.configuracion.services.requests.get")
    def test_service_maps_direct_link_token(self, mocked_get):
        mocked_response = Mock()
        mocked_response.json.return_value = {
            "templates": [
                {
                    "id": 100,
                    "title": "Consentimiento Direct Link",
                    "directLink": {
                        "token": "direct-link-token-100",
                    },
                }
            ]
        }
        mocked_response.raise_for_status.return_value = None
        mocked_get.return_value = mocked_response

        data = listar_templates_documenso_disponibles(clinica=self.clinica)

        self.assertEqual(data[0]["documenso_id"], 100)
        self.assertEqual(data[0]["nombre"], "Consentimiento Direct Link")
        self.assertEqual(data[0]["token"], "direct-link-token-100")
        self.assertIsNotNone(data[0]["id"])
        self.assertTrue(
            DocumensoConsentimientoTemplate.objects.filter(
                clinica=self.clinica,
                template_token="direct-link-token-100",
                tipo="otros",
            ).exists()
        )


class ConfiguracionHistoriaYSignosTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Config", nit="901234567")
        self.admin = User.objects.create_user(
            email="admin-config@example.com",
            password="secret123",
            first_name="Ada",
            last_name="Admin",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )
        self.client.force_authenticate(self.admin)

    def test_historia_get_crea_defaults_y_patch_fuerza_datos_generales(self):
        response = self.client.get("/api/v1/configuracion/historia/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["tabs_activos"],
            [
                "datos-generales",
                "motivo-consulta",
                "antecedentes",
                "examenes",
                "plan-manejo",
                "ordenes",
                "fotos",
            ],
        )
        self.assertTrue(ConfiguracionHistoria.objects.filter(clinica=self.clinica).exists())

        patch_response = self.client.patch(
            "/api/v1/configuracion/historia/",
            {"tabs_activos": ["antecedentes", "fotos", "slug-invalido"]},
            format="json",
        )

        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.json()["tabs_activos"], ["datos-generales", "antecedentes", "fotos"])

    def test_signos_vitales_get_y_patch_configuran_campos_extra(self):
        response = self.client.get("/api/v1/configuracion/signos-vitales/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["campos_extra"], [])

        patch_response = self.client.patch(
            "/api/v1/configuracion/signos-vitales/",
            {"campos_extra": [{"nombre": "Grasa corporal", "unidad": "%", "orden": 1}]},
            format="json",
        )

        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(
            patch_response.json()["campos_extra"],
            [{"nombre": "Grasa corporal", "unidad": "%", "orden": 1}],
        )
        self.assertTrue(ConfiguracionSignosVitales.objects.filter(clinica=self.clinica).exists())
