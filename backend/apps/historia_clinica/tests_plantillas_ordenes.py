"""Plantillas de órdenes que alimentan los profesionales (17/10/2026)."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.tests.factories import ClinicaFixtureMixin
from apps.historia_clinica.models import HistoriaClinica, OrdenMedica, PlantillaOrden
from apps.historia_clinica.views import build_orden_pdf_context

User = get_user_model()
PLANTILLAS = "/api/v1/historia-clinica/plantillas-ordenes/"
ORDENES = "/api/v1/historia-clinica/ordenes-medicas/"


class PlantillasDeProfesionalesTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base(nit="900777123")
        self.historia = HistoriaClinica.objects.get(paciente=self.paciente)
        self.otro_profesional = User.objects.create_user(
            email="otro-prof@example.com", password="Secret123!", first_name="Luis", last_name="Otro",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        self.admin = User.objects.create_user(
            email="admin-plantillas@example.com", password="Secret123!", first_name="Ada", last_name="Admin",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )

    def _cliente(self, user):
        c = APIClient(HTTP_HOST="localhost")
        c.force_authenticate(user)
        c.credentials(HTTP_X_CLINICA_ID=str(self.clinica.id))
        return c

    def _nombres(self, user):
        r = self._cliente(user).get(PLANTILLAS)
        self.assertEqual(r.status_code, 200, r.content[:200])
        datos = r.json()
        lista = datos["results"] if isinstance(datos, dict) else datos
        return {p["nombre"] for p in lista}

    def test_el_profesional_crea_una_plantilla_personal_que_solo_ve_el(self):
        r = self._cliente(self.profesional).post(
            PLANTILLAS, {"nombre": "Mi perfil lipídico", "contenido": "Perfil lipídico completo", "compartida": False},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content[:300])
        self.assertTrue(r.json()["es_mia"])
        self.assertIn("Mi perfil lipídico", self._nombres(self.profesional))
        self.assertNotIn("Mi perfil lipídico", self._nombres(self.otro_profesional))
        # Quien gestiona la clínica ve todas.
        self.assertIn("Mi perfil lipídico", self._nombres(self.admin))

    def test_una_plantilla_compartida_la_ven_todos(self):
        self._cliente(self.profesional).post(
            PLANTILLAS, {"nombre": "Hemograma", "contenido": "Hemograma completo", "compartida": True}, format="json",
        )
        self.assertIn("Hemograma", self._nombres(self.otro_profesional))

    def test_solo_el_dueno_o_el_admin_cambian_una_plantilla(self):
        plantilla = PlantillaOrden.objects.create(
            clinica=self.clinica, nombre="Compartida de Ana", contenido="Texto", created_by=self.profesional,
        )
        url = f"{PLANTILLAS}{plantilla.id}/"
        self.assertEqual(self._cliente(self.otro_profesional).patch(url, {"nombre": "X"}, format="json").status_code, 403)
        self.assertEqual(self._cliente(self.otro_profesional).delete(url).status_code, 403)
        self.assertEqual(self._cliente(self.profesional).patch(url, {"nombre": "Renombrada"}, format="json").status_code, 200)
        self.assertEqual(self._cliente(self.admin).patch(url, {"compartida": False}, format="json").status_code, 200)

    def test_las_variables_se_llenan_al_emitir(self):
        r = self._cliente(self.profesional).post(
            ORDENES,
            {"historia": str(self.historia.id), "contenido": "Paciente {{nombre_paciente}} ({{documento}}), {{edad}}. {{desconocida}}"},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content[:300])
        contenido = r.json()["contenido"]
        self.assertIn("Juan Perez", contenido)
        self.assertIn(self.paciente.numero_documento, contenido)
        self.assertIn("años", contenido)
        self.assertIn("{{desconocida}}", contenido)

    def test_guardar_como_plantilla_una_orden_emitida(self):
        orden = OrdenMedica.objects.create(
            historia=self.historia, contenido="Ecografía abdominal total", profesional=self.profesional,
        )
        r = self._cliente(self.profesional).post(
            f"{ORDENES}{orden.id}/guardar_como_plantilla/", {"nombre": "Ecografía", "compartida": False}, format="json",
        )
        self.assertEqual(r.status_code, 201, r.content[:300])
        plantilla = PlantillaOrden.objects.get(nombre="Ecografía")
        self.assertEqual(plantilla.contenido, "Ecografía abdominal total")
        self.assertFalse(plantilla.compartida)
        self.assertEqual(plantilla.created_by, self.profesional)

    def test_renombrar_la_plantilla_no_cambia_el_titulo_de_ordenes_emitidas(self):
        plantilla = PlantillaOrden.objects.create(clinica=self.clinica, nombre="Laboratorios", contenido="Glicemia")
        r = self._cliente(self.profesional).post(
            ORDENES, {"historia": str(self.historia.id), "plantilla_origen": str(plantilla.id), "contenido": "Glicemia"},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content[:300])
        orden = OrdenMedica.objects.get(id=r.json()["id"])
        self.assertEqual(orden.titulo, "Laboratorios")
        plantilla.nombre = "Otro nombre"
        plantilla.save()
        orden.refresh_from_db()
        self.assertEqual(build_orden_pdf_context(orden)["dx_nombre"], "LABORATORIOS")

    def test_sin_plantilla_el_titulo_se_puede_enviar(self):
        r = self._cliente(self.profesional).post(
            ORDENES, {"historia": str(self.historia.id), "contenido": "Rx de tórax", "titulo": "Imágenes"}, format="json",
        )
        self.assertEqual(r.status_code, 201, r.content[:300])
        self.assertEqual(OrdenMedica.objects.get(id=r.json()["id"]).titulo, "Imágenes")


class PlantillasSugeridasTests(ClinicaFixtureMixin, TestCase):
    """Las sugerencias priorizan el procedimiento de la cita, luego lo propio, luego la clínica."""

    def setUp(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.agenda.models import Cita

        self.crear_clinica_base(nit="900777456")
        self.historia = HistoriaClinica.objects.get(paciente=self.paciente)
        self.otro = User.objects.create_user(
            email="otro-sug@example.com", password="Secret123!", first_name="Otro", last_name="Prof",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        ahora = timezone.now()
        self.cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional, servicio=self.servicio,
            fecha_inicio=ahora, fecha_fin=ahora + timedelta(hours=1),
            canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
        )
        crear = lambda nombre, **kw: PlantillaOrden.objects.create(clinica=self.clinica, nombre=nombre, contenido=nombre, **kw)
        self.del_procedimiento = crear("Del procedimiento")
        self.mas_mia = crear("La que más uso")
        self.sin_uso = crear("Sin uso")
        self.personal_de_otro = crear("Personal de otro", compartida=False, created_by=self.otro)
        for _ in range(2):
            OrdenMedica.objects.create(historia=self.historia, cita=self.cita, plantilla_origen=self.del_procedimiento,
                                       contenido="x", profesional=self.otro)
        for _ in range(3):
            OrdenMedica.objects.create(historia=self.historia, plantilla_origen=self.mas_mia,
                                       contenido="x", profesional=self.profesional)
        for _ in range(5):
            OrdenMedica.objects.create(historia=self.historia, plantilla_origen=self.personal_de_otro,
                                       contenido="x", profesional=self.otro)

    def _sugeridas(self, query=""):
        c = APIClient(HTTP_HOST="localhost")
        c.force_authenticate(self.profesional)
        c.credentials(HTTP_X_CLINICA_ID=str(self.clinica.id))
        r = c.get(f"{PLANTILLAS}sugeridas/{query}")
        self.assertEqual(r.status_code, 200, r.content[:200])
        return [p["nombre"] for p in r.json()]

    def test_con_cita_primero_las_del_procedimiento(self):
        self.assertEqual(self._sugeridas(f"?cita={self.cita.id}"), ["Del procedimiento", "La que más uso", "Sin uso"])

    def test_sin_cita_primero_las_que_mas_usa_quien_pide(self):
        self.assertEqual(self._sugeridas()[0], "La que más uso")

    def test_nunca_sugiere_personales_de_otros_y_respeta_el_limite(self):
        self.assertNotIn("Personal de otro", self._sugeridas())
        self.assertEqual(len(self._sugeridas("?limite=1")), 1)
        self.assertEqual(self._sugeridas("?cita=no-es-uuid")[0], "La que más uso")

    def test_reconoce_el_procedimiento_por_nombre_aunque_la_cita_no_tenga_servicio(self):
        """Las citas que salen de una cotización guardan el procedimiento en el ítem, no en la cita."""
        from apps.agenda.models import Cita

        self.cita.servicio_nombre = "Radiofrecuencia"
        self.cita.save(update_fields=["servicio_nombre"])
        otra = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.otro, servicio=None,
            servicio_nombre="radiofrecuencia", fecha_inicio=self.cita.fecha_inicio, fecha_fin=self.cita.fecha_fin,
            canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
        )
        self.assertEqual(self._sugeridas(f"?cita={otra.id}")[0], "Del procedimiento")
