"""Quitar una foto de la atención mientras sigue abierta (vista sencilla, 28/10/2026):
basta con poder subir fotos. Las de atenciones pasadas no se tocan, con ningún permiso."""
import io
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.historia_clinica.models import FotoClinica, HistoriaClinica, NotaClinica
from apps.users.models import Permiso, Rol, RolPermiso


def png():
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(buffer, format="PNG")
    return SimpleUploadedFile("foto.png", buffer.getvalue(), content_type="image/png")


class QuitarFotoAtencionAbiertaTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        rol = Rol.objects.create(clinica=self.clinica, slug="cosmetologa", nombre="Cosmetóloga", es_profesional=True)
        for clave in ("historia.ver", "historia.notas.crear", "historia.fotos.subir"):
            RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave=clave))
        self.cosmetologa = User.objects.create_user(
            email="cosme-fotos@example.com", password="Secret123!", first_name="Cami", last_name="Lopez",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True, rol_dinamico=rol,
        )
        inicio = timezone.now() - timedelta(minutes=10)
        cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.cosmetologa, servicio=self.servicio,
            servicio_nombre=self.servicio.nombre, fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            duracion_min=30, estado=Cita.Estado.EN_CURSO, canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )
        self.nota = NotaClinica.objects.create(historia=HistoriaClinica.del_paciente(self.paciente), cita=cita)
        self.client = APIClient()
        self.client.force_authenticate(self.cosmetologa)

    def _subir(self):
        r = self.client.post(
            "/api/v1/historia-clinica/fotos/", {"nota": str(self.nota.id), "tipo": "antes", "archivo": png()},
            format="multipart",
        )
        self.assertEqual(r.status_code, 201, r.content[:300])
        return r.json()["id"]

    def test_con_la_atencion_abierta_quita_su_foto_sin_permiso_de_eliminar(self):
        foto = self._subir()

        r = self.client.delete(f"/api/v1/historia-clinica/fotos/{foto}/")

        self.assertEqual(r.status_code, 204, r.content[:300])
        self.assertFalse(FotoClinica.objects.filter(id=foto, activo=True).exists())

    def test_las_fotos_de_una_atencion_cerrada_no_se_quitan_ni_con_permiso_de_eliminar(self):
        foto = self._subir()
        NotaClinica.objects.filter(id=self.nota.id).update(estado=NotaClinica.EstadoNota.COMPLETADA)
        RolPermiso.objects.create(
            rol=self.cosmetologa.rol_dinamico, permiso=Permiso.objects.get(clave="historia.fotos.eliminar"),
        )

        r = self.client.delete(f"/api/v1/historia-clinica/fotos/{foto}/")

        self.assertEqual(r.status_code, 403)
        self.assertTrue(FotoClinica.objects.filter(id=foto).exists())
