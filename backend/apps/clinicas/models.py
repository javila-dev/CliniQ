from django.db import models

from apps.core.models import BaseModel


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
    telefono = models.CharField(max_length=20, blank=True)
    logo = models.ImageField(upload_to="clinicas/logos/", null=True, blank=True)
    slot_interval_min = models.PositiveIntegerField(default=15)
    recordatorios_automaticos = models.BooleanField(default=True)
    intervalo_recordatorio_horas = models.PositiveIntegerField(default=24)

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
