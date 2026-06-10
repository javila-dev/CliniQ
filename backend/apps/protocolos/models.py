import os
from datetime import date, timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel
from apps.core.storage import delete_private_file


def checkin_upload_path(instance, filename):
    _, ext = os.path.splitext(filename)
    hoy = timezone.now()
    return f"checkin/{hoy.year}/{hoy.month:02d}/{instance.id}{ext.lower() or '.jpg'}"


def checkin_otp_default_expira_en():
    return timezone.now() + timedelta(minutes=10)


class TratamientoPaciente(BaseModel):
    class Estado(models.TextChoices):
        ACTIVO = "activo", "Activo"
        COMPLETADO = "completado", "Completado"
        ABANDONADO = "abandonado", "Abandonado"

    paciente = models.ForeignKey("pacientes.Paciente", on_delete=models.PROTECT, related_name="tratamientos")
    servicio = models.ForeignKey(
        "clinicas.Servicio",
        on_delete=models.PROTECT,
        related_name="tratamientos",
        null=True,
        blank=True,
    )
    tratamiento_catalogo = models.ForeignKey(
        "clinicas.TratamientoCatalogo",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="ejecuciones",
    )
    cotizacion_item = models.ForeignKey(
        "cotizaciones.ItemCotizacion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tratamientos_paciente",
    )
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.ACTIVO)
    fecha_inicio = models.DateField(default=date.today)

    class Meta:
        db_table = "tratamientos_paciente"
        ordering = ["-fecha_inicio", "-created_at"]

    @property
    def total_pasos(self):
        return self.sesiones.count()

    @property
    def pasos_completados(self):
        return self.sesiones.filter(estado=SesionProcedimiento.Estado.COMPLETADO).count()

    @property
    def total_sesiones(self):
        return self.sesiones.filter(tipo_sesion__es_compromiso=True).count()

    @property
    def sesiones_completadas(self):
        return self.sesiones.filter(
            tipo_sesion__es_compromiso=True,
            estado=SesionProcedimiento.Estado.COMPLETADO,
        ).count()

    @property
    def progreso_pct(self):
        total = self.total_pasos
        if total == 0:
            return 0
        return round((self.pasos_completados / total) * 100)

    def __str__(self) -> str:
        nombre = self.tratamiento_catalogo.nombre if self.tratamiento_catalogo_id else self.servicio.nombre
        return f"{self.paciente.nombre_completo} - {nombre}"


class SesionProcedimiento(BaseModel):
    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        COMPLETADO = "completado", "Completado"
        INASISTENCIA = "inasistencia", "Inasistencia"

    class CheckinMetodo(models.TextChoices):
        OTP_WHATSAPP = "otp_whatsapp", "OTP WhatsApp"
        FOTO_PRESENCIAL = "foto_presencial", "Foto presencial"

    tratamiento = models.ForeignKey(TratamientoPaciente, on_delete=models.CASCADE, related_name="sesiones")
    tipo_sesion = models.ForeignKey(
        "clinicas.TipoSesion",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sesiones_ejecutadas",
    )
    numero = models.PositiveSmallIntegerField(default=1)
    paso = models.ForeignKey(
        "clinicas.PasoProtocolo",
        on_delete=models.PROTECT,
        related_name="sesiones_protocolo",
        null=True,
        blank=True,
    )
    procedimiento = models.ForeignKey(
        "clinicas.Servicio",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sesiones_tratamiento",
    )
    cita = models.ForeignKey(
        "agenda.Cita",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sesiones_protocolo",
    )
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PENDIENTE)
    fecha = models.DateField(null=True, blank=True)
    hora = models.TimeField(null=True, blank=True)
    profesional = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sesiones_ejecutadas",
    )
    observaciones = models.TextField(blank=True)
    procedimientos_ejecutados = models.ManyToManyField(
        "clinicas.Servicio",
        blank=True,
        related_name="sesiones_completadas",
    )
    consentimientos_verificados = models.ManyToManyField(
        "protocolos.ConsentimientoPaciente",
        blank=True,
        related_name="sesiones",
    )
    forzado_sin_consentimiento = models.BooleanField(default=False)
    motivo_forzado = models.TextField(blank=True)
    checkin_metodo = models.CharField(max_length=20, choices=CheckinMetodo.choices, null=True, blank=True)
    checkin_en = models.DateTimeField(null=True, blank=True)
    checkin_ip = models.GenericIPAddressField(null=True, blank=True)
    foto_presencia = models.ImageField(upload_to=checkin_upload_path, null=True, blank=True)
    foto_presencia_url = models.CharField(max_length=2048, blank=True)

    class Meta:
        db_table = "sesiones_procedimiento"
        ordering = ["paso__orden", "created_at"]

    @property
    def checkin_verificado(self):
        return self.checkin_metodo is not None

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        current_path = self.foto_presencia.name if self.foto_presencia else ""
        if current_path != self.foto_presencia_url:
            self.foto_presencia_url = current_path
            type(self).objects.filter(pk=self.pk).update(foto_presencia_url=current_path)

    def delete(self, *args, **kwargs):
        if self.foto_presencia_url:
            delete_private_file(self.foto_presencia_url)
        return super().delete(*args, **kwargs)

    def __str__(self) -> str:
        nombre = self.procedimiento.nombre if self.procedimiento_id else self.paso.nombre
        return f"{self.tratamiento} - {nombre}"


class CheckinOTP(models.Model):
    sesion = models.OneToOneField(SesionProcedimiento, on_delete=models.CASCADE, related_name="otp")
    codigo = models.CharField(max_length=6)
    expira_en = models.DateTimeField(default=checkin_otp_default_expira_en)
    usado = models.BooleanField(default=False)
    intentos = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "checkin_otps"

    def esta_vigente(self):
        return not self.usado and self.expira_en > timezone.now() and self.intentos < 3


class ConsentimientoPaciente(BaseModel):
    class Metodo(models.TextChoices):
        DOCUMENSO = "documenso", "Firma digital Documenso"
        PRESENCIAL_PDF = "presencial_pdf", "Documento fisico escaneado"
        PRESENCIAL_CONFIRMADO = "presencial_confirmado", "Confirmacion del profesional"

    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.PROTECT,
        related_name="consentimientos_protocolos",
    )
    template_token = models.CharField(max_length=200)
    template_nombre = models.CharField(max_length=200)
    procedimiento = models.ForeignKey(
        "clinicas.Servicio",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="consentimientos_pacientes",
    )
    fecha_firma = models.DateField()
    vigencia_hasta = models.DateField()
    metodo = models.CharField(max_length=30, choices=Metodo.choices)
    archivo = models.FileField(upload_to="consentimientos_paciente/", null=True, blank=True)
    documenso_envelope_id = models.CharField(max_length=200, blank=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="consentimientos_registrados",
    )
    notas = models.TextField(blank=True)

    class Meta:
        db_table = "protocolos_consentimiento_paciente"
        ordering = ["-fecha_firma", "-created_at"]

    @property
    def vigente(self):
        return self.vigencia_hasta >= date.today()

    def __str__(self) -> str:
        return f"{self.paciente_id}:{self.template_token}"
