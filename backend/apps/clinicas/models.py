import os
import secrets

from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel


def generate_token_registro_publico():
    return secrets.token_urlsafe(24)


class RegistroPendiente(models.Model):
    """
    Almacena una solicitud de registro antes de verificar el email.
    Se convierte en Clinica + User al confirmar el token.
    """
    token = models.CharField(max_length=100, unique=True, editable=False)
    nombre_clinica = models.CharField(max_length=255)
    nit = models.CharField(max_length=50)
    nombre_admin = models.CharField(max_length=150)
    apellido_admin = models.CharField(max_length=150)
    email = models.EmailField()
    telefono = models.CharField(max_length=30)
    expires_at = models.DateTimeField()
    usado_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "registros_pendientes"

    def is_valid(self) -> bool:
        return self.usado_at is None and self.expires_at > timezone.now()

    @classmethod
    def create(cls, **kwargs) -> "RegistroPendiente":
        from datetime import timedelta
        return cls.objects.create(
            token=secrets.token_urlsafe(48),
            expires_at=timezone.now() + timedelta(hours=24),
            **kwargs,
        )


class Plan(BaseModel):
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)
    max_usuarios = models.PositiveIntegerField(
        default=0,
        help_text="Numero maximo de usuarios activos. 0 significa sin limite.",
    )
    max_sedes = models.PositiveIntegerField(
        default=0,
        help_text="Numero maximo de sedes activas. 0 significa sin limite.",
    )
    precio = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Precio mensual del plan. Null si es gratuito o no aplica.",
    )

    class Meta:
        db_table = "planes"
        ordering = ["max_usuarios", "nombre"]

    def __str__(self) -> str:
        limite = f"{self.max_usuarios} usuarios" if self.max_usuarios > 0 else "sin limite"
        return f"{self.nombre} ({limite})"


class Clinica(BaseModel):
    plan = models.ForeignKey(
        Plan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinicas",
    )
    nombre = models.CharField(max_length=255)
    nit = models.CharField(max_length=50, unique=True)
    email = models.EmailField(blank=True, default="")
    telefono = models.CharField(max_length=30, blank=True)
    logo = models.ImageField(upload_to="clinicas/logos/", null=True, blank=True)
    slot_interval_min = models.PositiveIntegerField(default=15)
    recordatorios_automaticos = models.BooleanField(default=True)
    intervalo_recordatorio_horas = models.PositiveIntegerField(default=24)
    bloquear_agenda_por_deuda = models.BooleanField(
        default=False,
        help_text="Si True, impide crear citas a pacientes con cuotas vencidas.",
    )
    dias_gracia_deuda = models.PositiveIntegerField(
        default=0,
        help_text="Días de gracia después del vencimiento antes de bloquear la agenda.",
    )
    token_registro_publico = models.CharField(
        max_length=64,
        unique=True,
        default=generate_token_registro_publico,
        editable=False,
        help_text="Token permanente para el link de autoregistro publico de pacientes.",
    )
    trial_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Fecha de expiración del período de prueba. Null si tiene plan asignado.",
    )
    onboarding_completado = models.BooleanField(
        default=False,
        help_text="True cuando el admin completa el wizard de configuración inicial.",
    )
    facial_verificacion_habilitada = models.BooleanField(
        default=False,
        help_text="Habilita el módulo de verificación facial biométrica. Add-on de pago activado por superadmin.",
    )
    modulo_estetico_habilitado = models.BooleanField(
        default=True,
        help_text="Habilita el módulo estético (procedimientos, zonas corporales). Activado por defecto.",
    )
    modulo_obesidad_habilitado = models.BooleanField(
        default=False,
        help_text="Habilita el módulo de obesidad (tratamientos, sesiones, control de peso). Activado por superadmin.",
    )

    class Meta:
        db_table = "clinicas"
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre


class Sede(BaseModel):
    clinica = models.ForeignKey(
        Clinica,
        on_delete=models.PROTECT,
        related_name="sedes",
    )
    nombre = models.CharField(max_length=255)
    ciudad = models.CharField(max_length=120)
    direccion = models.CharField(max_length=255)
    telefono = models.CharField(max_length=20)
    horario = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "sedes"
        unique_together = (("clinica", "nombre"),)
        ordering = ["nombre"]

    def __str__(self) -> str:
        return f"{self.nombre} - {self.clinica.nombre}"


