import uuid

from django.conf import settings
from django.db import models


class NotificacionFallida(models.Model):
    """Registro de un envio de WhatsApp (recordatorio, OTP, cotizacion, orden) que n8n no pudo completar."""

    class Tipo(models.TextChoices):
        RECORDATORIO_CITA = "recordatorio_cita", "Recordatorio de cita"
        CHECKIN_OTP = "checkin_otp", "Codigo de check-in"
        ENVIO_COTIZACION = "envio_cotizacion", "Envio de cotizacion"
        ENVIO_FORMULA = "envio_formula", "Envio de orden medica"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="notificaciones_fallidas",
    )
    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notificaciones_fallidas",
    )
    tipo_notificacion = models.CharField(max_length=30, choices=Tipo.choices)
    telefono = models.CharField(max_length=30, blank=True)
    motivo = models.TextField(blank=True)
    resuelta = models.BooleanField(default=False)
    resuelta_en = models.DateTimeField(null=True, blank=True)
    resuelta_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notificaciones_fallidas_resueltas",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notificaciones_fallidas"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["clinica", "resuelta"])]

    def __str__(self):
        return f"{self.tipo_notificacion} · {self.telefono}"
