"""Vista de la atención por niveles: clínica → rol → usuario (docs/plan-atencion-sencilla.md)."""
from django.test import TestCase
from rest_framework.test import APIClient

from apps.configuracion.models import ConfiguracionHistoria
from apps.core.tests.factories import ClinicaFixtureMixin
from apps.users.models import Rol, VistaAtencion
from apps.users.vista_atencion import vista_atencion_de


class VistaAtencionTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.rol = Rol.objects.create(clinica=self.clinica, slug="cosmetologa", nombre="Cosmetóloga", es_profesional=True)
        self.profesional.rol_dinamico = self.rol
        self.profesional.save(update_fields=["rol_dinamico"])

    def _clinica(self, vista):
        ConfiguracionHistoria.objects.update_or_create(clinica=self.clinica, defaults={"vista_atencion": vista})

    def test_sin_nada_configurado_es_la_completa(self):
        self.assertEqual(vista_atencion_de(self.profesional), {"vista": "completa", "origen": "clinica"})

    def test_cada_nivel_manda_sobre_el_anterior(self):
        self._clinica(VistaAtencion.SENCILLA)
        self.assertEqual(vista_atencion_de(self.profesional), {"vista": "sencilla", "origen": "clinica"})

        self.rol.vista_atencion = VistaAtencion.COMPLETA
        self.rol.save()
        self.profesional.refresh_from_db()
        self.assertEqual(vista_atencion_de(self.profesional), {"vista": "completa", "origen": "rol"})

        self.profesional.vista_atencion = VistaAtencion.SENCILLA
        self.profesional.save()
        self.assertEqual(vista_atencion_de(self.profesional), {"vista": "sencilla", "origen": "usuario"})

    def test_usuario_sin_rol_dinamico_toma_la_de_la_clinica(self):
        self._clinica(VistaAtencion.SENCILLA)
        self.profesional.rol_dinamico = None
        self.profesional.save(update_fields=["rol_dinamico"])
        self.assertEqual(vista_atencion_de(self.profesional), {"vista": "sencilla", "origen": "clinica"})

    def test_superadmin_sin_clinica(self):
        self.assertEqual(vista_atencion_de(self.crear_superadmin()), {"vista": "completa", "origen": "clinica"})

    def test_me_trae_la_vista_efectiva(self):
        self._clinica(VistaAtencion.SENCILLA)
        client = APIClient()
        client.force_authenticate(self.profesional)

        r = client.get("/api/v1/auth/me/")

        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(r.json()["vista_atencion_efectiva"], {"vista": "sencilla", "origen": "clinica"})

    def test_la_clinica_la_cambia_desde_configuracion(self):
        admin = self.profesional.__class__.objects.create_user(
            email="admin-vista@example.com", password="Secret123!", rol="admin", clinica=self.clinica,
        )
        client = APIClient()
        client.force_authenticate(admin)

        r = client.patch("/api/v1/configuracion/historia/", {"vista_atencion": "sencilla"}, format="json")

        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(r.json()["vista_atencion"], "sencilla")
        self.assertEqual(ConfiguracionHistoria.objects.get(clinica=self.clinica).vista_atencion, "sencilla")

        invalida = client.patch("/api/v1/configuracion/historia/", {"vista_atencion": "otra"}, format="json")
        self.assertEqual(invalida.status_code, 400)
