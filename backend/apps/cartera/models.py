from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Sum
from django.utils import timezone

from apps.core.models import BaseModel


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
        return self.cuotas.filter(pagada=True).aggregate(s=Sum("valor_pagado"))["s"] or Decimal("0")

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
    def vencida(self):
        return not self.pagada and self.fecha_esperada and self.fecha_esperada < timezone.localdate()

    def __str__(self) -> str:
        return f"Cuota {self.id} - {self.cartera_id}"
