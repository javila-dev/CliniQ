from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.db import models, transaction

from apps.core.models import BaseModel


class Proveedor(BaseModel):
    class Categoria(models.TextChoices):
        INSUMOS_MEDICOS = "insumos_medicos", "Insumos medicos"
        PRODUCTOS_BELLEZA = "productos_belleza", "Productos de belleza"
        EQUIPOS = "equipos", "Equipos"
        PAPELERIA = "papeleria", "Papeleria"
        OTRO = "otro", "Otro"

    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.PROTECT,
        related_name="proveedores",
    )
    nombre = models.CharField(max_length=200)
    nit = models.CharField(max_length=20)
    contacto = models.CharField(max_length=100, blank=True)
    telefono = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    categoria = models.CharField(max_length=30, choices=Categoria.choices)

    class Meta:
        db_table = "proveedores"
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre


class OrdenCompra(BaseModel):
    class Estado(models.TextChoices):
        BORRADOR = "borrador", "Borrador"
        ENVIADA = "enviada", "Enviada"
        RECIBIDA_PARCIAL = "recibida_parcial", "Recibida parcial"
        RECIBIDA_TOTAL = "recibida_total", "Recibida total"
        CANCELADA = "cancelada", "Cancelada"

    proveedor = models.ForeignKey(
        Proveedor,
        on_delete=models.PROTECT,
        related_name="ordenes_compra",
    )
    sede = models.ForeignKey(
        "clinicas.Sede",
        on_delete=models.PROTECT,
        related_name="ordenes_compra",
    )
    numero = models.CharField(max_length=20, unique=True, blank=True)
    fecha = models.DateField()
    fecha_entrega_esperada = models.DateField(null=True, blank=True)
    estado = models.CharField(
        max_length=20,
        choices=Estado.choices,
        default=Estado.BORRADOR,
    )
    notas = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="ordenes_compra_creadas",
    )

    class Meta:
        db_table = "ordenes_compra"
        ordering = ["-fecha", "-created_at"]

    def __str__(self) -> str:
        return self.numero or f"OC-{self.fecha.year}-PENDIENTE"

    @property
    def total(self) -> Decimal:
        total = Decimal("0")
        for item in self.items.filter(activo=True):
            total += item.subtotal
        return total

    @property
    def clinica_id(self):
        return self.proveedor.clinica_id

    def save(self, *args, **kwargs):
        if not self.numero:
            self.numero = self._generar_numero()
        super().save(*args, **kwargs)

    def _generar_numero(self) -> str:
        year = self.fecha.year
        with transaction.atomic():
            ultimo = (
                OrdenCompra.objects.select_for_update()
                .filter(numero__startswith=f"OC-{year}-")
                .order_by("-numero")
                .first()
            )
            secuencial = 1
            if ultimo and ultimo.numero:
                try:
                    secuencial = int(ultimo.numero.rsplit("-", 1)[-1]) + 1
                except (TypeError, ValueError):
                    secuencial = 1
            return f"OC-{year}-{secuencial:05d}"


class ItemOrdenCompra(BaseModel):
    orden = models.ForeignKey(
        OrdenCompra,
        on_delete=models.CASCADE,
        related_name="items",
    )
    insumo = models.ForeignKey(
        "inventario.Insumo",
        on_delete=models.PROTECT,
        related_name="items_orden_compra",
    )
    cantidad = models.DecimalField(max_digits=10, decimal_places=3)
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    cantidad_recibida = models.DecimalField(max_digits=10, decimal_places=3, default=0)

    class Meta:
        db_table = "items_orden_compra"
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.insumo.nombre} x {self.cantidad}"

    @property
    def subtotal(self) -> Decimal:
        return self.cantidad * self.precio_unitario

    @property
    def pendiente_recibir(self) -> Decimal:
        return self.cantidad - self.cantidad_recibida
