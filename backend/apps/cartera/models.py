from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import DecimalField, ExpressionWrapper, F, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.core.models import BaseModel

# Saldo pendiente de una cuota = valor esperado - lo abonado (aunque `pagada`
# siga en False por tratarse de un abono parcial).
CUOTA_PENDIENTE_EXPR = ExpressionWrapper(
    F("valor_esperado") - Coalesce("valor_pagado", Value(Decimal("0"))),
    output_field=DecimalField(max_digits=14, decimal_places=2),
)


class Cartera(BaseModel):
    cotizacion = models.OneToOneField(
        "cotizaciones.Cotizacion",
        on_delete=models.CASCADE,
        related_name="cartera",
    )
    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.CASCADE,
        related_name="carteras",
    )
    total = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "carteras"
        ordering = ["-created_at"]

    @property
    def total_pagado(self):
        # Suma todo lo abonado, incluidos abonos parciales sobre cuotas que
        # todavía no están cerradas (pagada=False).
        return self.cuotas.aggregate(
            s=Sum(Coalesce("valor_pagado", Value(Decimal("0"))))
        )["s"] or Decimal("0")

    @property
    def saldo_pendiente(self):
        return self.total - self.total_pagado

    def __str__(self) -> str:
        return f"Cartera {self.id} - {self.paciente.nombre_completo}"


class CuotaCartera(BaseModel):
    class Tipo(models.TextChoices):
        EFECTIVO = "efectivo", "Efectivo"
        TRANSFERENCIA = "transferencia", "Transferencia"
        CUOTAS = "cuotas", "Cuotas"
        FINANCIAMIENTO = "financiamiento", "Financiamiento"

    cartera = models.ForeignKey(
        Cartera,
        on_delete=models.CASCADE,
        related_name="cuotas",
    )
    tipo = models.CharField(max_length=30, choices=Tipo.choices)
    descripcion = models.CharField(max_length=200, blank=True)
    valor_esperado = models.DecimalField(max_digits=14, decimal_places=2)
    fecha_esperada = models.DateField(null=True, blank=True)
    pagada = models.BooleanField(default=False)
    valor_pagado = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    fecha_pago = models.DateField(null=True, blank=True)
    medio_pago = models.CharField(max_length=50, blank=True)
    observaciones = models.CharField(max_length=300, blank=True)
    excepcion_aprobada = models.BooleanField(
        default=False,
        help_text="Si True, se permite agendar citas aunque la cuota esté vencida.",
    )
    aprobada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cuotas_cartera_aprobadas",
    )
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cuotas_cartera_registradas",
    )

    class Meta:
        db_table = "cuotas_cartera"
        ordering = ["fecha_esperada", "created_at"]

    @property
    def saldo_pendiente(self):
        """Lo que falta por cobrar de esta cuota (descontando abonos)."""
        return Decimal(self.valor_esperado) - Decimal(self.valor_pagado or 0)

    @property
    def cubierta(self):
        """True si ya se cobró el total esperado (con o sin la bandera `pagada`)."""
        return self.saldo_pendiente <= 0

    @property
    def vencida(self):
        return (
            self.saldo_pendiente > 0
            and self.fecha_esperada is not None
            and self.fecha_esperada < timezone.localdate()
        )

    def __str__(self) -> str:
        return f"Cuota {self.id} - {self.cartera_id}"


class CuotaCarteraLog(models.Model):
    cuota = models.ForeignKey(
        CuotaCartera,
        on_delete=models.CASCADE,
        related_name="logs",
    )
    campo = models.CharField(max_length=50)
    valor_anterior = models.TextField()
    valor_nuevo = models.TextField()
    modificado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cuota_cartera_logs",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cuota_cartera_logs"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Log {self.campo} cuota {self.cuota_id}"
