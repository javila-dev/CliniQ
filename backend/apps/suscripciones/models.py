"""Suscripción de la clínica a CliniQ (el SaaS cobrándole a la clínica).

No confundir con ``cobros``/``cartera``, que son los cobros de la clínica a sus
pacientes. Ver docs/plan-trial-suscripciones-y-facturacion.md.

El plan (límites y add-ons) sigue en ``Clinica.plan``; aquí vive el estado de
la cuenta: si está en prueba, pagada, en mora, en solo lectura o suspendida.
"""

from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel


class Suscripcion(BaseModel):
    class Estado(models.TextChoices):
        PRUEBA = "prueba", "En prueba"
        ACTIVA = "activa", "Activa"
        EN_GRACIA = "en_gracia", "Pago pendiente"
        SOLO_LECTURA = "solo_lectura", "Solo lectura"
        SUSPENDIDA = "suspendida", "Suspendida"
        CANCELADA = "cancelada", "Cancelada"

    class ModoCobro(models.TextChoices):
        AUTOMATICO = "automatico", "Automático con tarjeta"
        MANUAL = "manual", "Manual"

    class Ciclo(models.TextChoices):
        MENSUAL = "mensual", "Mensual"
        ANUAL = "anual", "Anual"

    clinica = models.OneToOneField("clinicas.Clinica", on_delete=models.CASCADE, related_name="suscripcion")
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PRUEBA)
    # Cuándo entró al estado actual: cuenta los días de gracia y los 30 de solo lectura.
    estado_desde = models.DateTimeField(default=timezone.now)
    modo_cobro = models.CharField(max_length=20, choices=ModoCobro.choices, default=ModoCobro.AUTOMATICO)
    ciclo = models.CharField(max_length=20, choices=Ciclo.choices, default=Ciclo.MENSUAL)
    prueba_termina_el = models.DateTimeField(null=True, blank=True)
    # Periodo pagado vigente; periodo_fin es el último día cubierto (inclusive).
    # En modo manual, periodo_fin vacío = sin vencimiento (clientes de antes).
    periodo_inicio = models.DateField(null=True, blank=True)
    periodo_fin = models.DateField(null=True, blank=True)
    # Día del mes en que se cobra (aniversario). Si el mes no lo tiene, el último día.
    dia_ancla = models.PositiveSmallIntegerField(null=True, blank=True)
    cancelar_al_terminar_periodo = models.BooleanField(default=False)
    intentos_fallidos = models.PositiveSmallIntegerField(default=0)
    nota_interna = models.TextField(blank=True, default="")
    # Respuestas de la bienvenida (cuántos profesionales, especialidad): sirven
    # para segmentar y sugerir plan. {"visto": True, ...} aunque no conteste.
    perfil = models.JSONField(default=dict, blank=True)
    # Autorización para que CliniQ le escriba por WhatsApp (casilla del registro).
    whatsapp_autorizado_at = models.DateTimeField(null=True, blank=True)

    # --- Cobro automático (Wompi) ---
    fuente_pago = models.ForeignKey("FuentePago", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    # Lo que se cobra por periodo, copiado al contratar (editar el plan no lo cambia).
    precio_periodo = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    # Próximo intento de cobro: el último día del periodo y, si falla, los reintentos.
    proximo_cobro_el = models.DateField(null=True, blank=True)
    # Bajar de plan o cambiar de ciclo se aplica al renovar.
    plan_pendiente = models.ForeignKey("clinicas.Plan", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    ciclo_pendiente = models.CharField(max_length=20, choices=Ciclo.choices, blank=True, default="")

    class Meta:
        db_table = "suscripciones"
        verbose_name = "suscripción"
        verbose_name_plural = "suscripciones"

    def __str__(self):
        return f"{self.clinica} · {self.get_estado_display()}"


class HitoClinica(models.Model):
    """Primera vez que la clínica llega a cada paso de la activación (ver activacion.py)."""

    clinica = models.ForeignKey("clinicas.Clinica", on_delete=models.CASCADE, related_name="hitos_activacion")
    hito = models.CharField(max_length=40)
    alcanzado_el = models.DateTimeField()

    class Meta:
        db_table = "suscripciones_hitos"
        constraints = [models.UniqueConstraint(fields=["clinica", "hito"], name="hito_unico_por_clinica")]


class ActividadDiaria(models.Model):
    """Días en que cada usuario de la clínica usó la app (sin contar la
    suplantación del superadmin). Se escribe como mucho una vez cada 15 minutos
    por usuario."""

    clinica = models.ForeignKey("clinicas.Clinica", on_delete=models.CASCADE, related_name="actividad_diaria")
    usuario = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="+")
    fecha = models.DateField()
    # Ventanas de 15 minutos con uso: aproxima cuánto la usó ese día.
    bloques = models.PositiveIntegerField(default=1)
    ultima_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "suscripciones_actividad_diaria"
        constraints = [
            models.UniqueConstraint(fields=["clinica", "usuario", "fecha"], name="actividad_unica_por_dia"),
        ]
        indexes = [models.Index(fields=["clinica", "fecha"])]


class NotaSeguimientoClinica(BaseModel):
    """Seguimiento comercial del equipo de CliniQ a una clínica (llamadas, WhatsApp...)."""

    class Canal(models.TextChoices):
        LLAMADA = "llamada", "Llamada"
        WHATSAPP = "whatsapp", "WhatsApp"
        CORREO = "correo", "Correo"
        REUNION = "reunion", "Reunión"
        OTRO = "otro", "Otro"

    clinica = models.ForeignKey("clinicas.Clinica", on_delete=models.CASCADE, related_name="notas_seguimiento")
    autor = models.ForeignKey("users.User", on_delete=models.SET_NULL, null=True, related_name="+")
    canal = models.CharField(max_length=20, choices=Canal.choices, default=Canal.WHATSAPP)
    texto = models.TextField()
    proximo_contacto = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "suscripciones_notas_seguimiento"
        ordering = ["-created_at"]


class MensajeCicloVida(models.Model):
    """Aviso automático ya enviado (correo y, más adelante, WhatsApp de CliniQ).

    `referencia` distingue repeticiones legítimas del mismo aviso: p. ej. el de
    "tu prueba vence" lleva la fecha de fin, así que si se extiende la prueba
    vuelve a salir para la nueva fecha.
    """

    class Canal(models.TextChoices):
        CORREO = "correo", "Correo"
        WHATSAPP = "whatsapp", "WhatsApp"

    clinica = models.ForeignKey("clinicas.Clinica", on_delete=models.CASCADE, related_name="mensajes_ciclo_vida")
    clave = models.CharField(max_length=40)
    canal = models.CharField(max_length=20, choices=Canal.choices, default=Canal.CORREO)
    referencia = models.CharField(max_length=40, blank=True, default="")
    destinatarios = models.JSONField(default=list)
    enviado_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "suscripciones_mensajes_ciclo_vida"
        ordering = ["-enviado_at"]
        constraints = [
            models.UniqueConstraint(fields=["clinica", "clave", "canal", "referencia"], name="mensaje_ciclo_vida_unico"),
        ]



class FuentePago(BaseModel):
    """Tarjeta guardada en Wompi para el cobro automático. CliniQ nunca ve el
    número: solo el id de la fuente de pago y lo que sirve para mostrarla."""

    class Estado(models.TextChoices):
        DISPONIBLE = "disponible", "Disponible"
        ANULADA = "anulada", "Anulada"

    clinica = models.ForeignKey("clinicas.Clinica", on_delete=models.CASCADE, related_name="fuentes_pago")
    wompi_id = models.CharField(max_length=40)
    marca = models.CharField(max_length=30, blank=True, default="")
    ultimos4 = models.CharField(max_length=4, blank=True, default="")
    expira_mes = models.CharField(max_length=2, blank=True, default="")
    expira_anio = models.CharField(max_length=4, blank=True, default="")
    titular = models.CharField(max_length=120, blank=True, default="")
    email = models.EmailField()
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.DISPONIBLE)
    creada_por = models.ForeignKey("users.User", on_delete=models.SET_NULL, null=True, related_name="+")
    # Aceptación de las políticas de Wompi: tokens, enlaces, fecha e IP.
    aceptacion = models.JSONField(default=dict)

    class Meta:
        db_table = "suscripciones_fuentes_pago"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.marca} •••• {self.ultimos4}"


