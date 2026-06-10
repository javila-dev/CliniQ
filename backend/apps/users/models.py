from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel
from apps.users.managers import CustomUserManager


class User(AbstractUser, BaseModel):
    username = None

    class Role(models.TextChoices):
        SUPERADMIN = "superadmin", "Superadministrador"
        ADMIN = "admin", "Administrador"
        PROFESIONAL = "profesional", "Profesional"
        RECEPCION = "recepcion", "Recepcion"

    email = models.EmailField(unique=True)
    rol = models.CharField(max_length=20, choices=Role.choices, default=Role.RECEPCION)
    es_profesional = models.BooleanField(default=False)
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="usuarios",
    )
    rol_dinamico = models.ForeignKey(
        "users.Rol",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="usuarios",
    )
    telefono = models.CharField(max_length=20, blank=True)
    foto_perfil = models.ImageField(upload_to="perfiles/", null=True, blank=True)
    registro_profesional = models.CharField(max_length=60, blank=True, default="")
    firma_digital = models.ImageField(upload_to="firmas_profesionales/", null=True, blank=True)

    objects = CustomUserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "users"
        ordering = ["last_name", "first_name"]

    @property
    def es_admin(self) -> bool:
        return self.rol in {self.Role.ADMIN, self.Role.SUPERADMIN}

    @property
    def nombre_completo(self) -> str:
        nombre = self.get_full_name().strip()
        return nombre or self.email

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        if self.rol == self.Role.PROFESIONAL:
            self.es_profesional = True
            if update_fields is not None and "es_profesional" not in update_fields:
                kwargs["update_fields"] = set(update_fields) | {"es_profesional"}
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.nombre_completo


class Permiso(BaseModel):
    clave = models.CharField(max_length=120, unique=True)
    modulo = models.CharField(max_length=60)
    accion = models.CharField(max_length=80)
    descripcion = models.CharField(max_length=255, blank=True)
    assignable = models.BooleanField(default=True)

    class Meta:
        db_table = "permisos"
        ordering = ["modulo", "accion", "clave"]

    def __str__(self) -> str:
        return self.clave


class Rol(BaseModel):
    clinica = models.ForeignKey(
        "clinicas.Clinica",
        on_delete=models.CASCADE,
        related_name="roles",
    )
    slug = models.SlugField(max_length=50)
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)
    es_sistema = models.BooleanField(default=False)
    editable = models.BooleanField(default=True)
    es_profesional = models.BooleanField(default=False)
    permisos = models.ManyToManyField(
        Permiso,
        through="users.RolPermiso",
        related_name="roles",
        blank=True,
    )

    class Meta:
        db_table = "roles"
        ordering = ["nombre"]
        constraints = [
            models.UniqueConstraint(fields=["clinica", "slug"], name="unique_rol_slug_por_clinica"),
        ]

    def __str__(self) -> str:
        return f"{self.nombre} ({self.clinica_id})"


class RolPermiso(BaseModel):
    rol = models.ForeignKey(Rol, on_delete=models.CASCADE, related_name="rol_permisos")
    permiso = models.ForeignKey(Permiso, on_delete=models.CASCADE, related_name="rol_permisos")

    class Meta:
        db_table = "roles_permisos"
        constraints = [
            models.UniqueConstraint(fields=["rol", "permiso"], name="unique_permiso_por_rol"),
        ]

    def __str__(self) -> str:
        return f"{self.rol_id}:{self.permiso_id}"


class RolAuditoria(BaseModel):
    class Accion(models.TextChoices):
        CREAR = "crear", "Crear"
        EDITAR = "editar", "Editar"
        ELIMINAR = "eliminar", "Eliminar"
        ASIGNAR_PERMISOS = "asignar_permisos", "Asignar permisos"

    rol = models.ForeignKey(
        Rol,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="auditorias",
    )
    usuario = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="auditorias_roles",
    )
    accion = models.CharField(max_length=40, choices=Accion.choices)
    antes = models.JSONField(null=True, blank=True)
    despues = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "roles_auditoria"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.accion} {self.rol_id or ''}".strip()


class PasswordResetToken(BaseModel):
    class Purpose(models.TextChoices):
        RESET = "reset", "Recuperacion"
        INVITE = "invite", "Invitacion"

    user = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
    )
    token = models.CharField(max_length=128, unique=True, db_index=True)
    purpose = models.CharField(
        max_length=20,
        choices=Purpose.choices,
        default=Purpose.RESET,
    )
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "password_reset_tokens"
        ordering = ["-created_at"]

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_used(self) -> bool:
        return self.used_at is not None
