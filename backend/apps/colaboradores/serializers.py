from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from apps.clinicas.models import Sede
from apps.colaboradores.models import Colaborador, HorarioColaborador
from apps.core.storage import get_public_url
from apps.users.serializers import (
    legacy_storage_role,
    resolve_role,
    user_role_id,
    user_role_name,
    user_role_slug,
)
from apps.users.services import send_invitation_email


User = get_user_model()


class UserAttributeField(serializers.Field):
    def __init__(self, attr_name, inner_field, **kwargs):
        self.attr_name = attr_name
        self.inner_field = inner_field
        super().__init__(**kwargs)

    def to_representation(self, value):
        return self.inner_field.to_representation(getattr(value.user, self.attr_name))

    def to_internal_value(self, data):
        return self.inner_field.to_internal_value(data)


class HorarioColaboradorSerializer(serializers.ModelSerializer):
    sede_nombre = serializers.CharField(source="sede.nombre", read_only=True)

    class Meta:
        model = HorarioColaborador
        fields = (
            "id",
            "colaborador",
            "sede",
            "sede_nombre",
            "dia_semana",
            "hora_inicio",
            "hora_fin",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "sede_nombre", "created_at", "updated_at")

    def validate(self, attrs):
        colaborador = attrs.get("colaborador", getattr(self.instance, "colaborador", None))
        sede = attrs.get("sede", getattr(self.instance, "sede", None))
        dia_semana = attrs.get("dia_semana", getattr(self.instance, "dia_semana", None))
        hora_inicio = attrs.get("hora_inicio", getattr(self.instance, "hora_inicio", None))
        hora_fin = attrs.get("hora_fin", getattr(self.instance, "hora_fin", None))
        request = self.context.get("request")

        if hora_inicio and hora_fin and hora_fin <= hora_inicio:
            raise serializers.ValidationError({"hora_fin": "La hora fin debe ser mayor a la hora inicio."})

        if colaborador and sede:
            if not colaborador.sedes.filter(id=sede.id).exists():
                raise serializers.ValidationError({"sede": "La sede debe estar asignada al colaborador."})
            if colaborador.sede_principal_id and sede.clinica_id != colaborador.sede_principal.clinica_id:
                raise serializers.ValidationError({"sede": "La sede no pertenece a la clinica del colaborador."})
            if request and request.user.rol != User.Role.SUPERADMIN and sede.clinica_id != request.user.clinica_id:
                raise serializers.ValidationError({"sede": "La sede no pertenece a tu clinica."})

        if colaborador and dia_semana and sede:
            queryset = HorarioColaborador.objects.filter(
                colaborador=colaborador,
                sede=sede,
                dia_semana=dia_semana,
            )
            if self.instance:
                queryset = queryset.exclude(id=self.instance.id)
            if queryset.exists():
                raise serializers.ValidationError({"dia_semana": "Ya existe un horario para ese dia en esa sede."})

        return attrs


