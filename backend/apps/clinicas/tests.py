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
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))

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


class CampanaSedesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Campanas", nit="903000444")
        self.sede_a = Sede.objects.create(
            clinica=self.clinica,
            nombre="Sede Norte",
            ciudad="Bogota",
            direccion="Calle 1",
            telefono="3000000001",
            horario={"lunes": ["08:00", "18:00"]},
        )
        self.sede_b = Sede.objects.create(
            clinica=self.clinica,
            nombre="Sede Sur",
            ciudad="Bogota",
            direccion="Calle 2",
            telefono="3000000002",
            horario={"lunes": ["08:00", "18:00"]},
        )
        self.admin = User.objects.create_user(
            email="admin-campanas@test.com",
            password="Secret123!",
            first_name="Admin",
            last_name="Campanas",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )
        from apps.users.models import Rol

        self.admin.rol_dinamico = Rol.objects.get(clinica=self.clinica, slug="admin")
        self.admin.save(update_fields=["rol_dinamico"])
        self.client.force_authenticate(self.admin)

    def test_get_y_list_incluyen_sedes_como_array_de_uuids(self):
        create = self.client.post(
            "/api/v1/clinicas/campanas/",
            {
                "nombre": "Verano",
                "descripcion": "Promo",
                "fecha_inicio": "2026-06-01",
                "fecha_fin": "2026-08-31",
                "sedes": [str(self.sede_a.id), str(self.sede_b.id)],
            },
            format="json",
        )
        self.assertEqual(create.status_code, 201)
        campana_id = create.json()["id"]

        detail = self.client.get(f"/api/v1/clinicas/campanas/{campana_id}/")
        listing = self.client.get("/api/v1/clinicas/campanas/")

        self.assertEqual(detail.status_code, 200)
        self.assertIsInstance(detail.json()["sedes"], list)
        self.assertEqual(set(detail.json()["sedes"]), {str(self.sede_a.id), str(self.sede_b.id)})
        self.assertEqual(len(detail.json()["sedes_nombres"]), 2)

        item = next(row for row in listing.json()["results"] if row["id"] == campana_id)
        self.assertEqual(set(item["sedes"]), {str(self.sede_a.id), str(self.sede_b.id)})

    def test_patch_sedes_persiste_y_vacio_significa_todas(self):
        create = self.client.post(
            "/api/v1/clinicas/campanas/",
            {
                "nombre": "Otono",
                "fecha_inicio": "2026-09-01",
                "fecha_fin": "2026-11-30",
                "sedes_ids": [str(self.sede_a.id)],
            },
            format="json",
        )
        campana_id = create.json()["id"]

        patch = self.client.patch(
            f"/api/v1/clinicas/campanas/{campana_id}/",
            {"sedes": [str(self.sede_b.id)]},
            format="json",
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.json()["sedes"], [str(self.sede_b.id)])

        clear = self.client.patch(
            f"/api/v1/clinicas/campanas/{campana_id}/",
            {"sedes": []},
            format="json",
        )
        self.assertEqual(clear.status_code, 200)
        self.assertEqual(clear.json()["sedes"], [])
        self.assertEqual(clear.json()["sedes_nombres"], [])


