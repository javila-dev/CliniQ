"""La hoja del paquete de una cita para la vista sencilla (docs/plan-atencion-sencilla.md)."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import DiagramaCorporal, Servicio, TipoSesion, TipoSesionProcedimiento, TratamientoCatalogo
from apps.configuracion.models import ConfiguracionWizard
from apps.core.tests.factories import ClinicaFixtureMixin
from apps.historia_clinica.models import AnotacionZona, HistoriaClinica, NotaClinica
from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente


class TarjetaCitaTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.client = APIClient()
        self.client.force_authenticate(self.profesional)
        self.limpieza = Servicio.objects.create(clinica=self.clinica, nombre="Limpieza", duracion_min=30)
        self.laser = Servicio.objects.create(clinica=self.clinica, nombre="Laser CO2", duracion_min=60)
        self.plasma = Servicio.objects.create(clinica=self.clinica, nombre="Plasma", duracion_min=30)
        catalogo = TratamientoCatalogo.objects.create(clinica=self.clinica, nombre="Rejuvenecimiento basico")
        primero = TipoSesion.objects.create(tratamiento=catalogo, nombre="Limpieza", cantidad=1, orden=1)
        TipoSesionProcedimiento.objects.create(tipo_sesion=primero, procedimiento=self.limpieza, orden=1)
        combo = TipoSesion.objects.create(tratamiento=catalogo, nombre="Laser + plasma", cantidad=2, orden=2)
        TipoSesionProcedimiento.objects.create(tipo_sesion=combo, procedimiento=self.plasma, orden=2)
        TipoSesionProcedimiento.objects.create(tipo_sesion=combo, procedimiento=self.laser, orden=1)

        self.tratamiento = TratamientoPaciente.objects.create(paciente=self.paciente, tratamiento_catalogo=catalogo)
        # Creadas en desorden: la hoja las ordena por tipo de sesión y número.
        self.s3 = SesionProcedimiento.objects.create(tratamiento=self.tratamiento, tipo_sesion=combo, numero=2)
        self.s1 = SesionProcedimiento.objects.create(tratamiento=self.tratamiento, tipo_sesion=primero, numero=1)
        self.s2 = SesionProcedimiento.objects.create(tratamiento=self.tratamiento, tipo_sesion=combo, numero=1)
        self.historia = HistoriaClinica.del_paciente(self.paciente)

        # Primera sesión ya hecha, firmada, con zonas marcadas.
        self.cita_1 = self._cita(dias=-14, estado=Cita.Estado.COMPLETADA)
        Cita.objects.filter(id=self.cita_1.id).update(firma_asistencia_estado=Cita.FirmaAsistenciaEstado.FIRMADA)
        self.s1.cita = self.cita_1
        self.s1.estado = SesionProcedimiento.Estado.COMPLETADO
        self.s1.profesional = self.profesional
        self.s1.save()
        self.s1.procedimientos_ejecutados.set([self.limpieza])
        nota = NotaClinica.objects.create(historia=self.historia, cita=self.cita_1, estado=NotaClinica.EstadoNota.COMPLETADA)
        cara = DiagramaCorporal.objects.create(nombre="Cara", imagen="diagramas/cara.png", orden=1)
        cuello = DiagramaCorporal.objects.create(nombre="Cuello", imagen="diagramas/cuello.png", orden=2)
        for diagrama, x in ((cuello, 0.5), (cara, 0.2), (cara, 0.4)):
            AnotacionZona.objects.create(nota=nota, diagrama=diagrama, x=x, y=0.5)

        # La de hoy, en curso.
        self.cita_hoy = self._cita(dias=0, estado=Cita.Estado.EN_CURSO)
        self.s2.cita = self.cita_hoy
        self.s2.save()

    def _cita(self, *, dias, estado, item=None):
        inicio = timezone.now() + timedelta(days=dias)
        return Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional, servicio=self.laser,
            servicio_nombre="Rejuvenecimiento basico", item_cotizacion=item, fecha_inicio=inicio,
            fecha_fin=inicio + timedelta(hours=1), duracion_min=60, estado=estado,
            canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )

    def _tarjeta(self, cita=None):
        r = self.client.get(f"/api/v1/agenda/citas/{(cita or self.cita_hoy).id}/tarjeta/")
        self.assertEqual(r.status_code, 200, r.content[:400])
        return r.json()

    def test_una_fila_por_sesion_en_el_orden_del_paquete(self):
        datos = self._tarjeta()

        self.assertEqual(datos["paquete"]["nombre"], "Rejuvenecimiento basico")
        self.assertEqual([f["sesion_id"] for f in datos["filas"]], [str(self.s1.id), str(self.s2.id), str(self.s3.id)])
        self.assertEqual((datos["numero_actual"], datos["total"]), (2, 3))
        self.assertEqual([f["es_actual"] for f in datos["filas"]], [False, True, False])

    def test_la_sesion_hecha_trae_lo_realizado_quien_y_donde(self):
        hecha = self._tarjeta()["filas"][0]

        self.assertEqual(hecha["estado"], "completado")
        self.assertEqual(hecha["procedimientos"], [{"id": str(self.limpieza.id), "nombre": "Limpieza", "realizado": True}])
        self.assertEqual(hecha["profesional"]["nombre"], self.profesional.nombre_completo)
        self.assertEqual(hecha["firma_paciente"], "firmada")
        self.assertEqual(hecha["zonas"], ["Cara", "Cuello"])
        self.assertIsNotNone(hecha["fecha"])

    def test_la_de_hoy_y_las_pendientes_traen_lo_planeado(self):
        filas = self._tarjeta()["filas"]

        self.assertEqual([p["nombre"] for p in filas[1]["procedimientos"]], ["Laser CO2", "Plasma"])
        self.assertFalse(any(p["realizado"] for p in filas[1]["procedimientos"]))
        self.assertEqual(filas[2]["cita_id"], None)
        self.assertEqual((filas[2]["fecha"], filas[2]["profesional"], filas[2]["firma_paciente"]), (None, None, None))

    def test_sin_firma_de_asistencia_la_columna_solo_aparece_si_hay_firmas_de_antes(self):
        ConfiguracionWizard.objects.update_or_create(clinica=self.clinica, defaults={"paso_firma_asistencia": False})
        datos = self._tarjeta()
        self.assertFalse(datos["firma_asistencia_activa"])
        self.assertTrue(datos["mostrar_firma_paciente"])

        Cita.objects.filter(id=self.cita_1.id).update(firma_asistencia_estado=Cita.FirmaAsistenciaEstado.SIN_FIRMA)
        self.assertFalse(self._tarjeta()["mostrar_firma_paciente"])

    def test_cita_suelta_es_una_sola_fila(self):
        inicio = timezone.now()
        suelta = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional, servicio=self.servicio,
            servicio_nombre=self.servicio.nombre, fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            duracion_min=30, estado=Cita.Estado.EN_CURSO, canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )

        datos = self._tarjeta(suelta)

        self.assertIsNone(datos["paquete"])
        self.assertEqual(len(datos["filas"]), 1)
        self.assertTrue(datos["filas"][0]["es_actual"])
        self.assertEqual(datos["filas"][0]["procedimientos"][0]["nombre"], self.servicio.nombre)

    def test_cita_de_otra_clinica_no_se_ve(self):
        from apps.clinicas.models import Clinica
        from apps.core.tests.factories import User

        otra = Clinica.objects.create(nombre="Otra", nit="900999111")
        ajeno = User.objects.create_user(
            email="ajeno-tarjeta@example.com", password="Secret123!", rol=User.Role.PROFESIONAL,
            clinica=otra, es_profesional=True,
        )
        self.client.force_authenticate(ajeno)

        r = self.client.get(f"/api/v1/agenda/citas/{self.cita_hoy.id}/tarjeta/")

        self.assertEqual(r.status_code, 404)
