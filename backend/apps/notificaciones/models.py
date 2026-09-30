import uuid

from django.conf import settings
from django.db import models


class NotificacionFallida(models.Model):
    """Registro de un envio de WhatsApp (recordatorio, OTP, cotizacion, orden) que n8n no pudo completar."""

    class Tipo(models.TextChoices):
        RECORDATORIO_CITA = "recordatorio_cita", "Recordatorio de cita"
        CHECKIN_OTP = "checkin_otp", "Codigo de check-in"
        ENVIO_COTIZACION = "envio_cotizacion", "Envio de cotizacion"
        ENVIO_FORMULA = "envio_formula", "Envio de orden medica"
        FIRMA_DOCUMENTO = "firma_documento", "Firma de documento"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="notificaciones_fallidas",
    )
    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notificaciones_fallidas",
    )
    tipo_notificacion = models.CharField(max_length=30, choices=Tipo.choices)
    telefono = models.CharField(max_length=30, blank=True)
    motivo = models.TextField(blank=True)
    resuelta = models.BooleanField(default=False)
    resuelta_en = models.DateTimeField(null=True, blank=True)
    resuelta_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notificaciones_fallidas_resueltas",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notificaciones_fallidas"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["clinica", "resuelta"])]

    def __str__(self):
        return f"{self.tipo_notificacion} · {self.telefono}"


class ConexionWhatsappPropio(models.Model):
    """Addon de numero propio: los numeros de WhatsApp de la clinica
    (Coexistence via Lyvio) y cual se usa por defecto. Los numeros son de la
    clinica; cada sede elige cual usar en AsignacionWhatsappSede."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinica = models.OneToOneField(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="conexion_whatsapp_propio",
    )
    pago_meta_configurado = models.BooleanField(
        default=False,
        help_text="La clínica confirmó que agregó un método de pago en Meta.",
    )
    numero_por_defecto = models.OneToOneField(
        "notificaciones.NumeroWhatsapp",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text=(
            "Número para envíos sin sede, sedes sin asignación (incluidas las nuevas) y "
            "respaldo cuando el número de una sede no está activo. El primero que se "
            "conecta queda como número por defecto."
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "conexiones_whatsapp_propio"

    def __str__(self):
        return f"WhatsApp propio · {self.clinica_id}"


class NumeroWhatsapp(models.Model):
    """Un numero de WhatsApp de la clinica conectado por Embedded Signup. Cada
    uno es un inbox de la cuenta de Lyvio de CliniQ. Nunca se borra el inbox en
    Lyvio: eso desconecta el numero de la API en Meta."""

    class Estado(models.TextChoices):
        CONECTADO = "conectado", "Conectado"
        PLANTILLAS_PENDIENTES = "plantillas_pendientes", "Plantillas pendientes de aprobación"
        ACTIVO = "activo", "Activo"
        ERROR = "error", "Error"

    class Bloqueo(models.TextChoices):
        """Problema del numero que no depende de las plantillas: mientras exista,
        el numero queda en error aunque las plantillas esten aprobadas."""

        NINGUNO = "", "Sin bloqueo"
        PAGO = "pago", "Falta el método de pago en Meta"
        CONEXION = "conexion", "Meta desconectó o restringió el número"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conexion = models.ForeignKey(
        ConexionWhatsappPropio,
        on_delete=models.CASCADE,
        related_name="numeros",
    )
    lyvio_inbox_id = models.CharField(max_length=64, unique=True)
    waba_id = models.CharField(max_length=64)
    phone_number_id = models.CharField(max_length=64, blank=True)
    business_id = models.CharField(max_length=64, blank=True)
    numero_visible = models.CharField(max_length=30, blank=True)
    estado = models.CharField(max_length=25, choices=Estado.choices, default=Estado.CONECTADO)
    bloqueo = models.CharField(max_length=10, choices=Bloqueo.choices, blank=True, default=Bloqueo.NINGUNO)
    ultimo_error = models.TextField(blank=True)
    ultimo_chequeo_en = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "numeros_whatsapp"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.numero_visible or self.lyvio_inbox_id} ({self.estado})"


class AsignacionWhatsappSede(models.Model):
    """Desde que numero envia una sede. Sin fila, la sede usa el numero por
    defecto de la clinica (asi las sedes nuevas nunca quedan sin numero)."""

    class Tipo(models.TextChoices):
        POR_DEFECTO = "por_defecto", "Número por defecto"
        NUMERO = "numero", "Un número de la clínica"
        CLINIQ = "cliniq", "Número de CliniQ"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conexion = models.ForeignKey(ConexionWhatsappPropio, on_delete=models.CASCADE, related_name="asignaciones")
    sede = models.OneToOneField("clinicas.Sede", on_delete=models.CASCADE, related_name="asignacion_whatsapp")
    tipo = models.CharField(max_length=15, choices=Tipo.choices, default=Tipo.POR_DEFECTO)
    numero = models.ForeignKey(
        NumeroWhatsapp,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="asignaciones",
        help_text="Solo con tipo `numero`. Si el número se borra, la sede vuelve al por defecto.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "asignaciones_whatsapp_sede"

    def __str__(self):
        return f"{self.sede_id} -> {self.tipo}"


class PlantillaWhatsappNumero(models.Model):
    """Estado en Meta de una plantilla del catalogo de CliniQ en el inbox de un
    numero. Las plantillas pertenecen a la WABA; se llevan por numero para cubrir
    numeros de distintas WABA sin logica extra (un duplicado es exito)."""

    class Estado(models.TextChoices):
        PENDING = "PENDING", "Pendiente"
        APPROVED = "APPROVED", "Aprobada"
        REJECTED = "REJECTED", "Rechazada"
        PAUSED = "PAUSED", "Pausada"
        DISABLED = "DISABLED", "Deshabilitada"
        ERROR = "ERROR", "No se pudo crear"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    numero = models.ForeignKey(NumeroWhatsapp, on_delete=models.CASCADE, related_name="plantillas")
    tipo = models.CharField(max_length=30, choices=NotificacionFallida.Tipo.choices)
    nombre = models.CharField(max_length=100)
    idioma = models.CharField(max_length=10)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.PENDING)
    categoria = models.CharField(max_length=20, blank=True, help_text="La categoría que dejó Meta.")
    ultimo_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "plantillas_whatsapp_numero"
        ordering = ["tipo"]
        constraints = [
            models.UniqueConstraint(
                fields=["numero", "nombre", "idioma"],
                name="plantilla_unica_por_numero",
            ),
        ]

    def __str__(self):
        return f"{self.nombre} [{self.idioma}] · {self.estado}"


class ContactoLyvio(models.Model):
    """Contacto y conversacion de un paciente en el inbox de un numero propio,
    para no buscarlos en Lyvio en cada envio."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    numero = models.ForeignKey(NumeroWhatsapp, on_delete=models.CASCADE, related_name="contactos")
    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.CASCADE,
        related_name="contactos_lyvio",
    )
    telefono = models.CharField(
        max_length=20, blank=True, help_text="Teléfono (E.164) con el que se creó; si el paciente lo cambia, se vuelve a resolver.",
    )
    contact_id = models.CharField(max_length=64)
    conversation_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "contactos_lyvio"
        constraints = [
            models.UniqueConstraint(fields=["numero", "paciente"], name="contacto_lyvio_unico"),
        ]


