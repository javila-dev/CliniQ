"""Regresiones del paso 2 de la verificación transversal: dinero y stock."""

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.caja.views import _ingresos_efectivo
from apps.clinicas.models import FormaDePago
from apps.cobros.models import Cobro, ItemCobro, PagoRecibido
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.historia_clinica.models import HistoriaClinica, NotaClinica
from apps.historia_clinica.services import eliminar_consumo_insumo, registrar_consumo_insumo
from apps.inventario.models import Insumo, StockInsumoSede
from apps.inventario.services import registrar_ajuste


class VerificacionPaso2Tests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.efectivo = FormaDePago.objects.filter(clinica=self.clinica, tipo_base="efectivo").first()
        self.tarjeta = FormaDePago.objects.filter(clinica=self.clinica).exclude(tipo_base="efectivo").first()

    def _cobro(self, total="100000.00", origen=Cobro.Origen.LIBRE):
        cobro = Cobro.objects.create(
            origen=origen, paciente=self.paciente, sede=self.sede, created_by=self.admin,
        )
        if origen != Cobro.Origen.COTIZACION:
            ItemCobro.objects.create(
                cobro=cobro, tipo=ItemCobro.TipoItem.SERVICIO, servicio=self.servicio, descripcion="Servicio",
                cantidad=1, precio_unitario=Decimal(total), subtotal=Decimal(total),
            )
            cobro.recalcular_totales()
        return cobro

    def _pagar(self, cobro, valor, medio=None):
        return self.client.post(
            f"/api/v1/cobros/cobros/{cobro.id}/registrar_pago/",
            {"medio_pago": str((medio or self.efectivo).id), "valor": valor},
            format="json",
        )

    # ── M6-01 ──────────────────────────────────────────────────────────────
    def test_m601_no_se_paga_dos_veces_un_ingreso_pagado(self):
        cobro = self._cobro()
        self.assertEqual(self._pagar(cobro, "100000").status_code, 201)
        response = self._pagar(cobro, "100000")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "COBRO_YA_PAGADO")
        self.assertEqual(cobro.pagos.count(), 1)

    def test_m601_un_abono_no_supera_el_saldo(self):
        cobro = self._cobro()
        self.assertEqual(self._pagar(cobro, "40000").status_code, 201)
        response = self._pagar(cobro, "80000")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "PAGO_SUPERA_SALDO")

    def test_m601_valor_cero_se_rechaza(self):
        self.assertEqual(self._pagar(self._cobro(), "0").status_code, 400)

    # ── M6-03 ──────────────────────────────────────────────────────────────
    def test_m603_un_ingreso_no_se_edita_directo(self):
        cobro = self._cobro()
        response = self.client.patch(f"/api/v1/cobros/cobros/{cobro.id}/", {"descuento": "99999"}, format="json")
        self.assertEqual(response.status_code, 405)

    # ── M6-06 ──────────────────────────────────────────────────────────────
    def test_m606_por_cobrar_con_pago_mixto(self):
        cobro = self._cobro()
        self._pagar(cobro, "50000")
        self._pagar(cobro, "50000", medio=self.tarjeta)
        resumen = self.client.get("/api/v1/cobros/cobros/resumen/").json()
        self.assertEqual(resumen["total_pendiente"], "0.00")
        self.assertEqual(resumen["total_recaudado"], "100000.00")

    # ── M6-09 ──────────────────────────────────────────────────────────────
    def test_m609_reversar_un_pago(self):
        cobro = self._cobro()
        pago_id = self._pagar(cobro, "100000").json()["pago"]["id"]
        url = f"/api/v1/cobros/cobros/{cobro.id}/pagos/{pago_id}/reversar/"
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 400)  # sin motivo
        response = self.client.post(url, {"motivo": "Valor mal digitado"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["estado"], Cobro.Estado.PENDIENTE)
        self.assertFalse(PagoRecibido.objects.filter(pk=pago_id).exists())

    def test_m609_reversar_exige_permiso_de_anular(self):
        cobro = self._cobro()
        pago_id = self._pagar(cobro, "100000").json()["pago"]["id"]
        recepcion = User.objects.create_user(
            email="rece@test.com", password="Secret123!", first_name="Re", last_name="Ce",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.client.force_authenticate(recepcion)
        response = self.client.post(
            f"/api/v1/cobros/cobros/{cobro.id}/pagos/{pago_id}/reversar/", {"motivo": "x"}, format="json",
        )
        self.assertEqual(response.status_code, 403)

    # ── M6-05 / M6-20 ──────────────────────────────────────────────────────
    def test_m605_ingresos_de_hoy_no_suman_cuotas_anteriores(self):
        cobro = self._cobro(origen=Cobro.Origen.COTIZACION)
        hace_un_mes = timezone.now() - timedelta(days=35)
        for _ in range(4):
            PagoRecibido.objects.create(
                cobro=cobro, medio_pago=self.efectivo, valor=Decimal("100000"), fecha=hace_un_mes,
                recibido_por=self.admin,
            )
        self._pagar(cobro, "100000", medio=self.tarjeta)  # la 5.ª cuota, hoy
        dashboard = self.client.get("/api/v1/reportes/dashboard/").json()
        self.assertEqual(Decimal(dashboard["cobros_hoy"]["total_cop"]), Decimal("100000"))
        por_medio = sum(Decimal(m["total"]) for m in dashboard["cobros_hoy"]["por_medio_pago"])
        self.assertEqual(por_medio, Decimal("100000"))  # el total cuadra con sus filas
        resumen = self.client.get(
            f"/api/v1/cobros/cobros/resumen/?fecha_desde={timezone.localdate()}&fecha_hasta={timezone.localdate()}",
        ).json()
        self.assertEqual(resumen["total_recaudado"], "100000.00")
        hoy = timezone.localdate()
        pyl = self.client.get(f"/api/v1/reportes/pyl/?fecha_inicio={hoy}&fecha_fin={hoy}").json()
        self.assertEqual(Decimal(pyl["actual"]["ingresos_facturado"]), Decimal("100000"))
        self.assertEqual(Decimal(pyl["actual"]["ingresos_recaudado"]), Decimal("100000"))

    # ── M6-08 ──────────────────────────────────────────────────────────────
    def test_m608_el_arqueo_cuenta_lo_registrado_aunque_tenga_fecha_anterior(self):
        cobro = self._cobro(origen=Cobro.Origen.COTIZACION)
        ayer = timezone.make_aware(datetime.combine(timezone.localdate() - timedelta(days=1), time.min))
        inicio_turno = timezone.now() - timedelta(minutes=5)
        PagoRecibido.objects.create(
            cobro=cobro, medio_pago=self.efectivo, valor=Decimal("30000"), fecha=ayer, recibido_por=self.admin,
        )
        self.assertEqual(Decimal(_ingresos_efectivo(self.sede, inicio_turno, timezone.now())), Decimal("30000"))

    # ── M7-01 ──────────────────────────────────────────────────────────────
    def test_m701_eliminar_un_consumo_dos_veces_devuelve_el_stock_una_vez(self):
        insumo = Insumo.objects.create(clinica=self.clinica, nombre="Gasa", unidad_medida="unidad")
        registrar_ajuste(insumo=insumo, sede=self.sede, cantidad_nueva=Decimal("10"), user=self.admin, motivo="Inicial")
        historia, _ = HistoriaClinica.objects.get_or_create(paciente=self.paciente, defaults={"clinica": self.clinica})
        nota = NotaClinica.objects.create(historia=historia)
        consumo = registrar_consumo_insumo(
            nota=nota, insumo=insumo, cantidad=Decimal("2"), user=self.admin, sede=self.sede,
        )
        eliminar_consumo_insumo(consumo, self.admin)
        with self.assertRaises(Exception):
            eliminar_consumo_insumo(consumo, self.admin)
        stock = StockInsumoSede.objects.get(insumo=insumo, sede=self.sede).stock_actual
        self.assertEqual(stock, Decimal("10"))
