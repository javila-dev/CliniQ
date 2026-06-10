from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


class Colaborador(BaseModel):
    class TipoContrato(models.TextChoices):
        EMPLEADO = "empleado", "Empleado"
        CONTRATISTA = "contratista", "Contratista"
        SOCIO = "socio", "Socio"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="colaborador",
    )
    sede_principal = models.ForeignKey(
        "clinicas.Sede",
        on_delete=models.PROTECT,
        related_name="colaboradores",
        null=True,
        blank=True,
    )
    sedes = models.ManyToManyField(
        "clinicas.Sede",
        blank=True,
        related_name="colaboradores_asignados",
    )
    tipo_contrato = models.CharField(max_length=20, choices=TipoContrato.choices)
    fecha_ingreso = models.DateField()
    especialidades = models.ManyToManyField(
        "clinicas.Servicio",
        blank=True,
        related_name="colaboradores",
    )
    numero_documento = models.CharField(max_length=30)

    class Meta:
        db_table = "colaboradores"
        ordering = ["user__last_name", "user__first_name"]

    @property
    def nombre_completo(self) -> str:
        return self.user.nombre_completo

    @property
    def clinica(self):
        if self.sede_principal_id:
            return self.sede_principal.clinica
        return self.user.clinica

    def __str__(self) -> str:
        return self.nombre_completo


class HorarioColaborador(BaseModel):
    class DiaSemana(models.TextChoices):
        LUNES = "lunes", "Lunes"
        MARTES = "martes", "Martes"
        MIERCOLES = "miercoles", "Miercoles"
        JUEVES = "jueves", "Jueves"
        VIERNES = "viernes", "Viernes"
        SABADO = "sabado", "Sabado"
        DOMINGO = "domingo", "Domingo"

    colaborador = models.ForeignKey(
        "colaboradores.Colaborador",
        on_delete=models.CASCADE,
        related_name="horarios",
    )
    sede = models.ForeignKey(
        "clinicas.Sede",
        on_delete=models.PROTECT,
        related_name="horarios_colaboradores",
    )
    dia_semana = models.CharField(max_length=10, choices=DiaSemana.choices)
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()

    class Meta:
        db_table = "horarios_colaborador"
        ordering = ["colaborador", "sede", "dia_semana"]
        constraints = [
            models.UniqueConstraint(
                fields=["colaborador", "sede", "dia_semana"],
                name="uniq_horario_colaborador_sede_dia",
            )
        ]

    def __str__(self) -> str:
        return f"{self.colaborador} - {self.sede} - {self.dia_semana}"