class CampanaStatsTests(TestCase):
    def setUp(self):
        from datetime import timedelta
        import uuid

        from django.utils import timezone

        from apps.clinicas.models import Campana, CampanaItem
        from apps.pacientes.models import Paciente
        from apps.users.models import Rol

        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Stats", nit=f"905{uuid.uuid4().hex[:6]}")
        self.sede = Sede.objects.create(
            clinica=self.clinica,
            nombre="Principal",
            ciudad="Bogota",
            direccion="Calle 1",
            telefono="3000000000",
            horario={"lunes": ["08:00", "18:00"]},
        )
        self.procedimiento = Servicio.objects.create(
            clinica=self.clinica,
            nombre="Laser",
            descripcion="Facial",
            duracion_min=45,
            precio="350000.00",
            precio_base="350000.00",
            descuento_maximo_pct="30.00",
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento="CC",
            numero_documento=f"DOC{uuid.uuid4().hex[:8]}",
            nombres="Ana",
            apellidos="Stats",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo="F",
            direccion="Calle 2",
            telefono="3001112233",
            canal_confirmacion="whatsapp",
            autoriza_datos=True,
        )
        self.admin = User.objects.create_user(
            email=f"admin-stats-{uuid.uuid4().hex[:6]}@test.com",
            password="Secret123!",
            first_name="Admin",
            last_name="Stats",
            rol=User.Role.ADMIN,
            clinica=self.clinica,
        )
        self.admin.rol_dinamico = Rol.objects.get(clinica=self.clinica, slug="admin")
        self.admin.save(update_fields=["rol_dinamico"])
        self.client.force_authenticate(self.admin)

        hoy = timezone.localdate()
        self.campana = Campana.objects.create(
            clinica=self.clinica,
            nombre="Verano",
            descripcion="Promo",
            fecha_inicio=hoy - timedelta(days=1),
            fecha_fin=hoy + timedelta(days=30),
        )
        self.campana.sedes.set([self.sede])
        CampanaItem.objects.create(
            campana=self.campana,
            procedimiento=self.procedimiento,
            precio_campana="280000.00",
        )

    def _crear_y_aceptar_cotizacion(self, *, valor="280000.00", num_citas=1, descuento="0.00"):
        create = self.client.post(
            "/api/v1/cotizaciones/",
            {
                "paciente": str(self.paciente.id),
                "sede": str(self.sede.id),
                "items": [
                    {
                        "tipo": "procedimiento",
                        "procedimiento": str(self.procedimiento.id),
                        "valor_unitario": valor,
                        "num_citas": num_citas,
                        "descuento_porcentaje": descuento,
                    }
                ],
                "formas_pago": [{"tipo": "transferencia", "descripcion": "Total", "valor": valor}],
            },
            format="json",
        )
        self.assertEqual(create.status_code, 201, create.content)
        cotizacion_id = create.json()["id"]

        patch = self.client.patch(
            f"/api/v1/cotizaciones/{cotizacion_id}/",
            {
                "items": [
                    {
                        "tipo": "procedimiento",
                        "procedimiento": str(self.procedimiento.id),
                        "valor_unitario": valor,
                        "num_citas": num_citas,
                        "descuento_porcentaje": descuento,
                    }
                ],
                "formas_pago": [{"tipo": "transferencia", "descripcion": "Total", "valor": valor}],
            },
            format="json",
        )
        self.assertEqual(patch.status_code, 200, patch.content)

        accept = self.client.post(
            f"/api/v1/cotizaciones/{cotizacion_id}/cambiar_estado/",
            {"estado": "aceptada"},
            format="json",
        )
        self.assertEqual(accept.status_code, 200, accept.content)
        return cotizacion_id

    def test_get_y_list_incluyen_stats_de_ventas(self):
        self._crear_y_aceptar_cotizacion()

        detail = self.client.get(f"/api/v1/clinicas/campanas/{self.campana.id}/")
        listing = self.client.get("/api/v1/clinicas/campanas/")

        self.assertEqual(detail.status_code, 200)
        stats = detail.json()["stats"]
        self.assertEqual(stats["cotizaciones_aceptadas"], 1)
        self.assertEqual(stats["items_vendidos"], 1)
        self.assertEqual(stats["monto_total"], "280000.00")

        item = next(row for row in listing.json()["results"] if row["id"] == str(self.campana.id))
        self.assertEqual(item["stats"]["cotizaciones_aceptadas"], 1)

    def test_stats_no_cuentan_cotizaciones_en_borrador(self):
        create = self.client.post(
            "/api/v1/cotizaciones/",
            {
                "paciente": str(self.paciente.id),
                "sede": str(self.sede.id),
                "items": [
                    {
                        "tipo": "procedimiento",
                        "procedimiento": str(self.procedimiento.id),
                        "valor_unitario": "280000.00",
                    }
                ],
                "formas_pago": [{"tipo": "transferencia", "descripcion": "Total", "valor": "280000.00"}],
            },
            format="json",
        )
        self.assertEqual(create.status_code, 201)

        detail = self.client.get(f"/api/v1/clinicas/campanas/{self.campana.id}/")
        stats = detail.json()["stats"]
        self.assertEqual(stats["cotizaciones_aceptadas"], 0)
        self.assertEqual(stats["items_vendidos"], 0)
        self.assertEqual(stats["monto_total"], "0.00")

    def test_stats_suma_subtotal_con_descuento(self):
        self._crear_y_aceptar_cotizacion(valor="280000.00", num_citas=2, descuento="10.00")

        detail = self.client.get(f"/api/v1/clinicas/campanas/{self.campana.id}/")
        stats = detail.json()["stats"]
        self.assertEqual(stats["items_vendidos"], 1)
        self.assertEqual(stats["monto_total"], "504000.00")
