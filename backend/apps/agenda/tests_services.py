"""Tests unitarios de la lógica de agenda (disponibilidad, horarios, deuda)."""

from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.agenda.models import BloqueoAgenda, Cita
from apps.agenda.services import (
    DIAS_SEMANA,
    calcular_fecha_fin,
    crear_cita,
    get_slots_disponibles,
    verificar_disponibilidad_profesional,
    verificar_horario_profesional,
    verificar_horario_sede,
)
from apps.colaboradores.models import Colaborador, HorarioColaborador
from apps.cartera.models import Cartera, CuotaCartera
from apps.clinicas.models import FormaDePago
from apps.core.tests.factories import ClinicaFixtureMixin, HORARIO_LUN_VIE
from apps.cotizaciones.models import Cotizacion

User = get_user_model()


class AgendaServicesTests(ClinicaFixtureMixin, TestCase):
    def setUp(self):
        self.crear_clinica_base(nit="900000201")
        self.crear_superadmin()
        self.inicio = self.proximo_dia_habil_10am()

    def test_calcular_fecha_fin_suma_minutos(self):
        fin = calcular_fecha_fin(self.inicio, 45)
        self.assertEqual(fin, self.inicio + timedelta(minutes=45))

    def test_verificar_horario_sede_rechaza_fuera_de_horario(self):
        domingo = self.inicio
        while domingo.weekday() != 6:
            domingo += timedelta(days=1)
        fuera = domingo.replace(hour=10, minute=0)
        self.assertFalse(verificar_horario_sede(self.sede, fuera, fuera + timedelta(minutes=30)))

    def test_verificar_horario_sede_acepta_dentro_de_horario(self):
        self.assertTrue(
            verificar_horario_sede(self.sede, self.inicio, self.inicio + timedelta(minutes=30))
        )

    def test_verificar_disponibilidad_detecta_solapamiento(self):
        fin = calcular_fecha_fin(self.inicio, 30)
        Cita.objects.create(
            paciente=self.paciente,
            sede=self.sede,
            servicio=self.servicio,
            profesional=self.profesional,
            fecha_inicio=self.inicio,
            fecha_fin=fin,
            duracion_min=30,
            servicio_nombre=self.servicio.nombre,
            canal_confirmacion=self.paciente.canal_confirmacion,
        )
        self.assertFalse(
            verificar_disponibilidad_profesional(
                self.profesional.id,
                self.inicio + timedelta(minutes=15),
                self.inicio + timedelta(minutes=45),
            )
        )

    def test_bloqueo_pendiente_no_ocupa_agenda(self):
        fin = calcular_fecha_fin(self.inicio, 30)
        BloqueoAgenda.objects.create(
            profesional=self.profesional,
            sede=self.sede,
            clinica=self.clinica,
            fecha_inicio=self.inicio,
            fecha_fin=fin,
            estado=BloqueoAgenda.Estado.PENDIENTE,
        )
        self.assertTrue(verificar_disponibilidad_profesional(self.profesional.id, self.inicio, fin))

    def test_bloqueo_aprobado_ocupa_agenda(self):
        fin = calcular_fecha_fin(self.inicio, 30)
        BloqueoAgenda.objects.create(
            profesional=self.profesional,
            sede=self.sede,
            clinica=self.clinica,
            fecha_inicio=self.inicio,
            fecha_fin=fin,
            estado=BloqueoAgenda.Estado.APROBADO,
        )
        self.assertFalse(verificar_disponibilidad_profesional(self.profesional.id, self.inicio, fin))

    def test_get_slots_disponibles_respeta_horario_sede(self):
        slots = get_slots_disponibles(self.profesional.id, self.sede.id, self.inicio.date(), 30)
        self.assertTrue(len(slots) > 0)
        for slot in slots:
            self.assertEqual(slot.date(), self.inicio.date())

    def _horario_profesional(self, **kwargs):
        colaborador = Colaborador.objects.create(
            user=self.profesional,
            sede_principal=self.sede,
            tipo_contrato=Colaborador.TipoContrato.EMPLEADO,
            fecha_ingreso=timezone.localdate(),
            numero_documento="123",
        )
        return HorarioColaborador.objects.create(
            colaborador=colaborador,
            sede=self.sede,
            dia_semana=DIAS_SEMANA[self.inicio.weekday()],
            **kwargs,
        )

    def test_profesional_sin_horario_especial_usa_el_de_la_sede(self):
        tarde = self.inicio.replace(hour=16)
        self.assertTrue(verificar_horario_profesional(self.profesional.id, self.sede.id, tarde, tarde + timedelta(minutes=30)))

    def test_profesional_con_horario_especial_solo_en_ese_rango(self):
        self._horario_profesional(hora_inicio="09:00", hora_fin="12:00")
        tarde = self.inicio.replace(hour=16)
        self.assertTrue(verificar_horario_profesional(self.profesional.id, self.sede.id, self.inicio, self.inicio + timedelta(minutes=30)))
        self.assertFalse(verificar_horario_profesional(self.profesional.id, self.sede.id, tarde, tarde + timedelta(minutes=30)))

    def test_profesional_que_no_atiende_ese_dia(self):
        self._horario_profesional(no_atiende=True)
        self.assertFalse(verificar_horario_profesional(self.profesional.id, self.sede.id, self.inicio, self.inicio + timedelta(minutes=30)))
        self.assertEqual(get_slots_disponibles(self.profesional.id, self.sede.id, self.inicio.date(), 30), [])

    def test_get_slots_disponibles_excluye_la_cita_que_se_edita(self):
        """Al editar una cita, su propio horario aparece libre."""
        cita = Cita.objects.create(
            paciente=self.paciente, sede=self.sede, servicio=self.servicio, profesional=self.profesional,
            fecha_inicio=self.inicio, fecha_fin=calcular_fecha_fin(self.inicio, 30), duracion_min=30,
            servicio_nombre=self.servicio.nombre, canal_confirmacion=self.paciente.canal_confirmacion,
        )
        fecha = self.inicio.date()
        self.assertNotIn(self.inicio, get_slots_disponibles(self.profesional.id, self.sede.id, fecha, 30))
        self.assertIn(
            self.inicio,
            get_slots_disponibles(self.profesional.id, self.sede.id, fecha, 30, excluir_cita_id=cita.id),
        )

    def test_crear_cita_rechaza_paciente_de_otra_clinica(self):
        sede = self.sede
        servicio = self.servicio
        profesional = self.profesional
        inicio = self.inicio
        otra_clinica = ClinicaFixtureMixin()
        otra_clinica.crear_clinica_base(nit="900000202")
        with self.assertRaises(ValidationError):
            crear_cita(
                {
                    "paciente": otra_clinica.paciente,
                    "sede": sede,
                    "servicio": servicio,
                    "profesional": profesional,
                    "fecha_inicio": inicio,
                    "canal_origen": Cita.CanalOrigen.PRESENCIAL,
                },
                self.superadmin,
            )

    def test_crear_cita_bloqueada_por_deuda_vencida(self):
        self.clinica.bloquear_agenda_por_deuda = True
        self.clinica.dias_gracia_deuda = 0
        self.clinica.save(update_fields=["bloquear_agenda_por_deuda", "dias_gracia_deuda"])

        cotizacion = Cotizacion.objects.create(
            clinica=self.clinica,
            paciente=self.paciente,
            profesional=self.superadmin,
            estado=Cotizacion.Estado.ACEPTADA,
        )
        cartera = Cartera.objects.create(
            cotizacion=cotizacion,
            paciente=self.paciente,
            total=Decimal("100000.00"),
        )
        CuotaCartera.objects.create(
            cartera=cartera,
            tipo=FormaDePago.objects.get(clinica=self.clinica, tipo_base="transferencia"),
            valor_esperado=Decimal("100000.00"),
            fecha_esperada=timezone.localdate() - timedelta(days=5),
            pagada=False,
        )

        with self.assertRaises(ValidationError) as ctx:
            crear_cita(
                {
                    "paciente": self.paciente,
                    "sede": self.sede,
                    "servicio": self.servicio,
                    "profesional": self.profesional,
                    "fecha_inicio": self.inicio,
                    "canal_origen": Cita.CanalOrigen.PRESENCIAL,
                },
                self.superadmin,
            )
        self.assertEqual(ctx.exception.detail.get("code"), "PACIENTE_CON_DEUDA")

    def test_crear_cita_excluye_cita_cancelada_en_disponibilidad(self):
        fin = calcular_fecha_fin(self.inicio, 30)
        Cita.objects.create(
            paciente=self.paciente,
            sede=self.sede,
            servicio=self.servicio,
            profesional=self.profesional,
            fecha_inicio=self.inicio,
            fecha_fin=fin,
            duracion_min=30,
            servicio_nombre=self.servicio.nombre,
            estado=Cita.Estado.CANCELADA,
            canal_confirmacion=self.paciente.canal_confirmacion,
        )
        self.assertTrue(verificar_disponibilidad_profesional(self.profesional.id, self.inicio, fin))
