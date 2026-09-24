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


def plantilla_pdf_upload_path(instance, filename):
    import os
    _, ext = os.path.splitext(filename)
    return f"consentimientos/plantillas/{instance.clinica_id}/{instance.id}{ext.lower()}"


class DocumensoConsentimientoTemplate(BaseModel):
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="documenso_templates",
    )
    nombre = models.CharField(max_length=200, blank=True, default="")
    tipo = models.CharField(
        max_length=30,
        choices=ConsentimientoInformado.TipoConsentimiento.choices,
        blank=True,
        default="",
    )
    template_token = models.CharField(max_length=500, blank=True, default="")
    # PDF subido por el tenant y campos mapeados (nuevo flujo self-service)
    pdf_file = models.FileField(
        upload_to=plantilla_pdf_upload_path,
        null=True,
        blank=True,
    )
    campos = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Lista de campos de firma/texto/fecha/checkbox con posición en el PDF. Cada campo "
            "indica su firmante (paciente|profesional); los del profesional llevan un rol fijo "
            "(firma|nombre|tp) que se llena automáticamente al firmar."
        ),
    )
    requiere_firma_profesional = models.BooleanField(
        default=True,
        help_text=(
            "Si True, el documento lo firma también el profesional que atiende la primera cita. "
            "Si False, se sella solo con la firma del paciente."
        ),
    )

    class Meta:
        db_table = "documenso_consentimiento_templates"
        ordering = ["nombre", "tipo"]
        constraints = [
            models.UniqueConstraint(
                fields=["clinica", "template_token"],
                name="uniq_documenso_template_clinica_token",
                condition=models.Q(template_token__gt=""),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.clinica_id}:{self.tipo}"

    @property
    def roles_profesional_ubicados(self) -> set[str]:
        return {
            campo.get("rol")
            for campo in self.campos or []
            if campo.get("firmante") == "profesional" and campo.get("rol")
        }

    @property
    def campos_profesional_completos(self) -> bool:
        from apps.historia_clinica.documenso_firmantes import ROLES_PROFESIONAL_OBLIGATORIOS

        return ROLES_PROFESIONAL_OBLIGATORIOS <= self.roles_profesional_ubicados

    @property
    def pide_tp_profesional(self) -> bool:
        """El documento lleva el campo de tarjeta profesional: solo lo firma quien tenga TP."""
        from apps.historia_clinica.documenso_firmantes import ROL_TP

        return ROL_TP in self.roles_profesional_ubicados

    @property
    def usa_firma_profesional(self) -> bool:
        """El sobre lleva al profesional como segundo firmante. Una plantilla que lo requiere
        pero aún no tiene la firma del profesional ubicada se sigue usando solo con el paciente."""
        return self.requiere_firma_profesional and self.campos_profesional_completos


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


class ConfiguracionCartera(BaseModel):
    clinica = models.OneToOneField(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="config_cartera",
    )
    # Al aceptar una cotizacion se genera un compromiso de pago estandar
    # (texto fijo, no configurable) pendiente de firma. La clinica solo lo
    # activa o desactiva aqui.
    requiere_consentimiento_promocional = models.BooleanField(default=False)

    class Meta:
        db_table = "configuracion_cartera"

    def __str__(self) -> str:
        return f"Config cartera {self.clinica_id}"


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


class ConfiguracionWizard(BaseModel):
    clinica = models.OneToOneField(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="config_wizard",
    )
    paso_checkin = models.BooleanField(default=True)
    paso_consentimientos = models.BooleanField(default=True)
    paso_pago = models.BooleanField(default=True)
    paso_firma_asistencia = models.BooleanField(default=True)
    paso_verificacion_facial = models.BooleanField(default=False)
    foto_control_obligatoria = models.BooleanField(
        default=False,
        help_text=(
            "Si True, al registrar un paciente la foto de control facial es "
            "obligatoria y el recepcionista no puede omitir el paso."
        ),
    )

    class Meta:
        db_table = "configuracion_wizard"

    def __str__(self) -> str:
        return f"Config wizard {self.clinica_id}"


class ConfiguracionRegistroPublico(BaseModel):
    clinica = models.OneToOneField(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="config_registro_publico",
    )
    tab_personal_requerido = models.BooleanField(
        default=False,
        help_text="Si True, el tab Datos personales es obligatorio en el autoregistro publico.",
    )
    tab_salud_requerido = models.BooleanField(
        default=False,
        help_text="Si True, el tab Salud y afiliacion es obligatorio en el autoregistro publico.",
    )

    class Meta:
        db_table = "configuracion_registro_publico"

    def __str__(self) -> str:
        return f"Config registro publico {self.clinica_id}"
