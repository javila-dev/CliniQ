from datetime import timedelta

from rest_framework import serializers

from apps.clinicas.models import Plan

from .models import CobroSuscripcion, DatosFacturacion, NotaSeguimientoClinica, Suscripcion
from .services import DIAS_GRACIA, DIAS_SOLO_LECTURA, dias_restantes_prueba, nivel_acceso

E = Suscripcion.Estado


class SuscripcionSerializer(serializers.ModelSerializer):
    estado_label = serializers.CharField(source="get_estado_display", read_only=True)
    acceso = serializers.SerializerMethodField()
    dias_restantes_prueba = serializers.SerializerMethodField()
    # Próximo cambio por tiempo, para avisarlo: cuándo pasa a solo lectura (en
    # mora) o cuándo se suspende (en solo lectura o cancelada).
    solo_lectura_el = serializers.SerializerMethodField()
    suspension_el = serializers.SerializerMethodField()
    plan_nombre = serializers.CharField(source="clinica.plan.nombre", read_only=True, default=None)
    clinica_nombre = serializers.CharField(source="clinica.nombre", read_only=True)
    tarjeta = serializers.SerializerMethodField()
    plan_pendiente_nombre = serializers.CharField(source="plan_pendiente.nombre", read_only=True, default=None)

    class Meta:
        model = Suscripcion
        fields = (
            "estado",
            "estado_label",
            "estado_desde",
            "acceso",
            "modo_cobro",
            "ciclo",
            "prueba_termina_el",
            "dias_restantes_prueba",
            "periodo_inicio",
            "periodo_fin",
            "cancelar_al_terminar_periodo",
            "solo_lectura_el",
            "suspension_el",
            "plan_nombre",
            "clinica_nombre",
            "proximo_cobro_el",
            "precio_periodo",
            "tarjeta",
            "plan_pendiente_nombre",
            "ciclo_pendiente",
        )

    def get_tarjeta(self, obj):
        f = obj.fuente_pago
        if f is None or f.estado != f.Estado.DISPONIBLE:
            return None
        return {"marca": f.marca, "ultimos4": f.ultimos4, "expira_mes": f.expira_mes, "expira_anio": f.expira_anio}

    def get_acceso(self, obj):
        return nivel_acceso(obj.estado)

    def get_dias_restantes_prueba(self, obj):
        return dias_restantes_prueba(obj)

    def get_solo_lectura_el(self, obj):
        return obj.estado_desde + timedelta(days=DIAS_GRACIA) if obj.estado == E.EN_GRACIA else None

    def get_suspension_el(self, obj):
        if obj.estado in (E.SOLO_LECTURA, E.CANCELADA):
            return obj.estado_desde + timedelta(days=DIAS_SOLO_LECTURA)
        return None


class SuscripcionAdminSerializer(SuscripcionSerializer):
    class Meta(SuscripcionSerializer.Meta):
        fields = SuscripcionSerializer.Meta.fields + ("nota_interna", "intentos_fallidos", "perfil", "whatsapp_autorizado_at", "updated_at")


class ExtenderPruebaSerializer(serializers.Serializer):
    dias = serializers.IntegerField(min_value=1, max_value=90)
    motivo = serializers.CharField(max_length=300)


class PagoManualSerializer(serializers.Serializer):
    # Vacío = sin vencimiento (como los clientes que pagan por fuera hoy).
    pagado_hasta = serializers.DateField(required=False, allow_null=True)
    ciclo = serializers.ChoiceField(choices=Suscripcion.Ciclo.choices, default=Suscripcion.Ciclo.MENSUAL)
    nota = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class PerfilBienvenidaSerializer(serializers.Serializer):
    PROFESIONALES = (("1", "Solo yo"), ("2-3", "2 a 3"), ("4-10", "4 a 10"), ("mas_10", "Más de 10"))
    ESPECIALIDADES = (
        ("estetica", "Medicina estética"),
        ("obesidad", "Obesidad y nutrición"),
        ("dermatologia", "Dermatología"),
        ("spa", "Spa y bienestar"),
        ("otra", "Otra"),
    )

    profesionales = serializers.ChoiceField(choices=PROFESIONALES, required=False, allow_blank=True)
    especialidad = serializers.ChoiceField(choices=ESPECIALIDADES, required=False, allow_blank=True)


class NotaSeguimientoSerializer(serializers.ModelSerializer):
    autor_nombre = serializers.CharField(source="autor.nombre_completo", read_only=True, default=None)

    class Meta:
        model = NotaSeguimientoClinica
        fields = ("id", "canal", "texto", "proximo_contacto", "autor_nombre", "created_at")
        read_only_fields = ("id", "autor_nombre", "created_at")


# --- Pago con tarjeta (Wompi) ------------------------------------------------------


