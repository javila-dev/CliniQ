"""Terminar una venta que el paciente deja a medias (docs/plan-terminacion-ventas.md)."""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.agenda import services as agenda_services
from apps.agenda.models import Cita
from apps.cartera.models import AcuerdoPago, CuotaCartera
from apps.clinicas.models import FormaDePago, Servicio
from apps.core.models import LogAccion
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.cotizaciones.services import aceptar_cotizacion
from apps.protocolos.models import TratamientoPaciente
# Mixin (no TestCase): importarlo no repite las pruebas del reporte.
from apps.reportes.tests_paquetes import PaquetesFixture
from apps.seguimiento import ritmo
from apps.seguimiento.models import ConfigSeguimiento, Oportunidad
from rest_framework.exceptions import ValidationError


class TerminacionFixture(PaquetesFixture):
    def setUp(self):
        super().setUp()
        self.efectivo = FormaDePago.objects.get(clinica=self.clinica, tipo_base="efectivo")
        self.item = self._venta("Ana", hace_dias=30)
        self.cotizacion = self.item.cotizacion
        self.cartera = self.cotizacion.cartera
        hoy = timezone.localdate()
        # Plan de 400.000 en dos cuotas: una vencida y otra por venir.
        self.vencida = CuotaCartera.objects.create(
            cartera=self.cartera, tipo=self.efectivo, descripcion="Cuota 1",
            valor_esperado=Decimal("200000.00"), fecha_esperada=hoy - timedelta(days=10),
        )
        self.futura = CuotaCartera.objects.create(
            cartera=self.cartera, tipo=self.efectivo, descripcion="Cuota 2",
            valor_esperado=Decimal("200000.00"), fecha_esperada=hoy + timedelta(days=20),
        )

    def _url(self, accion, cotizacion=None):
        return f"/api/v1/cotizaciones/{(cotizacion or self.cotizacion).id}/{accion}/"

    def _terminar(self, **datos):
        datos.setdefault("motivo", "economico")
        return self.client.post(self._url("terminar"), datos, format="json")

    def _refrescar(self):
        self.cotizacion.refresh_from_db()
        self.cartera.refresh_from_db()
        self.vencida.refresh_from_db()
        self.futura.refresh_from_db()