class CobroSuscripcion(BaseModel):
    """Un intento de cobro a la clínica. La referencia es única: Wompi la usa
    para no cobrar dos veces lo mismo."""

    class Concepto(models.TextChoices):
        PRIMER_PAGO = "primer_pago", "Primer pago"
        RENOVACION = "renovacion", "Renovación"
        CAMBIO_PLAN = "cambio_plan", "Cambio de plan"

    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        APROBADO = "aprobado", "Aprobado"
        RECHAZADO = "rechazado", "Rechazado"
        ERROR = "error", "Error"
        ANULADO = "anulado", "Anulado"

    suscripcion = models.ForeignKey(Suscripcion, on_delete=models.CASCADE, related_name="cobros")
    referencia = models.CharField(max_length=60, unique=True)
    concepto = models.CharField(max_length=20, choices=Concepto.choices)
    plan = models.ForeignKey("clinicas.Plan", on_delete=models.PROTECT, related_name="+")
    ciclo = models.CharField(max_length=20, choices=Suscripcion.Ciclo.choices)
    periodo_inicio = models.DateField()
    periodo_fin = models.DateField()
    monto_centavos = models.PositiveBigIntegerField()
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PENDIENTE)
    fuente_pago = models.ForeignKey(FuentePago, on_delete=models.SET_NULL, null=True, related_name="cobros")
    wompi_transaccion_id = models.CharField(max_length=60, blank=True, default="")
    mensaje = models.CharField(max_length=255, blank=True, default="")
    # Respuesta de Wompi sin datos sensibles (para soporte).
    respuesta = models.JSONField(default=dict, blank=True)
    resuelto_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "suscripciones_cobros"
        ordering = ["-created_at"]

    @property
    def monto(self):
        from decimal import Decimal

        return Decimal(self.monto_centavos) / 100


