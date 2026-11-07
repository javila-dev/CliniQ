"""Fotos HEIC del iPhone (07/11/2026): Pillow no las abría y la subida respondía
"Adjunte una imagen válida". Ahora se aceptan y se guardan como JPEG, que todos
los navegadores muestran (Chrome en Windows no muestra HEIC)."""
import io
from datetime import timedelta

import pillow_heif
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.historia_clinica.models import FotoClinica, HistoriaClinica, NotaClinica


def heic(nombre="IMG_0001.HEIC", content_type="image/heic", orientacion=None):
    imagen = Image.new("RGB", (40, 20), "red")
    heif = pillow_heif.from_pillow(imagen)
    buffer = io.BytesIO()
    if orientacion:
        exif = Image.Exif()
        exif[0x0112] = orientacion  # Orientation
        heif.save(buffer, quality=80, exif=exif.tobytes())
    else:
        heif.save(buffer, quality=80)
    return SimpleUploadedFile(nombre, buffer.getvalue(), content_type=content_type)


class FotoHeicTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin-heic@example.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        inicio = timezone.now() - timedelta(minutes=10)
        cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, profesional=self.admin, servicio=self.servicio,
            servicio_nombre=self.servicio.nombre, fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            duracion_min=30, estado=Cita.Estado.EN_CURSO, canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )
        self.nota = NotaClinica.objects.create(historia=HistoriaClinica.del_paciente(self.paciente), cita=cita)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _subir(self, archivo):
        return self.client.post(
            "/api/v1/historia-clinica/fotos/", {"nota": str(self.nota.id), "tipo": "antes", "archivo": archivo},
            format="multipart",
        )

    def _guardada(self, respuesta):
        foto = FotoClinica.objects.get(id=respuesta.json()["id"])
        foto.archivo.open("rb")
        try:
            return foto, Image.open(io.BytesIO(foto.archivo.read()))
        finally:
            foto.archivo.close()

    def test_una_foto_heic_del_iphone_se_guarda_como_jpeg(self):
        r = self._subir(heic())

        self.assertEqual(r.status_code, 201, r.content[:300])
        foto, imagen = self._guardada(r)
        self.assertTrue(foto.archivo.name.endswith(".jpg"), foto.archivo.name)
        self.assertEqual(imagen.format, "JPEG")
        self.assertEqual(imagen.size, (40, 20))

    def test_se_reconoce_aunque_el_navegador_no_mande_el_tipo(self):
        r = self._subir(heic(nombre="IMG_0002.heic", content_type="application/octet-stream"))

        self.assertEqual(r.status_code, 201, r.content[:300])
        self.assertEqual(self._guardada(r)[1].format, "JPEG")

    def test_respeta_la_orientacion_del_celular(self):
        # Orientation=6: la cámara guardó la foto acostada; al girarla queda vertical.
        r = self._subir(heic(orientacion=6))

        self.assertEqual(r.status_code, 201, r.content[:300])
        self.assertEqual(self._guardada(r)[1].size, (20, 40))

    def test_un_archivo_que_no_es_imagen_sigue_rechazado(self):
        falso = SimpleUploadedFile("IMG_0003.HEIC", b"no soy una foto", content_type="image/heic")

        r = self._subir(falso)

        self.assertEqual(r.status_code, 400)
        self.assertFalse(FotoClinica.objects.exists())
