import os
import secrets

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models, transaction
from django.db.models import F
from django.db.models.functions import Lower, Trim
from django.utils import timezone

from apps.core.models import BaseModel


def generate_token_registro_publico():
    return secrets.token_urlsafe(24)


class RegistroPendiente(models.Model):
    """
    Almacena una solicitud de registro antes de verificar el email.
    Se convierte en Clinica + User al confirmar el token.
    """
    token = models.CharField(max_length=100, unique=True, editable=False)
    nombre_clinica = models.CharField(max_length=255)
    # El registro de la prueba ya no pide NIT: se pide al pagar (datos de facturación).
    nit = models.CharField(max_length=50, blank=True, default="")
    nombre_admin = models.CharField(max_length=150)
    apellido_admin = models.CharField(max_length=150)
    email = models.EmailField()
    telefono = models.CharField(max_length=30)
    # Autorizó que CliniQ le escriba por WhatsApp sobre su cuenta (casilla del registro).
    acepta_whatsapp = models.BooleanField(default=False)
    # Rol de quien se registra (dueño, administrador...): sirve al seguimiento comercial
    # para saber si habla con quien decide la compra.
    cargo = models.CharField(max_length=30, blank=True, default="")
    expires_at = models.DateTimeField()
    usado_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "registros_pendientes"

    def is_valid(self) -> bool:
        return self.usado_at is None and self.expires_at > timezone.now()

    @classmethod
    def create(cls, **kwargs) -> "RegistroPendiente":
        from datetime import timedelta
        return cls.objects.create(
            token=secrets.token_urlsafe(48),
            expires_at=timezone.now() + timedelta(hours=24),
            **kwargs,
        )


class Plan(BaseModel):
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)
    max_usuarios = models.PositiveIntegerField(
        default=0,
        help_text="Numero maximo de usuarios activos. 0 significa sin limite.",
    )
    max_sedes = models.PositiveIntegerField(
        default=0,
        help_text="Numero maximo de sedes activas. 0 significa sin limite.",
    )
    precio = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Precio mensual del plan. Null si es gratuito o no aplica.",
    )
    facial_verificacion_habilitada = models.BooleanField(
        default=False,
        help_text="Addon: verificación facial biométrica incluida en este plan.",
    )
    modulo_estetico_habilitado = models.BooleanField(
        default=True,
        help_text="Addon: módulo estético (procedimientos, zonas corporales) incluido en este plan.",
    )
    whatsapp_habilitado = models.BooleanField(
        default=True,
        help_text=(
            "Addon: envío de mensajes de WhatsApp (documentos, firma, OTP de "
            "check-in, recordatorios) incluido en este plan."
        ),
    )
    whatsapp_envios_incluidos = models.PositiveIntegerField(
        default=0,
        help_text="Envíos de WhatsApp incluidos por mes en este plan. 0 significa sin límite.",
    )
    whatsapp_numero_propio_habilitado = models.BooleanField(
        default=False,
        help_text=(
            "Addon: la clínica envía los WhatsApp desde su propio número (Coexistence "
            "vía Lyvio). Requiere el addon base de WhatsApp."
        ),
    )
    whatsapp_numeros_incluidos = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text="Números propios de WhatsApp que la clínica puede conectar con el add-on.",
    )
    precio_por_numero_whatsapp = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Costo mensual de referencia por cada número propio de WhatsApp activo.",
    )
    mostrar_publico = models.BooleanField(
        default=False,
        help_text="Si esta activo, el plan aparece en la tabla de precios publica de la landing.",
    )
    precio_usuario_adicional = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Costo mensual por cada usuario por encima de max_usuarios. Null si no aplica (ej. plan a medida).",
    )
    precio_sede_adicional = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Costo mensual por cada sede por encima de max_sedes. Null si no aplica (ej. plan a medida).",
    )
    # Pago anual: precio mensual x 12 menos este porcentaje (0 = sin pago anual con descuento).
    descuento_anual_pct = models.PositiveSmallIntegerField(default=0)
    recomendado = models.BooleanField(
        default=False,
        db_default=False,
        help_text=(
            "Plan destacado como «Más elegido» en la landing. Solo uno puede estarlo "
            "y tiene que ser activo y público."
        ),
    )

    class Meta:
        db_table = "planes"
        ordering = ["max_usuarios", "nombre"]
        constraints = [
            # Nunca dos planes recomendados a la vez, aunque se escriba por fuera de save().
            models.UniqueConstraint(
                fields=["recomendado"],
                condition=models.Q(recomendado=True),
                name="planes_un_solo_recomendado",
            ),
        ]

    def save(self, *args, **kwargs):
        # Un plan oculto o inactivo no puede quedar como recomendado; y al marcar
        # uno se desmarca el anterior, para que el cambio desde la consola sea directo.
        if self.recomendado and not (self.activo and self.mostrar_publico):
            self.recomendado = False
        with transaction.atomic():
            if self.recomendado:
                Plan.objects.filter(recomendado=True).exclude(pk=self.pk).update(recomendado=False)
            super().save(*args, **kwargs)

    def __str__(self) -> str:
        limite = f"{self.max_usuarios} usuarios" if self.max_usuarios > 0 else "sin limite"
        return f"{self.nombre} ({limite})"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.whatsapp_numero_propio_habilitado and not self.whatsapp_habilitado:
            raise ValidationError({
                "whatsapp_numero_propio_habilitado": (
                    "El número propio de WhatsApp requiere el addon de WhatsApp."
                ),
            })


