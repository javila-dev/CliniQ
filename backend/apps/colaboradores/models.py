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
    # Sin registro para el día = atiende en el horario de la sede. Con registro:
    # horario especial (hora_inicio/hora_fin) o `no_atiende` ese día.
    no_atiende = models.BooleanField(default=False)
    hora_inicio = models.TimeField(null=True, blank=True)
    hora_fin = models.TimeField(null=True, blank=True)

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


class GrupoAtencion(BaseModel):
    """Grupo de profesionales que se asigna en bloque a procedimientos.

    Quien está en un grupo realiza todos los procedimientos asignados al grupo,
    además de los que tenga asignados directamente (Colaborador.especialidades).
    No es un rol (los roles son permisos) ni el menú "Equipo" (usuarios). Ver
    apps.colaboradores.grupos para la regla de quién realiza qué.
    """

    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="grupos_atencion",
    )
    nombre = models.CharField(max_length=100)
    descripcion = models.CharField(max_length=255, blank=True)
    miembros = models.ManyToManyField(
        Colaborador,
        blank=True,
        related_name="grupos_atencion",
    )
    procedimientos = models.ManyToManyField(
        "clinicas.Servicio",
        blank=True,
        related_name="grupos_atencion",
    )

    class Meta:
        db_table = "grupos_atencion"
        ordering = ["nombre"]
        constraints = [
            models.UniqueConstraint(fields=["clinica", "nombre"], name="grupo_atencion_nombre_unico_por_clinica"),
        ]

    def __str__(self) -> str:
        return self.nombre
