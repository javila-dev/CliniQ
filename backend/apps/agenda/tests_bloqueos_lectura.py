"""Lectura de bloqueos: quien ve la agenda (`agenda.citas.ver`) necesita ver los
horarios bloqueados aunque no tenga `agenda.bloqueos.ver`, pero solo los aprobados."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import BloqueoAgenda
from apps.clinicas.models import Clinica, Sede
from apps.users.models import Rol

User = get_user_model()


class BloqueosLecturaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Bloqueos", nit="900888003")
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1",
            telefono="3000000000",
        )
        self.profesional = User.objects.create_user(
            email="prof-bloqueos@example.com", password="secret123", first_name="Pro", last_name="Fesional",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        # Recepción (rol legado) tiene agenda.citas.ver pero no agenda.bloqueos.ver.
        self.recepcion = User.objects.create_user(
            email="recepcion-bloqueos@example.com", password="secret123", first_name="Rita", last_name="Recepcion",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        inicio = timezone.now() + timedelta(days=1)
        self.aprobado = self._bloqueo(inicio, BloqueoAgenda.Estado.APROBADO)
        self.pendiente = self._bloqueo(inicio, BloqueoAgenda.Estado.PENDIENTE)

    def _bloqueo(self, inicio, estado):
        return BloqueoAgenda.objects.create(
            clinica=self.clinica, sede=self.sede, profesional=self.profesional,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(hours=1), estado=estado,
        )

    def test_recepcion_ve_solo_los_bloqueos_aprobados(self):
        self.client.force_authenticate(self.recepcion)
        response = self.client.get("/api/v1/agenda/bloqueos/", {"sede": str(self.sede.id)})
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        filas = data["results"] if isinstance(data, dict) else data
        self.assertEqual({f["id"] for f in filas}, {str(self.aprobado.id)})

    def test_sin_permiso_de_agenda_no_ve_bloqueos(self):
        rol_vacio = Rol.objects.create(clinica=self.clinica, slug="sin-agenda", nombre="Sin agenda", es_sistema=False)
        sin_permisos = User.objects.create_user(
            email="sin-permisos-bloqueos@example.com", password="secret123", first_name="Sin", last_name="Permisos",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol_vacio,
        )
        self.client.force_authenticate(sin_permisos)
        response = self.client.get("/api/v1/agenda/bloqueos/")
        self.assertEqual(response.status_code, 403, response.content)