class Servicio(BaseModel):
    clinica = models.ForeignKey(
        Clinica,
        on_delete=models.PROTECT,
        related_name="servicios",
    )
    nombre = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    duracion_min = models.PositiveIntegerField()
    precio = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    precio_base = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Precio fijo de catalogo para cotizaciones. Si se configura, bloquea el precio en los items de cotizacion.",
    )
    vigencia_meses = models.PositiveIntegerField(default=12)
    tiene_protocolo = models.BooleanField(default=False)
    consentimientos_requeridos = models.ManyToManyField(
        "configuracion.DocumensoConsentimientoTemplate",
        through="ServicioConsentimiento",
        blank=True,
        related_name="servicios",
    )

    class Meta:
        db_table = "servicios"
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre


class ServicioConsentimiento(BaseModel):
    servicio = models.ForeignKey(
        Servicio,
        on_delete=models.CASCADE,
        related_name="consentimientos_requeridos_set",
    )
    template = models.ForeignKey(
        "configuracion.DocumensoConsentimientoTemplate",
        on_delete=models.PROTECT,
        related_name="servicios_que_lo_requieren",
    )
    orden = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "servicios_consentimientos"
        ordering = ["orden", "created_at"]
        unique_together = (("servicio", "template"),)

    def __str__(self) -> str:
        return f"{self.servicio.nombre} -> {self.template.template_token}"


class PasoProtocolo(BaseModel):
    servicio = models.ForeignKey(
        Servicio,
        on_delete=models.CASCADE,
        related_name="pasos_protocolo",
    )
    orden = models.PositiveIntegerField()
    nombre = models.CharField(max_length=255)
    semana = models.PositiveIntegerField(null=True, blank=True)
    es_control = models.BooleanField(default=False)

    class Meta:
        db_table = "pasos_protocolo"
        ordering = ["orden", "created_at"]
        unique_together = (("servicio", "orden"),)

    def __str__(self) -> str:
        return f"{self.servicio.nombre} - {self.orden}. {self.nombre}"


class TratamientoCatalogo(BaseModel):
    clinica = models.ForeignKey(
        Clinica,
        on_delete=models.PROTECT,
        related_name="tratamientos_catalogo",
    )
    nombre = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    precio_estimado = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = "clinicas_tratamiento_catalogo"
        ordering = ["nombre"]

    @property
    def total_sesiones(self) -> int:
        return sum(tipo.cantidad for tipo in self.tipos_sesion.filter(activo=True))

    def __str__(self) -> str:
        return self.nombre


class TratamientoProcedimiento(BaseModel):
    tratamiento = models.ForeignKey(
        TratamientoCatalogo,
        on_delete=models.CASCADE,
        related_name="items",
    )
    procedimiento = models.ForeignKey(
        Servicio,
        on_delete=models.PROTECT,
        related_name="tratamientos_catalogo",
    )
    cantidad = models.PositiveIntegerField(default=1)
    orden = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "clinicas_tratamiento_procedimiento"
        ordering = ["orden", "created_at"]
        unique_together = (("tratamiento", "procedimiento"),)

    def __str__(self) -> str:
        return f"{self.tratamiento.nombre} - {self.procedimiento.nombre}"


class TipoSesion(BaseModel):
    tratamiento = models.ForeignKey(
        TratamientoCatalogo,
        on_delete=models.CASCADE,
        related_name="tipos_sesion",
    )
    nombre = models.CharField(max_length=255)
    cantidad = models.PositiveIntegerField(default=1)
    orden = models.PositiveIntegerField(default=1)
    es_compromiso = models.BooleanField(default=True)
    duracion_min = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "clinicas_tipo_sesion"
        ordering = ["orden", "created_at"]

    def __str__(self) -> str:
        return f"{self.tratamiento.nombre} - {self.nombre}"


