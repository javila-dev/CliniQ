from datetime import date

from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel


class Paciente(BaseModel):
    class TipoDocumento(models.TextChoices):
        CC = "CC", "Cedula de ciudadania"
        CE = "CE", "Cedula de extranjeria"
        PA = "PA", "Pasaporte"
        TI = "TI", "Tarjeta de identidad"
        NIT = "NIT", "NIT"

    class Sexo(models.TextChoices):
        MASCULINO = "M", "Masculino"
        FEMENINO = "F", "Femenino"
        OTRO = "O", "Otro"

    class CanalConfirmacion(models.TextChoices):
        WHATSAPP = "whatsapp", "WhatsApp"
        SMS = "sms", "SMS"
        LLAMADA = "llamada", "Llamada"

    class EstadoCivil(models.TextChoices):
        SOLTERO = "soltero", "Soltero/a"
        CASADO = "casado", "Casado/a"
        UNION_LIBRE = "union_libre", "Union libre"
        SEPARADO = "separado", "Separado/a"
        DIVORCIADO = "divorciado", "Divorciado/a"
        VIUDO = "viudo", "Viudo/a"

    class Escolaridad(models.TextChoices):
        NINGUNA = "ninguna", "Sin escolaridad"
        PRIMARIA = "primaria", "Primaria"
        SECUNDARIA = "secundaria", "Secundaria"
        TECNICO = "tecnico", "Tecnico/Tecnologo"
        UNIVERSITARIO = "universitario", "Universitario"
        POSGRADO = "posgrado", "Posgrado"

    class GrupoEtnico(models.TextChoices):
        MESTIZO = "mestizo", "Mestizo"
        BLANCO = "blanco", "Blanco"
        AFROCOLOMBIANO = "afrocolombiano", "Afrocolombiano/Afrodescendiente"
        INDIGENA = "indigena", "Indigena"
        RAIZAL = "raizal", "Raizal"
        ROM = "rom", "ROM/Gitano"
        OTRO = "otro", "Otro"

    class GrupoSanguineo(models.TextChoices):
        A_POSITIVO = "A+", "A+"
        A_NEGATIVO = "A-", "A-"
        B_POSITIVO = "B+", "B+"
        B_NEGATIVO = "B-", "B-"
        AB_POSITIVO = "AB+", "AB+"
        AB_NEGATIVO = "AB-", "AB-"
        O_POSITIVO = "O+", "O+"
        O_NEGATIVO = "O-", "O-"

    class TipoAfiliado(models.TextChoices):
        COTIZANTE = "cotizante", "Cotizante"
        BENEFICIARIO = "beneficiario", "Beneficiario"
        INDEPENDIENTE = "independiente", "Independiente"
        SUBSIDIADO = "subsidiado", "Subsidiado"
        VINCULADO = "vinculado", "Vinculado"

    class Regimen(models.TextChoices):
        CONTRIBUTIVO = "contributivo", "Contributivo"
        SUBSIDIADO = "subsidiado", "Subsidiado"
        VINCULADO = "vinculado", "Vinculado"
        ESPECIAL = "especial", "Especial/Excepcion"
        PENSIONADO = "pensionado", "Pensionado"

    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.PROTECT,
        related_name="pacientes",
    )
    tipo_documento = models.CharField(max_length=3, choices=TipoDocumento.choices)
    numero_documento = models.CharField(max_length=30)
    nombres = models.CharField(max_length=100)
    apellidos = models.CharField(max_length=100)
    fecha_nacimiento = models.DateField()
    sexo = models.CharField(max_length=1, choices=Sexo.choices)
    ocupacion = models.CharField(max_length=100, blank=True)
    direccion = models.CharField(max_length=255, blank=True)
    ciudad = models.CharField(max_length=100, blank=True)
    barrio = models.CharField(max_length=100, blank=True)
    estado_civil = models.CharField(max_length=20, choices=EstadoCivil.choices, blank=True)
    escolaridad = models.CharField(max_length=20, choices=Escolaridad.choices, blank=True)
    grupo_etnico = models.CharField(max_length=20, choices=GrupoEtnico.choices, blank=True)
    grupo_sanguineo = models.CharField(max_length=5, choices=GrupoSanguineo.choices, blank=True)
    eps = models.CharField(max_length=100, blank=True)
    tipo_afiliado = models.CharField(max_length=20, choices=TipoAfiliado.choices, blank=True)
    regimen = models.CharField(max_length=20, choices=Regimen.choices, blank=True)
    nombre_responsable = models.CharField(max_length=200, blank=True)
    parentesco_responsable = models.CharField(max_length=50, blank=True)
    telefono_responsable = models.CharField(max_length=20, blank=True)
    telefono = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    canal_confirmacion = models.CharField(
        max_length=20,
        choices=CanalConfirmacion.choices,
        default=CanalConfirmacion.WHATSAPP,
    )
    autoriza_datos = models.BooleanField(default=False)
    fecha_autorizacion = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "pacientes"
        unique_together = (("clinica", "tipo_documento", "numero_documento"),)
        ordering = ["apellidos", "nombres"]

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombres} {self.apellidos}".strip()

    @property
    def edad(self) -> int:
        hoy = date.today()
        return hoy.year - self.fecha_nacimiento.year - (
            (hoy.month, hoy.day) < (self.fecha_nacimiento.month, self.fecha_nacimiento.day)
        )

    def save(self, *args, **kwargs):
        if self.autoriza_datos and self.fecha_autorizacion is None:
            self.fecha_autorizacion = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.nombre_completo} - {self.tipo_documento} {self.numero_documento}"