class Clinica(BaseModel):
    plan = models.ForeignKey(
        Plan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinicas",
    )
    nombre = models.CharField(max_length=255)
    # Opcional: la clínica que se registra sola no lo da hasta pagar. Vacío = None
    # (varias clínicas sin NIT no chocan con el unique).
    nit = models.CharField(max_length=50, unique=True, null=True, blank=True)
    email = models.EmailField(blank=True, default="")
    telefono = models.CharField(max_length=30, blank=True)
    logo = models.ImageField(upload_to="clinicas/logos/", null=True, blank=True)
    slot_interval_min = models.PositiveIntegerField(default=15)
    recordatorios_automaticos = models.BooleanField(default=True)
    intervalo_recordatorio_horas = models.PositiveIntegerField(default=24)
    bloquear_agenda_por_deuda = models.BooleanField(
        default=False,
        help_text=(
            "Si True, impide crear citas e iniciar la atención de pacientes con "
            "cuotas de cartera vencidas."
        ),
    )
    dias_gracia_deuda = models.PositiveIntegerField(
        default=0,
        help_text="Días de gracia después del vencimiento antes de bloquear la agenda.",
    )
    preparacion = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Preferencias de la pantalla Preparar mi clínica: "
            "{'modelo': 'procedimientos'|'tratamientos'|'ambos', 'omitidos': [claves de pasos opcionales]}. "
            "El progreso no se guarda: se calcula desde los datos reales."
        ),
    )
    filtrar_profesionales_por_procedimiento = models.BooleanField(
        default=False,
        help_text=(
            "Si True, al agendar solo se ofrecen los profesionales asociados al procedimiento "
            "elegido (Colaborador.especialidades). Si False, cualquier profesional de la sede "
            "puede atender cualquier procedimiento."
        ),
    )
    token_registro_publico = models.CharField(
        max_length=64,
        unique=True,
        default=generate_token_registro_publico,
        editable=False,
        help_text="Token permanente para el link de autoregistro publico de pacientes.",
    )
    trial_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Fecha de expiración del período de prueba. Null si tiene plan asignado.",
    )
    onboarding_completado = models.BooleanField(
        default=False,
        help_text="True cuando el admin completa el wizard de configuración inicial.",
    )
    facial_verificacion_override = models.BooleanField(
        null=True,
        blank=True,
        default=None,
        help_text="Anula el addon de verificación facial del plan para esta clínica. Null = hereda del plan.",
    )
    modulo_estetico_override = models.BooleanField(
        null=True,
        blank=True,
        default=None,
        help_text="Anula el addon de módulo estético del plan para esta clínica. Null = hereda del plan.",
    )
    whatsapp_override = models.BooleanField(
        null=True,
        blank=True,
        default=None,
        help_text="Anula el addon de WhatsApp del plan para esta clínica. Null = hereda del plan.",
    )
    whatsapp_envios_incluidos_override = models.PositiveIntegerField(
        null=True,
        blank=True,
        default=None,
        help_text=(
            "Anula el cupo mensual de envíos de WhatsApp para esta clínica. "
            "Null = hereda del plan. 0 = sin límite."
        ),
    )
    whatsapp_numero_propio_override = models.BooleanField(
        null=True,
        blank=True,
        default=None,
        help_text=(
            "Anula el addon de número propio de WhatsApp del plan para esta clínica. "
            "Null = hereda del plan. Sin el addon base de WhatsApp no tiene efecto."
        ),
    )
    whatsapp_numeros_incluidos_override = models.PositiveIntegerField(
        null=True,
        blank=True,
        default=None,
        validators=[MinValueValidator(1)],
        help_text="Anula cuántos números propios de WhatsApp puede conectar esta clínica. Null = hereda del plan.",
    )
    modo_puesta_en_marcha = models.BooleanField(
        default=False,
        help_text=(
            "Habilita el asistente de puesta en marcha (cargar pacientes en curso, "
            "saldos previos, etc.). Lo activa/desactiva el superadmin mientras la "
            "clínica migra sus datos."
        ),
    )

    class Meta:
        db_table = "clinicas"
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre

    def en_prueba(self) -> bool:
        """Si la cuenta está en su prueba gratuita (con el estado al día por fechas)."""
        if not hasattr(self, "_en_prueba"):
            from apps.suscripciones.models import Suscripcion
            from apps.suscripciones.services import estado_vigente

            s = Suscripcion.objects.filter(clinica_id=self.pk).first() if self.pk else None
            self._en_prueba = s is not None and estado_vigente(s)[0] == Suscripcion.Estado.PRUEBA
        return self._en_prueba

    @property
    def plan_vigente(self):
        """El plan cuyos límites y add-ons aplican hoy: el plan de prueba
        (Consola → Pruebas) mientras la clínica está en prueba y, si no, el
        contratado. Los overrides por clínica siguen mandando sobre ambos."""
        if not hasattr(self, "_plan_vigente"):
            plan = self.plan
            if self.en_prueba():
                from apps.core.models import ConfiguracionGlobal

                plan = ConfiguracionGlobal.get_solo().plan_prueba or plan
            self._plan_vigente = plan
        return self._plan_vigente

    def _addon_efectivo(self, override, plan_field):
        if override is not None:
            return override
        plan = self.plan_vigente
        return bool(plan and getattr(plan, plan_field))

    @property
    def facial_verificacion_habilitada(self):
        return self._addon_efectivo(self.facial_verificacion_override, "facial_verificacion_habilitada")

    @property
    def modulo_estetico_habilitado(self):
        return self._addon_efectivo(self.modulo_estetico_override, "modulo_estetico_habilitado")

    @property
    def whatsapp_habilitado(self):
        if self.whatsapp_override is not None:
            return self.whatsapp_override
        # A diferencia de los demas addons, WhatsApp nunca estuvo gateado para
        # nadie antes de este addon (ni siquiera para clinicas en trial sin plan
        # asignado). Sin plan se hereda "habilitado, sin limite" para no cortarle
        # WhatsApp a una clinica en trial el dia del deploy.
        if self.plan_vigente is None:
            return True
        return self.plan_vigente.whatsapp_habilitado

    @property
    def whatsapp_envios_incluidos(self):
        if self.whatsapp_envios_incluidos_override is not None:
            return self.whatsapp_envios_incluidos_override
        if self.en_prueba():
            # En prueba el cupo es por toda la prueba, no por mes.
            from apps.core.models import ConfiguracionGlobal

            return ConfiguracionGlobal.get_solo().whatsapp_envios_prueba
        if self.plan_vigente is None:
            return 0
        return self.plan_vigente.whatsapp_envios_incluidos

    @property
    def whatsapp_numero_propio_habilitado(self):
        # Depende del addon base: el numero compartido es el respaldo de todo
        # envio por numero propio. Sin plan no se hereda habilitado (addon nuevo).
        if not self.whatsapp_habilitado:
            return False
        return self._addon_efectivo(self.whatsapp_numero_propio_override, "whatsapp_numero_propio_habilitado")

    @property
    def whatsapp_numeros_incluidos(self):
        """Cuantos numeros propios puede conectar; 0 si no tiene el addon."""
        if not self.whatsapp_numero_propio_habilitado:
            return 0
        if self.whatsapp_numeros_incluidos_override is not None:
            return self.whatsapp_numeros_incluidos_override
        return self.plan_vigente.whatsapp_numeros_incluidos if self.plan_vigente else 1


