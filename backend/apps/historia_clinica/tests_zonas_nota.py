"""Zonas por atención: el procedimiento propone, el profesional agrega (20/10/2026)."""
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.clinicas.models import DiagramaCorporal, GrupoZonas, GrupoZonasDiagrama, ServicioGrupoZonas
from apps.core.tests.factories import ClinicaFixtureMixin
from apps.historia_clinica.models import AnotacionZona, HistoriaClinica, NotaClinica, NotaDiagramaZona

User = get_user_model()
NOTAS = "/api/v1/historia-clinica/notas/"


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage", MEDIA_ROOT=tempfile.gettempdir())
class ZonasPorNotaTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base(nit="900777789")
        self.historia = HistoriaClinica.objects.get(paciente=self.paciente)
        imagen = lambda n: SimpleUploadedFile(f"{n}.png", b"fake-png", content_type="image/png")
        self.frente = DiagramaCorporal.objects.create(nombre="Rostro frente", imagen=imagen("f"), orden=1)
        self.perfil = DiagramaCorporal.objects.create(nombre="Rostro perfil", imagen=imagen("p"), orden=2)
        self.piernas = DiagramaCorporal.objects.create(nombre="Piernas", imagen=imagen("l"), orden=3)
        self.cara = GrupoZonas.objects.create(nombre="CARA")
        GrupoZonasDiagrama.objects.create(grupo=self.cara, diagrama=self.frente, orden=1)
        GrupoZonasDiagrama.objects.create(grupo=self.cara, diagrama=self.perfil, orden=2)
        self.otro_prof = User.objects.create_user(
            email="otro-zonas@example.com", password="Secret123!", first_name="Otro", last_name="Prof",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )

    def _nota(self, *, con_grupos=True, estado=NotaClinica.EstadoNota.BORRADOR, hace_dias=0):
        if con_grupos:
            ServicioGrupoZonas.objects.get_or_create(servicio=self.servicio, grupo=self.cara)
        inicio = timezone.now() - timedelta(days=hace_dias)
        cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.profesional, servicio=self.servicio,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(hours=1),
            canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
        )
        return NotaClinica.objects.create(historia=self.historia, cita=cita, estado=estado)

    def _cliente(self, user=None):
        c = APIClient(HTTP_HOST="localhost")
        c.force_authenticate(user or self.profesional)
        c.credentials(HTTP_X_CLINICA_ID=str(self.clinica.id))
        return c

    def _ids(self, respuesta):
        self.assertEqual(respuesta.status_code, 200, respuesta.content[:300])
        return [d["id"] for d in respuesta.json()["diagramas"]]

    def test_una_nota_anterior_muestra_lo_mismo_que_antes_y_lo_guarda(self):
        nota = self._nota()
        self.assertFalse(nota.zonas_inicializadas)
        ids = self._ids(self._cliente().get(f"{NOTAS}{nota.id}/zonas/"))
        self.assertEqual(ids, [str(self.frente.id), str(self.perfil.id)])
        nota.refresh_from_db()
        self.assertTrue(nota.zonas_inicializadas)
        self.assertEqual(NotaDiagramaZona.objects.filter(nota=nota).count(), 2)

    def test_una_marca_en_un_diagrama_que_ya_no_esta_en_el_procedimiento_sigue_visible(self):
        nota = self._nota()
        AnotacionZona.objects.create(nota=nota, diagrama=self.piernas, x=0.5, y=0.5, radio=0.1)
        ids = self._ids(self._cliente().get(f"{NOTAS}{nota.id}/zonas/"))
        self.assertEqual(ids, [str(self.frente.id), str(self.perfil.id), str(self.piernas.id)])

    def test_una_nota_completada_no_se_escribe_al_consultarla(self):
        nota = self._nota(estado=NotaClinica.EstadoNota.COMPLETADA)
        ids = self._ids(self._cliente().get(f"{NOTAS}{nota.id}/zonas/"))
        self.assertEqual(ids, [str(self.frente.id), str(self.perfil.id)])
        nota.refresh_from_db()
        self.assertFalse(nota.zonas_inicializadas)
        self.assertFalse(NotaDiagramaZona.objects.filter(nota=nota).exists())

    def test_sin_grupos_en_el_procedimiento_el_profesional_agrega_y_quita(self):
        nota = self._nota(con_grupos=False)
        c = self._cliente()
        self.assertEqual(self._ids(c.get(f"{NOTAS}{nota.id}/zonas/")), [])
        ids = self._ids(c.post(f"{NOTAS}{nota.id}/zonas/agregar/", {"diagramas": [str(self.piernas.id), str(self.frente.id)]}, format="json"))
        self.assertEqual(ids, [str(self.piernas.id), str(self.frente.id)])
        # Repetir no duplica.
        ids = self._ids(c.post(f"{NOTAS}{nota.id}/zonas/agregar/", {"diagramas": [str(self.frente.id)]}, format="json"))
        self.assertEqual(ids, [str(self.piernas.id), str(self.frente.id)])
        ids = self._ids(c.post(f"{NOTAS}{nota.id}/zonas/quitar/", {"diagrama": str(self.piernas.id)}, format="json"))
        self.assertEqual(ids, [str(self.frente.id)])

    def test_no_se_quita_una_zona_con_marcas(self):
        nota = self._nota()
        c = self._cliente()
        c.get(f"{NOTAS}{nota.id}/zonas/")
        AnotacionZona.objects.create(nota=nota, diagrama=self.frente, x=0.5, y=0.5, radio=0.1)
        r = c.post(f"{NOTAS}{nota.id}/zonas/quitar/", {"diagrama": str(self.frente.id)}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "ZONA_CON_MARCAS")

    def test_marcar_en_un_diagrama_lo_agrega_a_la_pestana(self):
        nota = self._nota(con_grupos=False)
        r = self._cliente().post(
            "/api/v1/historia-clinica/anotaciones-zona/",
            {"nota": str(nota.id), "diagrama": str(self.piernas.id), "x": 0.4, "y": 0.4, "radio": 0.1, "texto": ""},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content[:300])
        self.assertTrue(NotaDiagramaZona.objects.filter(nota=nota, diagrama=self.piernas, activo=True).exists())

    def test_al_completar_la_nota_conserva_sus_diagramas(self):
        nota = self._nota()
        c = self._cliente()
        r = c.post(f"{NOTAS}{nota.id}/completar/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content[:300])
        ServicioGrupoZonas.objects.filter(servicio=self.servicio).update(activo=False)
        self.assertEqual(self._ids(c.get(f"{NOTAS}{nota.id}/zonas/")), [str(self.frente.id), str(self.perfil.id)])

    def test_opciones_trae_grupos_diagramas_y_la_atencion_anterior(self):
        anterior = self._nota(hace_dias=10)
        AnotacionZona.objects.create(nota=anterior, diagrama=self.piernas, x=0.5, y=0.5, radio=0.1)
        nota = self._nota(con_grupos=False)
        r = self._cliente().get(f"{NOTAS}{nota.id}/zonas/opciones/")
        self.assertEqual(r.status_code, 200, r.content[:300])
        datos = r.json()
        self.assertEqual(datos["grupos"], [{"id": str(self.cara.id), "nombre": "CARA", "diagramas": [str(self.frente.id), str(self.perfil.id)]}])
        self.assertEqual([d["nombre"] for d in datos["diagramas"]], ["Rostro frente", "Rostro perfil", "Piernas"])
        self.assertEqual(datos["anterior"]["nota_id"], str(anterior.id))
        self.assertEqual(datos["anterior"]["diagramas"], [str(self.piernas.id)])

    def test_otro_profesional_no_cambia_las_zonas_de_una_atencion_ajena(self):
        nota = self._nota(con_grupos=False)
        r = self._cliente(self.otro_prof).post(f"{NOTAS}{nota.id}/zonas/agregar/", {"diagramas": [str(self.frente.id)]}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_la_pestana_zonas_de_la_atencion_se_puede_apagar(self):
        admin = User.objects.create_user(
            email="admin-zonas@example.com", password="Secret123!", first_name="Ada", last_name="Admin",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        c = self._cliente(admin)
        self.assertIn("zonas", c.get("/api/v1/configuracion/historia/").json()["atencion_tabs_activos"])
        r = c.patch("/api/v1/configuracion/historia/", {"atencion_tabs_activos": ["fotos"]}, format="json")
        self.assertNotIn("zonas", r.json()["atencion_tabs_activos"])