class ColaboradorSerializer(serializers.ModelSerializer):
    nombre_completo = serializers.CharField(read_only=True)
    clinica_id = serializers.SerializerMethodField()
    user_nombre = UserAttributeField("nombre_completo", serializers.CharField(), read_only=True)
    first_name = UserAttributeField("first_name", serializers.CharField(), required=False)
    last_name = UserAttributeField("last_name", serializers.CharField(), required=False)
    email = UserAttributeField("email", serializers.EmailField(), read_only=True)
    telefono = UserAttributeField("telefono", serializers.CharField(), required=False)
    rol = serializers.CharField(required=False)
    role_id = serializers.UUIDField(required=False, allow_null=True)
    role_nombre = serializers.SerializerMethodField()
    es_profesional = UserAttributeField("es_profesional", serializers.BooleanField(), required=False)
    foto_perfil = serializers.SerializerMethodField()
    sede_principal_nombre = serializers.CharField(source="sede_principal.nombre", read_only=True)
    especialidades_detalle = serializers.SerializerMethodField()
    sedes = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    sedes_ids = serializers.PrimaryKeyRelatedField(
        source="sedes",
        many=True,
        queryset=Sede.objects.all(),
        write_only=True,
        required=False,
    )
    sedes_detalle = serializers.SerializerMethodField()
    horarios = HorarioColaboradorSerializer(many=True, read_only=True)

    class Meta:
        model = Colaborador
        fields = (
            "id",
            "user",
            "user_nombre",
            "nombre_completo",
            "first_name",
            "last_name",
            "email",
            "telefono",
            "rol",
            "role_id",
            "role_nombre",
            "es_profesional",
            "foto_perfil",
            "sede_principal",
            "sede_principal_nombre",
            "sedes",
            "sedes_ids",
            "sedes_detalle",
            "clinica_id",
            "tipo_contrato",
            "fecha_ingreso",
            "especialidades",
            "especialidades_detalle",
            "numero_documento",
            "horarios",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "nombre_completo",
            "user_nombre",
            "email",
            "foto_perfil",
            "sede_principal_nombre",
            "sedes",
            "sedes_detalle",
            "horarios",
        )

    def get_clinica_id(self, obj):
        if obj.sede_principal_id:
            return str(obj.sede_principal.clinica_id)
        if obj.user.clinica_id:
            return str(obj.user.clinica_id)
        return None

    def get_role_nombre(self, obj):
        return user_role_name(obj.user)

    def get_foto_perfil(self, obj):
        return get_public_url(obj.user.foto_perfil.name if obj.user.foto_perfil else "")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["rol"] = user_role_slug(instance.user)
        data["role_id"] = user_role_id(instance.user)
        return data

    def get_especialidades_detalle(self, obj):
        return [
            {"id": str(servicio.id), "nombre": servicio.nombre, "duracion_min": servicio.duracion_min}
            for servicio in obj.especialidades.all()
        ]

    def get_sedes_detalle(self, obj):
        return [{"id": str(sede.id), "nombre": sede.nombre} for sede in obj.sedes.all()]

    def validate_user(self, value):
        request = self.context.get("request")
        if request and request.user.rol != User.Role.SUPERADMIN and value.clinica_id != request.user.clinica_id:
            raise serializers.ValidationError("El usuario no pertenece a tu clinica.")
        if hasattr(value, "colaborador") and (not self.instance or self.instance.user_id != value.id):
            raise serializers.ValidationError("El usuario ya tiene un perfil de colaborador.")
        return value

    def validate_sede_principal(self, value):
        request = self.context.get("request")
        if request and request.user.rol != User.Role.SUPERADMIN and value.clinica_id != request.user.clinica_id:
            raise serializers.ValidationError("La sede no pertenece a tu clinica.")
        return value

    def validate_especialidades(self, value):
        request = self.context.get("request")
        if not request:
            return value
        for servicio in value:
            if request.user.rol != User.Role.SUPERADMIN and servicio.clinica_id != request.user.clinica_id:
                raise serializers.ValidationError("Las especialidades no coinciden con la clinica.")
        return value

    def validate_sedes(self, value):
        request = self.context.get("request")
        for sede in value:
            if request and request.user.rol != User.Role.SUPERADMIN and sede.clinica_id != request.user.clinica_id:
                raise serializers.ValidationError("Las sedes no pertenecen a tu clinica.")
        return value

    def validate(self, attrs):
        user = attrs.get("user", getattr(self.instance, "user", None))
        sede = attrs.get("sede_principal", getattr(self.instance, "sede_principal", None))
        sedes = attrs.get("sedes")
        role_id = attrs.get("role_id")
        rol_slug = attrs.get("rol")

        if role_id or rol_slug:
            attrs["_rol_dinamico"] = resolve_role(
                self.context["request"],
                role_id=role_id,
                rol_slug=rol_slug,
                disallowed_slugs={"superadmin"},
            )

        if user and sede and user.clinica_id and user.clinica_id != sede.clinica_id:
            raise serializers.ValidationError({"user": "El usuario y la sede deben pertenecer a la misma clinica."})
        if sedes is not None and sede and any(item.clinica_id != sede.clinica_id for item in sedes):
            raise serializers.ValidationError({"sedes_ids": "Todas las sedes deben pertenecer a la misma clinica."})
        if sedes is not None and sede is None:
            raise serializers.ValidationError({"sede_principal": "Debes definir sede_principal para asignar sedes."})
        return attrs

    def _save_user_updates(self, user, user_data):
        if not user_data:
            return
        for attr, value in user_data.items():
            setattr(user, attr, value)
        user.save(update_fields=list(user_data.keys()))

    def _apply_sedes(self, instance, sedes):
        if instance.sede_principal_id is None:
            if sedes is not None:
                instance.sedes.clear()
            return
        if sedes is None:
            instance.sedes.add(instance.sede_principal)
            return
        sedes_map = {sede.id: sede for sede in sedes}
        sedes_map[instance.sede_principal_id] = instance.sede_principal
        instance.sedes.set(sedes_map.values())

    def _apply_role(self, user, role):
        if not role:
            return
        user.rol_dinamico = role
        user.rol = legacy_storage_role(role.slug)
        user.es_profesional = role.es_profesional
        user.save(update_fields=["rol_dinamico", "rol", "es_profesional"])

    def update(self, instance, validated_data):
        role = validated_data.pop("_rol_dinamico", None)
        validated_data.pop("role_id", None)
        validated_data.pop("rol", None)
        user_fields = ("first_name", "last_name", "telefono", "es_profesional")
        user_data = {field: validated_data.pop(field) for field in user_fields if field in validated_data}
        sedes = validated_data.pop("sedes", None)

        if user_data:
            self._save_user_updates(instance.user, user_data)
        if role:
            self._apply_role(instance.user, role)

        instance = super().update(instance, validated_data)
        self._apply_sedes(instance, sedes)
        return instance


