from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel


class AntecedentesObesidad(BaseModel):
    """Valoración inicial de obesidad — one-to-one con HistoriaClinica."""

    class ActividadFisica(models.TextChoices):
        SEDENTARIO = "sedentario", "Sedentario"
        LEVE       = "leve",       "Leve (1-2 días/semana)"
        MODERADO   = "moderado",   "Moderado (3-4 días/semana)"
        INTENSO    = "intenso",    "Intenso (5+ días/semana)"

    historia = models.OneToOneField(
        "historia_clinica.HistoriaClinica",
        on_delete=models.PROTECT,
        related_name="antecedentes_obesidad",
    )
    peso_maximo_kg         = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    peso_minimo_adulto_kg  = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    intentos_previos       = models.TextField(blank=True)
    # JSONField lista de strings: ["diabetes_t2", "hipertension", ...]
    comorbilidades         = models.JSONField(default=list, blank=True)
    medicamentos_actuales  = models.TextField(blank=True)
    antecedente_familiar   = models.BooleanField(null=True, blank=True)
    actividad_fisica       = models.CharField(
        max_length=20, choices=ActividadFisica.choices, blank=True
    )
    patron_alimentario     = models.TextField(blank=True)
    factores_emocionales   = models.TextField(blank=True)

    class Meta:
        db_table = "obesidad_antecedentes"

    def __str__(self):
        return f"Antecedentes obesidad — {self.historia.numero}"


COMORBILIDADES_CHOICES = [
    ("diabetes_t2",    "Diabetes tipo 2"),
    ("hipertension",   "Hipertensión arterial"),
    ("dislipidemia",   "Dislipidemia"),
    ("apnea_sueno",    "Apnea del sueño"),
    ("higado_graso",   "Hígado graso (NAFLD)"),
    ("sop",            "Síndrome de ovario poliquístico"),
    ("artrosis",       "Artrosis / dolor articular"),
    ("reflujo",        "Reflujo gastroesofágico"),
    ("otro",           "Otro"),
]


class ObjetivoObesidad(BaseModel):
    """Meta de peso asociada a un programa del paciente."""

    paciente    = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.PROTECT,
        related_name="objetivos_obesidad",
    )
    cotizacion  = models.ForeignKey(
        "cotizaciones.Cotizacion",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="objetivo_obesidad",
    )
    peso_inicial_kg  = models.DecimalField(max_digits=5, decimal_places=2)
    peso_objetivo_kg = models.DecimalField(max_digits=5, decimal_places=2)
    fecha_inicio     = models.DateField()
    fecha_objetivo   = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "obesidad_objetivos"
        ordering = ["-fecha_inicio"]

    def __str__(self):
        return f"{self.paciente} → {self.peso_objetivo_kg} kg"

    @property
    def por_perder_kg(self):
        return self.peso_inicial_kg - self.peso_objetivo_kg


class MedicionAntropometrica(BaseModel):
    """Registro de medidas corporales en cada control."""

    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.PROTECT,
        related_name="mediciones_antropometricas",
    )
    nota = models.ForeignKey(
        "historia_clinica.NotaClinica",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="mediciones_antropometricas",
    )
    cita = models.ForeignKey(
        "agenda.Cita",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="mediciones_antropometricas",
    )
    fecha             = models.DateTimeField(default=timezone.now)
    peso_kg           = models.DecimalField(max_digits=5, decimal_places=2)
    talla_cm          = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    imc               = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    cintura_cm        = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    cadera_cm         = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    icc               = models.DecimalField(max_digits=4, decimal_places=3, null=True, blank=True)
    brazo_cm          = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    muslo_cm          = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    # Puntos de abdomen usados en los protocolos corporales en papel (LIPOMAX, METABOLIC, TENSAMAX)
    abdomen_alto_cm   = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    abdomen_medio_cm  = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    abdomen_bajo_cm   = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    # Medidas de pierna usadas en el protocolo PIERNAS DE IMPACTO
    pierna_derecha_alto_cm    = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    pierna_derecha_bajo_cm    = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    pierna_izquierda_alto_cm  = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    pierna_izquierda_bajo_cm  = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    # Bioimpedancia (opcional)
    grasa_corporal_pct = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    masa_muscular_kg   = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    grasa_visceral     = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    # Signos vitales
    presion_sistolica  = models.PositiveIntegerField(null=True, blank=True)
    presion_diastolica = models.PositiveIntegerField(null=True, blank=True)
    frecuencia_cardiaca    = models.PositiveSmallIntegerField(null=True, blank=True)
    frecuencia_respiratoria = models.PositiveSmallIntegerField(null=True, blank=True)
    temperatura_c          = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    saturacion_oxigeno     = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    # Campos custom definidos por la clínica (ver configuracion.ConfiguracionSignosVitales.campos_extra)
    campos_adicionales = models.JSONField(default=list, blank=True)
    tomado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="mediciones_tomadas",
    )

    class Meta:
        db_table = "obesidad_mediciones"
        ordering = ["-fecha"]

    def save(self, *args, **kwargs):
        if self.peso_kg and self.talla_cm and self.talla_cm > 0:
            talla_m = self.talla_cm / 100
            self.imc = round(float(self.peso_kg) / (float(talla_m) ** 2), 2)
        if self.cintura_cm and self.cadera_cm and self.cadera_cm > 0:
            self.icc = round(float(self.cintura_cm) / float(self.cadera_cm), 3)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.paciente} — {self.peso_kg} kg ({self.fecha.date()})"


