from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.core.storage import delete_public_file, get_public_url, upload_public_file, read_public_file
from apps.users.authorization import get_user_permission_keys
from apps.users.models import Permiso, Rol
from apps.users.services import validate_password_strength


User = get_user_model()

ROLES_ADMIN_CREABLES = {"admin", "recepcion"}
ROLES_NO_CREABLES_DESDE_USUARIOS = {"superadmin", "profesional"}


def user_role_slug(user) -> str:
    if getattr(user, "rol_dinamico", None):
        return user.rol_dinamico.slug
    return user.rol


def user_role_id(user):
    if getattr(user, "rol_dinamico_id", None):
        return str(user.rol_dinamico_id)
    return None


def user_role_name(user):
    if getattr(user, "rol_dinamico", None):
        return user.rol_dinamico.nombre
    return user.get_rol_display() if hasattr(user, "get_rol_display") else user.rol


def user_sede_id(user):
    colaborador = getattr(user, "colaborador", None)
    if getattr(colaborador, "sede_principal_id", None):
        return str(colaborador.sede_principal_id)
    return None


def legacy_storage_role(slug: str) -> str:
    if slug in {choice[0] for choice in User.Role.choices}:
        return slug
    return User.Role.RECEPCION


def resolve_role(request, *, role_id=None, rol_slug=None, disallowed_slugs=None):
    disallowed_slugs = set(disallowed_slugs or ROLES_NO_CREABLES_DESDE_USUARIOS)
    if role_id and rol_slug:
        raise serializers.ValidationError(
            {"role_id": "Envia role_id o rol, no ambos."}
        )
    slug = rol_slug or "recepcion"
    if slug in disallowed_slugs:
        raise serializers.ValidationError(
            {"rol": "No se puede asignar este rol desde gestion de usuarios."}
        )

    clinica = request.user.clinica
    if not clinica:
        raise serializers.ValidationError(
            {"clinica": "El usuario autenticado no tiene una clinica asociada."}
        )

    queryset = Rol.objects.filter(clinica=clinica, activo=True)
    if role_id:
        try:
            role = queryset.get(id=role_id)
        except Rol.DoesNotExist as exc:
            raise serializers.ValidationError({"role_id": "El rol no existe en tu clinica."}) from exc
    else:
        try:
            role = queryset.get(slug=slug)
        except Rol.DoesNotExist as exc:
            raise serializers.ValidationError({"rol": "El rol no existe en tu clinica."}) from exc

    if role.slug in disallowed_slugs:
        raise serializers.ValidationError(
            {"rol": "No se puede asignar este rol desde gestion de usuarios."}
        )
    return role


