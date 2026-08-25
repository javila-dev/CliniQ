from datetime import date, datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.caja.models import CategoriaGasto, CierreCaja, GastoCaja
from apps.clinicas.models import Clinica, Sede
from apps.cobros.models import Cobro
from apps.pacientes.models import Paciente

User = get_user_model()

# Fecha fija (no timezone.now()) para no depender del dia/hora en que corran
# los tests -- ver el hallazgo de fecha-flakiness en apps/cartera/tests.py.
FECHA_CIERRE = date(2026, 8, 20)


class CierreCajaCalculoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-caja@example.com",
            password="secret123",
            first_name="Root",
            last_name="Caja",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Caja", nit="901666555")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000"
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento="777111222",
            nombres="Marcela",
            apellidos="Torres",
            fecha_nacimiento=timezone.localdate() - timezone.timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO,
            direccion="Calle 7",
            telefono="3000000005",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )

    def _crear_cobro_pagado(self, *, medio_pago, valor, fecha=None):
        fecha = fecha or FECHA_CIERRE
        cobro = Cobro.objects.create(
            origen=Cobro.Origen.LIBRE,
            paciente=self.paciente,
            sede=self.sede,
            created_by=self.superadmin,
            total=valor,
            subtotal=valor,
            estado=Cobro.Estado.PAGADO,
        )
        cobro.pagos.create(
            medio_pago=medio_pago,
            valor=valor,
            referencia="REF",
            fecha=timezone.make_aware(datetime.combine(fecha, datetime.min.time())),
            recibido_por=self.superadmin,
        )
        return cobro

    def _crear_gasto(self, *, valor, estado=GastoCaja.Estado.APROBADO, fecha=None):
        fecha = fecha or FECHA_CIERRE
        categoria = CategoriaGasto.objects.create(clinica=self.clinica, nombre=f"Categoria {valor}-{estado}")
        return GastoCaja.objects.create(
            sede=self.sede,
            categoria=categoria,
            descripcion="Gasto de prueba",
            valor=valor,
            fecha=fecha,
            estado=estado,
            registrado_por=self.superadmin,
        )

    def _cerrar_caja(self, efectivo_contado, fecha=None):
        fecha = fecha or FECHA_CIERRE
        return self.client.post(
            "/api/v1/caja/cierres/",
            {"sede": str(self.sede.id), "fecha": fecha.isoformat(), "efectivo_contado": str(efectivo_contado)},
            format="json",
        )

    def test_diferencia_es_cero_cuando_el_efectivo_contado_coincide_con_lo_esperado(self):
        self._crear_cobro_pagado(medio_pago="efectivo", valor=Decimal("500000"))
        self._crear_gasto(valor=Decimal("30000"))

        # Esperado en caja = 500000 recibido en efectivo - 30000 de gasto aprobado.
        response = self._cerrar_caja("470000.00")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["diferencia"], "0.00")
        self.assertEqual(response.json()["total_cobros"], "500000.00")
        self.assertEqual(response.json()["total_gastos"], "30000.00")

    def test_diferencia_positiva_cuando_hay_sobrante(self):
        self._crear_cobro_pagado(medio_pago="efectivo", valor=Decimal("500000"))

        response = self._cerrar_caja("510000.00")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["diferencia"], "10000.00")

    def test_diferencia_negativa_cuando_hay_faltante(self):
        self._crear_cobro_pagado(medio_pago="efectivo", valor=Decimal("500000"))

        response = self._cerrar_caja("480000.00")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["diferencia"], "-20000.00")

    def test_pagos_no_efectivo_no_afectan_la_diferencia_pero_si_el_total_cobrado(self):
        self._crear_cobro_pagado(medio_pago="efectivo", valor=Decimal("300000"))
        self._crear_cobro_pagado(medio_pago="transferencia", valor=Decimal("200000"))

        # Si el cajero solo cuenta el efectivo (300000), la diferencia debe
        # dar cero -- la transferencia no pasa por la caja fisica.
        response = self._cerrar_caja("300000.00")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["diferencia"], "0.00")
        self.assertEqual(response.json()["total_cobros"], "500000.00")

    def test_gastos_no_aprobados_no_se_descuentan_de_la_diferencia(self):
        self._crear_cobro_pagado(medio_pago="efectivo", valor=Decimal("300000"))
        self._crear_gasto(valor=Decimal("50000"), estado=GastoCaja.Estado.PENDIENTE)
        self._crear_gasto(valor=Decimal("20000"), estado=GastoCaja.Estado.RECHAZADO)

        response = self._cerrar_caja("300000.00")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["total_gastos"], "0.00")
        self.assertEqual(response.json()["diferencia"], "0.00")

    def test_no_cuenta_cobros_ni_gastos_de_otra_fecha(self):
        otro_dia = date(2026, 8, 19)
        self._crear_cobro_pagado(medio_pago="efectivo", valor=Decimal("999999"), fecha=otro_dia)
        self._crear_gasto(valor=Decimal("999999"), fecha=otro_dia)
        self._crear_cobro_pagado(medio_pago="efectivo", valor=Decimal("100000"))

        response = self._cerrar_caja("100000.00")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["total_cobros"], "100000.00")
        self.assertEqual(response.json()["total_gastos"], "0.00")
        self.assertEqual(response.json()["diferencia"], "0.00")

    def test_no_se_puede_cerrar_dos_veces_la_misma_sede_y_fecha(self):
        primero = self._cerrar_caja("0.00")
        self.assertEqual(primero.status_code, 201)

        segundo = self._cerrar_caja("0.00")

        self.assertEqual(segundo.status_code, 400)
        self.assertEqual(segundo.json()["code"], "CIERRE_DUPLICADO")
        self.assertEqual(CierreCaja.objects.filter(sede=self.sede, fecha=FECHA_CIERRE).count(), 1)

    def test_recepcion_no_puede_cerrar_caja(self):
        recepcion = User.objects.create_user(
            email="recepcion-caja@example.com",
            password="secret123",
            first_name="Rosa",
            last_name="Recepcion",
            rol=User.Role.RECEPCION,
            clinica=self.clinica,
        )
        self.client.force_authenticate(recepcion)

        response = self._cerrar_caja("0.00")

        self.assertEqual(response.status_code, 403)
        self.assertFalse(CierreCaja.objects.filter(sede=self.sede, fecha=FECHA_CIERRE).exists())


class ResumenDiaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="root-resumen@example.com",
            password="secret123",
            first_name="Root",
            last_name="Resumen",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Resumen", nit="901666666")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1", telefono="3000000000"
        )

    def test_resumen_dia_refleja_caja_cerrada_solo_despues_del_cierre(self):
        antes = self.client.get(f"/api/v1/caja/cierres/resumen_dia/?sede_id={self.sede.id}&fecha={FECHA_CIERRE.isoformat()}")
        self.assertEqual(antes.status_code, 200)
        self.assertFalse(antes.json()["caja_cerrada"])
        self.assertIsNone(antes.json()["cierre_id"])

        cierre = self.client.post(
            "/api/v1/caja/cierres/",
            {"sede": str(self.sede.id), "fecha": FECHA_CIERRE.isoformat(), "efectivo_contado": "0.00"},
            format="json",
        )
        self.assertEqual(cierre.status_code, 201)

        despues = self.client.get(f"/api/v1/caja/cierres/resumen_dia/?sede_id={self.sede.id}&fecha={FECHA_CIERRE.isoformat()}")
        self.assertTrue(despues.json()["caja_cerrada"])
        self.assertEqual(despues.json()["cierre_id"], cierre.json()["id"])