class Sede(BaseModel):
    clinica = models.ForeignKey(
        Clinica,
        on_delete=models.PROTECT,
        related_name="sedes",
    )
    nombre = models.CharField(max_length=255)
    ciudad = models.CharField(max_length=120)
    direccion = models.CharField(max_length=255)
    telefono = models.CharField(max_length=20)
    horario = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "sedes"
        unique_together = (("clinica", "nombre"),)
        ordering = ["nombre"]

    def __str__(self) -> str:
        return f"{self.nombre} - {self.clinica.nombre}"


class Servicio(BaseModel):
    clinica = models.ForeignKey(
        Clinica,
        on_delete=models.PROTECT,
        related_name="servicios",
    )
    nombre = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    duracion_min = models.PositiveIntegerField()
    precio = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    precio_base = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Precio fijo de catalogo para cotizaciones. Si se configura, bloquea el precio en los items de cotizacion.",
    )
    descuento_maximo_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text=(
            "Descuento maximo permitido en cotizaciones sobre el precio de lista "
            "(precio_base). El precio efectivo del item nunca puede bajar de "
            "precio_base * (1 - descuento_maximo_pct/100). 0 = no se permite descuento."
        ),
    )
    vigencia_meses = models.PositiveIntegerField(default=12)
    tiene_protocolo = models.BooleanField(default=False)
    # Ritmo: días que deben pasar desde la sesión anterior (ver seguimiento/ritmo.py).
    cada_dias = models.PositiveIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(730)],
    )
    consentimientos_requeridos = models.ManyToManyField(
        "configuracion.DocumensoConsentimientoTemplate",
        through="ServicioConsentimiento",
        blank=True,
        related_name="servicios",
    )

    class Meta:
        db_table = "servicios"
        ordering = ["nombre"]
        constraints = [
            # Nombre único por clínica ignorando mayúsculas y espacios en los extremos.
            models.UniqueConstraint(
                Lower(Trim("nombre")),
                F("clinica"),
                name="servicio_nombre_unico_por_clinica",
                violation_error_message="Ya existe un procedimiento con ese nombre.",
            ),
        ]

    def __str__(self) -> str:
        return self.nombre


