import uuid

from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


class CategoriaInsumo(BaseModel):
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.PROTECT,
        related_name="categorias_insumos",
    )
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)

    class Meta:
        db_table = "categorias_insumos"
        unique_together = (("clinica", "nombre"),)
        ordering = ["nombre"]

    def __str__(self) -> str:
        return f"{self.nombre} ({self.clinica})"


class Insumo(BaseModel):
    class UnidadMedida(models.TextChoices):
        UNIDAD = "unidad", "Unidad"
        ML = "ml", "ml"
        GR = "gr", "gr"
        CM = "cm", "cm"
        PAR = "par", "Par"
        CAJA = "caja", "Caja"

    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.PROTECT,
        related_name="insumos",
    )
    categoria = models.ForeignKey(
        CategoriaInsumo,
        on_delete=models.PROTECT,
        related_name="insumos",
    )
    nombre = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True)
    es_consumo_interno = models.BooleanField(default=True)
    es_venta_retail = models.BooleanField(default=False)
    unidad_medida = models.CharField(max_length=20, choices=UnidadMedida.choices)
    stock_actual = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    stock_minimo = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    costo_promedio = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    precio_venta = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    requiere_lote = models.BooleanField(default=False)

    class Meta:
        db_table = "insumos"
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre

    def clean(self):
        from django.core.exceptions import ValidationError
        if not self.es_consumo_interno and not self.es_venta_retail:
            raise ValidationError("El insumo debe ser de consumo interno, venta retail, o ambos.")

    @property
    def stock_bajo(self) -> bool:
        return self.stock_actual <= self.stock_minimo

    @property
    def valor_stock(self):
        return self.stock_actual * self.costo_promedio


class MovimientoInventario(models.Model):
    class TipoMovimiento(models.TextChoices):
        ENTRADA = "entrada", "Entrada"
        SALIDA = "salida", "Salida"
        AJUSTE_POSITIVO = "ajuste_positivo", "Ajuste positivo"
        AJUSTE_NEGATIVO = "ajuste_negativo", "Ajuste negativo"
        BAJA = "baja", "Baja"

    class OrigenMovimiento(models.TextChoices):
        COMPRA = "compra", "Compra"
        CONSUMO_CITA = "consumo_cita", "Consumo en cita"
        VENTA_RETAIL = "venta_retail", "Venta retail"
        AJUSTE_MANUAL = "ajuste_manual", "Ajuste manual"
        BAJA_VENCIMIENTO = "baja_vencimiento", "Baja por vencimiento"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    insumo = models.ForeignKey(
        Insumo,
        on_delete=models.PROTECT,
        related_name="movimientos",
    )
    tipo = models.CharField(max_length=20, choices=TipoMovimiento.choices)
    cantidad = models.DecimalField(max_digits=10, decimal_places=3)
    costo_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    costo_promedio_resultante = models.DecimalField(max_digits=12, decimal_places=2)
    stock_resultante = models.DecimalField(max_digits=10, decimal_places=3)
    origen = models.CharField(max_length=20, choices=OrigenMovimiento.choices)
    referencia_id = models.UUIDField(null=True, blank=True)
    referencia_tipo = models.CharField(max_length=50, null=True, blank=True)
    motivo = models.TextField(blank=True)
    realizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="movimientos_inventario",
    )
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "movimientos_inventario"
        ordering = ["-fecha"]

    def __str__(self) -> str:
        return f"{self.tipo} — {self.insumo.nombre} x{self.cantidad}"
