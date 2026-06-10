import os
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel


def default_expira_en():
    return timezone.now() + timedelta(hours=48)


def cita_checkin_upload_path(instance, filename):
    _, ext = os.path.splitext(filename)
    hoy = timezone.now()
    return f"checkin_citas/{hoy.year}/{hoy.month:02d}/{instance.id}{ext.lower() or '.jpg'}"


def cita_checkin_otp_expira_en():
    return timezone.now() + timedelta(minutes=5)


class Cita(BaseModel):
    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        CONFIRMADA = "confirmada", "Confirmada"
        EN_ESPERA = "en_espera", "En espera"
        EN_CURSO = "en_curso", "En curso"
        COMPLETADA = "completada", "Completada"
        CANCELADA = "cancelada", "Cancelada"
        NO_ASISTIO = "no_asistio", "No asistio"

    class EstadoConfirmacion(models.TextChoices):
        SIN_ENVIAR = "sin_enviar", "Sin enviar"
        ENVIADO = "enviado", "Enviado"
        CONFIRMADO = "confirmado", "Confirmado"
        SIN_RESPUESTA = "sin_respuesta", "Sin respuesta"

    class CanalConfirmacion(models.TextChoices):
        WHATSAPP = "whatsapp", "WhatsApp"
        SMS = "sms", "SMS"
        LLAMADA = "llamada", "Llamada"

    class CanalOrigen(models.TextChoices):
        PRESENCIAL = "presencial", "Presencial"
        TELEFONO = "telefono", "Telefono"
        WEB = "web", "Web"
        REDES = "redes", "Redes"

    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.PROTECT,
        related_name="citas",
    )
    sede = models.ForeignKey(
        "clinicas.Sede",
        on_delete=models.PROTECT,
        related_name="citas",
    )
    servicio = models.ForeignKey(
        "clinicas.Servicio",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="citas",
    )
    servicio_nombre = models.CharField(max_length=200, blank=True)
    duracion_min = models.PositiveIntegerField(null=True, blank=True)
    motivo = models.CharField(max_length=500, blank=True)
    profesional = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="citas_asignadas",
        limit_choices_to={"es_profesional": True},
    )
    fecha_inicio = models.DateTimeField()
    fecha_fin = models.DateTimeField()
    fecha_inicio_real = models.DateTimeField(null=True, blank=True)
    fecha_fin_real = models.DateTimeField(null=True, blank=True)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PENDIENTE)
    estado_confirmacion = models.CharField(
        max_length=20,
        choices=EstadoConfirmacion.choices,
        default=EstadoConfirmacion.SIN_ENVIAR,
    )
    canal_confirmacion = models.CharField(max_length=20, choices=CanalConfirmacion.choices)
    canal_origen = models.CharField(
        max_length=20,
        choices=CanalOrigen.choices,
        default=CanalOrigen.PRESENCIAL,
    )
    notas_internas = models.TextField(blank=True)
    motivo_cancelacion = models.TextField(blank=True)
    confirmado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="citas_confirmadas_manual",
    )
    confirmado_en = models.DateTimeField(null=True, blank=True)
    recordatorio_enviado = models.BooleanField(default=False)
    recordatorio_manual_pendiente = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="citas_creadas",
    )
    item_cotizacion = models.ForeignKey(
        "cotizaciones.ItemCotizacion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="citas",
    )

    class CheckinMetodo(models.TextChoices):
        OTP_WHATSAPP = "otp_whatsapp", "OTP WhatsApp"
        FOTO_PRESENCIAL = "foto_presencial", "Foto presencial"

    checkin_metodo = models.CharField(max_length=20, choices=CheckinMetodo.choices, null=True, blank=True)
    checkin_en = models.DateTimeField(null=True, blank=True)
    checkin_ip = models.GenericIPAddressField(null=True, blank=True)
    checkin_foto = models.ImageField(upload_to=cita_checkin_upload_path, null=True, blank=True)
    checkin_foto_url = models.CharField(max_length=2048, blank=True)

    class Meta:
        db_table = "citas"
        ordering = ["fecha_inicio"]
        indexes = [
            models.Index(fields=["profesional", "fecha_inicio"]),
            models.Index(fields=["sede", "fecha_inicio"]),
            models.Index(fields=["paciente", "fecha_inicio"]),
        ]

    def __str__(self) -> str:
        return f"{self.paciente.nombre_completo} - {self.fecha_inicio}"


class CitaCheckinOTP(models.Model):
    cita = models.OneToOneField(Cita, on_delete=models.CASCADE, related_name="otp")
    codigo = models.CharField(max_length=6)
    expira_en = models.DateTimeField(default=cita_checkin_otp_expira_en)
    usado = models.BooleanField(default=False)
    intentos = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cita_checkin_otps"

    def esta_vigente(self):
        return not self.usado and self.expira_en > timezone.now() and self.intentos < 3


class BloqueoAgenda(BaseModel):
    profesional = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="bloqueos_agenda",
        limit_choices_to={"es_profesional": True},
    )
    sede = models.ForeignKey(
        "clinicas.Sede",
        on_delete=models.PROTECT,
        related_name="bloqueos_agenda",
    )
    fecha_inicio = models.DateTimeField()
    fecha_fin = models.DateTimeField()
    motivo = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "bloqueos_agenda"
        ordering = ["fecha_inicio"]

    def __str__(self) -> str:
        return f"Bloqueo {self.profesional} - {self.fecha_inicio}"


class ConfirmacionToken(BaseModel):
    cita = models.ForeignKey(
        Cita,
        on_delete=models.CASCADE,
        related_name="tokens",
    )
    token = models.CharField(max_length=128, unique=True)
    usado = models.BooleanField(default=False)
    expira_en = models.DateTimeField(default=default_expira_en)

    class Meta:
        db_table = "confirmacion_tokens"
        ordering = ["-created_at"]

    def esta_vigente(self) -> bool:
        return not self.usado and self.expira_en > timezone.now()


class RegistroConfirmacion(BaseModel):
    class Medio(models.TextChoices):
        WHATSAPP = "whatsapp", "WhatsApp"
        LLAMADA = "llamada", "Llamada telefonica"
        SMS = "sms", "SMS"
        PRESENCIAL = "presencial", "Presencial"
        LINK = "link", "Link de confirmacion"
        EMAIL = "email", "Email"

    cita = models.ForeignKey(
        Cita,
        on_delete=models.CASCADE,
        related_name="registros_confirmacion",
    )
    estado_resultante = models.CharField(max_length=20)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="registros_confirmacion_citas",
    )
    usuario_nombre = models.CharField(max_length=200, blank=True)
    medio = models.CharField(max_length=20, choices=Medio.choices, blank=True)
    nota = models.TextField(blank=True)

    class Meta:
        db_table = "registros_confirmacion"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.cita_id} - {self.estado_resultante} - {self.created_at}"
