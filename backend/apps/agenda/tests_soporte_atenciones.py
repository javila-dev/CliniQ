"""Correcciones de soporte sobre una atención (console): trasladarla y eliminarla."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita, CorreccionSoporte
from apps.clinicas.models import Clinica, FormaDePago, Sede, Servicio, TipoSesion, TipoSesionProcedimiento, TratamientoCatalogo
from apps.cobros.models import Cobro
from apps.core.models import LogAccion
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.cotizaciones.services import aceptar_cotizacion
from apps.historia_clinica.models import ConsumoInsumo, HistoriaClinica, NotaClinica, OrdenMedica, ResultadoExamen
from apps.pacientes.models import Paciente
from apps.protocolos.models import SesionProcedimiento
from apps.protocolos.services import marcar_sesion_completada

User = get_user_model()
BASE = "/api/v1/admin/soporte"


class AtencionDeTratamientoMixin:
    """A tiene una atención completada de su paquete, con nota, orden, examen y cobro."""

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            email="soporte-traslado@example.com", password="secret123", first_name="Sopo", last_name="Rte",
            rol=User.Role.SUPERADMIN,
        )
        self.client.force_authenticate(self.superadmin)
        self.clinica = Clinica.objects.create(nombre="Clinica Traslado", nit="901777888")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1",
            telefono="3000000000", horario={"lunes": ["08:00", "18:00"]},
        )
        self.profesional = User.objects.create_user(
            email="prof-traslado@example.com", password="secret123", first_name="Pro", last_name="Fesional",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        self.a = self._paciente("1001", "Ana", "Equivocada")
        self.b = self._paciente("2002", "Beatriz", "Correcta")
        self.laser = Servicio.objects.create(clinica=self.clinica, nombre="Laser facial", duracion_min=60)
        self.tratamiento = TratamientoCatalogo.objects.create(
            clinica=self.clinica, nombre="Rejuvenecimiento", precio_estimado="700000.00",
        )
        bloque = TipoSesion.objects.create(
            tratamiento=self.tratamiento, nombre="Laser facial", cantidad=2, orden=1, duracion_min=60,
        )
        TipoSesionProcedimiento.objects.create(tipo_sesion=bloque, procedimiento=self.laser, orden=1)
        self.item_a = self._vender(self.a)
        self.item_b = self._vender(self.b)

        inicio = timezone.now() - timedelta(days=1)
        self.cita = Cita.objects.create(
            paciente=self.a, sede=self.sede, profesional=self.profesional, servicio_nombre="Rejuvenecimiento",
            item_cotizacion=self.item_a, fecha_inicio=inicio, fecha_fin=inicio + timedelta(hours=1), duracion_min=60,
            estado=Cita.Estado.COMPLETADA, fecha_inicio_real=inicio, fecha_fin_real=inicio + timedelta(hours=1),
            canal_confirmacion=self.a.canal_confirmacion, canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )
        self.historia_a = HistoriaClinica.del_paciente(self.a)
        self.nota = NotaClinica.objects.create(
            historia=self.historia_a, cita=self.cita, estado=NotaClinica.EstadoNota.COMPLETADA,
            motivo_consulta="Laser en mejillas",
        )
        self.orden = OrdenMedica.objects.create(
            historia=self.historia_a, cita=self.cita, nota=self.nota, contenido="Hemograma", profesional=self.profesional,
        )
        ResultadoExamen.objects.create(historia=self.historia_a, nota=self.nota, titulo="Previo", fecha=inicio.date())
        self.sesion_a = self._primera_pendiente(self.item_a)
        marcar_sesion_completada(
            self.sesion_a, cita=self.cita, profesional=self.profesional, forzar_sin_consentimiento=True, motivo="x",
        )
        self.cobro = Cobro.objects.create(
            cita=self.cita, paciente=self.a, sede=self.sede, total="100000", subtotal="100000",
            cotizacion=self.item_a.cotizacion, created_by=self.profesional,
        )

    def _paciente(self, documento, nombres, apellidos):
        return Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento=documento,
            nombres=nombres, apellidos=apellidos, fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 2", telefono="3011111111",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )

    def _vender(self, paciente):
        r = self.client.post(
            "/api/v1/cotizaciones/",
            {
                "paciente": str(paciente.id), "validez_dias": 30, "notas": "",
                "items": [{"tratamiento": str(self.tratamiento.id), "num_citas": 1}],
                "formas_pago": [{
                    "tipo": str(FormaDePago.objects.get(clinica=self.clinica, tipo_base="transferencia").id),
                    "descripcion": "Banco", "valor": "700000.00",
                }],
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        aceptar_cotizacion(Cotizacion.objects.get(id=r.json()["id"]), actor=self.superadmin)
        return ItemCotizacion.objects.get(id=r.json()["items"][0]["id"])

    def _primera_pendiente(self, item):
        return SesionProcedimiento.objects.filter(
            tratamiento__cotizacion_item=item, estado=SesionProcedimiento.Estado.PENDIENTE, cita__isnull=True,
        ).first()

    def _datos(self, **extra):
        return {"clinica": str(self.clinica.id), "cita": str(self.cita.id), "paciente_destino": str(self.b.id), **extra}


class TrasladoAtencionTests(AtencionDeTratamientoMixin, TestCase):
    def test_lista_las_atenciones_del_paciente(self):
        r = self.client.get(f"{BASE}/atenciones/", {"clinica": str(self.clinica.id), "paciente": str(self.a.id)})
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual([a["id"] for a in r.json()], [str(self.cita.id)])
        self.assertEqual(r.json()[0]["paquete"], self.item_a.descripcion)

    def test_vista_previa_ofrece_el_paquete_de_b_y_el_cobro(self):
        r = self.client.post(f"{BASE}/trasladar-atencion/previsualizar/", self._datos(), format="json")
        self.assertEqual(r.status_code, 200, r.content[:300])
        datos = r.json()
        self.assertEqual(datos["contenido"]["notas"], 1)
        self.assertEqual(datos["contenido"]["ordenes"], 1)
        self.assertEqual([s["id"] for s in datos["sesiones_origen"]], [str(self.sesion_a.id)])
        self.assertEqual([p["id"] for p in datos["paquetes_destino"]], [str(self.item_b.id)])
        self.assertTrue(datos["paquetes_destino"][0]["sesiones"][0]["misma_sesion"])
        self.assertTrue(datos["cobro"]["cuenta_para_el_plan"])

    def test_traslada_a_un_paquete_de_b(self):
        restantes_a = self.item_a.citas_restantes()
        sesion_b = self._primera_pendiente(self.item_b)
        r = self.client.post(f"{BASE}/trasladar-atencion/", self._datos(
            item_destino=str(self.item_b.id), sesion_destino=str(sesion_b.id), accion_cobro="mover",
            motivo="El profesional abrió la cita de otra paciente",
        ), format="json")
        self.assertEqual(r.status_code, 201, r.content[:400])

        self.cita.refresh_from_db()
        self.assertEqual(self.cita.paciente_id, self.b.id)
        self.assertEqual(self.cita.item_cotizacion_id, self.item_b.id)
        self.nota.refresh_from_db()
        historia_b = HistoriaClinica.objects.get(paciente=self.b)
        self.assertEqual(self.nota.historia_id, historia_b.id)
        self.orden.refresh_from_db()
        self.assertEqual(self.orden.historia_id, historia_b.id)
        self.assertTrue(self.orden.auditorias.filter(accion="traslado").exists())
        self.assertEqual(ResultadoExamen.objects.get(nota=self.nota).historia_id, historia_b.id)

        self.sesion_a.refresh_from_db()
        self.assertEqual(self.sesion_a.estado, SesionProcedimiento.Estado.PENDIENTE)
        self.assertIsNone(self.sesion_a.cita_id)
        self.assertFalse(self.sesion_a.procedimientos_ejecutados.exists())
        self.assertEqual(self.item_a.citas_restantes(), restantes_a + 1)
        sesion_b.refresh_from_db()
        self.assertEqual(sesion_b.estado, SesionProcedimiento.Estado.COMPLETADO)
        self.assertEqual(sesion_b.cita_id, self.cita.id)
        self.assertEqual(sesion_b.profesional_id, self.profesional.id)

        self.cobro.refresh_from_db()
        self.assertEqual(self.cobro.paciente_id, self.b.id)
        self.assertEqual(self.cobro.cotizacion_id, self.item_b.cotizacion_id)
        traslado = CorreccionSoporte.objects.get(cita=self.cita, tipo=CorreccionSoporte.Tipo.TRASLADAR_ATENCION)
        self.assertEqual(traslado.paciente_id, self.a.id)
        self.assertEqual(traslado.paciente_destino_id, self.b.id)
        self.assertEqual(traslado.realizado_por_id, self.superadmin.id)
        log = LogAccion.objects.get(accion="cita.trasladar")
        self.assertEqual(log.clinica_id, self.clinica.id)
        self.assertEqual(log.detalle["paciente_id"], str(self.a.id))

        lista = self.client.get(f"{BASE}/atenciones/", {"clinica": str(self.clinica.id), "paciente": str(self.b.id)}).json()
        self.assertTrue(lista[0]["recibida_por_traslado"])
        self.assertEqual(self.client.get(f"{BASE}/atenciones/", {"clinica": str(self.clinica.id), "paciente": str(self.a.id)}).json(), [])

    def test_traslada_sin_paquete_y_el_cobro_queda_en_a(self):
        r = self.client.post(f"{BASE}/trasladar-atencion/", self._datos(accion_cobro="desligar", motivo="Error"), format="json")
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.cita.refresh_from_db()
        self.assertEqual(self.cita.paciente_id, self.b.id)
        self.assertIsNone(self.cita.item_cotizacion_id)
        self.cobro.refresh_from_db()
        self.assertIsNone(self.cobro.cita_id)
        self.assertEqual(self.cobro.paciente_id, self.a.id)

    def test_validaciones(self):
        url = f"{BASE}/trasladar-atencion/"
        sin_cobro = self.client.post(url, self._datos(motivo="Error"), format="json")
        self.assertEqual(sin_cobro.json()["code"], "ACCION_COBRO_REQUERIDA")
        sin_sesion = self.client.post(url, self._datos(item_destino=str(self.item_b.id), accion_cobro="mover", motivo="Error"), format="json")
        self.assertEqual(sin_sesion.json()["code"], "SESION_REQUERIDA")
        ajeno = self.client.post(url, self._datos(item_destino=str(self.item_a.id), accion_cobro="mover", motivo="Error"), format="json")
        self.assertEqual(ajeno.json()["code"], "PAQUETE_NO_DISPONIBLE")
        mismo = self.client.post(url, self._datos(paciente_destino=str(self.a.id), accion_cobro="mover", motivo="Error"), format="json")
        self.assertEqual(mismo.json()["code"], "MISMO_PACIENTE")
        self.cita.refresh_from_db()
        self.assertEqual(self.cita.paciente_id, self.a.id)

    def test_solo_superadmin(self):
        self.client.force_authenticate(self.profesional)
        r = self.client.post(f"{BASE}/trasladar-atencion/previsualizar/", self._datos(), format="json")
        self.assertEqual(r.status_code, 403)


class EliminarAtencionTests(AtencionDeTratamientoMixin, TestCase):
    URL = f"{BASE}/eliminar-atencion/"

    def _datos(self, **extra):
        return {"clinica": str(self.clinica.id), "cita": str(self.cita.id), **extra}

    def test_vista_previa_muestra_el_cupo_y_el_cobro(self):
        r = self.client.post(f"{self.URL}previsualizar/", self._datos(), format="json")
        self.assertEqual(r.status_code, 200, r.content[:300])
        datos = r.json()
        self.assertEqual([s["id"] for s in datos["sesiones"]], [str(self.sesion_a.id)])
        cupo = datos["paquete"]
        self.assertEqual(cupo["cancelada"]["restantes_despues"], cupo["cancelada"]["restantes_antes"] + 1)
        self.assertEqual(cupo["pendiente"]["restantes_despues"], cupo["pendiente"]["restantes_antes"])
        self.assertTrue(datos["cobro"]["cuenta_para_el_plan"])

    def test_eliminar_borra_lo_clinico_devuelve_la_sesion_y_guarda_copia(self):
        restantes = self.item_a.citas_restantes()
        r = self.client.post(self.URL, self._datos(
            estado_cita="cancelada", accion_cobro="anular", motivo="La paciente nunca llegó, se abrió por error",
        ), format="json")
        self.assertEqual(r.status_code, 201, r.content[:400])

        self.assertFalse(NotaClinica.objects.filter(cita=self.cita).exists())
        self.assertFalse(OrdenMedica.objects.filter(id=self.orden.id).exists())
        self.assertFalse(ResultadoExamen.objects.filter(historia=self.historia_a).exists())
        self.cita.refresh_from_db()
        self.assertEqual(self.cita.estado, Cita.Estado.CANCELADA)
        self.assertIn("soporte", self.cita.motivo_cancelacion)
        self.sesion_a.refresh_from_db()
        self.assertEqual(self.sesion_a.estado, SesionProcedimiento.Estado.PENDIENTE)
        self.assertIsNone(self.sesion_a.cita_id)
        self.assertEqual(self.item_a.citas_restantes(), restantes + 1)
        self.cobro.refresh_from_db()
        self.assertEqual(self.cobro.estado, Cobro.Estado.ANULADO)

        correccion = CorreccionSoporte.objects.get(cita=self.cita, tipo=CorreccionSoporte.Tipo.ELIMINAR_ATENCION)
        self.assertEqual(correccion.resumen["copia"]["notas"][0]["motivo_consulta"], "Laser en mejillas")
        self.assertEqual(correccion.resumen["copia"]["ordenes"][0]["contenido"], "Hemograma")
        self.assertTrue(LogAccion.objects.filter(accion="cita.eliminar_atencion", clinica=self.clinica).exists())
        self.assertEqual(
            self.client.get(f"{BASE}/atenciones/", {"clinica": str(self.clinica.id), "paciente": str(self.a.id)}).json(), [],
        )
        correcciones = self.client.get(f"{BASE}/correcciones/", {"clinica": str(self.clinica.id)}).json()
        self.assertEqual(correcciones[0]["estado_cita"], "cancelada")

    def test_cita_que_vuelve_a_agendarse_conserva_la_sesion_ligada_y_el_cobro(self):
        restantes = self.item_a.citas_restantes()
        r = self.client.post(self.URL, self._datos(
            estado_cita="pendiente", accion_cobro="mantener", motivo="Se abrió antes de que llegara",
        ), format="json")
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.cita.refresh_from_db()
        self.assertEqual(self.cita.estado, Cita.Estado.PENDIENTE)
        self.assertIsNone(self.cita.fecha_inicio_real)
        self.sesion_a.refresh_from_db()
        self.assertEqual(self.sesion_a.estado, SesionProcedimiento.Estado.PENDIENTE)
        self.assertEqual(self.sesion_a.cita_id, self.cita.id)
        self.assertEqual(self.item_a.citas_restantes(), restantes)
        self.cobro.refresh_from_db()
        self.assertEqual(self.cobro.cita_id, self.cita.id)
        self.assertNotEqual(self.cobro.estado, Cobro.Estado.ANULADO)

    def test_los_insumos_vuelven_al_stock(self):
        from apps.historia_clinica.services import registrar_consumo_insumo
        from apps.inventario.models import Insumo
        from apps.inventario.services import get_or_crear_stock

        insumo = Insumo.objects.create(clinica=self.clinica, nombre="Gel conductor", unidad_medida="ml")
        stock = get_or_crear_stock(insumo, self.sede)
        stock.stock_actual = 100
        stock.save()
        registrar_consumo_insumo(nota=self.nota, insumo=insumo, cantidad=10, user=self.profesional)
        self.assertEqual(get_or_crear_stock(insumo, self.sede).stock_actual, 90)

        r = self.client.post(self.URL, self._datos(
            estado_cita="no_asistio", accion_cobro="desligar", motivo="No vino, era otra persona",
        ), format="json")
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.assertEqual(get_or_crear_stock(insumo, self.sede).stock_actual, 100)
        self.assertFalse(ConsumoInsumo.objects.filter(insumo=insumo).exists())
        self.cobro.refresh_from_db()
        self.assertIsNone(self.cobro.cita_id)

    def test_validaciones(self):
        sin_cobro = self.client.post(self.URL, self._datos(estado_cita="cancelada", motivo="Error"), format="json")
        self.assertEqual(sin_cobro.json()["code"], "ACCION_COBRO_REQUERIDA")
        mover = self.client.post(self.URL, self._datos(estado_cita="cancelada", accion_cobro="mover", motivo="Error"), format="json")
        self.assertEqual(mover.status_code, 400)
        self.assertTrue(NotaClinica.objects.filter(cita=self.cita).exists())
