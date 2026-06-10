import uuid
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


class Cotizacion(BaseModel):
    class Estado(models.TextChoices):
        BORRADOR = "borrador", "Borrador"
        ACEPTADA = "aceptada", "Aceptada"
        VENCIDA = "vencida", "Vencida"

    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="cotizaciones",
    )
    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.CASCADE,
        related_name="cotizaciones",
    )
    profesional = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="cotizaciones_creadas",
    )
    sede = models.ForeignKey(
        "clinicas.Sede",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cotizaciones",
    )
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.BORRADOR)
    validez_dias = models.PositiveIntegerField(default=30)
    notas = models.TextField(blank=True, default="")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._estado_anterior = self.estado

    class Meta:
        db_table = "cotizaciones"
        ordering = ["-created_at"]

    @property
    def fecha_vencimiento(self):
        return (self.created_at + timedelta(days=self.validez_dias)).date()

    @property
    def total(self):
        return sum((item.subtotal for item in self.items.filter(activo=True)), Decimal("0.00"))

    def __str__(self) -> str:
        return f"Cotizacion {self.id} - {self.paciente.nombre_completo}"


class CotizacionEnvio(models.Model):
    class Canal(models.TextChoices):
        WHATSAPP = "whatsapp", "WhatsApp"
        EMAIL = "email", "Correo electronico"
        PDF = "pdf", "PDF descargado"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cotizacion = models.ForeignKey(
        Cotizacion,
        on_delete=models.CASCADE,
        related_name="envios",
    )
    canal = models.CharField(max_length=20, choices=Canal.choices)
    destinatario = models.CharField(max_length=200, blank=True)
    enviado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cotizaciones_enviadas",
    )
    notas = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cotizaciones_envios"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.canal} - {self.cotizacion_id}"


class ItemCotizacion(BaseModel):
    class Tipo(models.TextChoices):
        TRATAMIENTO = "tratamiento", "Tratamiento del catalogo"
        PROCEDIMIENTO = "procedimiento", "Procedimiento individual"
        LIBRE = "libre", "Item libre"

    cotizacion = models.ForeignKey(
        Cotizacion,
        on_delete=models.CASCADE,
        related_name="items",
    )
    tipo = models.CharField(max_length=20, choices=Tipo.choices, default=Tipo.LIBRE)
    servicio = models.ForeignKey(
        "clinicas.Servicio",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="items_cotizacion",
    )
    tratamiento = models.ForeignKey(
        "clinicas.TratamientoCatalogo",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="items_cotizacion",
    )
    procedimiento = models.ForeignKey(
        "clinicas.Servicio",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="items_cotizacion_procedimiento",
    )
    descripcion = models.CharField(max_length=300)
    num_citas = models.PositiveIntegerField(default=1)
    duracion_estimada = models.CharField(max_length=100, blank=True)
    periodicidad = models.CharField(max_length=100, blank=True)
    valor_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    descuento_porcentaje = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    class Meta:
        db_table = "items_cotizacion"
        ordering = ["created_at"]

    @property
    def subtotal(self):
        base = Decimal(self.num_citas) * self.valor_unitario
        descuento = (base * self.descuento_porcentaje) / Decimal("100.00")
        return base - descuento

    def citas_no_canceladas(self):
        return self.citas.exclude(estado="cancelada").count()

    def citas_restantes(self):
        return max(0, self.num_citas - self.citas_no_canceladas())


class FormaPagoCotizacion(BaseModel):
    class Tipo(models.TextChoices):
        EFECTIVO = "efectivo", "Efectivo"
        TRANSFERENCIA = "transferencia", "Transferencia"
        TARJETA_CREDITO = "tarjeta_credito", "Tarjeta de crédito"
        TARJETA_DEBITO = "tarjeta_debito", "Tarjeta de débito"
        CUOTAS = "cuotas", "Cuotas"
        FINANCIAMIENTO = "financiamiento", "Financiamiento"

    cotizacion = models.ForeignKey(
        Cotizacion,
        on_delete=models.CASCADE,
        related_name="formas_pago",
    )
    tipo = models.CharField(max_length=30, choices=Tipo.choices)
    descripcion = models.CharField(max_length=200, blank=True)
    valor = models.DecimalField(max_digits=12, decimal_places=2)
    fecha = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "formas_pago_cotizacion"
        ordering = ["created_at"]