class TipoSesionProcedimiento(BaseModel):
    tipo_sesion = models.ForeignKey(
        TipoSesion,
        on_delete=models.CASCADE,
        related_name="procedimientos",
    )
    procedimiento = models.ForeignKey(
        Servicio,
        on_delete=models.PROTECT,
        related_name="tipos_sesion",
    )
    orden = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "clinicas_tipo_sesion_procedimiento"
        ordering = ["orden", "created_at"]
        unique_together = (("tipo_sesion", "procedimiento"),)

    def __str__(self) -> str:
        return f"{self.tipo_sesion.nombre} - {self.procedimiento.nombre}"


Procedimiento = Servicio


class Campana(BaseModel):
    clinica = models.ForeignKey(
        Clinica,
        on_delete=models.CASCADE,
        related_name="campanas",
    )
    nombre = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    sedes = models.ManyToManyField(
        Sede,
        blank=True,
        related_name="campanas",
        help_text="Sedes donde aplica la campaña. Vacío = todas las sedes.",
    )

    class Meta:
        db_table = "campanas"
        ordering = ["-fecha_inicio"]

    def __str__(self) -> str:
        return f"{self.nombre} ({self.fecha_inicio} - {self.fecha_fin})"


class CampanaItem(BaseModel):
    campana = models.ForeignKey(
        Campana,
        on_delete=models.CASCADE,
        related_name="items",
    )
    procedimiento = models.ForeignKey(
        Servicio,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="campana_items",
    )
    tratamiento = models.ForeignKey(
        TratamientoCatalogo,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="campana_items",
    )
    precio_campana = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "campana_items"
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(procedimiento__isnull=False) | models.Q(tratamiento__isnull=False)
                ),
                name="campana_item_requires_target",
            )
        ]

    def __str__(self) -> str:
        target = self.procedimiento or self.tratamiento
        return f"{self.campana.nombre} — {target}"


def diagrama_upload_path(instance, filename):
    _, ext = os.path.splitext(filename)
    return f"diagramas_corporales/{instance.id}{ext.lower()}"


class DiagramaCorporal(BaseModel):
    nombre = models.CharField(max_length=255)
    imagen = models.ImageField(upload_to=diagrama_upload_path)
    orden = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "diagramas_corporales"
        ordering = ["orden", "nombre"]

    def __str__(self) -> str:
        return self.nombre


class ServicioDiagrama(BaseModel):
    """Legado — reemplazado por ServicioGrupoZonas. Mantener para migración."""
    servicio = models.ForeignKey(
        Servicio,
        on_delete=models.CASCADE,
        related_name="diagramas",
    )
    diagrama = models.ForeignKey(
        DiagramaCorporal,
        on_delete=models.PROTECT,
        related_name="servicios",
    )
    orden = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "servicios_diagramas"
        ordering = ["orden", "created_at"]
        unique_together = (("servicio", "diagrama"),)

    def __str__(self) -> str:
        return f"{self.servicio.nombre} → {self.diagrama.nombre}"


class GrupoZonas(BaseModel):
    nombre = models.CharField(max_length=255, unique=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "grupos_zonas"
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre


class GrupoZonasDiagrama(BaseModel):
    grupo = models.ForeignKey(
        GrupoZonas,
        on_delete=models.CASCADE,
        related_name="diagramas",
    )
    diagrama = models.ForeignKey(
        DiagramaCorporal,
        on_delete=models.PROTECT,
        related_name="grupos",
    )
    orden = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "grupos_zonas_diagramas"
        ordering = ["orden"]
        unique_together = (("grupo", "diagrama"),)

    def __str__(self) -> str:
        return f"{self.grupo.nombre} → {self.diagrama.nombre}"


class ServicioGrupoZonas(BaseModel):
    servicio = models.ForeignKey(
        Servicio,
        on_delete=models.CASCADE,
        related_name="grupos_zonas",
    )
    grupo = models.ForeignKey(
        GrupoZonas,
        on_delete=models.PROTECT,
        related_name="servicios",
    )
    orden = models.PositiveIntegerField(default=1)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "servicios_grupos_zonas"
        ordering = ["orden"]
        unique_together = (("servicio", "grupo"),)

    def __str__(self) -> str:
        return f"{self.servicio.nombre} → {self.grupo.nombre}"
