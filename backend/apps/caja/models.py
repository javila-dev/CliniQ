import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class CategoriaGasto(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.PROTECT,
        related_name="categorias_gasto",
    )
    nombre = models.CharField(max_length=100)
    activa = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "categorias_gasto"
        unique_together = [["clinica", "nombre"]]
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre


class GastoCaja(models.Model):
    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        APROBADO = "aprobado", "Aprobado"
        RECHAZADO = "rechazado", "Rechazado"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sede = models.ForeignKey(
        "clinicas.Sede",
        on_delete=models.PROTECT,
        related_name="gastos_caja",
    )
    categoria = models.ForeignKey(
        CategoriaGasto,
        on_delete=models.PROTECT,
        related_name="gastos",
    )
    descripcion = models.CharField(max_length=200)
    valor = models.DecimalField(max_digits=12, decimal_places=2)
    soporte_foto = models.ImageField(upload_to="gastos/%Y/%m/", null=True, blank=True)
    fecha = models.DateField(default=timezone.now)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PENDIENTE)
    motivo_rechazo = models.TextField(blank=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="gastos_registrados",
    )
    aprobado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="gastos_aprobados",
    )
    aprobado_en = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "gastos_caja"
        ordering = ["-fecha", "-created_at"]

    def __str__(self) -> str:
        return f"{self.descripcion} — ${self.valor} [{self.estado}]"

    def clean(self):
        if self.valor and self.valor > 50000 and not self.soporte_foto:
            raise ValidationError(
                {
                    "soporte_foto": "Para gastos mayores a $50.000 el soporte fotográfico es obligatorio."
                }
            )


class CierreCaja(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sede = models.ForeignKey(
        "clinicas.Sede",
        on_delete=models.PROTECT,
        related_name="cierres_caja",
    )
    fecha = models.DateField()
    total_cobros = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_gastos = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    efectivo_contado = models.DecimalField(max_digits=12, decimal_places=2)
    diferencia = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    observaciones = models.TextField(blank=True)
    cerrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cierres_realizados",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cierres_caja"
        unique_together = [["sede", "fecha"]]
        ordering = ["-fecha"]

    def __str__(self) -> str:
        return f"Cierre {self.sede} — {self.fecha}"
