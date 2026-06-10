from django.db import models

from apps.core.models import BaseModel
from apps.historia_clinica.models import ConsentimientoInformado


HISTORIA_TABS_DISPONIBLES = [
    ("datos-generales", "Datos Generales", True),
    ("motivo-consulta", "Motivo de Consulta", False),
    ("antecedentes", "Antecedentes", False),
    ("examenes", "Examenes", False),
    ("plan-manejo", "Plan de Manejo", False),
    ("ordenes", "Ordenes Medicas", False),
    ("fotos", "Fotos", False),
]


class DocumensoConsentimientoTemplate(BaseModel):
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="documenso_templates",
    )
    tipo = models.CharField(
        max_length=30,
        choices=ConsentimientoInformado.TipoConsentimiento.choices,
    )
    template_token = models.CharField(max_length=500)

    class Meta:
        db_table = "documenso_consentimiento_templates"
        ordering = ["tipo"]
        constraints = [
            models.UniqueConstraint(
                fields=["clinica", "template_token"],
                name="uniq_documenso_template_clinica_token",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.clinica_id}:{self.tipo}"


class ConfiguracionSignosVitales(BaseModel):
    clinica = models.OneToOneField(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="config_signos",
    )
    campos_extra = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "configuracion_signos_vitales"

    def __str__(self) -> str:
        return f"Config signos {self.clinica_id}"


class ConfiguracionHistoria(BaseModel):
    clinica = models.OneToOneField(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="config_historia",
    )
    tabs_activos = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "configuracion_historia"

    def __str__(self) -> str:
        return f"Config historia {self.clinica_id}"
