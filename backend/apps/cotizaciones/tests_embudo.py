"""Fase 1 del embudo comercial: fecha de venta, estado comercial, ventas y KPI.

Ver docs/plan-funnel-comercial.md.
"""

import tempfile
from datetime import datetime, timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.cotizaciones.models import Cotizacion, CotizacionEnvio
# Import del módulo (no de la clase) para que el runner no repita esas pruebas aquí.
from apps.cotizaciones import tests as cotizaciones_tests


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage", MEDIA_ROOT=tempfile.gettempdir())
class EmbudoComercialTests(TestCase):
    setUp = cotizaciones_tests.CotizacionFlowTests.setUp
    _forma_pago = cotizaciones_tests.CotizacionFlowTests._forma_pago
    _payload = cotizaciones_tests.CotizacionFlowTests._payload

    def _crear(self):
        response = self.client.post("/api/v1/cotizaciones/", self._payload(), format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return Cotizacion.objects.get(pk=response.json()["id"])

    def _cambiar_estado(self, cotizacion, **data):
        return self.client.post(f"/api/v1/cotizaciones/{cotizacion.id}/cambiar_estado/", data, format="json")

    def _antedatar(self, cotizacion, dias):
        Cotizacion.objects.filter(pk=cotizacion.pk).update(created_at=timezone.now() - timedelta(days=dias))
        cotizacion.refresh_from_db()

    # ── Fecha de venta y descarte ──

    def test_aceptar_guarda_fecha_y_usuario(self):
        cotizacion = self._crear()
        response = self._cambiar_estado(cotizacion, estado="aceptada")
        self.assertEqual(response.status_code, 200, response.content)
        cotizacion.refresh_from_db()
        self.assertIsNotNone(cotizacion.aceptada_en)
        self.assertEqual(cotizacion.aceptada_por, self.superadmin)
        self.assertEqual(response.json()["estado_comercial"], "aceptada")

    def test_descartar_guarda_motivo(self):
        cotizacion = self._crear()
        response = self._cambiar_estado(cotizacion, estado="descartada", motivo_descarte="precio", nota_descarte="Caro")
        self.assertEqual(response.status_code, 200, response.content)
        cotizacion.refresh_from_db()
        self.assertEqual(cotizacion.estado, Cotizacion.Estado.DESCARTADA)
        self.assertEqual(cotizacion.motivo_descarte, "precio")
        self.assertEqual(cotizacion.nota_descarte, "Caro")
        self.assertIsNotNone(cotizacion.descartada_en)

    def test_descartar_sin_motivo_sigue_funcionando(self):
        cotizacion = self._crear()
        response = self._cambiar_estado(cotizacion, estado="descartada")
        self.assertEqual(response.status_code, 200, response.content)
        cotizacion.refresh_from_db()
        self.assertEqual(cotizacion.motivo_descarte, "")
        self.assertIsNotNone(cotizacion.descartada_en)

    # ── Estado comercial ──

    def test_estado_comercial_y_marca_enviada(self):
        borrador = self._crear()
        enviada = self._crear()
        CotizacionEnvio.objects.create(cotizacion=enviada, canal=CotizacionEnvio.Canal.PDF)
        vencida = self._crear()
        self._antedatar(vencida, 40)

        self.assertEqual(borrador.estado_comercial, "borrador")
        self.assertFalse(borrador.enviada)
        # Enviada no es un estado: sigue en borrador con la marca.
        self.assertEqual(enviada.estado_comercial, "borrador")
        self.assertTrue(enviada.enviada)
        self.assertEqual(vencida.estado_comercial, "vencida")
        # El estado guardado no cambia.
        self.assertEqual(vencida.estado, Cotizacion.Estado.BORRADOR)

        def ids(query):
            response = self.client.get(f"/api/v1/cotizaciones/?{query}")
            self.assertEqual(response.status_code, 200, response.content)
            return {row["id"] for row in response.json()["results"]}

        self.assertEqual(ids("estado_comercial=borrador"), {str(borrador.id), str(enviada.id)})
        self.assertEqual(ids("estado_comercial=vencida"), {str(vencida.id)})
        self.assertEqual(ids("estado_comercial=borrador&enviada=true"), {str(enviada.id)})
        self.assertEqual(ids("estado_comercial=borrador&enviada=false"), {str(borrador.id)})

        response = self.client.get(f"/api/v1/cotizaciones/{enviada.id}/")
        self.assertEqual(response.json()["estado_comercial"], "borrador")
        self.assertTrue(response.json()["enviada"])
        self.assertIsNotNone(response.json()["enviada_en"])

    def test_estado_comercial_invalido(self):
        response = self.client.get("/api/v1/cotizaciones/?estado_comercial=otro")
        self.assertEqual(response.status_code, 400)

    def test_aceptar_vencida_exige_confirmacion(self):
        cotizacion = self._crear()
        self._antedatar(cotizacion, 40)

        response = self._cambiar_estado(cotizacion, estado="aceptada")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "COTIZACION_VENCIDA")

        response = self._cambiar_estado(cotizacion, estado="aceptada", confirmar_vencida=True)
        self.assertEqual(response.status_code, 200, response.content)
        cotizacion.refresh_from_db()
        self.assertEqual(cotizacion.estado, Cotizacion.Estado.ACEPTADA)

    def test_renovar_reinicia_la_vigencia(self):
        cotizacion = self._crear()
        self._antedatar(cotizacion, 40)
        self.assertTrue(cotizacion.esta_vencida)

        response = self.client.post(f"/api/v1/cotizaciones/{cotizacion.id}/renovar/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["estado_comercial"], "borrador")
        self.assertEqual(response.json()["fecha_vencimiento"], (timezone.localdate() + timedelta(days=30)).isoformat())

    def test_no_se_renueva_una_aceptada(self):
        cotizacion = self._crear()
        self._cambiar_estado(cotizacion, estado="aceptada")
        response = self.client.post(f"/api/v1/cotizaciones/{cotizacion.id}/renovar/")
        self.assertEqual(response.status_code, 400)

    # ── Ventas ──

    def test_ventas_lista_solo_aceptadas_sin_migradas(self):
        aceptada = self._crear()
        self._cambiar_estado(aceptada, estado="aceptada")
        self._crear()  # borrador: no es venta
        migrada = self._crear()
        self._cambiar_estado(migrada, estado="aceptada")
        Cotizacion.objects.filter(pk=migrada.pk).update(es_migracion=True)

        response = self.client.get("/api/v1/ventas/")
        self.assertEqual(response.status_code, 200, response.content)
        rows = response.json()["results"]
        self.assertEqual([row["id"] for row in rows], [str(aceptada.id)])
        self.assertEqual(rows[0]["total"], "350000.00")
        self.assertEqual(rows[0]["saldo_pendiente"], "350000.00")
        self.assertFalse(rows[0]["en_mora"])
        self.assertIsNotNone(rows[0]["cartera_id"])

    def test_ventas_filtra_por_fecha_de_aceptacion(self):
        cotizacion = self._crear()
        self._cambiar_estado(cotizacion, estado="aceptada")
        hoy = timezone.localdate()
        ayer = (hoy - timedelta(days=1)).isoformat()

        response = self.client.get(f"/api/v1/ventas/?aceptada_desde={hoy.isoformat()}")
        self.assertEqual(len(response.json()["results"]), 1)
        response = self.client.get(f"/api/v1/ventas/?aceptada_hasta={ayer}")
        self.assertEqual(len(response.json()["results"]), 0)

    def test_ventas_ordena_por_total_y_lista_vendedores(self):
        barata = self._crear()
        self._cambiar_estado(barata, estado="aceptada")
        payload = self._payload()
        payload["items"][0]["valor_unitario"] = "500000.00"
        payload["formas_pago"][0]["valor"] = "500000.00"
        cara = Cotizacion.objects.get(pk=self.client.post("/api/v1/cotizaciones/", payload, format="json").json()["id"])
        Cotizacion.objects.filter(pk__in=[barata.pk, cara.pk]).update(profesional=self.superadmin)
        self._cambiar_estado(cara, estado="aceptada")

        def orden(campo):
            response = self.client.get(f"/api/v1/ventas/?ordering={campo}")
            self.assertEqual(response.status_code, 200, response.content)
            return [row["id"] for row in response.json()["results"]]

        self.assertEqual(orden("total_venta"), [str(barata.id), str(cara.id)])
        self.assertEqual(orden("-saldo_venta"), [str(cara.id), str(barata.id)])
        self.assertEqual(len(orden("pagado_venta")), 2)

        response = self.client.get(f"/api/v1/ventas/?vendedor={self.superadmin.id}")
        self.assertEqual(len(response.json()["results"]), 2)
        response = self.client.get("/api/v1/ventas/vendedores/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([v["id"] for v in response.json()], [str(self.superadmin.id)])

    # ── KPI comerciales ──

    def _reporte(self, desde, hasta):
        response = self.client.get(f"/api/v1/reportes/comercial/?fecha_inicio={desde}&fecha_fin={hasta}")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_cotizacion_de_un_mes_vendida_al_siguiente(self):
        hoy = timezone.localdate()
        inicio_mes = hoy.replace(day=1)
        mes_anterior_fin = inicio_mes - timedelta(days=1)
        mes_anterior_inicio = mes_anterior_fin.replace(day=1)

        cotizacion = self._crear()
        creada = timezone.make_aware(datetime.combine(mes_anterior_inicio + timedelta(days=5), datetime.min.time()))
        Cotizacion.objects.filter(pk=cotizacion.pk).update(created_at=creada)
        cotizacion.refresh_from_db()
        self._cambiar_estado(cotizacion, estado="aceptada", confirmar_vencida=True)

        anterior = self._reporte(mes_anterior_inicio, mes_anterior_fin)
        self.assertEqual(anterior["cotizaciones"]["creadas"], 1)
        self.assertEqual(anterior["ventas"]["cantidad"], 0)

        actual = self._reporte(inicio_mes, hoy)
        self.assertEqual(actual["cotizaciones"]["creadas"], 0)
        self.assertEqual(actual["ventas"]["cantidad"], 1)
        self.assertEqual(actual["ventas"]["valor"], "350000.00")

    def test_serie_cotizado_vs_vendido(self):
        hoy = timezone.localdate()
        ganada = self._crear()
        self._cambiar_estado(ganada, estado="aceptada")
        self._crear()

        # 10 días: un punto por día, todos presentes aunque estén en cero.
        data = self._reporte(hoy - timedelta(days=9), hoy)
        self.assertEqual(data["granularidad"], "dia")
        self.assertEqual(len(data["serie"]), 10)
        ultimo = data["serie"][-1]
        self.assertEqual(ultimo["periodo"], hoy.isoformat())
        self.assertEqual(ultimo["cotizadas"], 2)
        self.assertEqual(ultimo["cotizado_valor"], "700000.00")
        self.assertEqual(ultimo["vendidas"], 1)
        self.assertEqual(ultimo["vendido_valor"], "350000.00")

        # Un año: por mes.
        data = self._reporte(hoy - timedelta(days=364), hoy)
        self.assertEqual(data["granularidad"], "mes")
        self.assertEqual(data["serie"][-1]["vendidas"], 1)

    def test_tasa_de_cierre_y_migradas(self):
        hoy = timezone.localdate()
        ganada = self._crear()
        self._cambiar_estado(ganada, estado="aceptada")
        perdida = self._crear()
        self._cambiar_estado(perdida, estado="descartada", motivo_descarte="precio")
        abierta = self._crear()
        migrada = self._crear()
        self._cambiar_estado(migrada, estado="aceptada")
        Cotizacion.objects.filter(pk=migrada.pk).update(es_migracion=True)

        data = self._reporte(hoy.replace(day=1), hoy)
        self.assertEqual(data["cotizaciones"]["creadas"], 3)
        self.assertEqual(data["cotizaciones"]["abiertas"], 1)
        self.assertEqual(data["cotizaciones"]["descartadas"], 1)
        self.assertEqual(data["cotizaciones"]["motivo_principal"], "precio")
        self.assertEqual(data["ventas"]["cantidad"], 1)
        # De las 3 creadas en el periodo (sin la migrada), 1 ya se vendió.
        self.assertEqual(data["ventas"]["tasa_cierre_pct"], "33.33")
        self.assertEqual(data["ventas"]["creadas_vendidas"], 1)
        self.assertEqual(data["ventas"]["creadas_abiertas"], 1)
        self.assertIsNotNone(abierta)

    # ── Resumen de cartera ──

    def test_resumen_cartera_antiguedad_y_por_vencer(self):
        from apps.cartera.models import CuotaCartera

        cotizacion = self._crear()
        self._cambiar_estado(cotizacion, estado="aceptada")
        cuota = CuotaCartera.objects.get(cartera__cotizacion=cotizacion)
        hoy = timezone.localdate()
        cuota.fecha_esperada = hoy - timedelta(days=45)
        cuota.save(update_fields=["fecha_esperada"])
        CuotaCartera.objects.create(
            cartera=cuota.cartera, tipo=cuota.tipo, descripcion="Próxima",
            valor_esperado="100000.00", fecha_esperada=hoy + timedelta(days=10),
        )

        response = self.client.get("/api/v1/cartera/resumen/")
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        tramos = {t["tramo"]: t for t in data["mora_por_antiguedad"]}
        self.assertEqual(tramos["31_60"]["cuotas"], 1)
        self.assertEqual(tramos["31_60"]["valor"], "350000.00")
        self.assertEqual(tramos["1_30"]["cuotas"], 0)
        self.assertEqual(data["pacientes_en_mora"], 1)
        self.assertEqual(data["por_vencer_30"], {"valor": "100000.00", "cuotas": 1})
        self.assertEqual(data["cobrado_pct"], "0.0")
