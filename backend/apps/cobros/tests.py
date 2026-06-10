from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica, Sede
from apps.cobros.models import Cobro
from apps.cotizaciones.models import Cotizacion
from apps.pacientes.models import Paciente


User = get_user_model()


class CobrosIngresosTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-cobros@example.com",
            password="secret123",
            first_name="Root",
            last_name="Cobros",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Ingresos", nit="901555333")
        self.sede = Sede.objects.create(
            clinica=self.clinica,
            nombre="Principal",
            ciudad="Bogota",
            direccion="Calle 10",
            telefono="3000000000",
            horario={},
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="444555666",
            nombres="Laura",
            apellidos="Lopez",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 8",
            telefono="3001112233",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.cotizacion = Cotizacion.objects.create(
            clinica=self.clinica,
            paciente=self.paciente,
            profesional=self.superadmin,
            sede=self.sede,
            estado=Cotizacion.Estado.ACEPTADA,
        )

    def test_lista_filtra_por_origen_y_cotizacion(self):
        cobro = Cobro.objects.create(
            origen=Cobro.Origen.COTIZACION,
            cotizacion=self.cotizacion,
            paciente=self.paciente,
            profesional=self.superadmin,
            sede=self.sede,
            created_by=self.superadmin,
        )

        response = self.client.get(
            f"/api/v1/cobros/cobros/?origen=cotizacion&cotizacion={self.cotizacion.id}"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)
        self.assertEqual(response.json()["results"][0]["id"], str(cobro.id))
        self.assertEqual(response.json()["results"][0]["cotizacion_numero"], f"COT-{str(self.cotizacion.id)[:8].upper()}")

    def test_resumen_separa_ingresos_por_origen(self):
        cobro_cita = Cobro.objects.create(
            origen=Cobro.Origen.CITA,
            paciente=self.paciente,
            profesional=self.superadmin,
            sede=self.sede,
            created_by=self.superadmin,
            total="500000.00",
            subtotal="500000.00",
        )
        cobro_cotizacion = Cobro.objects.create(
            origen=Cobro.Origen.COTIZACION,
            cotizacion=self.cotizacion,
            paciente=self.paciente,
            profesional=self.superadmin,
            sede=self.sede,
            created_by=self.superadmin,
        )
        cobro_libre = Cobro.objects.create(
            origen=Cobro.Origen.LIBRE,
            paciente=self.paciente,
            profesional=self.superadmin,
            sede=self.sede,
            created_by=self.superadmin,
            total="30000.00",
            subtotal="30000.00",
        )
        hoy = timezone.now()
        cobro_cita.pagos.create(
            medio_pago="efectivo",
            valor="500000.00",
            referencia="CITA-1",
            fecha=hoy,
            recibido_por=self.superadmin,
        )
        cobro_cotizacion.pagos.create(
            medio_pago="transferencia",
            valor="350000.00",
            referencia="COT-1",
            fecha=hoy,
            recibido_por=self.superadmin,
        )
        cobro_libre.pagos.create(
            medio_pago="efectivo",
            valor="30000.00",
            referencia="LIB-1",
            fecha=hoy,
            recibido_por=self.superadmin,
        )
        cobro_cotizacion.recalcular_totales()

        response = self.client.get("/api/v1/cobros/cobros/resumen/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["hoy"]["total"], "880000.00")
        self.assertEqual(response.json()["hoy"]["por_cita"], "500000.00")
        self.assertEqual(response.json()["hoy"]["por_cotizacion"], "350000.00")
        self.assertEqual(response.json()["hoy"]["por_libre"], "30000.00")