class TerminarSaldoTests(TerminacionFixture, TestCase):
    def test_perdonar_anula_cuotas_y_levanta_la_mora(self):
        self.assertTrue(agenda_services._cuotas_vencidas_bloqueantes(self.cotizacion.paciente, self.clinica).exists())

        response = self._terminar(modo="perdonar")
        self.assertEqual(response.status_code, 200, response.content)
        self._refrescar()

        self.assertIsNotNone(self.cotizacion.terminada_en)
        self.assertEqual(self.cotizacion.estado, Cotizacion.Estado.ACEPTADA)
        self.assertEqual(self.cotizacion.saldo_al_terminar, Decimal("400000.00"))
        self.assertEqual(self.cotizacion.valor_perdonado, Decimal("400000.00"))
        self.assertTrue(self.vencida.anulada)
        self.assertTrue(self.futura.anulada)
        self.assertEqual(self.cartera.total, Decimal("0.00"))
        self.assertEqual(self.cartera.saldo_pendiente, Decimal("0"))
        self.assertFalse(agenda_services._cuotas_vencidas_bloqueantes(self.cotizacion.paciente, self.clinica).exists())
        self.assertEqual(response.json()["saldo_pendiente"], "0.00")
        self.assertFalse(response.json()["puede_reanudar"])
        self.assertTrue(LogAccion.objects.filter(accion="venta.terminar").exists())

        venta = self.client.get("/api/v1/ventas/?terminada=true").json()["results"]
        self.assertEqual([v["id"] for v in venta], [str(self.cotizacion.id)])
        self.assertEqual(venta[0]["saldo_pendiente"], "0.00")
        self.assertEqual(self.client.get("/api/v1/ventas/?terminada=false").json()["results"], [])

    def test_perdonar_cierra_por_lo_abonado(self):
        CuotaCartera.objects.filter(pk=self.vencida.pk).update(valor_pagado=Decimal("50000.00"))

        response = self._terminar(modo="perdonar")
        self.assertEqual(response.status_code, 200, response.content)
        self._refrescar()

        self.assertFalse(self.vencida.anulada)
        self.assertTrue(self.vencida.pagada)
        self.assertEqual(self.vencida.valor_esperado, Decimal("50000.00"))
        self.assertEqual(self.cartera.total, Decimal("50000.00"))
        self.assertEqual(self.cotizacion.valor_perdonado, Decimal("350000.00"))

    def test_cobrar_un_valor_deja_una_sola_cuota(self):
        fecha = timezone.localdate() + timedelta(days=15)
        response = self._terminar(modo="cobrar", valor="100000.00", fecha=fecha.isoformat())
        self.assertEqual(response.status_code, 200, response.content)
        self._refrescar()

        vigentes = list(self.cartera.cuotas.filter(anulada=False))
        self.assertEqual(len(vigentes), 1)
        self.assertEqual(vigentes[0].valor_esperado, Decimal("100000.00"))
        self.assertEqual(vigentes[0].fecha_esperada, fecha)
        self.assertEqual(vigentes[0].tipo, self.efectivo)  # la de la primera cuota pendiente
        self.assertEqual(self.cartera.total, Decimal("100000.00"))
        self.assertEqual(self.cotizacion.valor_perdonado, Decimal("300000.00"))

        response = self.client.post(self._url("reanudar"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "NO_REANUDABLE")

    def test_cobrar_el_saldo_completo_no_toca_el_plan_y_se_reanuda(self):
        response = self._terminar(modo="cobrar", valor="400000.00")
        self.assertEqual(response.status_code, 200, response.content)
        self._refrescar()
        self.assertFalse(self.vencida.anulada)
        self.assertFalse(self.futura.anulada)
        self.assertEqual(self.cotizacion.valor_perdonado, Decimal("0.00"))
        self.assertTrue(response.json()["puede_reanudar"])
        self.assertTrue(self.client.get(self._url("sesiones")).json()["terminada"])

        response = self.client.post(self._url("reanudar"))
        self.assertEqual(response.status_code, 200, response.content)
        self._refrescar()
        self.assertIsNone(self.cotizacion.terminada_en)
        self.assertEqual(self.cotizacion.motivo_terminacion, "")
        self.assertFalse(self.client.get(self._url("sesiones")).json()["terminada"])
        self.item.refresh_from_db()
        agenda_services._reservar_sesion_del_item(self.item)  # se vuelve a poder agendar
        tratamiento = TratamientoPaciente.objects.get(cotizacion_item=self.item)
        self.assertEqual(tratamiento.estado, TratamientoPaciente.Estado.ACTIVO)
        self.assertTrue(LogAccion.objects.filter(accion="venta.reanudar").exists())

    def test_validaciones_del_saldo(self):
        response = self._terminar()
        self.assertEqual(response.json()["code"], "ELEGIR_MODO_SALDO")
        response = self._terminar(modo="cobrar", valor="500000.00")
        self.assertEqual(response.json()["code"], "VALOR_FUERA_DE_RANGO")
        response = self._terminar(modo="cobrar", valor="100000.00")
        self.assertEqual(response.json()["code"], "FECHA_REQUERIDA")
        ayer = (timezone.localdate() - timedelta(days=1)).isoformat()
        response = self._terminar(modo="cobrar", valor="100000.00", fecha=ayer)
        self.assertEqual(response.json()["code"], "FECHA_INVALIDA")
        response = self._terminar(motivo="otro", modo="perdonar")
        self.assertIn("nota", response.json())
        self.cotizacion.refresh_from_db()
        self.assertIsNone(self.cotizacion.terminada_en)

    def test_sin_saldo_no_pide_modo(self):
        CuotaCartera.objects.filter(cartera=self.cartera).update(valor_pagado=Decimal("200000.00"), pagada=True)
        response = self._terminar()
        self.assertEqual(response.status_code, 200, response.content)
        self._refrescar()
        self.assertEqual(self.cotizacion.valor_perdonado, Decimal("0.00"))
        self.assertTrue(response.json()["puede_reanudar"])

    def test_acuerdo_de_pago_pendiente_bloquea(self):
        AcuerdoPago.objects.create(
            cartera=self.cartera, numero=1, motivo="Renegociar", saldo_al_proponer=Decimal("400000.00"),
            plan_propuesto=[],
        )
        response = self._terminar(modo="perdonar")
        self.assertEqual(response.json()["code"], "ACUERDO_PENDIENTE")

    def test_no_se_termina_dos_veces_ni_una_cotizacion_abierta(self):
        self.assertEqual(self._terminar(modo="perdonar").status_code, 200)
        self.assertEqual(self._terminar(modo="perdonar").json()["code"], "VENTA_YA_TERMINADA")

        borrador = Cotizacion.objects.create(clinica=self.clinica, paciente=self.cotizacion.paciente, sede=self.norte)
        response = self.client.post(self._url("terminar", borrador), {"motivo": "economico"}, format="json")
        self.assertEqual(response.json()["code"], "VENTA_NO_ACEPTADA")

    def test_sin_permiso(self):
        self.client.force_authenticate(self.laura)
        self.assertEqual(self.client.get(self._url("terminacion")).status_code, 403)
        self.assertEqual(self._terminar(modo="perdonar").status_code, 403)


class TerminarCitasTests(TerminacionFixture, TestCase):
    def setUp(self):
        super().setUp()
        CuotaCartera.objects.filter(cartera=self.cartera).update(valor_pagado=Decimal("200000.00"), pagada=True)
        self.agendada = self._cita(self.item, dias=3, estado=Cita.Estado.PENDIENTE)
        self.sin_cerrar = self._cita(self.item, dias=-2, estado=Cita.Estado.CONFIRMADA)
        self.en_curso = self._cita(self.item, dias=0, estado=Cita.Estado.EN_CURSO)
        self.hecha = self._cita(self.item, dias=-9, estado=Cita.Estado.COMPLETADA)

    def test_vista_previa_agrupa_las_citas(self):
        response = self.client.get(self._url("terminacion"))
        self.assertEqual(response.status_code, 200, response.content)
        datos = response.json()
        self.assertEqual([c["id"] for c in datos["citas"]["agendadas"]], [str(self.agendada.id)])
        self.assertEqual([c["id"] for c in datos["citas"]["sin_cerrar"]], [str(self.sin_cerrar.id)])
        self.assertEqual([c["id"] for c in datos["citas"]["en_atencion"]], [str(self.en_curso.id)])
        self.assertEqual(datos["saldo"], "0.00")
        self.assertEqual(datos["sesiones"][0]["total"], 4)
        self.assertEqual(datos["sesiones"][0]["hechas"], 1)

    def test_hay_que_elegir_que_hacer_con_las_citas(self):
        response = self._terminar()
        self.assertEqual(response.json()["code"], "ELEGIR_ACCION_CITAS")

    def test_cancelarlas_ahora_respeta_las_que_estan_en_atencion(self):
        response = self._terminar(citas="cancelar")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["terminacion"]["citas_canceladas"], 2)
        for cita in (self.agendada, self.sin_cerrar, self.en_curso, self.hecha):
            cita.refresh_from_db()
        self.assertEqual(self.agendada.estado, Cita.Estado.CANCELADA)
        self.assertEqual(self.sin_cerrar.estado, Cita.Estado.CANCELADA)
        self.assertEqual(self.agendada.motivo_cancelacion, "Venta terminada: Razones económicas")
        self.assertEqual(self.en_curso.estado, Cita.Estado.EN_CURSO)
        self.assertEqual(self.hecha.estado, Cita.Estado.COMPLETADA)

    def test_manejarlas_a_mano_las_deja_pero_no_deja_agendar(self):
        response = self._terminar(citas="manual")
        self.assertEqual(response.status_code, 200, response.content)
        self.agendada.refresh_from_db()
        self.assertEqual(self.agendada.estado, Cita.Estado.PENDIENTE)
        self.item.refresh_from_db()
        with self.assertRaises(ValidationError) as ctx:
            agenda_services._reservar_sesion_del_item(self.item)
        self.assertEqual(ctx.exception.detail["code"], "VENTA_TERMINADA")


