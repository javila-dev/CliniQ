from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel


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
    peso_kg           = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
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
    agua_corporal_pct  = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
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


# Solo se conserva porque la migración 0002 lo referencia (el modelo
# ResultadoLaboratorio se eliminó junto con el módulo de obesidad).
def laboratorio_upload_path(instance, filename):
    import os
    _, ext = os.path.splitext(filename)
    return f"laboratorios/{instance.paciente_id}/{instance.id}{ext.lower()}"
