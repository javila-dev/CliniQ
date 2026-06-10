import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Cobro(models.Model):
    class Origen(models.TextChoices):
        CITA = "cita", "Por cita"
        COTIZACION = "cotizacion", "Por cotizacion / plan"
        LIBRE = "libre", "Ingreso libre"

    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        PAGADO_PARCIAL = "pagado_parcial", "Pagado parcial"
        PAGADO = "pagado", "Pagado"
        ANULADO = "anulado", "Anulado"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    origen = models.CharField(max_length=20, choices=Origen.choices, default=Origen.CITA)
    cotizacion = models.ForeignKey(
        "cotizaciones.Cotizacion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cobros",
    )
    cita = models.OneToOneField(
        "agenda.Cita",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cobro",
    )
    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.PROTECT,
        related_name="cobros",
    )
    profesional = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cobros_como_profesional",
    )
    sede = models.ForeignKey(
        "clinicas.Sede",
        on_delete=models.PROTECT,
        related_name="cobros",
    )
    fecha = models.DateTimeField(default=timezone.now)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    descuento = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PENDIENTE)
    notas = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cobros_creados",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cobros"
        ordering = ["-fecha"]

    def __str__(self) -> str:
        return f"Cobro {self.id} — {self.paciente} [{self.estado}]"

    @property
    def saldo_pendiente(self):
        total_pagado = self.pagos.aggregate(
            total=models.Sum("valor")
        )["total"] or 0
        return self.total - total_pagado

    def recalcular_totales(self):
        if self.origen == self.Origen.COTIZACION:
            total_pagado = self.pagos.aggregate(total=models.Sum("valor"))["total"] or 0
            self.subtotal = total_pagado
            self.total = total_pagado
            Cobro.objects.filter(pk=self.pk).update(
                subtotal=self.subtotal,
                total=self.total,
            )
            return
        subtotal = self.items.aggregate(
            total=models.Sum("subtotal")
        )["total"] or 0
        self.subtotal = subtotal
        self.total = max(subtotal - self.descuento, 0)
        Cobro.objects.filter(pk=self.pk).update(
            subtotal=self.subtotal,
            total=self.total,
        )


class ItemCobro(models.Model):
    class TipoItem(models.TextChoices):
        SERVICIO = "servicio", "Servicio"
        INSUMO_CONSUMO = "insumo_consumo", "Insumo consumo"
        PRODUCTO_RETAIL = "producto_retail", "Producto retail"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cobro = models.ForeignKey(
        Cobro,
        on_delete=models.CASCADE,
        related_name="items",
    )
    tipo = models.CharField(max_length=20, choices=TipoItem.choices)
    servicio = models.ForeignKey(
        "clinicas.Servicio",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    insumo = models.ForeignKey(
        "inventario.Insumo",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    descripcion = models.CharField(max_length=200)
    cantidad = models.DecimalField(max_digits=10, decimal_places=3, default=1)
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    costo_unitario = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "items_cobro"

    def __str__(self) -> str:
        return f"{self.descripcion} x{self.cantidad}"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.tipo == self.TipoItem.SERVICIO and not self.servicio_id:
            raise ValidationError("El ítem de tipo servicio requiere un servicio.")
        if self.tipo in {self.TipoItem.INSUMO_CONSUMO, self.TipoItem.PRODUCTO_RETAIL}:
            if not self.insumo_id:
                raise ValidationError("El ítem de tipo insumo requiere un insumo.")


class PagoRecibido(models.Model):
    class MedioPago(models.TextChoices):
        EFECTIVO = "efectivo", "Efectivo"
        TARJETA_DEBITO = "tarjeta_debito", "Tarjeta débito"
        TARJETA_CREDITO = "tarjeta_credito", "Tarjeta crédito"
        TRANSFERENCIA = "transferencia", "Transferencia"
        OTRO = "otro", "Otro"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cobro = models.ForeignKey(
        Cobro,
        on_delete=models.CASCADE,
        related_name="pagos",
    )
    medio_pago = models.CharField(max_length=20, choices=MedioPago.choices)
    valor = models.DecimalField(max_digits=12, decimal_places=2)
    referencia = models.CharField(max_length=100, blank=True)
    fecha = models.DateTimeField(default=timezone.now)
    recibido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pagos_recibidos",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pagos_recibidos"
        ordering = ["-fecha"]

    def __str__(self) -> str:
        return f"{self.medio_pago} ${self.valor} — cobro {self.cobro_id}"
