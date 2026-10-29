"""Evoluciones del paciente fuera de una atención, escritas desde la historia
(28/10/2026): nota sin cita, firmada y cerrada al guardar, que no se edita."""
from django.test import TestCase
from rest_framework.test import APIClient

from apps.clinicas.models import Clinica
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.historia_clinica.models import HistoriaClinica, NotaClinica
from apps.historia_clinica.pdf import _build_notas
from apps.users.models import Permiso, Rol, RolPermiso


class EvolucionesTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.historia = HistoriaClinica.del_paciente(self.paciente)
        self.client = APIClient()
        self.client.force_authenticate(self.profesional)
        self.url = f"/api/v1/historia-clinica/historias/{self.historia.id}/evoluciones/"

    def _rol(self, *claves):
        rol = Rol.objects.create(clinica=self.clinica, slug="_".join(claves).replace(".", "-")[:45], nombre=" ".join(claves)[:90])
        for clave in claves:
            RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave=clave))
        return rol

    def test_queda_firmada_cerrada_y_en_la_historia(self):
        r = self.client.post(self.url, {"texto": "  Llamada de control: sin molestias.  "}, format="json")

        self.assertEqual(r.status_code, 201, r.content[:300])
        nota = NotaClinica.objects.get(id=r.json()["id"])
        self.assertEqual(nota.estado, NotaClinica.EstadoNota.COMPLETADA)
        self.assertEqual(nota.firmada_por_id, self.profesional.id)
        self.assertIsNotNone(nota.firmada_en)
        self.assertIsNone(nota.cita_id)
        self.assertEqual(nota.motivo_consulta, "Llamada de control: sin molestias.")

        notas = self.client.get(f"/api/v1/historia-clinica/historias/{self.historia.id}/notas/").json()
        evolucion = next(n for n in notas if n["id"] == str(nota.id))
        self.assertTrue(evolucion["es_evolucion"])
        self.assertEqual(evolucion["profesional_nombre"], self.profesional.nombre_completo)

    def test_no_se_edita_despues_de_guardada(self):
        nota_id = self.client.post(self.url, {"texto": "Control"}, format="json").json()["id"]

        r = self.client.patch(f"/api/v1/historia-clinica/notas/{nota_id}/", {"motivo_consulta": "Otro texto"}, format="json")

        self.assertEqual(r.status_code, 400)
        self.assertEqual(NotaClinica.objects.get(id=nota_id).motivo_consulta, "Control")

    def test_sin_texto_no_se_guarda(self):
        r = self.client.post(self.url, {"texto": "   "}, format="json")

        self.assertEqual(r.status_code, 400)
        self.assertFalse(NotaClinica.objects.filter(historia=self.historia).exists())

    def test_hace_falta_el_permiso_de_crear_notas(self):
        lector = User.objects.create_user(
            email="lector-evol@example.com", password="Secret123!", rol=User.Role.RECEPCION,
            clinica=self.clinica, rol_dinamico=self._rol("historia.ver"),
        )
        self.client.force_authenticate(lector)

        r = self.client.post(self.url, {"texto": "Control"}, format="json")

        self.assertEqual(r.status_code, 403)

    def test_no_se_escribe_en_la_historia_de_otra_clinica(self):
        otra = Clinica.objects.create(nombre="Otra", nit="900111222")
        ajeno = User.objects.create_user(
            email="ajeno-evol@example.com", password="Secret123!", rol=User.Role.PROFESIONAL,
            clinica=otra, es_profesional=True,
        )
        self.client.force_authenticate(ajeno)

        r = self.client.post(self.url, {"texto": "Control"}, format="json")

        self.assertEqual(r.status_code, 404)

    def test_el_pdf_la_muestra_como_evolucion_con_su_autor(self):
        self.client.post(self.url, {"texto": "Control"}, format="json")

        [nota] = _build_notas(self.historia, include_fotos=False)

        self.assertTrue(nota["es_evolucion"])
        self.assertEqual(nota["profesional"], self.profesional.nombre_completo)
        self.assertEqual(nota["motivo_consulta"], "Control")
