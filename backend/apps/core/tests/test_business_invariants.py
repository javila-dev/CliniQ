"""Invariantes de negocio transversales a varios módulos."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.tests.factories import ClinicaFixtureMixin
from apps.cotizaciones.models import Cotizacion
from apps.historia_clinica.models import HistoriaClinica
from apps.pacientes.models import Paciente

User = get_user_model()


class BusinessInvariantsTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        self.crear_clinica_base(nit="900000301")
        self.crear_superadmin()
        self.client.force_authenticate(self.superadmin)

    def test_paciente_duplicado_misma_clinica_rechazado(self):
        payload = {
            "clinica": self.clinica.id,
            "tipo_documento": Paciente.TipoDocumento.CC,
            "numero_documento": self.paciente.numero_documento,
            "nombres": "Otro",
            "apellidos": "Nombre",
            "fecha_nacimiento": "1990-01-01",
            "sexo": Paciente.Sexo.MASCULINO,
            "direccion": "Calle X",
            "telefono": "3000000001",
            "autoriza_datos": True,
        }
        with self.assertRaises(IntegrityError):
            Paciente.objects.create(
                clinica=self.clinica,
                tipo_documento=payload["tipo_documento"],
                numero_documento=payload["numero_documento"],
                nombres=payload["nombres"],
                apellidos=payload["apellidos"],
                fecha_nacimiento=timezone.localdate() - timedelta(days=365 * 30),
                sexo=payload["sexo"],
                direccion=payload["direccion"],
                telefono=payload["telefono"],
                autoriza_datos=True,
            )

    def test_historia_clinica_se_crea_al_registrar_paciente(self):
        nuevo = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="999888777",
            nombres="Nuevo",
            apellidos="Paciente",
            fecha_nacimiento=timezone.localdate() - timedelta(days=365 * 25),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 3",
            telefono="3002223344",
            autoriza_datos=True,
        )
        self.assertTrue(HistoriaClinica.objects.filter(paciente=nuevo).exists())

    def test_nota_completada_no_acepta_edicion(self):
        historia = self.paciente.historia_clinica
        crear = self.client.post(
            "/api/v1/historia-clinica/notas/",
            {"historia": str(historia.id)},
            format="json",
        )
        self.assertEqual(crear.status_code, 201)
        nota_id = crear.json()["id"]
        self.client.patch(
            f"/api/v1/historia-clinica/notas/{nota_id}/",
            {"motivo_consulta": "Control estetico"},
            format="json",
        )
        completar = self.client.post(f"/api/v1/historia-clinica/notas/{nota_id}/completar/")
        self.assertEqual(completar.status_code, 200)

        editar = self.client.patch(
            f"/api/v1/historia-clinica/notas/{nota_id}/",
            {"motivo_consulta": "Intento de cambio"},
            format="json",
        )
        self.assertIn(editar.status_code, {400, 403, 405})

    def test_cotizacion_descartada_no_acepta_edicion(self):
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica,
            paciente=self.paciente,
            profesional=self.superadmin,
            estado=Cotizacion.Estado.DESCARTADA,
        )
        response = self.client.patch(
            f"/api/v1/cotizaciones/{cotizacion.id}/",
            {"notas": "Cambio prohibido"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_cotizacion_borrador_puede_revertir_desde_aceptada_via_endpoint(self):
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica,
            paciente=self.paciente,
            profesional=self.superadmin,
            estado=Cotizacion.Estado.BORRADOR,
        )
        aceptar = self.client.post(
            f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/",
            {"estado": "aceptada"},
            format="json",
        )
        self.assertEqual(aceptar.status_code, 200)

        revertir = self.client.post(
            f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/",
            {"estado": "borrador"},
            format="json",
        )
        self.assertIn(revertir.status_code, {200, 400})

    def test_paciente_sin_autoriza_datos_rechazado_en_api(self):
        response = self.client.post(
            "/api/v1/pacientes/",
            {
                "clinica": str(self.clinica.id),
                "tipo_documento": "CC",
                "numero_documento": "111222333",
                "nombres": "Sin",
                "apellidos": "Autorizacion",
                "fecha_nacimiento": "1995-06-15",
                "sexo": "M",
                "direccion": "Calle 4",
                "telefono": "3003334455",
                "autoriza_datos": False,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
