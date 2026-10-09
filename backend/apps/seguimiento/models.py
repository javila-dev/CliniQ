"""Seguimiento: oportunidades de venta y de retención en una sola bandeja.

Un solo modelo para adquisición (interesados que todavía no compran) y
retención (paquetes con sesiones sin agendar, mantenimientos...). Ver
docs/plan-funnel-comercial.md y docs/plan-seguimiento-retencion.md.

La recepción solo ve una fecha: ``proximo_contacto``. Si es hoy o ya pasó, la
oportunidad abierta aparece en "Para hoy".
"""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import BaseModel


class Oportunidad(BaseModel):
    class Tipo(models.TextChoices):
        NUEVA = "nueva", "Nuevo cliente"
        RECOMPRA = "recompra", "Recompra"
        REACTIVACION = "reactivacion", "Reactivación"
        PAQUETE = "paquete", "Completar paquete"

    class Motivo(models.TextChoices):
        MANUAL = "manual", "Registrado por la clínica"
        CAMPANA = "campana", "Respondió a una campaña"
        SESIONES_PENDIENTES = "sesiones_pendientes", "Sesiones pendientes sin agendar"
        COTIZACION_ABIERTA = "cotizacion_abierta", "Cotización sin respuesta"
        NO_ASISTIO = "no_asistio", "No asistió y no reagendó"
        MANTENIMIENTO = "mantenimiento", "Le toca mantenimiento"
        INACTIVO = "inactivo", "Paciente inactivo"
        CUMPLEANOS = "cumpleanos", "Cumpleaños"

    class Etapa(models.TextChoices):
        NUEVO = "nuevo", "Nuevo"
        VALORACION = "valoracion", "Valoración"
        COTIZADO = "cotizado", "Cotizado"

    class Estado(models.TextChoices):
        ABIERTA = "abierta", "Abierta"
        GANADA = "ganada", "Ganada"
        PERDIDA = "perdida", "Perdida"
        RESUELTA_SOLA = "resuelta_sola", "Resuelta sola"

    class Origen(models.TextChoices):
        WHATSAPP = "whatsapp", "WhatsApp"
        INSTAGRAM = "instagram", "Instagram"
        FACEBOOK = "facebook", "Facebook"
        TIKTOK = "tiktok", "TikTok"
        GOOGLE = "google", "Google"
        REFERIDO = "referido", "Referido"
        VISITA = "visita", "Pasó por la sede"
        LLAMADA = "llamada", "Llamada"
        CAMPANA = "campana", "Campaña"
        OTRO = "otro", "Otro"

    class MotivoPerdida(models.TextChoices):
        PRECIO = "precio", "Precio"
        OTRA_CLINICA = "otra_clinica", "Eligió otra clínica"
        NO_RESPONDE = "no_responde", "No responde"
        NO_CANDIDATO = "no_candidato", "No es candidato"
        OTRO = "otro", "Otro"

    TIPOS_VENTA = (Tipo.NUEVA, Tipo.RECOMPRA, Tipo.REACTIVACION)

    clinica = models.ForeignKey("clinicas.Clinica", on_delete=models.CASCADE, related_name="oportunidades")
    sede = models.ForeignKey(
        "clinicas.Sede", on_delete=models.SET_NULL, null=True, blank=True, related_name="oportunidades",
    )
    # Null mientras es solo un interesado (sin ficha). Ver contacto_*.
    paciente = models.ForeignKey(
        "pacientes.Paciente", on_delete=models.CASCADE, null=True, blank=True, related_name="oportunidades",
    )
    contacto_nombre = models.CharField(max_length=200, blank=True, default="")
    contacto_telefono = models.CharField(max_length=30, blank=True, default="")

    tipo = models.CharField(max_length=20, choices=Tipo.choices, default=Tipo.NUEVA)
    motivo = models.CharField(max_length=30, choices=Motivo.choices, default=Motivo.MANUAL)
    # Solo en oportunidades de venta; null en tipo "paquete".
    etapa = models.CharField(max_length=20, choices=Etapa.choices, null=True, blank=True)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.ABIERTA, db_index=True)
    proximo_contacto = models.DateField(null=True, blank=True, db_index=True)

    origen = models.CharField(max_length=20, choices=Origen.choices, blank=True, default="")
    origen_detalle = models.CharField(max_length=200, blank=True, default="")
    responsable = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="oportunidades_asignadas",
    )
    interes = models.CharField(max_length=200, blank=True, default="")
    valor_estimado = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    # Contexto de la detección automática (retención) y del avance del embudo.
    item_cotizacion = models.ForeignKey(
        "cotizaciones.ItemCotizacion", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="oportunidades",
    )
    cotizacion = models.ForeignKey(
        "cotizaciones.Cotizacion", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="oportunidades_seguimiento",
    )
    cita = models.ForeignKey(
        "agenda.Cita", on_delete=models.SET_NULL, null=True, blank=True, related_name="oportunidades",
    )
    # Deduplicación de la detección automática; null en las creadas a mano.
    clave = models.CharField(max_length=200, null=True, blank=True)
    detalle = models.JSONField(default=dict, blank=True)
    detectada_en = models.DateTimeField(null=True, blank=True)

    motivo_perdida = models.CharField(max_length=20, choices=MotivoPerdida.choices, blank=True, default="")
    nota_perdida = models.TextField(blank=True, default="")
    cerrada_en = models.DateTimeField(null=True, blank=True)
    cerrada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="oportunidades_cerradas",
    )
    creada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="oportunidades_creadas",
    )

    class Meta:
        db_table = "seguimiento_oportunidades"
        ordering = ["proximo_contacto", "-created_at"]
        indexes = [
            models.Index(fields=["clinica", "estado", "proximo_contacto"]),
            models.Index(fields=["paciente", "estado"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["clinica", "clave"], condition=Q(clave__isnull=False), name="oportunidad_clave_unica",
            ),
        ]

    @property
    def es_venta(self) -> bool:
        return self.tipo in self.TIPOS_VENTA

    @property
    def nombre(self) -> str:
        return self.paciente.nombre_completo if self.paciente_id else self.contacto_nombre

    @property
    def telefono(self) -> str:
        return (self.paciente.telefono if self.paciente_id else self.contacto_telefono) or ""

    def __str__(self) -> str:
        return f"Oportunidad {self.nombre} ({self.get_tipo_display()})"


class GestionOportunidad(models.Model):
    """Cada contacto con la persona (llamada, WhatsApp, nota). Historial visible en la ficha."""

    class Canal(models.TextChoices):
        WHATSAPP_AUTOMATICO = "whatsapp_automatico", "WhatsApp automático"
        WHATSAPP_PLANTILLA = "whatsapp_plantilla", "WhatsApp (plantilla)"
        WHATSAPP_MANUAL = "whatsapp_manual", "WhatsApp"
        LLAMADA = "llamada", "Llamada"
        PRESENCIAL = "presencial", "En persona"
        NOTA = "nota", "Nota"

    class Resultado(models.TextChoices):
        ENVIADO = "enviado", "Mensaje enviado"
        SIN_RESPUESTA = "sin_respuesta", "No contestó"
        INTERESADO = "interesado", "Interesado"
        AGENDO = "agendo", "Agendó"
        NO_INTERESADO = "no_interesado", "No le interesa"
        NUMERO_ERRADO = "numero_errado", "Número errado"
        OTRO = "otro", "Otro"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    oportunidad = models.ForeignKey(Oportunidad, on_delete=models.CASCADE, related_name="gestiones")
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="gestiones_oportunidad",
    )
    canal = models.CharField(max_length=30, choices=Canal.choices)
    resultado = models.CharField(max_length=20, choices=Resultado.choices)
    nota = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "seguimiento_gestiones"
        ordering = ["-created_at"]