class ServicioConsentimiento(BaseModel):
    servicio = models.ForeignKey(
        Servicio,
        on_delete=models.CASCADE,
        related_name="consentimientos_requeridos_set",
    )
    template = models.ForeignKey(
        "configuracion.DocumensoConsentimientoTemplate",
        on_delete=models.PROTECT,
        related_name="servicios_que_lo_requieren",
    )
    orden = models.PositiveIntegerField(default=1)
    requiere_firma_cada_vez = models.BooleanField(
        default=False,
        help_text=(
            "Si True, el paciente debe firmar este consentimiento en cada cita donde se "
            "realice el procedimiento, en vez de reutilizar una firma vigente por meses."
        ),
    )

    class Meta:
        db_table = "servicios_consentimientos"
        ordering = ["orden", "created_at"]
        unique_together = (("servicio", "template"),)

    def __str__(self) -> str:
        return f"{self.servicio.nombre} -> {self.template.template_token}"


class PasoProtocolo(BaseModel):
    servicio = models.ForeignKey(
        Servicio,
        on_delete=models.CASCADE,
        related_name="pasos_protocolo",
    )
    orden = models.PositiveIntegerField()
    nombre = models.CharField(max_length=255)
    semana = models.PositiveIntegerField(null=True, blank=True)
    es_control = models.BooleanField(default=False)

    class Meta:
        db_table = "pasos_protocolo"
        ordering = ["orden", "created_at"]
        unique_together = (("servicio", "orden"),)

    def __str__(self) -> str:
        return f"{self.servicio.nombre} - {self.orden}. {self.nombre}"


