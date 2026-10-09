from django.utils import timezone
from rest_framework import serializers

from apps.clinicas.models import Sede
from apps.pacientes.serializers import enmascarar_cola, usuario_ve_datos_sensibles
from apps.users.authorization import sede_ids_para_filtro
from apps.seguimiento.models import GestionOportunidad, Oportunidad


class GestionOportunidadSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source="usuario.nombre_completo", read_only=True, default=None)
    canal_nombre = serializers.CharField(source="get_canal_display", read_only=True)
    resultado_nombre = serializers.CharField(source="get_resultado_display", read_only=True)

    class Meta:
        model = GestionOportunidad
        fields = (
            "id", "canal", "canal_nombre", "resultado", "resultado_nombre", "nota",
            "usuario", "usuario_nombre", "created_at",
        )
        read_only_fields = fields


def _frase(oportunidad, hoy) -> str:
    """Por qué está en la lista, en una frase."""
    if oportunidad.tipo == Oportunidad.Tipo.PAQUETE or oportunidad.motivo not in (
        Oportunidad.Motivo.MANUAL, Oportunidad.Motivo.CAMPANA,
    ):
        return oportunidad.detalle.get("frase") or oportunidad.get_motivo_display()
    partes = [oportunidad.get_etapa_display() if oportunidad.etapa else oportunidad.get_tipo_display()]
    if oportunidad.etapa == Oportunidad.Etapa.VALORACION and oportunidad.cita_id:
        fecha = timezone.localdate(oportunidad.cita.fecha_inicio)
        partes.append(("valoración " if fecha >= hoy else "fue a valoración ") + fecha.strftime("%d/%m"))
    elif oportunidad.etapa == Oportunidad.Etapa.COTIZADO:
        partes.append("cotización enviada")
    if oportunidad.interes:
        partes.append(f"le interesa {oportunidad.interes}")
    if oportunidad.origen:
        partes.append(f"llegó por {oportunidad.get_origen_display()}")
    return " · ".join(partes)


class OportunidadSerializer(serializers.ModelSerializer):
    nombre = serializers.CharField(read_only=True)
    telefono = serializers.SerializerMethodField()
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True, default=None)
    responsable_nombre = serializers.CharField(source="responsable.nombre_completo", read_only=True, default=None)
    tipo_nombre = serializers.CharField(source="get_tipo_display", read_only=True)
    etapa_nombre = serializers.CharField(source="get_etapa_display", read_only=True, default=None)
    origen_nombre = serializers.CharField(source="get_origen_display", read_only=True)
    motivo_perdida_nombre = serializers.CharField(source="get_motivo_perdida_display", read_only=True)
    es_venta = serializers.BooleanField(read_only=True)
    frase = serializers.SerializerMethodField()
    ultima_gestion = serializers.SerializerMethodField()
    dias_sin_movimiento = serializers.SerializerMethodField()
    cita_fecha = serializers.DateTimeField(source="cita.fecha_inicio", read_only=True, default=None)
    cotizacion_estado = serializers.CharField(source="cotizacion.estado", read_only=True, default=None)

    class Meta:
        model = Oportunidad
        fields = (
            "id", "nombre", "telefono", "paciente", "paciente_nombre", "contacto_nombre",
            "tipo", "tipo_nombre", "motivo", "etapa", "etapa_nombre", "estado", "es_venta",
            "proximo_contacto", "origen", "origen_nombre", "origen_detalle",
            "responsable", "responsable_nombre", "interes", "valor_estimado", "sede",
            "cotizacion", "cotizacion_estado", "cita", "cita_fecha",
            "motivo_perdida", "motivo_perdida_nombre", "nota_perdida", "cerrada_en",
            "frase", "ultima_gestion", "dias_sin_movimiento", "created_at",
        )
        read_only_fields = fields

    def get_telefono(self, obj):
        telefono = obj.telefono
        return telefono if usuario_ve_datos_sensibles(self.context) else enmascarar_cola(telefono)

    def get_frase(self, obj):
        return _frase(obj, timezone.localdate())

    def _ultima(self, obj):
        gestiones = getattr(obj, "gestiones_recientes", None)
        if gestiones is not None:
            return gestiones[0] if gestiones else None
        return obj.gestiones.select_related("usuario").first()

    def get_ultima_gestion(self, obj):
        gestion = self._ultima(obj)
        return GestionOportunidadSerializer(gestion).data if gestion else None

    def get_dias_sin_movimiento(self, obj):
        gestion = self._ultima(obj)
        desde = gestion.created_at if gestion else obj.created_at
        return (timezone.localdate() - timezone.localdate(desde)).days


class CrearInteresadoSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=200)
    telefono = serializers.CharField(max_length=30)
    interes = serializers.CharField(max_length=200, required=False, allow_blank=True)
    origen = serializers.ChoiceField(choices=Oportunidad.Origen.choices, required=False, allow_blank=True)
    origen_detalle = serializers.CharField(max_length=200, required=False, allow_blank=True)
    valor_estimado = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)
    proximo_contacto = serializers.DateField(required=False, allow_null=True)
    sede = serializers.PrimaryKeyRelatedField(queryset=Sede.objects.filter(activo=True), required=False, allow_null=True)

    def validate_sede(self, sede):
        if sede is None:
            return sede
        clinica = self.context.get("clinica")
        if clinica is not None and sede.clinica_id != clinica.id:
            raise serializers.ValidationError("La sede no es de esta clínica.")
        request = self.context.get("request")
        if request is not None:
            permitidas = sede_ids_para_filtro(request.user, str(sede.id))
            if permitidas == []:
                raise serializers.ValidationError("No tienes acceso a esa sede.")
        return sede


class ActualizarOportunidadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Oportunidad
        fields = (
            "etapa", "proximo_contacto", "origen", "origen_detalle", "interes", "valor_estimado",
            "responsable", "contacto_nombre", "contacto_telefono", "sede",
        )
        extra_kwargs = {field: {"required": False} for field in fields}

    def validate_etapa(self, etapa):
        if etapa and not self.instance.es_venta:
            raise serializers.ValidationError("Solo las oportunidades de venta tienen etapa.")
        return etapa

    def validate_responsable(self, responsable):
        if responsable and responsable.clinica_id != self.instance.clinica_id:
            raise serializers.ValidationError("El usuario no es de esta clínica.")
        return responsable

    def validate_sede(self, sede):
        if sede and sede.clinica_id != self.instance.clinica_id:
            raise serializers.ValidationError("La sede no es de esta clínica.")
        return sede


class RegistrarGestionSerializer(serializers.Serializer):
    canal = serializers.ChoiceField(choices=GestionOportunidad.Canal.choices)
    resultado = serializers.ChoiceField(choices=GestionOportunidad.Resultado.choices)
    nota = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    # Fecha elegida por la recepción; sin ella se usa la sugerida según el resultado.
    proximo_contacto = serializers.DateField(required=False, allow_null=True)
    sin_fecha = serializers.BooleanField(required=False, default=False)


class PerderSerializer(serializers.Serializer):
    motivo = serializers.ChoiceField(choices=Oportunidad.MotivoPerdida.choices, required=False, allow_blank=True)
    nota = serializers.CharField(required=False, allow_blank=True, max_length=2000)
