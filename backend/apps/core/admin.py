from django.contrib import admin

from apps.core.models import ConfiguracionGlobal


@admin.register(ConfiguracionGlobal)
class ConfiguracionGlobalAdmin(admin.ModelAdmin):
    list_display = ("centro_ayuda_habilitado", "dias_prueba", "correos_ciclo_vida_habilitados", "actualizado_por", "updated_at")

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
