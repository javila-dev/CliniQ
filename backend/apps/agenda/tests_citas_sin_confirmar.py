"""Aviso de "citas sin confirmar": del próximo día que cada sede trabaja, no necesariamente
mañana en el calendario (si la sede no abre mañana, el próximo día hábil puede caer varios
días después, p. ej. de viernes a lunes)."""
from datetime import date, datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import Cita
from apps.agenda.services import proximo_dia_habil_sede
from apps.clinicas.models import Clinica, Sede, Servicio
from apps.pacientes.models import Paciente

User = get_user_model()

# 2024-01-01 fue lunes: ancla fija para no depender del día en que corre el test.
LUNES = date(2024, 1, 1)


class ProximoDiaHabilSedeTests(TestCase):
    def test_salta_los_dias_sin_horario(self):
        sede = Sede(horario={dia: ["08:00", "18:00"] for dia in ("lunes", "martes", "miercoles", "jueves")})
        jueves = LUNES + timedelta(days=3)
        # Viernes, sábado y domingo no tienen horario: el próximo día hábil es el lunes siguiente.
        self.assertEqual(proximo_dia_habil_sede(sede, jueves), LUNES + timedelta(days=7))

    def test_dia_siguiente_normal(self):
        sede = Sede(horario={dia: ["08:00", "18:00"] for dia in ("lunes", "martes", "miercoles", "jueves", "viernes")})
        self.assertEqual(proximo_dia_habil_sede(sede, LUNES), LUNES + timedelta(days=1))

    def test_sede_sin_horario_no_se_cuelga(self):
        sede = Sede(horario={})
        self.assertEqual(proximo_dia_habil_sede(sede, LUNES), LUNES + timedelta(days=1))


class CitasSinConfirmarEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clinica = Clinica.objects.create(nombre="Clinica Confirmacion", nit="900888002")
        self.hoy = timezone.localdate()
        dia_semana = {0: "lunes", 1: "martes", 2: "miercoles", 3: "jueves", 4: "viernes", 5: "sabado", 6: "domingo"}
        # La sede no trabaja mañana, pero sí pasado mañana: el próximo día hábil se corre.
        manana = self.hoy + timedelta(days=1)
        pasado = self.hoy + timedelta(days=2)
        horario = {dia_semana[self.hoy.weekday()]: ["08:00", "18:00"], dia_semana[pasado.weekday()]: ["08:00", "18:00"]}
        self.sede = Sede.objects.create(
            clinica=self.clinica, nombre="Principal", ciudad="Bogota", direccion="Calle 1",
            telefono="3000000000", horario=horario,
        )
        self.admin = User.objects.create_user(
            email="admin-confirmacion@example.com", password="secret123", first_name="Ada", last_name="Admin",
            rol=User.Role.ADMIN, clinica=self.clinica,
        )
        self.client.force_authenticate(self.admin)
        self.profesional = User.objects.create_user(
            email="prof-confirmacion@example.com", password="secret123", first_name="Pro", last_name="Fesional",
            rol=User.Role.PROFESIONAL, clinica=self.clinica, es_profesional=True,
        )
        self.servicio = Servicio.objects.create(clinica=self.clinica, nombre="Consulta", duracion_min=30)
        self.paciente = Paciente.objects.create(
            clinica=self.clinica, tipo_documento=Paciente.TipoDocumento.CC, numero_documento="2020",
            nombres="Marta", apellidos="Gomez", fecha_nacimiento=self.hoy - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.FEMENINO, direccion="Calle 2", telefono="3001112233",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP, autoriza_datos=True,
        )
        self.manana = manana
        self.pasado = pasado

    def _crear_cita(self, fecha, estado=Cita.Estado.PENDIENTE, estado_confirmacion=Cita.EstadoConfirmacion.SIN_ENVIAR):
        inicio = timezone.make_aware(datetime.combine(fecha, time(9, 0)), timezone.get_current_timezone())
        return Cita.objects.create(
            paciente=self.paciente, sede=self.sede, servicio=self.servicio, servicio_nombre=self.servicio.nombre,
            duracion_min=30, profesional=self.profesional, fecha_inicio=inicio,
            fecha_fin=inicio + timedelta(minutes=30), estado=estado, estado_confirmacion=estado_confirmacion,
            canal_confirmacion=Cita.CanalConfirmacion.WHATSAPP,
        )

    def test_cuenta_solo_el_proximo_dia_que_la_sede_trabaja(self):
        # No cuenta: mañana la sede no trabaja, así que no puede haber citas reales ahí,
        # pero si las hubiera (dato viejo/inconsistente) tampoco deberían contarse.
        self._crear_cita(self.manana)
        # Sí cuenta: pasado mañana es el próximo día que la sede trabaja, y sigue sin confirmar.
        esperada = self._crear_cita(self.pasado)
        # No cuenta: misma fecha pero ya confirmada.
        self._crear_cita(self.pasado, estado_confirmacion=Cita.EstadoConfirmacion.CONFIRMADO)
        # No cuenta: misma fecha pero cancelada.
        self._crear_cita(self.pasado, estado=Cita.Estado.CANCELADA)

        response = self.client.get("/api/v1/agenda/citas/sin_confirmar_proximo_dia_habil/")
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["fecha_desde"], self.pasado.isoformat())
        self.assertEqual(data["fecha_hasta"], self.pasado.isoformat())
        self.assertTrue(Cita.objects.filter(id=esperada.id).exists())
