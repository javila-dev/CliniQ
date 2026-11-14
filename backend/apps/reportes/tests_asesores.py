"""Reporte comercial por asesor y filtro de ventas por tratamiento."""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.cartera.models import CuotaCartera
from apps.clinicas.models import FormaDePago, Servicio
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.cotizaciones.terminacion import terminar
# Mixin (no TestCase): importarlo no repite las pruebas del reporte de paquetes.
from apps.reportes.tests_paquetes import PaquetesFixture

URL = "/api/v1/reportes/comercial/asesores/"


class AsesoresFixture(PaquetesFixture):
    def setUp(self):
        super().setUp()
        self.peeling = Servicio.objects.create(clinica=self.clinica, nombre="Peeling", duracion_min=30, precio="80000.00")
        # Laura: dos ventas de RF x4 y una cotización abierta de peeling; el
        # profesional: una venta. Una venta vieja de Laura queda fuera del periodo.
        self.v1 = self._venta("Ana", hace_dias=2)
        self.v2 = self._venta("Bea", hace_dias=3)
        self.v3 = self._venta("Caro", hace_dias=2, vendedor=self.profesional)
        self._venta("Dora", hace_dias=60)
        self.abierta = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self._paciente("Eva"), profesional=self.laura, sede=self.norte,
        )
        self.abierta.items.create(
            tipo=ItemCotizacion.Tipo.PROCEDIMIENTO, procedimiento=self.peeling, descripcion="Peeling x2",
            num_citas=2, valor_unitario="80000.00",
        )
        hoy = timezone.localdate()
        self.rango = f"fecha_inicio={(hoy - timedelta(days=10)).isoformat()}&fecha_fin={hoy.isoformat()}"

    def _reporte(self, extra=""):
        response = self.client.get(f"{URL}?{self.rango}{extra}")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def _fila(self, datos, usuario):
        return next(f for f in datos["asesores"] if f["asesor_id"] == str(usuario.id))


class ReporteAsesoresTests(AsesoresFixture, TestCase):
    def test_volumen_y_valor_por_asesor(self):
        datos = self._reporte()
        laura = self._fila(datos, self.laura)
        self.assertEqual(laura["cotizaciones"], {"cantidad": 3, "valor": "960000.00"})
        self.assertEqual(laura["ventas"]["cantidad"], 2)
        self.assertEqual(laura["ventas"]["valor"], "800000.00")
        self.assertEqual(laura["ventas"]["ticket_promedio"], "400000.00")
        self.assertEqual(laura["creadas_vendidas"], 2)
        self.assertEqual(laura["tasa_cierre_pct"], "66.67")

        profesional = self._fila(datos, self.profesional)
        self.assertEqual(profesional["ventas"]["cantidad"], 1)
        self.assertEqual(profesional["tasa_cierre_pct"], "100.00")

        # Ordenado por valor vendido; los totales cuadran con las filas.
        self.assertEqual(datos["asesores"][0]["asesor_id"], str(self.laura.id))
        self.assertEqual(datos["totales"]["cotizaciones"]["cantidad"], 4)
        self.assertEqual(datos["totales"]["ventas"]["cantidad"], 3)
        self.assertEqual(datos["totales"]["ventas"]["valor"], "1200000.00")

    def test_cuadra_con_el_dashboard_comercial(self):
        datos = self._reporte()
        comercial = self.client.get(f"/api/v1/reportes/comercial/?{self.rango}").json()
        self.assertEqual(datos["totales"]["ventas"]["valor"], comercial["ventas"]["valor"])
        self.assertEqual(datos["totales"]["cotizaciones"]["cantidad"], comercial["cotizaciones"]["creadas"])

    def test_filtro_por_tratamiento(self):
        datos = self._reporte(f"&tratamiento={self.peeling.id}")
        self.assertEqual([f["asesor_id"] for f in datos["asesores"]], [str(self.laura.id)])
        self.assertEqual(datos["totales"]["cotizaciones"]["cantidad"], 1)
        self.assertEqual(datos["totales"]["ventas"]["cantidad"], 0)

        datos = self._reporte(f"&tratamiento={self.rf4.id}")
        self.assertEqual(datos["totales"]["ventas"]["cantidad"], 3)
        self.assertEqual(self._fila(datos, self.laura)["cotizaciones"]["cantidad"], 2)

        response = self.client.get(f"{URL}?tratamiento=no-es-uuid")
        self.assertEqual(response.status_code, 400)

    def test_filtro_por_sede(self):
        self.v3.cotizacion.__class__.objects.filter(pk=self.v3.cotizacion_id).update(sede=self.sur)
        datos = self._reporte(f"&sede_id={self.sur.id}")
        self.assertEqual([f["asesor_id"] for f in datos["asesores"]], [str(self.profesional.id)])

    def test_una_venta_terminada_con_perdon_sigue_valiendo_lo_vendido(self):
        efectivo = FormaDePago.objects.get(clinica=self.clinica, tipo_base="efectivo")
        cotizacion = self.v1.cotizacion
        CuotaCartera.objects.create(
            cartera=cotizacion.cartera, tipo=efectivo, valor_esperado=Decimal("400000.00"),
            fecha_esperada=timezone.localdate(),
        )
        terminar(cotizacion, {"motivo": "economico", "modo": "perdonar"}, usuario=self.superadmin)
        cotizacion.cartera.refresh_from_db()
        self.assertEqual(cotizacion.cartera.total, Decimal("0.00"))

        self.assertEqual(self._fila(self._reporte(), self.laura)["ventas"]["valor"], "800000.00")
        comercial = self.client.get(f"/api/v1/reportes/comercial/?{self.rango}").json()
        self.assertEqual(comercial["ventas"]["valor"], "1200000.00")

    def test_sin_permiso_de_reportes_financieros(self):
        self.client.force_authenticate(self.laura)
        self.assertEqual(self.client.get(URL).status_code, 403)


class VentasPorTratamientoTests(AsesoresFixture, TestCase):
    def setUp(self):
        super().setUp()
        Cotizacion.objects.filter(pk=self.abierta.pk).update(estado=Cotizacion.Estado.ACEPTADA, aceptada_en=timezone.now())

    def _ids(self, query=""):
        response = self.client.get(f"/api/v1/ventas/?{query}")
        self.assertEqual(response.status_code, 200, response.content)
        return {v["id"] for v in response.json()["results"]}

    def test_filtra_por_uno_o_varios(self):
        self.assertEqual(self._ids(f"tratamiento={self.peeling.id}"), {str(self.abierta.id)})
        self.assertEqual(len(self._ids(f"tratamiento={self.rf4.id}")), 4)
        self.assertEqual(len(self._ids(f"tratamiento={self.rf4.id},{self.peeling.id}")), 5)
        self.assertEqual(self.client.get("/api/v1/ventas/?tratamiento=x").status_code, 400)

    def test_obsequios_no_cuentan(self):
        self.v1.cotizacion.items.create(
            tipo=ItemCotizacion.Tipo.PROCEDIMIENTO, procedimiento=self.peeling, descripcion="Peeling",
            num_citas=1, valor_unitario="0.00", es_obsequio=True, agendable=True,
        )
        self.assertEqual(self._ids(f"tratamiento={self.peeling.id}"), {str(self.abierta.id)})

    def test_opciones_del_filtro(self):
        response = self.client.get("/api/v1/ventas/tratamientos/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            [(o["nombre"], o["tipo"]) for o in response.json()],
            [("RF x4", "tratamiento"), ("Peeling", "procedimiento")],
        )
