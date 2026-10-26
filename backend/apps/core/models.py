import uuid
from django.conf import settings
from django.db import models


class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    activo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class LogAccion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="log_acciones",
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="log_acciones",
    )
    accion = models.CharField(max_length=100)
    objeto_tipo = models.CharField(max_length=100)
    objeto_id = models.CharField(max_length=100)
    detalle = models.JSONField(default=dict)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["clinica", "created_at"]),
            models.Index(fields=["clinica", "accion"]),
            models.Index(fields=["objeto_tipo", "objeto_id"]),
        ]
        ordering = ["-created_at"]


class ConfiguracionGlobal(models.Model):
    """Fila única con flags de plataforma (no por clínica). Se edita desde /admin.

    Nuevas funcionalidades en construcción nacen apagadas (default=False) y las
    activa un superadmin cuando están listas para todas las clínicas.
    """

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    centro_ayuda_habilitado = models.BooleanField(default=False)
    # Días de prueba gratis al registrarse (ver apps.suscripciones).
    dias_prueba = models.PositiveSmallIntegerField(default=14)
    # Correos automáticos de la prueba (bienvenida, "tu prueba vence"...). Nacen
    # apagados: se encienden cuando se revisen los textos.
    correos_ciclo_vida_habilitados = models.BooleanField(default=False)
    # Lo que tiene una clínica mientras está en prueba (límites y add-ons): la
    # prueba muestra todo y al pagar queda lo del plan elegido. Vacío = sin plan.
    plan_prueba = models.ForeignKey(
        "clinicas.Plan", null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    # Envíos por el número compartido de CliniQ durante toda la prueba (0 = sin límite):
    # sin tope, una prueba que abuse baja la calidad del número de todas las clínicas.
    whatsapp_envios_prueba = models.PositiveIntegerField(default=100)
    # Última vez que terminó `procesar_suscripciones` (tarea programada en Dokploy):
    # la consola avisa si no corre, porque sin ella no salen correos ni cobros.
    suscripciones_procesadas_el = models.DateTimeField(null=True, blank=True)
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "configuracion_global"
        verbose_name = "configuración global"
        verbose_name_plural = "configuración global"

    def __str__(self):
        return "Configuración global"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls) -> "ConfiguracionGlobal":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
