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

    # ── Puesta en marcha: saldo previo cargado por el asistente de migración.
    # La deuda es real (entra a cartera y calcula mora); no cuenta como venta
    # nueva del periodo. ──
    es_migracion = models.BooleanField(default=False, db_index=True)
    lote_migracion = models.UUIDField(null=True, blank=True, db_index=True)

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

    # ── Acuerdos de pago (renegociación del plan) ──
    # `anulada=True`: cuota del plan original reemplazada por un acuerdo de pago.
    # Deja de contar para saldo/mora/UI pero se conserva para auditoría.
    # `acuerdo`: si está seteado, la cuota pertenece al plan de ese acuerdo.
    anulada = models.BooleanField(default=False, db_index=True)
    acuerdo = models.ForeignKey(
        "cartera.AcuerdoPago",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cuotas",
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


class AcuerdoPago(BaseModel):
    """Renegociación del plan de pago de una cartera.

    Se crea en estado ``pendiente_firma`` y **no altera la cartera**: el plan
    nuevo vive en ``plan_propuesto`` (JSON) hasta que Documenso confirma la firma
    del acta. Recién ahí ``aplicar_acuerdo_pago`` anula las cuotas viejas
    pendientes, materializa el plan nuevo y levanta la mora.
    """

    class Estado(models.TextChoices):
        PENDIENTE_FIRMA = "pendiente_firma", "Pendiente de firma"
        VIGENTE = "vigente", "Vigente"
        ANULADO = "anulado", "Anulado"
        REQUIERE_REVISION = "requiere_revision", "Requiere revisión"

    cartera = models.ForeignKey(
        Cartera,
        on_delete=models.CASCADE,
        related_name="acuerdos",
    )
    numero = models.PositiveSmallIntegerField(help_text="Secuencial por cartera.")
    motivo = models.TextField()
    saldo_al_proponer = models.DecimalField(max_digits=14, decimal_places=2)
    # [{tipo, descripcion, valor_esperado (str), fecha_esperada (ISO date)}]
    plan_propuesto = models.JSONField()
    documento = models.OneToOneField(
        "consentimientos.Consentimiento",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="acuerdo_pago",
    )
    estado = models.CharField(
        max_length=20,
        choices=Estado.choices,
        default=Estado.PENDIENTE_FIRMA,
    )
    vigente_desde = models.DateTimeField(null=True, blank=True)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="acuerdos_pago_creados",
    )
    anulado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="acuerdos_pago_anulados",
    )
    anulado_en = models.DateTimeField(null=True, blank=True)
    motivo_anulacion = models.TextField(blank=True)

    class Meta:
        db_table = "acuerdos_pago"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["cartera", "numero"],
                name="uniq_acuerdo_numero_por_cartera",
            ),
            # Un solo acuerdo pendiente de firma por cartera (garantía de BD).
            models.UniqueConstraint(
                fields=["cartera"],
                condition=models.Q(estado="pendiente_firma"),
                name="uniq_acuerdo_pendiente_por_cartera",
            ),
        ]

    def __str__(self) -> str:
        return f"Acuerdo de pago N°{self.numero} - cartera {self.cartera_id} ({self.estado})"


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
