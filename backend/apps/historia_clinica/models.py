import os
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.db import models, transaction
from django.db.models import Max
from django.conf import settings
from django.utils import timezone
from dateutil.relativedelta import relativedelta

from apps.core.models import BaseModel
from apps.core.storage import delete_private_file


def foto_upload_path(instance, filename):
    _, ext = os.path.splitext(filename)
    hoy = timezone.now()
    return f"fotos/{hoy.year}/{hoy.month:02d}/{instance.id}{ext.lower()}"


class HistoriaClinica(BaseModel):
    paciente = models.OneToOneField(
        "pacientes.Paciente",
        on_delete=models.PROTECT,
        related_name="historia_clinica",
    )
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.PROTECT,
        related_name="historias_clinicas",
    )
    numero = models.CharField(max_length=20, unique=True, blank=True)
    motivo_consulta = models.TextField(blank=True, default="")
    plan_manejo = models.TextField(blank=True, default="")

    class Meta:
        db_table = "historias_clinicas"
        ordering = ["-created_at"]

    def _generar_numero(self):
        year = date.today().year
        prefix = f"HC-{year}-"
        ultimo = (
            HistoriaClinica.objects.select_for_update()
            .filter(numero__startswith=prefix)
            .aggregate(max_num=Max("numero"))
            .get("max_num")
        )
        if ultimo:
            secuencial = int(ultimo.split("-")[-1]) + 1
        else:
            secuencial = 1
        return f"{prefix}{secuencial:05d}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            original = HistoriaClinica.objects.filter(pk=self.pk).values("numero", "paciente_id", "clinica_id").first()
            if original and (
                original["numero"] != self.numero
                or original["paciente_id"] != self.paciente_id
                or original["clinica_id"] != self.clinica_id
            ):
                raise ValueError("La historia clínica no puede modificarse.")

        if not self.numero:
            with transaction.atomic():
                self.numero = self._generar_numero()
                return super().save(*args, **kwargs)
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.numero


class NotaClinica(BaseModel):
    class EstadoNota(models.TextChoices):
        BORRADOR = "borrador", "Borrador"
        COMPLETADA = "completada", "Completada"

    historia = models.ForeignKey(
        HistoriaClinica,
        on_delete=models.PROTECT,
        related_name="notas",
    )
    cita = models.ForeignKey(
        "agenda.Cita",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="notas_clinicas",
    )
    estado = models.CharField(
        max_length=20,
        choices=EstadoNota.choices,
        default=EstadoNota.BORRADOR,
    )
    motivo_consulta = models.TextField(blank=True, null=True)
    plan_manejo = models.TextField(blank=True, null=True)
    # Campos legacy: se mantienen nullable para retrocompatibilidad con registros históricos
    firmada_por = models.ForeignKey(
        "users.User",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="notas_firmadas",
    )
    firmada_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notas_clinicas"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.historia.numero} - {self.estado}"


class FotoClinica(BaseModel):
    class TipoFoto(models.TextChoices):
        ANTES = "antes", "Antes"
        DURANTE = "durante", "Durante"
        DESPUES = "despues", "Despues"

    nota = models.ForeignKey(
        NotaClinica,
        on_delete=models.PROTECT,
        related_name="fotos",
    )
    tipo = models.CharField(max_length=20, choices=TipoFoto.choices)
    archivo = models.ImageField(upload_to=foto_upload_path)
    descripcion = models.CharField(max_length=200, blank=True)
    zona = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = "fotos_clinicas"
        ordering = ["tipo", "created_at"]

    def __str__(self) -> str:
        return f"{self.nota_id} - {self.tipo}"


class ConsentimientoInformado(BaseModel):
    class TipoConsentimiento(models.TextChoices):
        GENERAL = "general", "Consentimiento General"
        TOXINA_BOTULINICA = "toxina_botulinica", "Toxina Botulinica"
        RELLENOS = "rellenos", "Rellenos Dermicos"
        LASER = "laser", "Laser y Luz Pulsada"
        PEELINGS = "peelings", "Peelings y Exfoliaciones"
        MESOTERAPIA = "mesoterapia", "Mesoterapia"
        OTROS = "otros", "Otros procedimientos"

    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.CASCADE,
        related_name="consentimientos_informados",
    )
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.PROTECT,
        related_name="consentimientos_informados",
    )
    tipo = models.CharField(max_length=30, choices=TipoConsentimiento.choices)
    documenso_template_token = models.CharField(max_length=500, null=True, blank=True)
    documenso_template_nombre = models.CharField(max_length=255, null=True, blank=True)
    fecha_firma = models.DateField(null=True, blank=True)
    firmado = models.BooleanField(default=False)
    archivo = models.FileField(upload_to="consentimientos/", null=True, blank=True)
    url_firmada = models.CharField(max_length=2048, blank=True, editable=False)
    documenso_document_id = models.CharField(max_length=255, null=True, blank=True)
    documenso_signing_token = models.CharField(max_length=500, null=True, blank=True)
    vigencia_meses = models.PositiveIntegerField(default=12)
    fecha_vencimiento = models.DateField(null=True, blank=True, editable=False)
    notas = models.TextField(blank=True)

    class Meta:
        db_table = "consentimientos_informados"
        ordering = ["documenso_template_nombre", "tipo"]

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")

        if self.firmado and self.fecha_firma:
            self.fecha_vencimiento = self.fecha_firma + relativedelta(months=self.vigencia_meses)
            if update_fields is not None:
                update_fields = set(update_fields) | {"fecha_vencimiento"}
        elif not self.firmado:
            self.fecha_vencimiento = None
            if update_fields is not None:
                update_fields = set(update_fields) | {"fecha_vencimiento"}

        if update_fields is not None:
            kwargs["update_fields"] = list(update_fields)

        super().save(*args, **kwargs)

        current_path = self.archivo.name if self.archivo else ""
        if current_path != self.url_firmada:
            self.url_firmada = current_path
            type(self).objects.filter(pk=self.pk).update(url_firmada=current_path)

    def delete(self, *args, **kwargs):
        if self.url_firmada:
            delete_private_file(self.url_firmada)
        return super().delete(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.paciente.nombre_completo} - {self.documenso_template_nombre or self.tipo}"


