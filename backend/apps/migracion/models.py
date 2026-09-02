import uuid

from django.conf import settings
from django.db import models


class LoteMigracion(models.Model):
    """Un 'lote' agrupa todo lo que se creó en una sola corrida del asistente de
    puesta en marcha (p. ej. la carga de un paciente en curso: su cotización,
    cobro, pagos, citas y cartera). Sirve para poder revertir la carga completa
    mientras la clínica todavía no arrancó la operación real.

    Los registros migrados NO apuntan a este modelo por FK: llevan un
    ``lote_migracion`` (UUID plano) + ``es_migracion=True``. El manifiesto guarda
    qué se creó para poder borrarlo en orden.
    """

    class Tipo(models.TextChoices):
        PACIENTE_EN_CURSO = "paciente_en_curso", "Paciente en curso"
        SALDO_CARTERA = "saldo_cartera", "Saldo de cartera"
        OTRO = "otro", "Otro"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="lotes_migracion",
    )
    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lotes_migracion",
    )
    tipo = models.CharField(max_length=30, choices=Tipo.choices, default=Tipo.PACIENTE_EN_CURSO)
    nota = models.CharField(max_length=300, blank=True)
    # {"cotizaciones": [...ids], "cobros": [...], "pagos": [...], "citas": [...], "carteras": [...]}
    manifest = models.JSONField(default=dict, blank=True)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lotes_migracion_creados",
    )
    revertido_en = models.DateTimeField(null=True, blank=True)
    revertido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lotes_migracion_revertidos",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lotes_migracion"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        etiqueta = self.paciente.nombre_completo if self.paciente_id else self.get_tipo_display()
        return f"Lote {self.id} — {etiqueta}"

    @property
    def revertido(self) -> bool:
        return self.revertido_en is not None