class UserAdminSerializer(serializers.ModelSerializer):
    foto_perfil = serializers.SerializerMethodField()
    rol = serializers.SerializerMethodField()
    role_id = serializers.SerializerMethodField()
    role_nombre = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    nombre_completo = serializers.CharField(read_only=True)
    tiene_colaborador = serializers.SerializerMethodField()
    sede_principal_nombre = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "nombre_completo",
            "rol",
            "role_id",
            "role_nombre",
            "permissions",
            "es_profesional",
            "telefono",
            "foto_perfil",
            "activo",
            "created_at",
            "tiene_colaborador",
            "sede_principal_nombre",
        )
        read_only_fields = fields

    def get_tiene_colaborador(self, obj):
        return hasattr(obj, "colaborador")

    def get_sede_principal_nombre(self, obj):
        try:
            return obj.colaborador.sede_principal.nombre
        except AttributeError:
            return None

    def get_foto_perfil(self, obj):
        return get_public_url(obj.foto_perfil.name if obj.foto_perfil else "")

    def get_rol(self, obj):
        return user_role_slug(obj)

    def get_role_id(self, obj):
        return user_role_id(obj)

    def get_role_nombre(self, obj):
        return user_role_name(obj)

    def get_permissions(self, obj):
        return sorted(get_user_permission_keys(obj, request=self.context.get("request")))


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    rol = serializers.CharField(required=False)
    role_id = serializers.UUIDField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ("email", "first_name", "last_name", "password", "rol", "role_id", "es_profesional", "telefono")

    def validate_email(self, value):
        request = self.context["request"]
        if User.objects.filter(email=value, clinica=request.user.clinica).exists():
            raise serializers.ValidationError("Ya existe un usuario con ese email en esta clínica.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs["_rol_dinamico"] = resolve_role(
            self.context["request"],
            role_id=attrs.get("role_id"),
            rol_slug=attrs.get("rol"),
        )
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        password = validated_data.pop("password")
        role = validated_data.pop("_rol_dinamico")
        validated_data.pop("role_id", None)
        validated_data.pop("rol", None)
        validated_data.pop("es_profesional", None)
        user = User(
            **validated_data,
            clinica=request.user.clinica,
            rol=legacy_storage_role(role.slug),
            rol_dinamico=role,
            es_profesional=False,
        )
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    rol = serializers.CharField(required=False)
    role_id = serializers.UUIDField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ("first_name", "last_name", "telefono", "rol", "role_id", "es_profesional", "activo")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance and self.instance.rol == "superadmin":
            raise serializers.ValidationError({"rol": "No se puede cambiar el rol de un superadmin."})
        if "role_id" in attrs or "rol" in attrs:
            attrs["_rol_dinamico"] = resolve_role(
                self.context["request"],
                role_id=attrs.get("role_id"),
                rol_slug=attrs.get("rol"),
            )
        return attrs

    def update(self, instance, validated_data):
        role = validated_data.pop("_rol_dinamico", None)
        validated_data.pop("role_id", None)
        validated_data.pop("rol", None)
        if role:
            instance.rol_dinamico = role
            instance.rol = legacy_storage_role(role.slug)
            validated_data["es_profesional"] = False
        return super().update(instance, validated_data)


class UserSerializer(serializers.ModelSerializer):
    foto_perfil = serializers.SerializerMethodField()
    firma_digital_url = serializers.SerializerMethodField()
    rol = serializers.SerializerMethodField()
    role_id = serializers.SerializerMethodField()
    role_nombre = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    clinica_id = serializers.UUIDField(read_only=True)
    sede_id = serializers.SerializerMethodField()
    clinica_nombre = serializers.CharField(source="clinica.nombre", read_only=True)
    nombre_completo = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "nombre_completo",
            "rol",
            "role_id",
            "role_nombre",
            "permissions",
            "es_profesional",
            "clinica_id",
            "sede_id",
            "clinica",
            "clinica_nombre",
            "telefono",
            "foto_perfil",
            "registro_profesional",
            "firma_digital_url",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "email",
            "rol",
            "role_id",
            "role_nombre",
            "permissions",
            "es_profesional",
            "clinica_id",
            "sede_id",
            "clinica",
            "clinica_nombre",
            "activo",
            "created_at",
            "updated_at",
        )

    def get_rol(self, obj):
        return user_role_slug(obj)

    def get_foto_perfil(self, obj):
        return get_public_url(obj.foto_perfil.name if obj.foto_perfil else "")

    def get_firma_digital_url(self, obj):
        return get_public_url(obj.firma_digital.name if obj.firma_digital else "")

    def get_role_id(self, obj):
        return user_role_id(obj)

    def get_role_nombre(self, obj):
        return user_role_name(obj)

    def get_permissions(self, obj):
        return sorted(get_user_permission_keys(obj, request=self.context.get("request")))

    def get_sede_id(self, obj):
        return user_sede_id(obj)


class MeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("telefono", "foto_perfil", "registro_profesional", "firma_digital")

    def validate(self, attrs):
        is_profesional = getattr(self.instance, "es_profesional", False)
        if not is_profesional:
            if "firma_digital" in attrs:
                raise serializers.ValidationError({"firma_digital": "Solo los profesionales pueden subir una firma digital."})
            if "registro_profesional" in attrs and attrs["registro_profesional"]:
                raise serializers.ValidationError({"registro_profesional": "Solo los profesionales tienen registro profesional."})
        return attrs

    def _upload_image_field(self, instance, field_name, file_obj):
        field = instance._meta.get_field(field_name)
        previous_path = getattr(instance, field_name).name if getattr(instance, field_name) else ""
        path = field.generate_filename(instance, file_obj.name)
        upload_public_file(file_obj.read(), path, file_obj.content_type or "application/octet-stream")
        setattr(instance, field_name, path)
        update_fields = [field_name, "updated_at"]
        if previous_path and previous_path != path:
            delete_public_file(previous_path)
        return update_fields

    def update(self, instance, validated_data):
        foto_perfil = validated_data.pop("foto_perfil", None)
        firma_digital = validated_data.pop("firma_digital", None)
        instance = super().update(instance, validated_data)
        extra_fields: list[str] = []
        if foto_perfil is not None:
            extra_fields += self._upload_image_field(instance, "foto_perfil", foto_perfil)
        if firma_digital is not None:
            extra_fields += self._upload_image_field(instance, "firma_digital", firma_digital)
        if extra_fields:
            instance.save(update_fields=list(set(extra_fields)))
        return instance


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class InvitationRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    nueva_password = serializers.CharField(write_only=True)
    confirmar_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["nueva_password"] != attrs["confirmar_password"]:
            raise serializers.ValidationError({"confirmar_password": "Las contrasenas no coinciden."})
        validate_password_strength(attrs["nueva_password"])
        return attrs


class LoginSerializer(TokenObtainPairSerializer):
    default_error_messages = {
        "no_active_account": "Credenciales invalidas.",
    }

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["rol"] = user_role_slug(user)
        token["clinica_id"] = str(user.clinica_id) if user.clinica_id else None
        token["sede_id"] = user_sede_id(user)
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = {
            "id": str(self.user.id),
            "email": self.user.email,
            "first_name": self.user.first_name,
            "last_name": self.user.last_name,
            "nombre_completo": self.user.nombre_completo,
            "rol": user_role_slug(self.user),
            "role_id": user_role_id(self.user),
            "role_nombre": user_role_name(self.user),
            "permissions": sorted(get_user_permission_keys(self.user)),
            "es_profesional": self.user.es_profesional,
            "clinica_id": str(self.user.clinica_id) if self.user.clinica_id else None,
            "sede_id": user_sede_id(self.user),
            "clinica_nombre": self.user.clinica.nombre if self.user.clinica_id else None,
        }
        return data


class PermisoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permiso
        fields = ("id", "clave", "modulo", "accion", "descripcion")
        read_only_fields = fields


class RolSerializer(serializers.ModelSerializer):
    permission_keys = serializers.SerializerMethodField()
    usuarios_count = serializers.SerializerMethodField()

    class Meta:
        model = Rol
        fields = (
            "id",
            "slug",
            "nombre",
            "descripcion",
            "es_sistema",
            "editable",
            "es_profesional",
            "activo",
            "permission_keys",
            "usuarios_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "es_sistema", "editable", "permission_keys", "usuarios_count", "created_at", "updated_at")

    def get_permission_keys(self, obj):
        return sorted(obj.permisos.filter(activo=True).values_list("clave", flat=True))

    def get_usuarios_count(self, obj):
        return getattr(obj, "usuarios_count", obj.usuarios.count())

    def validate_slug(self, value):
        value = value.strip().lower()
        if value in {"superadmin"}:
            raise serializers.ValidationError("Este slug esta reservado.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        slug = attrs.get("slug", getattr(self.instance, "slug", None))
        qs = Rol.objects.filter(clinica=request.user.clinica, slug=slug)
        if self.instance:
            qs = qs.exclude(id=self.instance.id)
        if qs.exists():
            raise serializers.ValidationError({"slug": "Ya existe un rol con ese slug en tu clinica."})
        return attrs


class RolPermisosUpdateSerializer(serializers.Serializer):
    permission_keys = serializers.ListField(
        child=serializers.CharField(),
        allow_empty=True,
    )

    def validate_permission_keys(self, value):
        keys = sorted(set(value))
        permisos = Permiso.objects.filter(clave__in=keys, activo=True, assignable=True)
        encontrados = set(permisos.values_list("clave", flat=True))
        faltantes = sorted(set(keys) - encontrados)
        if faltantes:
            raise serializers.ValidationError(
                "Permisos no asignables o inexistentes: " + ", ".join(faltantes)
            )
        return keys
