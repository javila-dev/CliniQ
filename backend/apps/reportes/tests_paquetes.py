"""Reporte de paquetes sin movimiento: lo vendido o importado que no se atiende en la app."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import Clinica, FormaDePago, Sede, Servicio, TratamientoCatalogo
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.cotizaciones.services import aceptar_cotizacion
from apps.migracion.models import LoteMigracion
from apps.pacientes.models import Paciente
from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

User = get_user_model()
URL = "/api/v1/reportes/paquetes-sin-movimiento/"


class PaquetesFixture:
    """Clínica con dos sedes, una asesora, un profesional y el tratamiento «RF x4»."""

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="reporte-paquetes@example.com", password="secret123", first_name="Sopo", last_name="Rte",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Paquetes", nit="901777333", modo_puesta_en_marcha=True)
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(self.clinica.id))
        self.norte = Sede.objects.create(
            clinica=self.clinica, nombre="Norte", ciudad="Bogota", direccion="Calle 1", telefono="3000000000",
        )
        self.sur = Sede.objects.create(
            clinica=self.clinica, nombre="Sur", ciudad="Bogota", direccion="Calle 2", telefono="3000000001",
        )
        self.laura = User.objects.create_user(
            email="laura-paquetes@example.com", password="secret123", first_name="Laura", last_name="Asesora",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.profesional = User.objects.create_user(
            email="prof-paquetes@example.com", password="secret123", first_name="Pro", last_name="Fesional",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        rf = Servicio.objects.create(clinica=self.clinica, nombre="Radiofrecuencia", duracion_min=30, precio="100000.00")
        self.rf4 = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="RF x4")
        tipo = self.rf4.tipos_sesion.create(nombre="RF", cantidad=4, orden=1, es_compromiso=True)
        tipo.procedimientos.create(procedimiento=rf, orden=1)
        self._n = 0

    def _paciente(self, nombre):
        self._n += 1
        return Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento=f"88800{self._n}",
            nombres=nombre, apellidos="Prueba", fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 7", telefono=f"30000001{self._n:02d}",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )

    def _venta(self, nombre, *, hace_dias, sede=None, vendedor=None):
        """Venta de «RF x4» aceptada hace ``hace_dias``."""
        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica, paciente=self._paciente(nombre), profesional=vendedor or self.laura,
            sede=sede or self.norte,
        )
        item = cotizacion.items.create(
            tipo=ItemCotizacion.Tipo.TRATAMIENTO, tratamiento=self.rf4, descripcion="RF x4",
            num_citas=1, valor_unitario="400000.00",
        )
        aceptar_cotizacion(cotizacion, actor=self.superadmin)
        cuando = timezone.now() - timedelta(days=hace_dias)
        Cotizacion.objects.filter(pk=cotizacion.pk).update(aceptada_en=cuando, created_at=cuando)
        return item

    def _cita(self, item, *, dias, estado):
        inicio = timezone.now() + timedelta(days=dias)
        cita = Cita.objects.create(
            paciente=item.cotizacion.paciente, sede=item.cotizacion.sede, profesional=self.profesional,
            servicio_nombre="RF", item_cotizacion=item, fecha_inicio=inicio,
            fecha_fin=inicio + timedelta(minutes=30), duracion_min=30, estado=estado,
        )
        if estado == Cita.Estado.COMPLETADA:
            sesion = SesionProcedimiento.objects.filter(
                tratamiento__cotizacion_item=item, estado=SesionProcedimiento.Estado.PENDIENTE,
            ).order_by("numero").first()
            sesion.cita = cita
            sesion.estado = SesionProcedimiento.Estado.COMPLETADO
            sesion.fecha = timezone.localdate(inicio)
            sesion.save()
        return cita

    def _importar(self, nombre, *, hechas, hace_dias):
        """Paciente cargado por la puesta en marcha con ``hechas`` de 4 sesiones."""
        efectivo = str(FormaDePago.objects.get(clinica=self.clinica, tipo_base="efectivo").id)
        paciente = self._paciente(nombre)
        r = self.client.post("/api/v1/migracion/paciente-en-curso/", {
            "paciente": str(paciente.id), "sede": str(self.sur.id),
            "tratamiento": {
                "tipo": "tratamiento", "tratamiento": str(self.rf4.id), "descripcion": "RF x4",
                "num_sesiones_total": 4, "precio_total_pactado": "400000.00",
            },
            "sesiones_realizadas": [{} for _ in range(hechas)],
            "pagos": [{"valor": "400000.00", "medio_pago": efectivo, "fecha": "2026-01-15"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        lote = LoteMigracion.objects.get(paciente=paciente)
        LoteMigracion.objects.filter(pk=lote.pk).update(created_at=timezone.now() - timedelta(days=hace_dias))
        return ItemCotizacion.objects.get(cotizacion__paciente=paciente)

    def _reporte(self, **params):
        r = self.client.get(URL, params)
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def _fila(self, reporte, item):
        return next((p for p in reporte["paquetes"] if p["item_id"] == str(item.id)), None)


class PaquetesSinMovimientoTests(PaquetesFixture, TestCase):
    def test_venta_que_nunca_se_agendo(self):
        item = self._venta("Ana", hace_dias=60)
        fila = self._fila(self._reporte(), item)
        self.assertEqual(
            (fila["estado"], fila["origen"], fila["responsable_nombre"], fila["sede_nombre"]),
            ("nunca_agendado", "venta", "Laura Asesora", "Norte"),
        )
        self.assertEqual((fila["sesiones_hechas"], fila["sesiones_total"], fila["citas_en_app"]), (0, 4, 0))
        self.assertEqual(fila["dias_sin_movimiento"], 60)

    def test_cuenta_desde_la_ultima_sesion_hecha(self):
        item = self._venta("Bea", hace_dias=90)
        self._cita(item, dias=-45, estado=Cita.Estado.COMPLETADA)
        fila = self._fila(self._reporte(), item)
        self.assertEqual((fila["estado"], fila["sesiones_hechas"], fila["dias_sin_movimiento"]), ("sin_proxima_cita", 1, 45))
        self.assertIsNotNone(fila["ultima_atencion"])

    def test_un_tratamiento_con_una_cita_no_cuenta_como_terminado(self):
        # El reporte anterior usaba num_citas (1 en un tratamiento): con una cita lo daba por hecho.
        item = self._venta("Caro", hace_dias=90)
        self._cita(item, dias=-40, estado=Cita.Estado.COMPLETADA)
        self.assertIsNotNone(self._fila(self._reporte(), item))

    def test_con_proxima_cita_o_reciente_no_aparece_pero_cuenta_como_activo(self):
        agendada = self._venta("Dani", hace_dias=60)
        self._cita(agendada, dias=5, estado=Cita.Estado.PENDIENTE)
        reciente = self._venta("Eva", hace_dias=10)
        reporte = self._reporte()
        self.assertIsNone(self._fila(reporte, agendada))
        self.assertIsNone(self._fila(reporte, reciente))
        self.assertEqual(reporte["totales"]["activos"], 2)
        self.assertEqual(reporte["totales"]["sin_movimiento"], 0)
        # Con 0 días aparece la reciente, no la agendada.
        reporte = self._reporte(dias=0)
        self.assertIsNotNone(self._fila(reporte, reciente))
        self.assertIsNone(self._fila(reporte, agendada))

    def test_completo_o_pausado_no_esta_activo(self):
        completo = self._venta("Flor", hace_dias=200)
        for d in (-150, -120, -90, -60):
            self._cita(completo, dias=d, estado=Cita.Estado.COMPLETADA)
        pausado = self._venta("Gina", hace_dias=200)
        TratamientoPaciente.objects.filter(cotizacion_item=pausado).update(estado=TratamientoPaciente.Estado.ABANDONADO)
        self.assertEqual(self._reporte()["totales"]["activos"], 0)

    def test_importado_queda_a_nombre_de_quien_hizo_la_carga(self):
        item = self._importar("Hilda", hechas=2, hace_dias=40)
        fila = self._fila(self._reporte(), item)
        self.assertEqual(
            (fila["origen"], fila["responsable_nombre"], fila["estado"], fila["sesiones_hechas"]),
            ("importado", "Sopo Rte", "nunca_agendado", 2),
        )
        self.assertEqual(fila["dias_sin_movimiento"], 40)

    def test_importado_con_todas_hechas_no_esta_activo(self):
        self._importar("Ines", hechas=4, hace_dias=40)
        self.assertEqual(self._reporte()["totales"]["activos"], 0)

    def test_resumen_por_responsable_y_por_sede(self):
        juan = User.objects.create_user(
            email="juan-paquetes@example.com", password="secret123", first_name="Juan", last_name="Vende",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self._venta("Ana", hace_dias=60)
        self._venta("Bea", hace_dias=60)
        con_cita = self._venta("Caro", hace_dias=60)
        self._cita(con_cita, dias=3, estado=Cita.Estado.PENDIENTE)
        self._venta("Dani", hace_dias=60, vendedor=juan, sede=self.sur)
        reporte = self._reporte()
        laura = next(g for g in reporte["por_responsable"] if g["nombre"] == "Laura Asesora")
        self.assertEqual((laura["activos"], laura["sin_movimiento"], laura["nunca_agendados"]), (3, 2, 2))
        self.assertEqual(reporte["por_responsable"][0]["nombre"], "Laura Asesora")
        sedes = {g["nombre"]: (g["activos"], g["sin_movimiento"]) for g in reporte["por_sede"]}
        self.assertEqual(sedes, {"Norte": (3, 2), "Sur": (1, 1)})
        self.assertEqual(reporte["totales"]["sesiones_pendientes"], 12)

    def test_filtros_por_sede_responsable_y_origen(self):
        norte = self._venta("Ana", hace_dias=60)
        sur = self._venta("Bea", hace_dias=60, sede=self.sur)
        importado = self._importar("Caro", hechas=1, hace_dias=60)
        ids = lambda r: {p["item_id"] for p in r["paquetes"]}
        self.assertEqual(ids(self._reporte(sede_id=str(self.sur.id))), {str(sur.id), str(importado.id)})
        self.assertEqual(ids(self._reporte(responsable=str(self.laura.id))), {str(norte.id), str(sur.id)})
        self.assertEqual(ids(self._reporte(origen="importado")), {str(importado.id)})

    def test_carga_revertida_no_aparece(self):
        item = self._importar("Dora", hechas=1, hace_dias=60)
        LoteMigracion.objects.update(revertido_en=timezone.now())
        self.assertIsNone(self._fila(self._reporte(), item))

    def test_sin_clinica_activa_viene_vacio(self):
        self.client.credentials()
        self.assertEqual(self._reporte()["paquetes"], [])

    def test_otra_clinica_no_se_mezcla(self):
        self._venta("Ana", hace_dias=60)
        otra = Clinica.objects.create(nombre="Otra", nit="901000111")
        self.client.credentials(HTTP_X_ACTIVE_CLINICA=str(otra.id))
        self.assertEqual(self._reporte()["totales"]["activos"], 0)
