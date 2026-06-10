import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica, Sede, Servicio, TipoSesion, TratamientoCatalogo
from apps.configuracion.models import DocumensoConsentimientoTemplate


User = get_user_model()


class ServicioVigenciaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-servicio@example.com",
            password="secret123",
            first_name="Root",
            last_name="Servicio",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Vigencia", nit="901111222")

    def test_servicio_accepts_vigencia_meses(self):
        response = self.client.post(
            "/api/v1/clinicas/servicios/",
            {
                "clinica": str(self.clinica.id),
                "nombre": "Limpieza Facial",
                "descripcion": "Test",
                "duracion_min": 45,
                "precio": "90000.00",
                "vigencia_meses": 6,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["vigencia_meses"], 6)

    def test_servicio_rejects_vigencia_meses_menor_a_1(self):
        response = self.client.post(
            "/api/v1/clinicas/servicios/",
            {
                "clinica": str(self.clinica.id),
                "nombre": "Limpieza Facial",
                "descripcion": "Test",
                "duracion_min": 45,
                "precio": "90000.00",
                "vigencia_meses": 0,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("vigencia_meses", response.json())

    def test_procedimientos_alias_expone_servicios(self):
        procedimiento = Servicio.objects.create(
            clinica=self.clinica,
            nombre="Peeling Quimico",
            descripcion="Sesion",
            duracion_min=45,
            precio="120000.00",
        )

        response = self.client.get("/api/v1/clinicas/procedimientos/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["results"][0]["id"], str(procedimiento.id))
        self.assertEqual(response.json()["results"][0]["nombre"], "Peeling Quimico")

    def test_procedimiento_create_toma_clinica_desde_header(self):
        response = self.client.post(
            "/api/v1/clinicas/procedimientos/",
            {
                "nombre": "Radiofrecuencia Facial",
                "descripcion": "Test",
                "duracion_min": 50,
                "precio_referencia": "150000.00",
                "vigencia_meses": 6,
            },
            format="json",
            HTTP_X_CLINICA_ID=str(self.clinica.id),
        )

        self.assertEqual(response.status_code, 201)
        procedimiento = Servicio.objects.get(id=response.json()["id"])
        self.assertEqual(procedimiento.clinica_id, self.clinica.id)
        self.assertEqual(response.json()["precio"], "150000.00")
        self.assertEqual(response.json()["precio_referencia"], "150000.00")

    def test_procedimiento_precio_referencia_es_opcional(self):
        response = self.client.post(
            "/api/v1/clinicas/procedimientos/",
            {
                "nombre": "Drenaje Linfatico",
                "descripcion": "Sin referencia comercial",
                "duracion_min": 45,
                "vigencia_meses": 12,
            },
            format="json",
            HTTP_X_CLINICA_ID=str(self.clinica.id),
        )

        self.assertEqual(response.status_code, 201)
        procedimiento = Servicio.objects.get(id=response.json()["id"])
        self.assertIsNone(procedimiento.precio)
        self.assertIsNone(response.json()["precio"])
        self.assertIsNone(response.json()["precio_referencia"])

    def test_agregar_consentimiento_rechaza_id_numerico_de_documenso_con_400(self):
        procedimiento = Servicio.objects.create(
            clinica=self.clinica,
            nombre="Peeling Quimico",
            descripcion="Sesion",
            duracion_min=45,
            precio="120000.00",
        )

        response = self.client.post(
            f"/api/v1/clinicas/procedimientos/{procedimiento.id}/consentimientos/",
            {"template_id": 2, "orden": 1},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["template_id"],
            "Debes enviar el UUID del template configurado en la clinica. No uses el id numerico de Documenso.",
        )

    def test_agregar_consentimiento_permita_resolver_por_template_token(self):
        procedimiento = Servicio.objects.create(
            clinica=self.clinica,
            nombre="Laser CO2",
            descripcion="Sesion",
            duracion_min=60,
            precio="250000.00",
        )
        template = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica,
            tipo="laser",
            template_token="laser-co2-token",
        )

        response = self.client.post(
            f"/api/v1/clinicas/procedimientos/{procedimiento.id}/consentimientos/",
            {"template_token": "laser-co2-token", "orden": 1},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["template_id"], str(template.id))
        self.assertEqual(response.json()["template_token"], "laser-co2-token")


class TratamientoCatalogoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Tratamientos", nit="902000333")
        self.superadmin = User.objects.create_user(
            email="root-tratamientos@example.com",
            password="secret123",
            first_name="Root",
            last_name="Tratamientos",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.procedimiento = Servicio.objects.create(
            clinica=self.clinica,
            nombre="Laser Facial",
            descripcion="Protocolo",
            duracion_min=60,
            precio="300000.00",
        )

    def test_create_tratamiento_catalogo_with_nested_items(self):
        response = self.client.post(
            "/api/v1/clinicas/tratamientos/",
            {
                "clinica": str(self.clinica.id),
                "nombre": "Plan Laser Premium",
                "descripcion": "Incluye varias sesiones",
                "precio_estimado": "900000.00",
                "tipos_sesion": [
                    {
                        "nombre": "Sesion Laser",
                        "cantidad": 3,
                        "orden": 1,
                        "es_compromiso": True,
                        "procedimientos": [
                            {
                                "procedimiento": str(self.procedimiento.id),
                                "orden": 1,
                            }
                        ],
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["nombre"], "Plan Laser Premium")
        self.assertEqual(body["total_sesiones"], 3)
        self.assertEqual(len(body["tipos_sesion"]), 1)
        self.assertEqual(body["tipos_sesion"][0]["procedimientos"][0]["procedimiento"], str(self.procedimiento.id))
        self.assertTrue(
            TratamientoCatalogo.objects.filter(nombre="Plan Laser Premium", clinica=self.clinica).exists()
        )
        self.assertTrue(TipoSesion.objects.filter(tratamiento__nombre="Plan Laser Premium", nombre="Sesion Laser").exists())


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage", MEDIA_ROOT=tempfile.gettempdir())
class MiClinicaLogoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Logo", nit="900123456")
        Sede.objects.create(
            clinica=self.clinica,
            nombre="Principal",
            ciudad="Bogota",
            direccion="Calle 100 #15-20",
            telefono="3000000000",
            horario={},
        )
        self.admin = User.objects.create_user(
            email="admin-logo@example.com",
            password="secret123",
            first_name="Ada",
            last_name="Logo",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )
        self.client.force_authenticate(self.admin)

    def test_get_mi_clinica_incluye_logo_url_y_datos_ubicacion(self):
        response = self.client.get("/api/v1/clinicas/mi-clinica/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["nombre"], "Clinica Logo")
        self.assertEqual(response.json()["ciudad"], "Bogota")
        self.assertEqual(response.json()["direccion"], "Calle 100 #15-20")
        self.assertIsNone(response.json()["logo_url"])

    def test_post_y_delete_logo_en_mi_clinica(self):
        logo = SimpleUploadedFile("logo.png", b"fake-png-content", content_type="image/png")

        upload_response = self.client.post("/api/v1/clinicas/mi-clinica/logo/", {"logo": logo}, format="multipart")

        self.assertEqual(upload_response.status_code, 200)
        self.clinica.refresh_from_db()
        self.assertTrue(bool(self.clinica.logo))
        self.assertIn("clinicas/logos/", upload_response.json()["logo_url"])

        delete_response = self.client.delete("/api/v1/clinicas/mi-clinica/logo/")

        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(delete_response.json(), {"logo_url": None})
        self.clinica.refresh_from_db()
        self.assertFalse(bool(self.clinica.logo))

    def test_post_logo_por_ruta_legacy_con_id_de_clinica(self):
        logo = SimpleUploadedFile("logo-legacy.png", b"fake-png-content", content_type="image/png")

        response = self.client.post(
            f"/api/v1/clinicas/clinicas/{self.clinica.id}/logo/",
            {"logo": logo},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.clinica.refresh_from_db()
        self.assertTrue(bool(self.clinica.logo))
        self.assertIn("clinicas/logos/", response.json()["logo_url"])

    @override_settings(MINIO_PUBLIC_BUCKET="clinica-static", MINIO_PUBLIC_BASE_URL="http://cdn.test")
    def test_logo_url_publica_no_es_presignada(self):
        logo = SimpleUploadedFile("logo-publico.png", b"fake-png-content", content_type="image/png")

        response = self.client.post("/api/v1/clinicas/mi-clinica/logo/", {"logo": logo}, format="multipart")

        self.assertEqual(response.status_code, 200)
        self.clinica.refresh_from_db()
        self.assertEqual(response.json()["logo_url"], f"http://cdn.test/clinica-static/{self.clinica.logo.name}")
        self.assertNotIn("X-Amz-", response.json()["logo_url"])
