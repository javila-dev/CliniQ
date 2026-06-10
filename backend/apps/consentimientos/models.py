import secrets

from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel


class PlantillaConsentimiento(BaseModel):
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.PROTECT,
        related_name="plantillas_consentimiento",
    )
    servicio = models.ForeignKey(
        "clinicas.Servicio",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="plantillas_consentimiento",
    )
    nombre = models.CharField(max_length=200)
    contenido_html = models.TextField()
    version = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "plantillas_consentimiento"
        ordering = ["nombre", "-version"]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            original = PlantillaConsentimiento.objects.filter(pk=self.pk).values("contenido_html", "version").first()
            if original and original["contenido_html"] != self.contenido_html:
                self.version = original["version"] + 1
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.nombre} v{self.version}"


class Consentimiento(BaseModel):
    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        FIRMADO = "firmado", "Firmado"
        REVOCADO = "revocado", "Revocado"

    cita = models.ForeignKey(
        "agenda.Cita",
        on_delete=models.PROTECT,
        related_name="consentimientos",
    )
    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.PROTECT,
        related_name="consentimientos",
    )
    plantilla = models.ForeignKey(
        PlantillaConsentimiento,
        on_delete=models.PROTECT,
        related_name="consentimientos",
    )
    contenido_snapshot = models.TextField()
    hash_contenido = models.CharField(max_length=64)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PENDIENTE)
    token = models.CharField(max_length=64, unique=True, null=True, blank=True)
    token_expira = models.DateTimeField(null=True, blank=True)
    firmado_en = models.DateTimeField(null=True, blank=True)
    firma_ip = models.GenericIPAddressField(null=True, blank=True)
    firma_user_agent = models.TextField(blank=True)
    pdf_archivo = models.FileField(upload_to="consentimientos/%Y/%m/", null=True, blank=True)
    revocado_en = models.DateTimeField(null=True, blank=True)
    motivo_revocacion = models.TextField(blank=True)

    class Meta:
        db_table = "consentimientos"
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if self._state.adding and not self.token:
            self.token = secrets.token_hex(32)

        if not self._state.adding:
            original = Consentimiento.objects.filter(pk=self.pk).values(
                "estado",
                "cita_id",
                "paciente_id",
                "plantilla_id",
                "contenido_snapshot",
                "hash_contenido",
            ).first()
            if original and original["estado"] == self.Estado.FIRMADO:
                locked_fields = (
                    original["cita_id"] != self.cita_id
                    or original["paciente_id"] != self.paciente_id
                    or original["plantilla_id"] != self.plantilla_id
                    or original["contenido_snapshot"] != self.contenido_snapshot
                    or original["hash_contenido"] != self.hash_contenido
                )
                if locked_fields:
                    raise ValueError("No se puede modificar un consentimiento firmado.")
        super().save(*args, **kwargs)

    @property
    def token_vigente(self) -> bool:
        return bool(self.token and self.token_expira and self.token_expira > timezone.now())

    def __str__(self) -> str:
        return f"Consentimiento {self.id} - {self.estado}"