class EnvioWhatsApp(models.Model):
    """Registro de cada envio de WhatsApp disparado por la clinica.

    Solo la ruta `compartido` consume el cupo mensual del addon de WhatsApp
    (Plan.whatsapp_envios_incluidos / Clinica.whatsapp_envios_incluidos_override),
    tambien cuando es el respaldo de un envio propio que fallo. Distinto de
    NotificacionFallida: ese modelo registra fallas reportadas por n8n.

    En la ruta `propio` (Django -> Lyvio) la fila se crea antes de llamar a Lyvio
    con estado `incierto`.
    """

    Tipo = NotificacionFallida.Tipo

    class Ruta(models.TextChoices):
        COMPARTIDO = "compartido", "Número compartido"
        PROPIO = "propio", "Número propio"

    class Estado(models.TextChoices):
        ENVIADO = "enviado", "Enviado"
        INCIERTO = "incierto", "Sin confirmar"
        FALLIDO = "fallido", "Fallido"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="envios_whatsapp",
    )
    paciente = models.ForeignKey(
        "pacientes.Paciente",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="envios_whatsapp",
    )
    tipo = models.CharField(max_length=30, choices=NotificacionFallida.Tipo.choices)
    ruta = models.CharField(max_length=10, choices=Ruta.choices, default=Ruta.COMPARTIDO)
    numero = models.ForeignKey(
        NumeroWhatsapp,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="envios",
    )
    motivo_ruta = models.CharField(max_length=40, blank=True)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.ENVIADO)
    lyvio_message_id = models.CharField(max_length=64, blank=True, db_index=True)
    lyvio_conversation_id = models.CharField(max_length=64, blank=True)
    error_externo = models.TextField(blank=True)
    datos = models.JSONField(
        default=dict,
        blank=True,
        help_text="Lo necesario para reenviar por el número compartido si el envío propio falla.",
    )
    respaldo_de = models.OneToOneField(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="respaldo",
        help_text="Envío propio fallido que este envío por el compartido reemplazó.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "envios_whatsapp"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["clinica", "created_at"])]

    def __str__(self):
        return f"{self.tipo} · {self.clinica_id} · {self.ruta}"