class TratamientoCatalogo(BaseModel):
    clinica = models.ForeignKey(
        Clinica,
        on_delete=models.PROTECT,
        related_name="tratamientos_catalogo",
    )
    nombre = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    precio_estimado = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    descuento_maximo_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text=(
            "Descuento maximo permitido en cotizaciones sobre el precio de lista "
            "(precio_estimado). El precio efectivo del item nunca puede bajar de "
            "precio_estimado * (1 - descuento_maximo_pct/100). 0 = no se permite descuento."
        ),
    )

    class Meta:
        db_table = "clinicas_tratamiento_catalogo"
        ordering = ["nombre"]

    @property
    def total_sesiones(self) -> int:
        return sum(tipo.cantidad for tipo in self.tipos_sesion.filter(activo=True))

    def __str__(self) -> str:
        return self.nombre


class TratamientoProcedimiento(BaseModel):
    tratamiento = models.ForeignKey(
        TratamientoCatalogo,
        on_delete=models.CASCADE,
        related_name="items",
    )
    procedimiento = models.ForeignKey(
        Servicio,
        on_delete=models.PROTECT,
        related_name="tratamientos_catalogo",
    )
    cantidad = models.PositiveIntegerField(default=1)
    orden = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "clinicas_tratamiento_procedimiento"
        ordering = ["orden", "created_at"]
        unique_together = (("tratamiento", "procedimiento"),)

    def __str__(self) -> str:
        return f"{self.tratamiento.nombre} - {self.procedimiento.nombre}"


class TipoSesion(BaseModel):
    tratamiento = models.ForeignKey(
        TratamientoCatalogo,
        on_delete=models.CASCADE,
        related_name="tipos_sesion",
    )
    nombre = models.CharField(max_length=255)
    cantidad = models.PositiveIntegerField(default=1)
    orden = models.PositiveIntegerField(default=1)
    es_compromiso = models.BooleanField(default=True)
    duracion_min = models.PositiveIntegerField(default=0)
    # Ritmo: días que deben pasar desde la sesión anterior (ver seguimiento/ritmo.py).
    cada_dias = models.PositiveIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(730)],
    )

    class Meta:
        db_table = "clinicas_tipo_sesion"
        ordering = ["orden", "created_at"]

    def __str__(self) -> str:
        return f"{self.tratamiento.nombre} - {self.nombre}"


class TipoSesionProcedimiento(BaseModel):
    tipo_sesion = models.ForeignKey(
        TipoSesion,
        on_delete=models.CASCADE,
        related_name="procedimientos",
    )
    procedimiento = models.ForeignKey(
        Servicio,
        on_delete=models.PROTECT,
        related_name="tipos_sesion",
    )
    orden = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "clinicas_tipo_sesion_procedimiento"
        ordering = ["orden", "created_at"]
        unique_together = (("tipo_sesion", "procedimiento"),)

    def __str__(self) -> str:
        return f"{self.tipo_sesion.nombre} - {self.procedimiento.nombre}"