class ColaboradorCreateSerializer(ColaboradorSerializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False)
    email = serializers.EmailField(required=False)
    first_name = serializers.CharField(required=False)
    last_name = serializers.CharField(required=False)
    telefono = serializers.CharField(required=False, allow_blank=True)
    rol = serializers.CharField(required=False)
    role_id = serializers.UUIDField(required=False)
    es_profesional = serializers.BooleanField(required=False)

    class Meta(ColaboradorSerializer.Meta):
        fields = ColaboradorSerializer.Meta.fields

    def validate(self, attrs):
        attrs = super().validate(attrs)
        user = attrs.get("user")
        role = attrs.get("_rol_dinamico")
        sede_principal = attrs.get("sede_principal")
        email = attrs.get("email")

        if role is None:
            raise serializers.ValidationError({"role_id": "Debes enviar role_id o rol."})

        if user is None:
            required_fields = ("email", "first_name", "last_name")
            missing = [field for field in required_fields if not attrs.get(field)]
            if missing:
                raise serializers.ValidationError({field: "Este campo es obligatorio." for field in missing})
            if sede_principal and User.objects.filter(email=email, clinica=sede_principal.clinica).exists():
                raise serializers.ValidationError({"email": "Ya existe un usuario con ese email en esta clínica."})
        else:
            if email and email != user.email:
                raise serializers.ValidationError({"email": "No se puede cambiar el email de un usuario existente desde este endpoint."})

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        user = validated_data.pop("user", None)
        sedes = validated_data.pop("sedes", None)
        especialidades = validated_data.pop("especialidades", [])
        role = validated_data.pop("_rol_dinamico")
        validated_data.pop("role_id", None)
        validated_data.pop("rol", None)
        sede_principal = validated_data["sede_principal"]
        user_fields = ("email", "first_name", "last_name", "telefono", "es_profesional")
        user_data = {field: validated_data.pop(field) for field in user_fields if field in validated_data}
        user_data["es_profesional"] = role.es_profesional

        if user is None:
            user = User.objects.create_user(
                email=user_data["email"],
                password=None,
                first_name=user_data["first_name"],
                last_name=user_data["last_name"],
                telefono=user_data.get("telefono", ""),
                rol=legacy_storage_role(role.slug),
                rol_dinamico=role,
                es_profesional=user_data["es_profesional"],
                clinica=sede_principal.clinica,
            )
            user.activo = False
            user.is_active = False
            user.save(update_fields=["activo", "is_active"])
        else:
            self._save_user_updates(user, user_data)
            self._apply_role(user, role)

        colaborador = Colaborador.objects.create(user=user, **validated_data)
        if especialidades:
            colaborador.especialidades.set(especialidades)
        self._apply_sedes(colaborador, sedes)

        if user and not user.activo:
            send_invitation_email(user)
        return colaborador


