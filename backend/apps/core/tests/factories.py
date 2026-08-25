"""Fixtures reutilizables para tests de integración."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.clinicas.models import Clinica, Sede, Servicio
from apps.pacientes.models import Paciente

User = get_user_model()

HORARIO_LUN_VIE = {
    "lunes": ["08:00", "18:00"],
    "martes": ["08:00", "18:00"],
    "miercoles": ["08:00", "18:00"],
    "jueves": ["08:00", "18:00"],
    "viernes": ["08:00", "18:00"],
}


class ClinicaFixtureMixin:
    """Crea clínica, sede, profesional y paciente mínimos para flujos API."""

    clinica_nit = "900000001"

    def crear_clinica_base(self, *, nombre="Clinica Test", nit=None):
        nit = nit or self.clinica_nit
        self.clinica_nit = nit
        self.clinica = Clinica.objects.create(nombre=nombre, nit=nit)
        self.sede = Sede.objects.create(
            clinica=self.clinica,
            nombre="Principal",
            ciudad="Bogota",
            direccion="Calle 1",
            telefono="3000000000",
            horario=dict(HORARIO_LUN_VIE),
        )
        self.profesional = User.objects.create_user(
            email=f"prof-{self.clinica_nit}@example.com",
            password="Secret123!",
            first_name="Ana",
            last_name="Profesional",
            rol=User.Role.PROFESIONAL,
            clinica=self.clinica,
            es_profesional=True,
        )
        self.paciente = Paciente.objects.create(
            clinica=self.clinica,
            tipo_documento=Paciente.TipoDocumento.CC,
            numero_documento=f"DOC{self.clinica_nit[-6:]}",
            nombres="Juan",
            apellidos="Perez",
            fecha_nacimiento=timezone.localdate() - timedelta(days=30 * 365),
            sexo=Paciente.Sexo.MASCULINO,
            direccion="Calle 2",
            telefono="3001112233",
            canal_confirmacion=Paciente.CanalConfirmacion.WHATSAPP,
            autoriza_datos=True,
        )
        self.servicio = Servicio.objects.create(
            clinica=self.clinica,
            nombre="Procedimiento base",
            descripcion="Test",
            duracion_min=30,
            precio="150000.00",
        )
        return self.clinica

    def crear_superadmin(self, email="super@test.com"):
        self.superadmin = User.objects.create_user(
            email=email,
            password="Secret123!",
            first_name="Super",
            last_name="Admin",
            rol=User.Role.SUPERADMIN,
        )
        return self.superadmin

    def proximo_dia_habil_10am(self):
        fecha = timezone.localtime(timezone.now()) + timedelta(days=1)
        while fecha.weekday() >= 5:
            fecha += timedelta(days=1)
        return fecha.replace(hour=10, minute=0, second=0, microsecond=0)