Procedimiento = Servicio


class PrecioSede(BaseModel):
    """Precio de un procedimiento o tratamiento en una sede concreta.

    Si una sede no tiene fila, usa el precio general (``Servicio.precio_base`` o
    ``TratamientoCatalogo.precio_estimado``). El descuento máximo sigue siendo el
    general y se aplica sobre el precio de la sede. Ver ``clinicas/precios.py``.
    """

    sede = models.ForeignKey(Sede, on_delete=models.CASCADE, related_name="precios")
    procedimiento = models.ForeignKey(
        Servicio, on_delete=models.CASCADE, null=True, blank=True, related_name="precios_sede",
    )
    tratamiento = models.ForeignKey(
        TratamientoCatalogo, on_delete=models.CASCADE, null=True, blank=True, related_name="precios_sede",
    )
    precio = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])

    class Meta:
        db_table = "clinicas_precio_sede"
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(procedimiento__isnull=False, tratamiento__isnull=True)
                    | models.Q(procedimiento__isnull=True, tratamiento__isnull=False)
                ),
                name="precio_sede_un_destino",
            ),
            models.UniqueConstraint(
                fields=["sede", "procedimiento"], condition=models.Q(procedimiento__isnull=False),
                name="precio_sede_unico_procedimiento",
            ),
            models.UniqueConstraint(
                fields=["sede", "tratamiento"], condition=models.Q(tratamiento__isnull=False),
                name="precio_sede_unico_tratamiento",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.procedimiento or self.tratamiento} @ {self.sede}: {self.precio}"


class Campana(BaseModel):
    clinica = models.ForeignKey(
        Clinica,
        on_delete=models.CASCADE,
        related_name="campanas",
    )
    nombre = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    sedes = models.ManyToManyField(
        Sede,
        blank=True,
        related_name="campanas",
        help_text="Sedes donde aplica la campaña. Vacío = todas las sedes.",
    )

    class Meta:
        db_table = "campanas"
        ordering = ["-fecha_inicio"]

    def __str__(self) -> str:
        return f"{self.nombre} ({self.fecha_inicio} - {self.fecha_fin})"


class CampanaItem(BaseModel):
    campana = models.ForeignKey(
        Campana,
        on_delete=models.CASCADE,
        related_name="items",
    )
    procedimiento = models.ForeignKey(
        Servicio,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="campana_items",
    )
    tratamiento = models.ForeignKey(
        TratamientoCatalogo,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="campana_items",
    )
    # Precio fijo de promoción, o un % de descuento sobre el precio de cada sede
    # (uno de los dos). Con precios por sede, el % evita que la promoción quede
    # por encima del precio normal de una sede más barata.
    precio_campana = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    descuento_pct = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )

    class Meta:
        db_table = "campana_items"
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(procedimiento__isnull=False) | models.Q(tratamiento__isnull=False)
                ),
                name="campana_item_requires_target",
            ),
            models.CheckConstraint(
                check=(
                    models.Q(precio_campana__isnull=False, descuento_pct__isnull=True)
                    | models.Q(precio_campana__isnull=True, descuento_pct__isnull=False)
                ),
                name="campana_item_precio_o_porcentaje",
            ),
        ]

    def __str__(self) -> str:
        target = self.procedimiento or self.tratamiento
        return f"{self.campana.nombre} — {target}"


def diagrama_upload_path(instance, filename):
    _, ext = os.path.splitext(filename)
    return f"diagramas_corporales/{instance.id}{ext.lower()}"