class EventoWompi(models.Model):
    """Bitácora de los avisos (webhooks) de Wompi: auditoría e idempotencia."""

    evento = models.CharField(max_length=60)
    referencia = models.CharField(max_length=60, blank=True, default="")
    checksum = models.CharField(max_length=100)
    checksum_valido = models.BooleanField(default=False)
    payload = models.JSONField()
    recibido_at = models.DateTimeField(default=timezone.now)
    procesado_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "suscripciones_eventos_wompi"
        ordering = ["-recibido_at"]


class DatosFacturacion(models.Model):
    """A nombre de quién se emite la factura electrónica de la suscripción."""

    class TipoPersona(models.TextChoices):
        JURIDICA = "juridica", "Persona jurídica"
        NATURAL = "natural", "Persona natural"

    class TipoDocumento(models.TextChoices):
        NIT = "NIT", "NIT"
        CC = "CC", "Cédula de ciudadanía"
        CE = "CE", "Cédula de extranjería"
        PP = "PP", "Pasaporte"

    clinica = models.OneToOneField("clinicas.Clinica", on_delete=models.CASCADE, related_name="datos_facturacion")
    tipo_persona = models.CharField(max_length=20, choices=TipoPersona.choices, default=TipoPersona.JURIDICA)
    tipo_documento = models.CharField(max_length=5, choices=TipoDocumento.choices, default=TipoDocumento.NIT)
    numero_documento = models.CharField(max_length=30)
    dv = models.CharField(max_length=1, blank=True, default="")
    razon_social = models.CharField(max_length=255, blank=True, default="")
    nombres = models.CharField(max_length=150, blank=True, default="")
    apellidos = models.CharField(max_length=150, blank=True, default="")
    email_facturacion = models.EmailField()
    telefono = models.CharField(max_length=30, blank=True, default="")
    direccion = models.CharField(max_length=255)
    # Nombres exactos del catálogo de Alegra (ver ubicacion.py).
    ciudad = models.CharField(max_length=120)
    departamento = models.CharField(max_length=120)
    # Régimen ante la DIAN: responsable de IVA o no (muchas clínicas no lo son).
    responsable_iva = models.BooleanField(default=False)
    # Ids de Alegra: 5 gran contribuyente (O-13), 7 autorretenedor (O-15),
    # 12 agente de retención de IVA (O-23), 114 régimen simple (O-47).
    responsabilidades_fiscales = models.JSONField(default=list, blank=True)
    # Id del contacto en Alegra (F5).
    alegra_contact_id = models.CharField(max_length=40, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "suscripciones_datos_facturacion"



class FacturaSaaS(models.Model):
    """Factura electrónica (Alegra) de un cobro aprobado."""

    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"  # aún no sale o falló y se reintenta
        EMITIDA = "emitida", "Emitida"
        ERROR = "error", "Error"  # agotó los reintentos: revisar desde la consola

    cobro = models.OneToOneField(CobroSuscripcion, on_delete=models.PROTECT, related_name="factura")
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PENDIENTE)
    alegra_invoice_id = models.CharField(max_length=40, blank=True, default="")
    numero = models.CharField(max_length=40, blank=True, default="")
    cufe = models.CharField(max_length=120, blank=True, default="")
    # Estado ante la DIAN según Alegra; vacío si se creó sin enviarla (pruebas).
    estado_dian = models.CharField(max_length=60, blank=True, default="")
    enviada_at = models.DateTimeField(null=True, blank=True)
    intentos = models.PositiveSmallIntegerField(default=0)
    ultimo_error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "suscripciones_facturas"
        ordering = ["-created_at"]