class ColaboradorListSerializer(serializers.ModelSerializer):
    rol = serializers.SerializerMethodField()
    role_id = serializers.SerializerMethodField()
    role_nombre = serializers.SerializerMethodField()
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    telefono = serializers.CharField(source="user.telefono", read_only=True, allow_null=True)
    nombre_completo = serializers.CharField(read_only=True)
    sede_principal_nombre = serializers.CharField(source="sede_principal.nombre", read_only=True)
    especialidades = serializers.SerializerMethodField()

    class Meta:
        model = Colaborador
        fields = (
            "id",
            "user",
            "nombre_completo",
            "first_name",
            "last_name",
            "email",
            "telefono",
            "rol",
            "role_id",
            "role_nombre",
            "sede_principal",
            "sede_principal_nombre",
            "especialidades",
            "tipo_contrato",
            "fecha_ingreso",
            "numero_documento",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_especialidades(self, obj):
        return [
            {"id": str(item.id), "nombre": item.nombre, "duracion_min": item.duracion_min}
            for item in obj.especialidades.all()
        ]

    def get_rol(self, obj):
        return user_role_slug(obj.user)

    def get_role_id(self, obj):
        return user_role_id(obj.user)

    def get_role_nombre(self, obj):
        return user_role_name(obj.user)


class ProfesionalListSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="user.id", read_only=True)
    colaborador_id = serializers.UUIDField(source="pk", read_only=True)
    nombre_completo = serializers.CharField(read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    telefono = serializers.CharField(source="user.telefono", read_only=True, allow_null=True)
    rol = serializers.SerializerMethodField()
    role_id = serializers.SerializerMethodField()
    role_nombre = serializers.SerializerMethodField()
    sede_principal = serializers.UUIDField(source="sede_principal_id", read_only=True)
    sede_principal_nombre = serializers.CharField(source="sede_principal.nombre", read_only=True)
    especialidades = serializers.SerializerMethodField()

    class Meta:
        model = Colaborador
        fields = (
            "id",
            "colaborador_id",
            "nombre_completo",
            "first_name",
            "last_name",
            "email",
            "telefono",
            "rol",
            "role_id",
            "role_nombre",
            "sede_principal",
            "sede_principal_nombre",
            "especialidades",
        )

    def get_especialidades(self, obj):
        return [
            {"id": str(item.id), "nombre": item.nombre, "duracion_min": item.duracion_min}
            for item in obj.especialidades.all()
        ]

    def get_rol(self, obj):
        return user_role_slug(obj.user)

    def get_role_id(self, obj):
        return user_role_id(obj.user)

    def get_role_nombre(self, obj):
        return user_role_name(obj.user)


def colaborador_tiene_citas_futuras(colaborador):
    try:
        cita_model = apps.get_model("agenda", "Cita")
    except LookupError:
        return False

    if not hasattr(cita_model, "fecha_inicio"):
        return False

    from django.utils import timezone

    return cita_model.objects.filter(
        profesional=colaborador.user,
        fecha_inicio__gt=timezone.now(),
    ).exists()
