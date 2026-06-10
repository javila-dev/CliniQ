from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.users.models import Permiso, Rol, RolAuditoria, RolPermiso, User


class RolPermisoInline(admin.TabularInline):
    model = RolPermiso
    extra = 0
    autocomplete_fields = ("permiso",)


@admin.register(Permiso)
class PermisoAdmin(admin.ModelAdmin):
    list_display = ("clave", "modulo", "accion", "assignable", "activo")
    list_filter = ("modulo", "assignable", "activo")
    search_fields = ("clave", "descripcion")


@admin.register(Rol)
class RolAdmin(admin.ModelAdmin):
    list_display = ("nombre", "slug", "clinica", "es_sistema", "editable", "activo")
    list_filter = ("es_sistema", "editable", "activo", "clinica")
    search_fields = ("nombre", "slug", "clinica__nombre")
    inlines = (RolPermisoInline,)


@admin.register(RolAuditoria)
class RolAuditoriaAdmin(admin.ModelAdmin):
    list_display = ("accion", "rol", "usuario", "created_at")
    list_filter = ("accion", "created_at")
    search_fields = ("rol__nombre", "usuario__email")
    readonly_fields = ("created_at", "updated_at")


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("last_name", "first_name", "email")
    list_display = ("email", "first_name", "last_name", "rol", "rol_dinamico", "es_profesional", "clinica", "activo")
    list_filter = ("rol", "es_profesional", "activo", "is_staff", "is_superuser", "clinica")
    search_fields = ("email", "first_name", "last_name", "telefono")
    readonly_fields = ("created_at", "updated_at", "last_login", "date_joined")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Informacion personal", {"fields": ("first_name", "last_name", "telefono", "foto_perfil")}),
        ("Acceso", {"fields": ("rol", "rol_dinamico", "es_profesional", "clinica", "activo", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Fechas", {"fields": ("last_login", "date_joined", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "first_name", "last_name", "rol", "rol_dinamico", "es_profesional", "clinica", "password1", "password2", "is_staff", "is_superuser", "activo"),
            },
        ),
    )
