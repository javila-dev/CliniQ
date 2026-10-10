"""Regresiones del paso 1 de la verificación transversal (docs/verificacion/)."""

from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.core.tests.factories import ClinicaFixtureMixin, User
from apps.pacientes.models import Paciente
from apps.users.authorization import get_user_permission_keys
from apps.users.models import Permiso, Rol, RolPermiso


class VerificacionPaso1Tests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base()
        self.admin = User.objects.create_user(
            email="admin@test.com", password="Secret123!", first_name="Ad", last_name="Min",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_t01_el_backend_respeta_page_size(self):
        for i in range(12):
            Paciente.objects.create(
                clinica=self.clinica, tipo_documento="CC", numero_documento=f"77{i:04d}",
                nombres=f"Paciente{i}", apellidos="Prueba", fecha_nacimiento=date(1990, 1, 1),
                sexo="F", telefono=f"30000{i:05d}", autoriza_datos=True,
            )
        pagina = self.client.get("/api/v1/pacientes/?page_size=10").json()
        self.assertEqual(len(pagina["results"]), 10)
        self.assertEqual(pagina["count"], 13)
        # La página 2 existe con 10 por página (antes daba 404 porque el backend devolvía 25).
        segunda = self.client.get("/api/v1/pacientes/?page=2&page_size=10")
        self.assertEqual(segunda.status_code, 200)
        self.assertEqual(len(segunda.json()["results"]), 3)

    def test_m604_buscar_en_ingresos_no_da_500(self):
        response = self.client.get("/api/v1/cobros/cobros/?search=Juan")
        self.assertEqual(response.status_code, 200, response.content)

    def test_m402_quien_atiende_ve_la_historia_aunque_su_rol_no_lo_traiga(self):
        rol = Rol.objects.create(clinica=self.clinica, slug="esteticista", nombre="Esteticista", es_sistema=False)
        RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave="agenda.citas.ver"))
        esteticista = User.objects.create_user(
            email="este@test.com", password="Secret123!", first_name="Es", last_name="Te",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol, es_profesional=True,
        )
        claves = get_user_permission_keys(esteticista)
        self.assertIn("historia.ver", claves)
        self.assertIn("pacientes.antecedentes.ver", claves)
        self.client.force_authenticate(esteticista)
        response = self.client.get(f"/api/v1/historia-clinica/historias/?paciente={self.paciente.id}")
        self.assertEqual(response.status_code, 200, response.content)

    def _cita_pendiente(self):
        inicio = timezone.now() + timedelta(days=1)
        return Cita.objects.create(
            paciente=self.paciente, sede=self.sede, servicio=self.servicio, profesional=self.profesional,
            fecha_inicio=inicio, fecha_fin=inicio + timedelta(minutes=30),
            estado=Cita.Estado.PENDIENTE, estado_confirmacion=Cita.EstadoConfirmacion.ENVIADO,
            canal_confirmacion=self.paciente.canal_confirmacion, canal_origen=Cita.CanalOrigen.PRESENCIAL,
        )

    def test_m304_quien_gestiona_la_agenda_registra_la_confirmacion(self):
        # Sin permiso aparte: basta con poder crear o editar citas (Recepción).
        recepcion = User.objects.create_user(
            email="rece@test.com", password="Secret123!", first_name="Re", last_name="Ce",
            rol=User.Role.RECEPCION, clinica=self.clinica,
        )
        self.client.force_authenticate(recepcion)
        cita = self._cita_pendiente()
        response = self.client.post(
            f"/api/v1/agenda/citas/{cita.id}/no_confirmo/", {"medio": "llamada", "nota": "No contestó"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        response = self.client.patch(f"/api/v1/agenda/citas/{cita.id}/confirmar_manual/", {"medio": "llamada"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)

    def test_m304_solo_ver_la_agenda_no_registra_confirmaciones(self):
        rol = Rol.objects.create(clinica=self.clinica, slug="solo-agenda", nombre="Solo agenda", es_sistema=False)
        RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(clave="agenda.citas.ver"))
        lector = User.objects.create_user(
            email="lector@test.com", password="Secret123!", first_name="Le", last_name="Ctor",
            rol=User.Role.RECEPCION, clinica=self.clinica, rol_dinamico=rol,
        )
        self.client.force_authenticate(lector)
        cita = self._cita_pendiente()
        response = self.client.patch(f"/api/v1/agenda/citas/{cita.id}/confirmar_manual/", {"medio": "llamada"}, format="json")
        self.assertEqual(response.status_code, 403)
