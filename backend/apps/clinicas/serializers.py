from django.apps import apps
from rest_framework import serializers

from django.db import transaction

from apps.core.storage import get_public_url
from apps.clinicas.models import (
    Clinica,
    PasoProtocolo,
    Plan,
    Sede,
    Servicio,
    ServicioConsentimiento,
    TipoSesion,
    TipoSesionProcedimiento,
    TratamientoCatalogo,
    TratamientoProcedimiento,
)


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = ("id", "nombre", "descripcion", "max_usuarios", "max_sedes", "precio", "activo", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_max_usuarios(self, value):
        if value < 0:
            raise serializers.ValidationError("El numero maximo de usuarios no puede ser negativo.")
        return value

    def validate_max_sedes(self, value):
        if value < 0:
            raise serializers.ValidationError("El numero maximo de sedes no puede ser negativo.")
        return value


class PlanUsageSerializer(serializers.Serializer):
    plan = PlanSerializer(allow_null=True)
    usuarios_activos = serializers.IntegerField()
    puede_agregar = serializers.BooleanField()
    slots_disponibles = serializers.IntegerField(allow_null=True)
    sin_limite = serializers.BooleanField()


class ClinicaSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    plan_nombre = serializers.CharField(source="plan.nombre", read_only=True, allow_null=True)

    class Meta:
        model = Clinica
        fields = (
            "id",
            "plan",
            "plan_nombre",
            "nombre",
            "nit",
            "telefono",
            "logo",
            "logo_url",
            "slot_interval_min",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "logo", "logo_url", "plan_nombre", "created_at", "updated_at")

    def get_logo_url(self, obj):
        return get_public_url(obj.logo.name if obj.logo else "")

    def validate_nit(self, value):
        queryset = Clinica.objects.filter(nit=value)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Ya existe una clinica con ese NIT.")
        return value

    def validate_telefono(self, value):
        return value.strip()

    def validate_slot_interval_min(self, value):
        if value < 5 or value > 60:
            raise serializers.ValidationError("El intervalo de slots debe estar entre 5 y 60 minutos.")
        return value


class ClinicaSlotIntervalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Clinica
        fields = ("id", "nombre", "slot_interval_min")
        read_only_fields = ("id", "nombre")

    def validate_slot_interval_min(self, value):
        if value < 5 or value > 60:
            raise serializers.ValidationError("El intervalo de slots debe estar entre 5 y 60 minutos.")
        return value


class ClinicaRecordatorioConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = Clinica
        fields = ("id", "nombre", "recordatorios_automaticos", "intervalo_recordatorio_horas")
        read_only_fields = ("id", "nombre")

    def validate_intervalo_recordatorio_horas(self, value):
        if value < 1 or value > 720:
            raise serializers.ValidationError("El intervalo debe estar entre 1 y 720 horas (30 días).")
        return value


class MiClinicaSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    ciudad = serializers.SerializerMethodField()
    direccion = serializers.SerializerMethodField()

    class Meta:
        model = Clinica
        fields = (
            "id",
            "nombre",
            "nit",
            "telefono",
            "ciudad",
            "direccion",
            "logo_url",
        )
        read_only_fields = fields

    def get_logo_url(self, obj):
        return get_public_url(obj.logo.name if obj.logo else "")

    def _get_sede_principal(self, obj):
        return obj.sedes.filter(activo=True).order_by("created_at").first()

    def get_ciudad(self, obj):
        sede = self._get_sede_principal(obj)
        return sede.ciudad if sede else ""

    def get_direccion(self, obj):
        sede = self._get_sede_principal(obj)
        return sede.direccion if sede else ""


class SedeSerializer(serializers.ModelSerializer):
    nombre_clinica = serializers.SerializerMethodField()
    clinica = serializers.PrimaryKeyRelatedField(
        queryset=Clinica.objects.all(),
        required=False,
    )

    class Meta:
        model = Sede
        fields = (
            "id",
            "clinica",
            "nombre",
            "nombre_clinica",
            "ciudad",
            "direccion",
            "telefono",
            "horario",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        # Suppress the auto-generated UniqueTogetherValidator for (clinica, nombre).
        # When clinica comes from the X-Clinica-Id header (not the body), that validator
        # fires enforce_required_fields and raises {"clinica": "Este campo es requerido."}
        # before perform_create can inject the clinica. The manual check in validate() covers
        # the case where clinica IS supplied in the body; the DB constraint is the safety net.
        validators = []

    def get_nombre_clinica(self, obj):
        return obj.clinica.nombre

    def validate_clinica(self, value):
        request = self.context.get("request")
        if request and request.user.is_authenticated and request.user.rol != "superadmin":
            if value.id != request.user.clinica_id:
                raise serializers.ValidationError("No puedes asignar sedes a otra clinica.")
        return value

    def validate(self, attrs):
        if self.instance and self.instance.pk:
            return attrs

        clinica = attrs.get("clinica")
        nombre = attrs.get("nombre")
        if clinica and nombre and Sede.objects.filter(clinica=clinica, nombre=nombre).exists():
            raise serializers.ValidationError({"nombre": "Ya existe una sede con ese nombre en la clinica."})
        return attrs


class ServicioSerializer(serializers.ModelSerializer):
    precio_referencia = serializers.DecimalField(
        source="precio",
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    nombre_clinica = serializers.CharField(source="clinica.nombre", read_only=True)
    tiene_protocolo = serializers.BooleanField(read_only=True)
    pasos_protocolo = serializers.SerializerMethodField()
    consentimientos_requeridos = serializers.SerializerMethodField()

    class Meta:
        model = Servicio
        fields = (
            "id",
            "clinica",
            "nombre",
            "nombre_clinica",
            "descripcion",
            "duracion_min",
            "precio",
            "precio_referencia",
            "vigencia_meses",
            "tiene_protocolo",
            "pasos_protocolo",
            "consentimientos_requeridos",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {
            "clinica": {"required": False},
            "precio": {"required": False, "allow_null": True},
        }

    def validate_clinica(self, value):
        request = self.context.get("request")
        if request and request.user.is_authenticated and request.user.rol != "superadmin":
            if value.id != request.user.clinica_id:
                raise serializers.ValidationError("No puedes asignar servicios a otra clinica.")
        return value

    def validate_precio(self, value):
        if value in (None, ""):
            return None
        if value <= 0:
            raise serializers.ValidationError("El precio debe ser mayor a 0.")
        return value

    def validate_duracion_min(self, value):
        if value < 15 or value > 480:
            raise serializers.ValidationError("La duracion debe estar entre 15 y 480 minutos.")
        return value

    def validate_vigencia_meses(self, value):
        if value < 1:
            raise serializers.ValidationError("La vigencia debe ser de al menos 1 mes.")
        return value

    def get_pasos_protocolo(self, obj):
        pasos = getattr(obj, "_pasos_protocolo_prefetched", None)
        if pasos is None:
            pasos = obj.pasos_protocolo.filter(activo=True).order_by("orden")
        return PasoProtocoloSerializer(pasos, many=True).data

    def get_consentimientos_requeridos(self, obj):
        relaciones = getattr(obj, "_consentimientos_requeridos_prefetched", None)
        if relaciones is None:
            relaciones = obj.consentimientos_requeridos_set.select_related("template").filter(activo=True).order_by("orden")
        return [
            {
                "id": str(relacion.template_id),
                "template_id": str(relacion.template_id),
                "template_token": relacion.template.template_token,
                "template_nombre": relacion.template.get_tipo_display(),
                "activo": relacion.template.activo,
                "orden": relacion.orden,
                "tipo": relacion.template.tipo,
            }
            for relacion in relaciones
        ]


class ProcedimientoSerializer(ServicioSerializer):
    class Meta(ServicioSerializer.Meta):
        fields = (
            "id",
            "clinica",
            "nombre",
            "nombre_clinica",
            "descripcion",
            "duracion_min",
            "precio",
            "precio_referencia",
            "vigencia_meses",
            "tiene_protocolo",
            "pasos_protocolo",
            "consentimientos_requeridos",
            "activo",
            "created_at",
            "updated_at",
        )


class PasoProtocoloSerializer(serializers.ModelSerializer):
    procedimiento = serializers.UUIDField(source="servicio_id", read_only=True)

    class Meta:
        model = PasoProtocolo
        fields = (
            "id",
            "servicio",
            "procedimiento",
            "orden",
            "nombre",
            "semana",
            "es_control",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_orden(self, value):
        if value < 1:
            raise serializers.ValidationError("El orden debe ser mayor o igual a 1.")
        return value

    def create(self, validated_data):
        servicio = validated_data["servicio"]
        orden = validated_data["orden"]
        with transaction.atomic():
            afectados = list(
                PasoProtocolo.objects.filter(servicio=servicio, orden__gte=orden).order_by("-orden")
            )
            for paso in afectados:
                PasoProtocolo.objects.filter(pk=paso.pk).update(orden=paso.orden + 1)
            return super().create(validated_data)

    def update(self, instance, validated_data):
        nuevo_orden = validated_data.get("orden", instance.orden)
        with transaction.atomic():
            if nuevo_orden != instance.orden:
                queryset = PasoProtocolo.objects.filter(servicio=instance.servicio).exclude(pk=instance.pk)
                if nuevo_orden > instance.orden:
                    afectados = list(queryset.filter(orden__gt=instance.orden, orden__lte=nuevo_orden).order_by("orden"))
                    for paso in afectados:
                        PasoProtocolo.objects.filter(pk=paso.pk).update(orden=paso.orden - 1)
                else:
                    afectados = list(queryset.filter(orden__gte=nuevo_orden, orden__lt=instance.orden).order_by("-orden"))
                    for paso in afectados:
                        PasoProtocolo.objects.filter(pk=paso.pk).update(orden=paso.orden + 1)
            return super().update(instance, validated_data)


class ServicioConsentimientoSerializer(serializers.ModelSerializer):
    template_id = serializers.UUIDField(read_only=True)
    template_token = serializers.CharField(source="template.template_token", read_only=True)
    template_nombre = serializers.CharField(source="template.get_tipo_display", read_only=True)
    tipo = serializers.CharField(source="template.tipo", read_only=True)
    activo_template = serializers.BooleanField(source="template.activo", read_only=True)

    class Meta:
        model = ServicioConsentimiento
        fields = (
            "id",
            "servicio",
            "template",
            "template_id",
            "template_token",
            "template_nombre",
            "tipo",
            "activo_template",
            "orden",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class TratamientoProcedimientoSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    procedimiento_nombre = serializers.CharField(source="procedimiento.nombre", read_only=True)
    procedimiento_duracion_min = serializers.IntegerField(source="procedimiento.duracion_min", read_only=True)

    class Meta:
        model = TratamientoProcedimiento
        fields = (
            "id",
            "procedimiento",
            "procedimiento_nombre",
            "procedimiento_duracion_min",
            "cantidad",
            "orden",
        )

    def validate_cantidad(self, value):
        if value < 1:
            raise serializers.ValidationError("La cantidad debe ser mayor o igual a 1.")
        return value

    def validate_orden(self, value):
        if value < 1:
            raise serializers.ValidationError("El orden debe ser mayor o igual a 1.")
        return value


class TipoSesionProcedimientoSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    nombre = serializers.CharField(source="procedimiento.nombre", read_only=True)
    duracion_min = serializers.IntegerField(source="procedimiento.duracion_min", read_only=True)

    class Meta:
        model = TipoSesionProcedimiento
        fields = (
            "id",
            "procedimiento",
            "nombre",
            "duracion_min",
            "orden",
        )

    def validate_orden(self, value):
        if value < 1:
            raise serializers.ValidationError("El orden debe ser mayor o igual a 1.")
        return value


class TipoSesionSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    procedimientos = TipoSesionProcedimientoSerializer(many=True)

    class Meta:
        model = TipoSesion
        fields = (
            "id",
            "nombre",
            "cantidad",
            "orden",
            "es_compromiso",
            "duracion_min",
            "procedimientos",
        )

    def validate_cantidad(self, value):
        if value < 1:
            raise serializers.ValidationError("La cantidad debe ser mayor o igual a 1.")
        return value

    def validate_orden(self, value):
        if value < 1:
            raise serializers.ValidationError("El orden debe ser mayor o igual a 1.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        procedimientos = validated_data.pop("procedimientos", [])
        tipo = TipoSesion.objects.create(**validated_data)
        self._sync_procedimientos(tipo, procedimientos)
        return tipo

    @transaction.atomic
    def update(self, instance, validated_data):
        procedimientos = validated_data.pop("procedimientos", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if procedimientos is not None:
            self._sync_procedimientos(instance, procedimientos)
        return instance

    def _sync_procedimientos(self, tipo_sesion, procedimientos):
        existentes = {str(item.id): item for item in tipo_sesion.procedimientos.filter(activo=True)}
        enviados = set()
        for procedimiento_data in procedimientos:
            item_id = str(procedimiento_data.get("id", "")) if procedimiento_data.get("id") else ""
            if item_id and item_id in existentes:
                item = existentes[item_id]
                for attr, value in procedimiento_data.items():
                    if attr != "id":
                        setattr(item, attr, value)
                item.save()
                enviados.add(item_id)
            else:
                procedimiento_data.pop("id", None)
                item = TipoSesionProcedimiento.objects.create(tipo_sesion=tipo_sesion, **procedimiento_data)
                enviados.add(str(item.id))
        for item_id, item in existentes.items():
            if item_id not in enviados:
                item.activo = False
                item.save(update_fields=["activo", "updated_at"])


class TratamientoCatalogoSerializer(serializers.ModelSerializer):
    nombre_clinica = serializers.CharField(source="clinica.nombre", read_only=True)
    total_sesiones = serializers.IntegerField(read_only=True)
    tipos_sesion = TipoSesionSerializer(many=True)

    class Meta:
        model = TratamientoCatalogo
        fields = (
            "id",
            "clinica",
            "nombre_clinica",
            "nombre",
            "descripcion",
            "precio_estimado",
            "activo",
            "total_sesiones",
            "tipos_sesion",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at", "nombre_clinica", "total_sesiones")
        extra_kwargs = {
            "clinica": {"required": False},
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        warnings = [
            ts["nombre"]
            for ts in data.get("tipos_sesion", [])
            if ts.get("es_compromiso") and ts.get("duracion_min", 0) == 0
        ]
        if warnings:
            data["warnings"] = {"tipo_sin_duracion": warnings}
        return data

    def validate_clinica(self, value):
        request = self.context.get("request")
        if request and request.user.is_authenticated and request.user.rol != "superadmin":
            if value.id != request.user.clinica_id:
                raise serializers.ValidationError("No puedes asignar tratamientos a otra clinica.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        clinica = attrs.get("clinica", getattr(self.instance, "clinica", None))
        tipos_sesion = self.initial_data.get("tipos_sesion", None)
        if tipos_sesion is not None and not isinstance(tipos_sesion, list):
            raise serializers.ValidationError({"tipos_sesion": "Debe ser una lista."})
        if clinica and tipos_sesion:
            procedimiento_ids = []
            for tipo in tipos_sesion:
                procedimiento_ids.extend(
                    procedimiento.get("procedimiento")
                    for procedimiento in tipo.get("procedimientos", [])
                    if procedimiento.get("procedimiento")
                )
            existentes = {
                str(pk)
                for pk in Servicio.objects.filter(id__in=procedimiento_ids, clinica=clinica).values_list("id", flat=True)
            }
            for procedimiento_id in procedimiento_ids:
                if str(procedimiento_id) not in existentes:
                    raise serializers.ValidationError(
                        {"tipos_sesion": "Todos los procedimientos deben pertenecer a la clinica del tratamiento."}
                    )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        tipos_sesion_data = validated_data.pop("tipos_sesion", [])
        tratamiento = TratamientoCatalogo.objects.create(**validated_data)
        self._sync_tipos_sesion(tratamiento, tipos_sesion_data)
        return tratamiento

    @transaction.atomic
    def update(self, instance, validated_data):
        tipos_sesion_data = validated_data.pop("tipos_sesion", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if tipos_sesion_data is not None:
            self._sync_tipos_sesion(instance, tipos_sesion_data)
        return instance

    def _sync_tipos_sesion(self, tratamiento, tipos_sesion_data):
        existentes = {str(tipo.id): tipo for tipo in tratamiento.tipos_sesion.filter(activo=True)}
        enviados = set()
        for tipo_data in tipos_sesion_data:
            procedimientos_data = tipo_data.pop("procedimientos", [])
            tipo_id = str(tipo_data.get("id", "")) if tipo_data.get("id") else ""
            if tipo_id and tipo_id in existentes:
                tipo = existentes[tipo_id]
                for attr, value in tipo_data.items():
                    if attr != "id":
                        setattr(tipo, attr, value)
                tipo.save()
                enviados.add(tipo_id)
            else:
                tipo_data.pop("id", None)
                tipo = TipoSesion.objects.create(tratamiento=tratamiento, **tipo_data)
            self._sync_tipo_procedimientos(tipo, procedimientos_data)
        for tipo_id, tipo in existentes.items():
            if tipo_id not in enviados:
                tipo.activo = False
                tipo.save(update_fields=["activo", "updated_at"])

    def _sync_tipo_procedimientos(self, tipo_sesion, procedimientos_data):
        existentes = {str(item.id): item for item in tipo_sesion.procedimientos.filter(activo=True)}
        enviados = set()
        for procedimiento_data in procedimientos_data:
            item_id = str(procedimiento_data.get("id", "")) if procedimiento_data.get("id") else ""
            if item_id and item_id in existentes:
                item = existentes[item_id]
                for attr, value in procedimiento_data.items():
                    if attr != "id":
                        setattr(item, attr, value)
                item.save()
                enviados.add(item_id)
            else:
                procedimiento_data.pop("id", None)
                item = TipoSesionProcedimiento.objects.create(tipo_sesion=tipo_sesion, **procedimiento_data)
                enviados.add(str(item.id))
        for item_id, item in existentes.items():
            if item_id not in enviados:
                item.activo = False
                item.save(update_fields=["activo", "updated_at"])


def sede_tiene_citas(sede):
    try:
        cita_model = apps.get_model("agenda", "Cita")
    except LookupError:
        return False
    return cita_model.objects.filter(sede=sede).exists()


class AdminTenantSerializer(serializers.ModelSerializer):
    plan = PlanSerializer(read_only=True)
    total_usuarios = serializers.IntegerField(read_only=True, default=0)
    usuarios_activos = serializers.IntegerField(read_only=True, default=0)
    total_sedes = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Clinica
        fields = (
            "id",
            "nombre",
            "nit",
            "email",
            "telefono",
            "activo",
            "plan",
            "total_usuarios",
            "usuarios_activos",
            "total_sedes",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class AdminTenantCreateSerializer(serializers.ModelSerializer):
    plan = serializers.PrimaryKeyRelatedField(
        queryset=Plan.objects.filter(activo=True),
        required=False,
        allow_null=True,
    )
    admin_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Clinica
        fields = ("nombre", "nit", "email", "telefono", "plan", "admin_email")
        extra_kwargs = {"telefono": {"required": False}, "email": {"required": False}}

    def validate_nit(self, value):
        if Clinica.objects.filter(nit=value).exists():
            raise serializers.ValidationError("Ya existe una clinica con ese NIT.")
        return value

    def create(self, validated_data):
        validated_data.pop("admin_email", None)
        return Clinica.objects.create(**validated_data)


class AdminTenantUpdateSerializer(serializers.ModelSerializer):
    plan = serializers.PrimaryKeyRelatedField(
        queryset=Plan.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Clinica
        fields = ("nombre", "nit", "email", "telefono", "activo", "plan")
        extra_kwargs = {"nit": {"required": False}}

    def validate_nit(self, value):
        queryset = Clinica.objects.filter(nit=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Ya existe una clinica con ese NIT.")
        return value