class DatosFacturacionSerializer(serializers.ModelSerializer):
    """Datos del cliente de la factura electrónica: todos obligatorios salvo las
    responsabilidades fiscales (ver validacion_facturacion.problemas)."""

    # Texto libre aquí: el formato lo revisa problemas(), con mensajes en español
    # y todos los errores a la vez.
    email_facturacion = serializers.CharField(max_length=254, required=False, allow_blank=True)

    class Meta:
        model = DatosFacturacion
        fields = (
            "tipo_persona", "tipo_documento", "numero_documento", "dv", "razon_social", "nombres", "apellidos",
            "email_facturacion", "telefono", "direccion", "ciudad", "departamento",
            "responsable_iva", "responsabilidades_fiscales",
        )
        extra_kwargs = {
            # Se validan juntos en validate(), con mensajes propios.
            campo: {"required": False, "allow_blank": True}
            for campo in ("numero_documento", "email_facturacion", "direccion", "ciudad", "departamento")
        }

    def validate(self, attrs):
        from .validacion_facturacion import limpiar_documento, problemas

        attrs["numero_documento"] = limpiar_documento(attrs.get("numero_documento", ""))
        attrs["responsabilidades_fiscales"] = sorted({str(r) for r in attrs.get("responsabilidades_fiscales") or []})
        for campo in ("razon_social", "nombres", "apellidos", "email_facturacion", "telefono", "direccion", "dv"):
            if isinstance(attrs.get(campo), str):
                attrs[campo] = attrs[campo].strip()
        if attrs.get("tipo_documento") != DatosFacturacion.TipoDocumento.NIT:
            attrs["dv"] = ""
        errores = problemas(attrs)
        if errores:
            raise serializers.ValidationError(errores)
        return attrs


class TarjetaVistaSerializer(serializers.Serializer):
    """Lo que devuelve Wompi al tokenizar (solo para mostrarla; nunca el número)."""

    marca = serializers.CharField(max_length=30, required=False, allow_blank=True)
    ultimos4 = serializers.CharField(max_length=4, required=False, allow_blank=True)
    expira_mes = serializers.CharField(max_length=2, required=False, allow_blank=True)
    expira_anio = serializers.CharField(max_length=4, required=False, allow_blank=True)
    titular = serializers.CharField(max_length=120, required=False, allow_blank=True)


class TarjetaNuevaSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=120)
    acceptance_token = serializers.CharField()
    accept_personal_auth = serializers.CharField()
    tarjeta = TarjetaVistaSerializer()


class ContratarSerializer(TarjetaNuevaSerializer):
    plan = serializers.PrimaryKeyRelatedField(queryset=Plan.objects.filter(activo=True, precio__isnull=False))
    ciclo = serializers.ChoiceField(choices=Suscripcion.Ciclo.choices)
    # Términos de la suscripción de CliniQ (renovación automática).
    acepta_terminos = serializers.BooleanField()
    datos_facturacion = DatosFacturacionSerializer()

    def validate_acepta_terminos(self, value):
        if not value:
            raise serializers.ValidationError("Debes aceptar los términos de la suscripción.")
        return value


class CambiarPlanSerializer(serializers.Serializer):
    plan = serializers.PrimaryKeyRelatedField(queryset=Plan.objects.filter(activo=True, precio__isnull=False))
    ciclo = serializers.ChoiceField(choices=Suscripcion.Ciclo.choices)


class CobroSerializer(serializers.ModelSerializer):
    concepto_label = serializers.CharField(source="get_concepto_display", read_only=True)
    estado_label = serializers.CharField(source="get_estado_display", read_only=True)
    plan_nombre = serializers.CharField(source="plan.nombre", read_only=True)
    monto = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    tarjeta = serializers.SerializerMethodField()
    factura = serializers.SerializerMethodField()

    class Meta:
        model = CobroSuscripcion
        fields = (
            "referencia", "concepto", "concepto_label", "plan_nombre", "ciclo", "periodo_inicio", "periodo_fin",
            "monto", "estado", "estado_label", "mensaje", "tarjeta", "factura", "created_at", "resuelto_at",
        )

    def get_tarjeta(self, obj):
        return str(obj.fuente_pago) if obj.fuente_pago else ""

    def get_factura(self, obj):
        factura = getattr(obj, "factura", None)
        if factura is None:
            return None
        return {
            "numero": factura.numero,
            "estado": factura.estado,
            "estado_label": factura.get_estado_display(),
            "enviada_at": factura.enviada_at,
            "ultimo_error": factura.ultimo_error,
        }


class CobroAdminSerializer(CobroSerializer):
    """Para la consola: el cobro con su clínica y el id de la transacción en Wompi."""

    clinica_id = serializers.UUIDField(source="suscripcion.clinica_id", read_only=True)
    clinica_nombre = serializers.CharField(source="suscripcion.clinica.nombre", read_only=True)

    class Meta(CobroSerializer.Meta):
        fields = CobroSerializer.Meta.fields + ("clinica_id", "clinica_nombre", "wompi_transaccion_id")
