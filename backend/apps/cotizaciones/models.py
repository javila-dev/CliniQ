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
        DESCARTADA = "descartada", "Descartada"

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

    # ── Puesta en marcha: datos previos cargados por el asistente de migración ──
    es_migracion = models.BooleanField(default=False, db_index=True)
    lote_migracion = models.UUIDField(null=True, blank=True, db_index=True)

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
        INSUMO = "insumo", "Producto / insumo"

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
    precio_bloqueado = models.BooleanField(
        default=False,
        help_text="True si el valor_unitario fue fijado desde el catalogo y requiere permiso para cambiarse.",
    )
    campana = models.ForeignKey(
        "clinicas.Campana",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="items_cotizacion",
        help_text="Campaña cuyo precio se aplicó en este ítem (para métricas de ventas).",
    )
    sesiones_previas_consumidas = models.PositiveIntegerField(
        default=0,
        help_text=(
            "Sesiones que el paciente ya había hecho antes de usar CliniQ (carga "
            "de puesta en marcha sin detalle por sesión). Se descuentan de las "
            "sesiones agendables restantes."
        ),
    )

    # ── Obsequios ──────────────────────────────────────────────────────────
    # Un obsequio es un ítem con ``valor_unitario = 0`` (no altera el total, la
    # cartera ni el plan de pagos) que se muestra en la cotización con su
    # ``valor_referencia``. Hay tres formas:
    #   * informativo (``agendable=False``): solo se muestra, ya está incluido
    #     en el protocolo o no consume nada;
    #   * sesión agendable: procedimiento del catálogo (cupo propio) o clon de
    #     una sesión del tratamiento cotizado (``item_origen``: suma al cupo del
    #     ítem tratamiento y no tiene cupo propio);
    #   * producto (``tipo = insumo``): descuenta inventario al entregarse.
    es_obsequio = models.BooleanField(default=False)
    agendable = models.BooleanField(
        default=False,
        help_text="Solo obsequios de sesión: True si consume una sesión agendable real.",
    )
    valor_referencia = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Precio de lista del obsequio. Solo informativo: no entra al total.",
    )
    item_origen = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="obsequios",
        help_text="Ítem tratamiento de la misma cotización del que se clona la sesión obsequiada.",
    )
    tipo_sesion_origen = models.ForeignKey(
        "clinicas.TipoSesion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="items_obsequio",
    )
    insumo = models.ForeignKey(
        "inventario.Insumo",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="items_obsequio_cotizacion",
    )
    cantidad_insumo = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    # Entrega del producto obsequiado: es lo que descuenta inventario.
    entregado_at = models.DateTimeField(null=True, blank=True)
    entregado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="obsequios_entregados",
    )
    movimiento_entrega = models.ForeignKey(
        "inventario.MovimientoInventario",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        db_table = "items_cotizacion"
        ordering = ["created_at"]

    @property
    def subtotal(self):
        if self.es_obsequio:
            return Decimal("0.00")
        base = Decimal(self.num_citas) * self.valor_unitario
        descuento = (base * self.descuento_porcentaje) / Decimal("100.00")
        return base - descuento

    @property
    def tiene_cupo_propio(self) -> bool:
        """True si el ítem aporta sesiones agendables por sí mismo.

        Los ítems normales sí. Un obsequio solo cuando es una sesión agendable
        con cupo propio (procedimiento del catálogo): los informativos, los
        productos y los clones de una sesión del tratamiento no lo tienen (estos
        últimos suman al cupo del ítem tratamiento de origen).
        """
        if not self.es_obsequio:
            return True
        return self.agendable and self.tipo != self.Tipo.INSUMO and self.item_origen_id is None

    def cantidad_legible(self) -> str:
        """Cantidad para documentos: ``"5 ml"`` en un producto, ``"2"`` en sesiones."""
        if self.tipo == self.Tipo.INSUMO and self.cantidad_insumo is not None:
            cantidad = format(self.cantidad_insumo.normalize(), "f")
            unidad = self.insumo.unidad_medida if self.insumo_id else ""
            return f"{cantidad} {'und.' if unidad == 'unidad' else unidad}".strip()
        return str(self.num_citas)

    def etiqueta_obsequio(self) -> str:
        """Clase de obsequio para documentos: producto, sesión adicional o cortesía."""
        if self.tipo == self.Tipo.INSUMO:
            return "Producto"
        return "Sesión adicional" if self.agendable else "Cortesía"

    def sesiones_obsequio_extra(self) -> int:
        """Sesiones regaladas (clonadas de este tratamiento) que suman a su cupo."""
        if self.tipo != self.Tipo.TRATAMIENTO:
            return 0
        return sum(
            obsequio.num_citas
            for obsequio in self.obsequios.filter(activo=True, es_obsequio=True, agendable=True)
        )

    def citas_no_canceladas(self):
        return self.citas.exclude(estado="cancelada").count()

    def num_sesiones_efectivas(self):
        """Sesiones agendables reales del ítem.

        Para ítems de tratamiento el total lo define la configuración vigente
        del catálogo (suma de ``TipoSesion`` de compromiso), no la columna
        ``num_citas`` —que para tratamientos queda en 1 porque solo representa
        una línea cotizada/cobrada—. A eso se suman las sesiones obsequiadas
        clonadas de este tratamiento. El endpoint ``/cotizaciones/{id}/sesiones/``
        usa esta misma fórmula; mantenerlas alineadas evita que el selector de
        "Nueva cita" ofrezca sesiones que luego el backend rechaza.
        """
        if not self.tiene_cupo_propio:
            return 0
        if self.tipo == self.Tipo.TRATAMIENTO and self.tratamiento_id:
            total = sum(
                ts.cantidad
                for ts in self.tratamiento.tipos_sesion.filter(es_compromiso=True, activo=True)
            )
            return (total or self.num_citas) + self.sesiones_obsequio_extra()
        return self.num_citas

    def citas_restantes(self):
        return max(
            0,
            self.num_sesiones_efectivas()
            - self.citas_no_canceladas()
            - self.sesiones_previas_consumidas,
        )


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
