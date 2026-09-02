import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

SOPORTE_MIN = 50000


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


class Caja(models.Model):
    """Caja física de una sede (una por sede). La configura el admin: define el
    fondo inicial y el responsable. A partir de ahí el fondo se arrastra de una
    sesión a la siguiente."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sede = models.OneToOneField(
        "clinicas.Sede",
        on_delete=models.PROTECT,
        related_name="caja",
    )
    responsable = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cajas_responsable",
    )
    saldo_inicial = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text="Fondo con el que se abre la caja la primera vez. Después arrastra.",
    )
    activa = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cajas"
        ordering = ["sede__nombre"]

    def __str__(self) -> str:
        return f"Caja {self.sede.nombre}"

    @property
    def sesion_abierta(self):
        return self.sesiones.filter(estado=SesionCaja.Estado.ABIERTA).first()

    @property
    def monto_apertura_sugerido(self):
        """Fondo con el que debería abrir la próxima sesión: lo contado en el
        último cierre, o el saldo inicial si nunca se abrió."""
        ultima = self.sesiones.filter(estado=SesionCaja.Estado.CERRADA).order_by("-cerrada_en").first()
        return ultima.efectivo_contado if ultima else self.saldo_inicial


class SesionCaja(models.Model):
    """Una apertura → cierre de la caja. No está atada a una fecha: queda
    ABIERTA hasta que alguien la cierra. Solo puede haber una ABIERTA por caja."""

    class Estado(models.TextChoices):
        ABIERTA = "abierta", "Abierta"
        CERRADA = "cerrada", "Cerrada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    caja = models.ForeignKey(Caja, on_delete=models.PROTECT, related_name="sesiones")
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.ABIERTA)

    monto_apertura = models.DecimalField(max_digits=12, decimal_places=2)
    abierta_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sesiones_abiertas",
    )
    abierta_en = models.DateTimeField(default=timezone.now)

    # Snapshot calculado al cerrar
    total_ingresos = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_egresos = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    esperado = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    efectivo_contado = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    diferencia = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    observaciones = models.TextField(blank=True)
    cerrada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,
        related_name="sesiones_cerradas",
    )
    cerrada_en = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "sesiones_caja"
        ordering = ["-abierta_en"]
        constraints = [
            models.UniqueConstraint(
                fields=["caja"],
                condition=models.Q(estado="abierta"),
                name="una_sesion_abierta_por_caja",
            ),
        ]

    def __str__(self) -> str:
        return f"Sesión {self.caja.sede.nombre} — {self.abierta_en:%Y-%m-%d %H:%M} [{self.estado}]"


class GastoCaja(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sesion = models.ForeignKey(
        SesionCaja,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="gastos",
        help_text="Sesión de caja bajo la que se registró. Null = gasto histórico.",
    )
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
    fecha = models.DateField(default=timezone.localdate)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="gastos_registrados",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "gastos_caja"
        ordering = ["-fecha", "-created_at"]

    def __str__(self) -> str:
        return f"{self.descripcion} — ${self.valor}"

    def clean(self):
        if self.valor and self.valor > SOPORTE_MIN and not self.soporte_foto:
            raise ValidationError(
                {
                    "soporte_foto": "Para gastos mayores a $50.000 el soporte fotográfico es obligatorio."
                }
            )