class DiagramaCorporal(BaseModel):
    nombre = models.CharField(max_length=255)
    imagen = models.ImageField(upload_to=diagrama_upload_path)
    orden = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "diagramas_corporales"
        ordering = ["orden", "nombre"]

    def __str__(self) -> str:
        return self.nombre


class ServicioDiagrama(BaseModel):
    """Legado — reemplazado por ServicioGrupoZonas. Mantener para migración."""
    servicio = models.ForeignKey(
        Servicio,
        on_delete=models.CASCADE,
        related_name="diagramas",
    )
    diagrama = models.ForeignKey(
        DiagramaCorporal,
        on_delete=models.PROTECT,
        related_name="servicios",
    )
    orden = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "servicios_diagramas"
        ordering = ["orden", "created_at"]
        unique_together = (("servicio", "diagrama"),)

    def __str__(self) -> str:
        return f"{self.servicio.nombre} → {self.diagrama.nombre}"


class GrupoZonas(BaseModel):
    nombre = models.CharField(max_length=255, unique=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "grupos_zonas"
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre


class GrupoZonasDiagrama(BaseModel):
    grupo = models.ForeignKey(
        GrupoZonas,
        on_delete=models.CASCADE,
        related_name="diagramas",
    )
    diagrama = models.ForeignKey(
        DiagramaCorporal,
        on_delete=models.PROTECT,
        related_name="grupos",
    )
    orden = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "grupos_zonas_diagramas"
        ordering = ["orden"]
        unique_together = (("grupo", "diagrama"),)

    def __str__(self) -> str:
        return f"{self.grupo.nombre} → {self.diagrama.nombre}"


class ServicioGrupoZonas(BaseModel):
    servicio = models.ForeignKey(
        Servicio,
        on_delete=models.CASCADE,
        related_name="grupos_zonas",
    )
    grupo = models.ForeignKey(
        GrupoZonas,
        on_delete=models.PROTECT,
        related_name="servicios",
    )
    orden = models.PositiveIntegerField(default=1)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "servicios_grupos_zonas"
        ordering = ["orden"]
        unique_together = (("servicio", "grupo"),)

    def __str__(self) -> str:
        return f"{self.servicio.nombre} → {self.grupo.nombre}"


class FormaDePago(BaseModel):
    """Catálogo de formas de pago de una clínica.

    Unifica lo que antes eran varios enums sueltos (medio real de un pago
    recibido, y tipo de plan declarado en una cotización/cuota): ambos ejes
    usan el mismo catálogo porque en la práctica comparten vocabulario
    (efectivo, transferencia, tarjeta...). `tipo_base` es fijo (no lo edita la
    clínica) y es lo que debe usar cualquier lógica de negocio (p. ej. el
    arqueo de caja filtrando efectivo) en vez del `nombre`, que sí es editable.
    """

    class TipoBase(models.TextChoices):
        EFECTIVO = "efectivo", "Efectivo"
        TRANSFERENCIA = "transferencia", "Transferencia"
        TARJETA_DEBITO = "tarjeta_debito", "Tarjeta débito"
        TARJETA_CREDITO = "tarjeta_credito", "Tarjeta crédito"
        CREDITO = "credito", "Crédito"
        CUOTAS = "cuotas", "Cuotas"
        FINANCIAMIENTO = "financiamiento", "Financiamiento"
        OTRO = "otro", "Otro"

    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="formas_pago",
    )
    nombre = models.CharField(max_length=50)
    tipo_base = models.CharField(max_length=20, choices=TipoBase.choices)
    # Formas de pago sembradas por el sistema al crear la clínica; no se pueden
    # borrar (solo desactivar) para no romper referencias históricas.
    es_sistema = models.BooleanField(default=False)
    orden = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "formas_pago"
        ordering = ["orden", "nombre"]
        constraints = [
            models.UniqueConstraint(fields=["clinica", "nombre"], name="uniq_forma_pago_nombre_por_clinica"),
        ]

    def __str__(self) -> str:
        return f"{self.nombre} ({self.clinica_id})"