class AntecedentePaciente(BaseModel):
    class TipoPiel(models.TextChoices):
        I = "I", "Tipo I - Muy clara, siempre se quema"
        II = "II", "Tipo II - Clara, generalmente se quema"
        III = "III", "Tipo III - Intermedia, a veces se quema"
        IV = "IV", "Tipo IV - Morena clara, raramente se quema"
        V = "V", "Tipo V - Morena oscura, muy raramente se quema"
        VI = "VI", "Tipo VI - Muy oscura, nunca se quema"

    paciente = models.OneToOneField(
        "pacientes.Paciente",
        on_delete=models.CASCADE,
        related_name="antecedentes",
    )
    alergias = models.TextField(blank=True)
    medicamentos_actuales = models.TextField(blank=True)
    condiciones_medicas = models.TextField(blank=True)
    contraindicaciones = models.TextField(blank=True)
    tipo_piel = models.CharField(max_length=3, choices=TipoPiel.choices, blank=True)
    antecedentes_esteticos = models.TextField(blank=True)
    toxicologicos_tabaquismo = models.BooleanField(default=False)
    toxicologicos_alcohol = models.BooleanField(default=False)
    toxicologicos_drogas = models.BooleanField(default=False)
    toxicologicos_otros = models.TextField(blank=True, default="")
    patologicos = models.TextField(blank=True, default="")
    quirurgicos = models.TextField(blank=True, default="")
    ant_traumaticos = models.TextField(blank=True, default="")
    ginecoobstetricos = models.JSONField(null=True, blank=True)
    gestaciones = models.PositiveSmallIntegerField(null=True, blank=True)
    partos = models.PositiveSmallIntegerField(null=True, blank=True)
    abortos = models.PositiveSmallIntegerField(null=True, blank=True)
    cesareas = models.PositiveSmallIntegerField(null=True, blank=True)
    fum = models.DateField(null=True, blank=True)
    planificacion_familiar = models.TextField(blank=True, default="")
    metodo_anticonceptivo = models.TextField(blank=True, default="")
    familiares = models.TextField(blank=True, default='')

    class Meta:
        db_table = "antecedentes_paciente"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"Antecedentes de {self.paciente.nombre_completo}"
