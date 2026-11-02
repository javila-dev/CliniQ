"""PDF consolidado con las columnas de la hoja del paquete y espacios para firmar a mano
(docs/plan-atencion-sencilla.md, fase 4)."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import FormaDePago, Servicio, TipoSesion, TipoSesionProcedimiento, TratamientoCatalogo
from apps.core.tests.factories import ClinicaFixtureMixin
from apps.cotizaciones.models import Cotizacion, ItemCotizacion
from apps.cotizaciones.pdf import build_consolidado_asistencia_context, render_consolidado_asistencia_pdf
from apps.cotizaciones.services import aceptar_cotizacion
from apps.protocolos.models import SesionProcedimiento


class ConsolidadoHojaTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.crear_superadmin()
        self.client = APIClient()
        self.client.force_authenticate(self.superadmin)
        self.laser = Servicio.objects.create(clinica=self.clinica, nombre="Laser CO2", duracion_min=60)
        self.plasma = Servicio.objects.create(clinica=self.clinica, nombre="Plasma", duracion_min=30)
        catalogo = TratamientoCatalogo.objects.create(
            clinica=self.clinica, nombre="Rejuvenecimiento basico", precio_estimado="900000.00",
        )
        combo = TipoSesion.objects.create(tratamiento=catalogo, nombre="Laser + plasma", cantidad=3, orden=1, duracion_min=60)
        TipoSesionProcedimiento.objects.create(tipo_sesion=combo, procedimiento=self.laser, orden=1)
        TipoSesionProcedimiento.objects.create(tipo_sesion=combo, procedimiento=self.plasma, orden=2)

        r = self.client.post("/api/v1/cotizaciones/", {
            "paciente": str(self.paciente.id), "validez_dias": 30, "notas": "",
            "items": [
                {"tratamiento": str(catalogo.id), "num_citas": 1},
                {"servicio": str(self.servicio.id), "num_citas": 2},
            ],
            "formas_pago": [{
                "tipo": str(FormaDePago.objects.get(clinica=self.clinica, tipo_base="transferencia").id),
                "descripcion": "Banco", "valor": "1200000.00",
            }],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.cotizacion = Cotizacion.objects.get(id=r.json()["id"])
        aceptar_cotizacion(self.cotizacion, actor=self.superadmin)
        self.item_tratamiento = ItemCotizacion.objects.get(cotizacion=self.cotizacion, tipo="tratamiento")
        self.item_procedimiento = ItemCotizacion.objects.get(cotizacion=self.cotizacion, tipo="procedimiento")

        # La primera sesión del paquete ya se hizo y el paciente firmó la asistencia
        # (sin archivo: el recorte de la firma no aplica en la prueba).
        inicio = timezone.now() - timedelta(days=7)
        cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional, item_cotizacion=self.item_tratamiento,
            servicio_nombre="Rejuvenecimiento basico", fecha_inicio=inicio, fecha_fin=inicio + timedelta(hours=1),
            duracion_min=60, estado=Cita.Estado.COMPLETADA, fecha_inicio_real=inicio,
            canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )
        sesion = SesionProcedimiento.objects.filter(tratamiento__cotizacion_item=self.item_tratamiento).order_by("numero").first()
        sesion.cita = cita
        sesion.estado = SesionProcedimiento.Estado.COMPLETADO
        sesion.profesional = self.profesional
        sesion.save()
        sesion.procedimientos_ejecutados.set([self.laser])

    def _seccion(self, descripcion):
        contexto = build_consolidado_asistencia_context(self.cotizacion)
        return next(s for s in contexto["secciones"] if s["descripcion"] == descripcion)

    def test_el_paquete_trae_todas_sus_sesiones_hechas_o_no(self):
        seccion = self._seccion(self.item_tratamiento.descripcion)

        self.assertEqual((seccion["total"], seccion["hechas"]), (3, 1))
        hecha, *pendientes = seccion["filas"]
        self.assertEqual(hecha["procedimiento"], "Laser CO2")  # lo realizado, no lo planeado
        self.assertTrue(hecha["fecha"])
        self.assertEqual(hecha["profesional_nombre"], self.profesional.nombre_completo)
        for fila in pendientes:
            self.assertEqual(fila["procedimiento"], "Laser CO2 + Plasma")
            # En blanco para llenarlo a mano.
            self.assertEqual((fila["fecha"], fila["hora"], fila["profesional_nombre"]), ("", "", ""))
            self.assertIsNone(fila["firma_paciente_b64"])

    def test_un_paquete_de_procedimiento_deja_filas_para_las_citas_que_faltan(self):
        seccion = self._seccion(self.item_procedimiento.descripcion)

        self.assertEqual((seccion["total"], seccion["hechas"]), (2, 0))
        self.assertTrue(all(f["procedimiento"] for f in seccion["filas"]))

    def test_productos_e_items_libres_sin_citas_no_tienen_hoja(self):
        for tipo, descripcion in ((ItemCotizacion.Tipo.INSUMO, "Crema hidratante"), (ItemCotizacion.Tipo.LIBRE, "Kit en casa")):
            ItemCotizacion.objects.create(cotizacion=self.cotizacion, tipo=tipo, descripcion=descripcion, valor_unitario="50000.00")

        descripciones = [s["descripcion"] for s in build_consolidado_asistencia_context(self.cotizacion)["secciones"]]

        self.assertNotIn("Crema hidratante", descripciones)
        self.assertNotIn("Kit en casa", descripciones)
        self.assertIn(self.item_tratamiento.descripcion, descripciones)

    def test_genera_el_pdf(self):
        self.assertTrue(render_consolidado_asistencia_pdf(self.cotizacion).startswith(b"%PDF"))

    def test_el_endpoint_sigue_respondiendo(self):
        r = self.client.get(f"/api/v1/cotizaciones/{self.cotizacion.id}/consolidado_asistencia/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "application/pdf")