def laboratorio_upload_path(instance, filename):
    import os
    _, ext = os.path.splitext(filename)
    return f"laboratorios/{instance.paciente_id}/{instance.id}{ext.lower()}"


class ResultadoLaboratorio(BaseModel):
    """PDF de laboratorio + valores clave rastreables."""

    class TipoExamen(models.TextChoices):
        GLUCOSA   = "glucosa",   "Glucosa / Insulina"
        HBA1C     = "hba1c",     "HbA1c"
        LIPIDOS   = "lipidos",   "Perfil lipídico"
        HEPATICO  = "hepatico",  "Función hepática"
        TIROIDEO  = "tiroideo",  "Perfil tiroideo"
        HEMOGRAMA = "hemograma", "Hemograma"
        OTRO      = "otro",      "Otro"

    paciente       = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.PROTECT,
        related_name="resultados_laboratorio",
    )
    fecha          = models.DateField()
    tipo           = models.CharField(max_length=20, choices=TipoExamen.choices)
    archivo        = models.FileField(upload_to=laboratorio_upload_path, null=True, blank=True)
    # Ejemplo: {"glucosa_mg_dl": 95, "hba1c_pct": 5.8, "trigliceridos": 142}
    valores        = models.JSONField(default=dict, blank=True)
    observaciones  = models.TextField(blank=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="laboratorios_registrados",
    )

    class Meta:
        db_table = "obesidad_laboratorios"
        ordering = ["-fecha"]

    def __str__(self):
        return f"{self.paciente} — {self.get_tipo_display()} ({self.fecha})"


class TratamientoFarmacologico(BaseModel):
    """Prescripción farmacológica activa de un paciente en el programa."""

    class Via(models.TextChoices):
        ORAL           = "oral",           "Oral"
        SUBCUTANEA     = "subcutanea",     "Subcutánea"
        INTRAMUSCULAR  = "intramuscular",  "Intramuscular"

    paciente         = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.PROTECT,
        related_name="tratamientos_farmacologicos",
    )
    nota             = models.ForeignKey(
        "historia_clinica.NotaClinica",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="prescripciones_farmacologicas",
    )
    medicamento      = models.CharField(max_length=200)
    principio_activo = models.CharField(max_length=200, blank=True)
    dosis            = models.CharField(max_length=200)
    via              = models.CharField(max_length=20, choices=Via.choices, default=Via.ORAL)
    frecuencia       = models.CharField(max_length=200)
    fecha_inicio     = models.DateField()
    fecha_fin        = models.DateField(null=True, blank=True)
    indicado_por     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="prescripciones_indicadas",
    )
    motivo_suspension = models.TextField(blank=True)

    class Meta:
        db_table = "obesidad_farmacologico"
        ordering = ["-fecha_inicio"]

    def __str__(self):
        return f"{self.paciente} — {self.medicamento}"

    @property
    def vigente(self):
        from datetime import date
        return self.activo and (self.fecha_fin is None or self.fecha_fin >= date.today())
