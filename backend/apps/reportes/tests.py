from datetime import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.caja.models import CategoriaGasto, GastoCaja
from apps.clinicas.models import Clinica, Sede
from apps.cobros.models import Cobro, ItemCobro
from apps.pacientes.models import Paciente

User = get_user_model()


def _dt(y, m, d):
    return timezone.make_aware(datetime(y, m, d, 10, 0))


class EstadoFinancieroTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-pyl@example.com", password="secret123",
            first_name="Root", last_name="PyL", rol=User.Role.SUPERADMIN,
        )
        self.clinica = Clinica.objects.create(nombre="Clinica PyL", nit="901333222")
        self.sede_a = Sede.objects.create(
            clinica=self.clinica, nombre="A-Centro", ciudad="Bogota", direccion="Calle 1", telefono="3000000000",
        )
        self.sede_b = Sede.objects.create(
            clinica=self.clinica, nombre="B-Norte", ciudad="Bogota", direccion="Calle 2", telefono="3000000001",
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="333222111",
            nombres="Sol", apellidos="Ríos",
            fecha_nacimiento=timezone.localdate() - timezone.timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 9", telefono="3000000009",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        self.categoria = CategoriaGasto.objects.create(clinica=self.clinica, nombre="Servicios")

        # --- Periodo actual: agosto 2026 ---
        cobro_a = self._cobro(self.sede_a, "1000000.00", _dt(2026, 8, 5))
        ItemCobro.objects.create(
            cobro=cobro_a, tipo=ItemCobro.TipoItem.INSUMO_CONSUMO, descripcion="Toxina",
            cantidad="2", precio_unitario="0.00", costo_unitario="100000.00", subtotal="0.00",
        )
        self._cobro(self.sede_b, "500000.00", _dt(2026, 8, 12))
        self._cobro(self.sede_a, "999999.00", _dt(2026, 8, 20), estado=Cobro.Estado.ANULADO)
        self._gasto(self.sede_a, "150000.00", "2026-08-10")

        # --- Periodo anterior: julio 2026 ---
        self._cobro(self.sede_a, "800000.00", _dt(2026, 7, 15))

        self.client.force_authenticate(self.superadmin)

    def _cobro(self, sede, total, fecha, estado=Cobro.Estado.PENDIENTE):
        return Cobro.objects.create(
            origen=Cobro.Origen.LIBRE, paciente=self.paciente, sede=sede, created_by=self.superadmin,
            total=total, subtotal=total, estado=estado, fecha=fecha,
        )

    def _gasto(self, sede, valor, fecha):
        return GastoCaja.objects.create(
            sede=sede, categoria=self.categoria, descripcion="x", valor=valor, fecha=fecha,
            registrado_por=self.superadmin,
        )

    def _pyl(self, **params):
        params.setdefault("fecha_inicio", "2026-08-01")
        params.setdefault("fecha_fin", "2026-08-31")
        return self.client.get("/api/v1/reportes/pyl/", params).json()

    def test_margen_y_comparativo_todas_las_sedes(self):
        data = self._pyl()
        self.assertEqual(data["actual"]["ingresos_facturado"], "1500000.00")
        self.assertEqual(data["actual"]["costo_insumos"], "200000.00")
        self.assertEqual(data["actual"]["gastos_operativos"], "150000.00")
        self.assertEqual(data["actual"]["margen"], "1150000.00")
        self.assertEqual(data["anterior"]["ingresos_facturado"], "800000.00")
        self.assertEqual(data["variacion_pct"]["ingresos_facturado"], "87.5")

    def test_desglose_por_sede_solo_sin_filtro(self):
        data = self._pyl()
        self.assertIn("por_sede", data)
        por_sede = {row["sede_nombre"]: row for row in data["por_sede"]}
        self.assertEqual(por_sede["A-Centro"]["ingresos_facturado"], "1000000.00")
        self.assertEqual(por_sede["A-Centro"]["gastos_operativos"], "150000.00")
        self.assertEqual(por_sede["B-Norte"]["ingresos_facturado"], "500000.00")

        acotado = self._pyl(sede_id=str(self.sede_a.id))
        self.assertNotIn("por_sede", acotado)
        self.assertEqual(acotado["actual"]["ingresos_facturado"], "1000000.00")
        self.assertEqual(acotado["actual"]["margen"], "650000.00")  # 1000000 - 200000 - 150000

    def test_superadmin_con_clinica_activa_no_ve_otras_clinicas(self):
        otra = Clinica.objects.create(nombre="Otra Clinica", nit="900000001")
        sede_otra = Sede.objects.create(
            clinica=otra, nombre="Otra", ciudad="Cali", direccion="Cra 1", telefono="3009999999",
        )
        pac_otra = Paciente.objects.create(
            clinica=otra, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="999888777",
            nombres="Ajeno", apellidos="Total",
            fecha_nacimiento=timezone.localdate() - timezone.timedelta(days=30 * 365),
            sexo=Paciente.Sexo.MASCULINO, direccion="x", telefono="3001",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        Cobro.objects.create(
            origen=Cobro.Origen.LIBRE, paciente=pac_otra, sede=sede_otra, created_by=self.superadmin,
            total="7777777.00", subtotal="7777777.00", estado=Cobro.Estado.PENDIENTE, fecha=_dt(2026, 8, 8),
        )

        # Sin clínica activa: superadmin ve todo (1.5M + 7.7M).
        todo = self._pyl()
        self.assertEqual(todo["actual"]["ingresos_facturado"], "9277777.00")

        # Con X-Active-Clinica = clinica del test: solo esa (1.5M).
        acotado = self.client.get(
            "/api/v1/reportes/pyl/",
            {"fecha_inicio": "2026-08-01", "fecha_fin": "2026-08-31"},
            HTTP_X_ACTIVE_CLINICA=str(self.clinica.id),
        ).json()
        self.assertEqual(acotado["actual"]["ingresos_facturado"], "1500000.00")
        nombres = {r["sede_nombre"] for r in acotado["por_sede"]}
        self.assertNotIn("Otra", nombres)
