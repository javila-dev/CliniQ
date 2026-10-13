"""Regresiones del paso 7 de la verificación transversal (lo restante, por severidad)."""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.cartera.models import Cartera
from apps.clinicas.models import PrecioSede, Sede, ServicioConsentimiento
from apps.colaboradores.models import Colaborador
from apps.configuracion.models import DocumensoConsentimientoTemplate
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.cotizaciones.models import Cotizacion
from apps.pacientes.registro_publico import (
    RegistroPublicoConsultaThrottle,
    RegistroPublicoFotoThrottle,
    RegistroPublicoThrottle,
)
from apps.users.serializers import build_auth_user_payload


class VerificacionPaso7AltosTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.sede_b = Sede.objects.create(
            clinica=self.clinica, nombre="Norte", ciudad="Bogota",
            direccion="Calle 20", telefono="3000000001", horario={},
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _recepcion_de_la_sede_a(self):
        recep = User.objects.create_user(
            email="recep@test.com", password="Secret123!", first_name="Rita", last_name="Recepcion",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        colab = Colaborador.objects.create(
            user=recep, sede_principal=self.sede, tipo_contrato=Colaborador.TipoContrato.EMPLEADO,
            fecha_ingreso=timezone.localdate(), numero_documento="900900900",
        )
        colab.sedes.set([self.sede])
        self.client.force_authenticate(recep)
        return recep

    def _cotizacion(self, sede):
        return Cotizacion.objects.create(
            clinica=self.clinica, paciente=self.paciente, profesional=self.admin, sede=sede,
            estado=Cotizacion.Estado.BORRADOR,
        )

    # ── M0-13: el login trae lo mismo que /auth/me/ ────────────────────────
    def test_m013_el_login_trae_telefono_y_firma(self):
        self.admin.telefono = "3001234567"
        self.admin.save(update_fields=["telefono"])
        datos = build_auth_user_payload(self.admin)
        self.assertEqual(datos["telefono"], "3001234567")
        for campo in ("firma_digital_url", "registro_profesional", "created_at", "permissions", "sedes"):
            self.assertIn(campo, datos)
        self.assertEqual(datos["id"], str(self.admin.id))

    # ── M1-03: la clínica en prueba ve los días que le quedan ──────────────
    def test_m103_mi_clinica_trae_los_dias_de_prueba(self):
        self.clinica.trial_expires_at = timezone.now() + timedelta(days=5, hours=3)
        self.clinica.save(update_fields=["trial_expires_at"])
        datos = self.client.get("/api/v1/clinicas/mi-clinica/").json()
        self.assertEqual(datos["trial_days_remaining"], 6)
        self.assertIn("plan_nombre", datos)

    def test_m103_el_ultimo_dia_no_figura_como_vencido(self):
        self.clinica.trial_expires_at = timezone.now() + timedelta(hours=10)
        self.clinica.save(update_fields=["trial_expires_at"])
        self.assertEqual(self.client.get("/api/v1/clinicas/mi-clinica/").json()["trial_days_remaining"], 1)

    # ── M1-04: el precio de una sede desactivada no bloquea el guardado ────
    def test_m104_se_guarda_el_procedimiento_con_precio_de_una_sede_inactiva(self):
        PrecioSede.objects.create(sede=self.sede_b, procedimiento=self.servicio, precio=Decimal("200000"))
        self.sede_b.activo = False
        self.sede_b.save(update_fields=["activo"])
        response = self.client.patch(f"/api/v1/clinicas/servicios/{self.servicio.id}/", {
            "nombre": "Procedimiento base editado",
            "precios_sede": [{"sede": str(self.sede_b.id), "precio": "200000"}],
        }, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(PrecioSede.objects.filter(sede=self.sede_b, procedimiento=self.servicio).exists())

    # ── M1-05: borrar una plantilla deja de exigirla ───────────────────────
    def test_m105_borrar_una_plantilla_la_quita_de_los_procedimientos(self):
        plantilla = DocumensoConsentimientoTemplate.objects.create(
            clinica=self.clinica, nombre="Toxina", template_token="tok-1",
        )
        relacion = ServicioConsentimiento.objects.create(servicio=self.servicio, template=plantilla)
        response = self.client.delete(f"/api/v1/configuracion/plantillas-consentimiento/{plantilla.id}/")
        self.assertEqual(response.status_code, 204, response.content)
        relacion.refresh_from_db()
        self.assertFalse(relacion.activo)

    # ── M2-06: el autorregistro tiene cupo propio por vista ────────────────
    def test_m206_cada_vista_del_autorregistro_tiene_su_limite(self):
        claves = {RegistroPublicoThrottle.alcance, RegistroPublicoConsultaThrottle.alcance, RegistroPublicoFotoThrottle.alcance}
        self.assertEqual(len(claves), 3)
        self.assertEqual(RegistroPublicoConsultaThrottle.rate, "300/hour")
        self.assertEqual(RegistroPublicoThrottle.rate, "60/hour")

    # ── M5-01: cotizaciones por sede ───────────────────────────────────────
    def test_m501_recepcion_no_ve_ni_edita_cotizaciones_de_otra_sede(self):
        propia = self._cotizacion(self.sede)
        ajena = self._cotizacion(self.sede_b)
        self._recepcion_de_la_sede_a()
        ids = [c["id"] for c in self.client.get("/api/v1/cotizaciones/").json()["results"]]
        self.assertIn(str(propia.id), ids)
        self.assertNotIn(str(ajena.id), ids)
        response = self.client.patch(f"/api/v1/cotizaciones/{ajena.id}/", {"notas": "x"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_m501_la_ficha_del_paciente_ve_todas_sus_cotizaciones(self):
        ajena = self._cotizacion(self.sede_b)
        self._recepcion_de_la_sede_a()
        response = self.client.get("/api/v1/cotizaciones/", {"paciente": str(self.paciente.id)})
        self.assertIn(str(ajena.id), [c["id"] for c in response.json()["results"]])

    # ── M6-10: cartera por sede ────────────────────────────────────────────
    def test_m610_recepcion_solo_ve_la_cartera_de_su_sede(self):
        propia = Cartera.objects.create(cotizacion=self._cotizacion(self.sede), paciente=self.paciente, total=Decimal("100"))
        ajena = Cartera.objects.create(cotizacion=self._cotizacion(self.sede_b), paciente=self.paciente, total=Decimal("200"))
        self._recepcion_de_la_sede_a()
        ids = [c["id"] for c in self.client.get("/api/v1/cartera/").json()["results"]]
        self.assertIn(str(propia.id), ids)
        self.assertNotIn(str(ajena.id), ids)
        self.assertEqual(self.client.get(f"/api/v1/cartera/{ajena.id}/").status_code, 404)