class TerminarEfectosTests(TerminacionFixture, TestCase):
    def setUp(self):
        super().setUp()
        CuotaCartera.objects.filter(cartera=self.cartera).update(valor_pagado=Decimal("200000.00"), pagada=True)

    def test_tratamiento_abandonado_y_oportunidad_cerrada(self):
        oportunidad = Oportunidad.objects.create(
            clinica=self.clinica, paciente=self.cotizacion.paciente, tipo=Oportunidad.Tipo.PAQUETE,
            motivo=Oportunidad.Motivo.SESIONES_PENDIENTES, item_cotizacion=self.item, cotizacion=self.cotizacion,
        )
        response = self._terminar()
        self.assertEqual(response.status_code, 200, response.content)
        tratamiento = TratamientoPaciente.objects.get(cotizacion_item=self.item)
        self.assertEqual(tratamiento.estado, TratamientoPaciente.Estado.ABANDONADO)
        oportunidad.refresh_from_db()
        self.assertEqual(oportunidad.estado, Oportunidad.Estado.PERDIDA)

    def test_sale_de_paquetes_sin_movimiento(self):
        url = "/api/v1/reportes/paquetes-sin-movimiento/"
        antes = self.client.get(url).json()
        self.assertIn(str(self.item.id), str(antes))
        self.assertEqual(self._terminar().status_code, 200)
        despues = self.client.get(url).json()
        self.assertNotIn(str(self.item.id), str(despues))

    def test_un_procedimiento_terminado_queda_pausado(self):
        servicio = Servicio.objects.create(clinica=self.clinica, nombre="Peeling", duracion_min=30, precio="80000.00")
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self._paciente("Bea"), profesional=self.laura, sede=self.norte,
        )
        item = cotizacion.items.create(
            tipo=ItemCotizacion.Tipo.PROCEDIMIENTO, procedimiento=servicio, descripcion="Peeling x3",
            num_citas=3, valor_unitario="80000.00",
        )
        aceptar_cotizacion(cotizacion, actor=self.superadmin)
        response = self.client.post(self._url("terminar", cotizacion), {"motivo": "salud", "modo": "perdonar"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        item.refresh_from_db()
        r = ritmo.calcular(item, ConfigSeguimiento.de(self.clinica))
        self.assertEqual(r["estado"], "pausado")
        with self.assertRaises(ValidationError):
            agenda_services._reservar_sesion_del_item(item)
