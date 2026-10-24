"""Resultados de exámenes cargados desde la historia, después de la atención."""

import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.models import LogAccion
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.historia_clinica.models import ArchivoResultadoExamen, NotaClinica, ResultadoExamen
from apps.historia_clinica.pdf import build_historia_pdf_context, render_historia_pdf
from apps.users.authorization import get_user_permission_keys
from apps.users.models import Permiso, Rol, RolPermiso

URL = "/api/v1/historia-clinica/resultados-examenes/"


def _pdf(nombre="hemograma.pdf"):
    return SimpleUploadedFile(nombre, b"%PDF-1.4 fake", content_type="application/pdf")


def _png(nombre="pagina2.png"):
    return SimpleUploadedFile(nombre, b"fake-png", content_type="image/png")


@override_settings(DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage", MEDIA_ROOT=tempfile.gettempdir())
class ExamenesPostAtencionTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.otro = User.objects.create_user(
            email="otro-ex@test.com", password="Secret123!", first_name="Otro", last_name="Prof",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        self.recepcion = User.objects.create_user(
            email="recep-ex@test.com", password="Secret123!", first_name="Re", last_name="Cep",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.historia = self.paciente.historia_clinica
        self.client = APIClient()

    def _cargar(self, user, **extra):
        self.client.force_authenticate(user)
        datos = {"historia": str(self.historia.id), "titulo": "Hemograma", "fecha": "2026-10-20", **extra}
        return self.client.post(URL, datos, format="multipart")

    def _lista(self):
        data = self.client.get(URL, {"historia": str(self.historia.id)}).json()
        return data["results"] if isinstance(data, dict) else data

    def test_quien_atiende_carga_sin_atencion_con_varios_archivos(self):
        r = self._cargar(self.profesional, adjuntos=[_pdf(), _png()])
        self.assertEqual(r.status_code, 201, r.content[:300])
        data = r.json()
        self.assertIsNone(data["nota"])
        self.assertEqual([a["nombre"] for a in data["archivos"]], ["hemograma.pdf", "pagina2.png"])
        self.assertEqual(data["created_by"], str(self.profesional.id))
        self.assertTrue(all(a["subido_por"] == str(self.profesional.id) for a in data["archivos"]))
        log = LogAccion.objects.get(accion="historia.examen.cargar", objeto_id=data["id"])
        self.assertEqual(log.usuario_id, self.profesional.id)
        self.assertFalse(log.detalle["en_atencion"])

    def test_solo_pdf_o_imagen(self):
        texto = SimpleUploadedFile("notas.txt", b"hola", content_type="text/plain")
        r = self._cargar(self.profesional, adjuntos=[texto])
        self.assertEqual(r.status_code, 400)
        self.assertFalse(ResultadoExamen.objects.exists())

    def test_recepcion_no_carga_salvo_que_su_rol_lo_tenga(self):
        self.assertEqual(self._cargar(self.recepcion).status_code, 403)

        rol = Rol.objects.create(clinica=self.clinica, slug="recepcion-ex", nombre="Recepción ex", es_sistema=False)
        for clave in ("historia.ver", "historia.examenes.cargar"):
            RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave=clave))
        self.recepcion.rol_dinamico = rol
        self.recepcion.save(update_fields=["rol_dinamico"])
        self.assertEqual(self._cargar(self.recepcion).status_code, 201)

    def test_el_check_atiende_pacientes_da_el_permiso(self):
        self.assertIn("historia.examenes.cargar", get_user_permission_keys(self.profesional))
        self.assertNotIn("historia.examenes.cargar", get_user_permission_keys(self.recepcion))

    def test_eliminar_solo_quien_lo_cargo_y_queda_el_registro(self):
        examen_id = self._cargar(self.profesional).json()["id"]

        self.client.force_authenticate(self.otro)
        self.assertFalse(self._lista()[0]["puede_modificar"])
        self.assertEqual(self.client.delete(f"{URL}{examen_id}/").status_code, 403)

        self.client.force_authenticate(self.profesional)
        self.assertTrue(self._lista()[0]["puede_modificar"])
        self.assertEqual(self.client.delete(f"{URL}{examen_id}/").status_code, 204)

        examen = ResultadoExamen.objects.get(id=examen_id)
        self.assertFalse(examen.activo)
        self.assertEqual(examen.created_by_id, self.profesional.id)
        self.assertEqual(self._lista(), [])
        self.assertTrue(LogAccion.objects.filter(accion="historia.examen.eliminar", objeto_id=examen_id).exists())

    def test_agregar_archivo_despues_y_quitar_solo_el_propio(self):
        examen_id = self._cargar(self.profesional, adjuntos=[_pdf()]).json()["id"]

        self.client.force_authenticate(self.otro)
        r = self.client.post(f"{URL}{examen_id}/archivos/", {"adjuntos": [_png()]}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content[:300])
        archivos = r.json()["archivos"]
        self.assertEqual(len(archivos), 2)
        # Cada uno quita solo el archivo que subió.
        self.assertEqual([a["puede_quitar"] for a in archivos], [False, True])
        del_profesional = ArchivoResultadoExamen.objects.get(resultado_id=examen_id, subido_por=self.profesional)
        del_otro = ArchivoResultadoExamen.objects.get(resultado_id=examen_id, subido_por=self.otro)

        self.assertEqual(self.client.delete(f"{URL}{examen_id}/archivos/{del_profesional.id}/").status_code, 403)
        self.assertEqual(self.client.delete(f"{URL}{examen_id}/archivos/{del_otro.id}/").status_code, 204)
        del_otro.refresh_from_db()
        self.assertFalse(del_otro.activo)

    def test_pdf_incluye_los_cargados_fuera_de_atencion(self):
        self._cargar(self.profesional, adjuntos=[_pdf()])
        nota = NotaClinica.objects.create(historia=self.historia, estado=NotaClinica.EstadoNota.COMPLETADA)
        ResultadoExamen.objects.create(historia=self.historia, nota=nota, titulo="Borrado", fecha="2026-10-01", activo=False)
        ResultadoExamen.objects.create(historia=self.historia, nota=nota, titulo="En atención", fecha="2026-10-01")

        contexto = build_historia_pdf_context(self.historia, include_fotos=False)

        sueltos = contexto["examenes_sin_atencion"]
        self.assertEqual([e["titulo"] for e in sueltos], ["Hemograma"])
        self.assertEqual(sueltos[0]["archivos"], ["hemograma.pdf"])
        self.assertEqual(sueltos[0]["cargado_por"], self.profesional.nombre_completo)
        self.assertEqual([e["titulo"] for e in contexto["notas"][0]["examenes"]], ["En atención"])
        self.assertTrue(render_historia_pdf(self.historia, include_fotos=False).startswith(b"%PDF"))