def resultado_examen_upload_path(instance, filename):
    _, ext = os.path.splitext(filename)
    hoy = timezone.now()
    return f"examenes/{hoy.year}/{hoy.month:02d}/{instance.id}{ext.lower()}"


class ResultadoExamen(BaseModel):
    historia = models.ForeignKey(
        HistoriaClinica,
        on_delete=models.CASCADE,
        related_name="resultados",
    )
    nota = models.ForeignKey(
        NotaClinica,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="examenes",
    )
    titulo = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True, default="")
    archivo = models.FileField(upload_to=resultado_examen_upload_path, null=True, blank=True)
    fecha = models.DateField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="resultados_examenes_creados",
    )

    class Meta:
        db_table = "resultados_examenes"
        ordering = ["-fecha", "-created_at"]

    def __str__(self) -> str:
        return f"{self.historia.numero} - {self.titulo}"


class SignosVitales(BaseModel):
    historia = models.ForeignKey(
        HistoriaClinica,
        on_delete=models.CASCADE,
        related_name="signos_vitales",
    )
    cita = models.ForeignKey(
        "agenda.Cita",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="signos_vitales",
    )
    peso_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    altura_cm = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    imc = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, editable=False)
    tension_sistolica = models.SmallIntegerField(null=True, blank=True)
    tension_diastolica = models.SmallIntegerField(null=True, blank=True)
    frecuencia_cardiaca = models.SmallIntegerField(null=True, blank=True)
    frecuencia_respiratoria = models.SmallIntegerField(null=True, blank=True)
    temperatura_c = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    saturacion_oxigeno = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    campos_adicionales = models.JSONField(default=list, blank=True)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="signos_vitales_registrados",
    )

    class Meta:
        db_table = "signos_vitales"
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if self.peso_kg and self.altura_cm and self.altura_cm > 0:
            peso = Decimal(self.peso_kg)
            altura_m = Decimal(self.altura_cm) / Decimal("100")
            imc = peso / (altura_m * altura_m)
            self.imc = imc.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        else:
            self.imc = None
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.historia.numero} - {self.created_at:%Y-%m-%d %H:%M}"


class PlantillaOrden(BaseModel):
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="plantillas_ordenes",
    )
    nombre = models.CharField(max_length=200)
    contenido = models.TextField()
    permite_edicion_profesional = models.BooleanField(default=True)
    activa = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="plantillas_ordenes_creadas",
    )

    class Meta:
        db_table = "plantillas_ordenes"
        ordering = ["nombre", "-created_at"]

    def __str__(self) -> str:
        return self.nombre


class OrdenMedica(BaseModel):
    historia = models.ForeignKey(
        HistoriaClinica,
        on_delete=models.CASCADE,
        related_name="ordenes",
    )
    cita = models.ForeignKey(
        "agenda.Cita",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ordenes_medicas",
    )
    nota = models.ForeignKey(
        NotaClinica,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ordenes",
    )
    plantilla_origen = models.ForeignKey(
        PlantillaOrden,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ordenes_generadas",
    )
    contenido = models.TextField()
    contenido_original = models.TextField(blank=True, default="")
    fue_editada = models.BooleanField(default=False)
    profesional = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="ordenes_medicas_emitidas",
    )

    class Meta:
        db_table = "ordenes_medicas"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Orden {self.id} - {self.historia.numero}"


class OrdenMedicaAuditoria(BaseModel):
    orden = models.ForeignKey(
        OrdenMedica,
        on_delete=models.CASCADE,
        related_name="auditorias",
    )
    accion = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True, default="")
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="auditorias_ordenes_medicas",
    )

    class Meta:
        db_table = "ordenes_medicas_auditoria"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.accion} - {self.orden_id}"
