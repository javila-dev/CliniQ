"""Botón "Datos clínicos" de la cotización: lo abre quien cotiza o quien atiende
pacientes (check "atiende pacientes", que da historia.notas.crear). Antes el
botón se mostraba con el check pero el endpoint respondía 403."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.clinicas.models import FormaDePago
from apps.core.tests.factories import ClinicaFixtureMixin
from apps.cotizaciones.models import Cotizacion
from apps.historia_clinica.models import NotaClinica

User = get_user_model()


class DatosClinicosCotizacionTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.crear_superadmin()
        self.client = APIClient()
        self.client.force_authenticate(self.superadmin)
        r = self.client.post("/api/v1/cotizaciones/", {
            "paciente": str(self.paciente.id), "validez_dias": 30, "notas": "",
            "items": [{"servicio": str(self.servicio.id), "num_citas": 1}],
            "formas_pago": [{
                "tipo": str(FormaDePago.objects.get(clinica=self.clinica, tipo_base="transferencia").id),
                "descripcion": "Banco", "valor": "150000.00",
            }],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.cotizacion = Cotizacion.objects.get(id=r.json()["id"])

    def _recepcion(self, email, *, atiende):
        return User.objects.create_user(
            email=email, password="Secret123!", first_name="Rosa", last_name="Recepcion",
            rol=User.Role.RECEPCION, clinica=self.clinica, es_profesional=atiende,
        )

    def _abrir(self, user):
        self.client.force_authenticate(user)
        return self.client.post(f"/api/v1/cotizaciones/{self.cotizacion.id}/nota_clinica/")

    def test_quien_atiende_sin_cotizar_abre_y_guarda_el_motivo(self):
        user = self._recepcion("rec-atiende@example.com", atiende=True)
        r = self._abrir(user)
        self.assertEqual(r.status_code, 200, r.content[:300])
        nota = NotaClinica.objects.get(cotizacion=self.cotizacion)
        self.assertEqual(r.json()["id"], str(nota.id))

        r = self.client.patch(
            f"/api/v1/historia-clinica/notas/{nota.id}/", {"motivo_consulta": "Manchas en mejillas"}, format="json",
        )
        self.assertEqual(r.status_code, 200, r.content[:300])
        nota.refresh_from_db()
        self.assertEqual(nota.motivo_consulta, "Manchas en mejillas")

    def test_sin_cotizar_ni_atender_no_abre(self):
        user = self._recepcion("rec-sin-check@example.com", atiende=False)
        self.assertEqual(self._abrir(user).status_code, 403)
        self.assertFalse(NotaClinica.objects.filter(cotizacion=self.cotizacion).exists())

    def test_quien_cotiza_sigue_abriendo(self):
        self.assertEqual(self._abrir(self.profesional).status_code, 200)
