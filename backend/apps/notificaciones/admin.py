from django.contrib import admin

from apps.notificaciones.models import NotificacionFallida


@admin.register(NotificacionFallida)
class NotificacionFallidaAdmin(admin.ModelAdmin):
    list_display = ("tipo_notificacion", "telefono", "clinica", "resuelta", "created_at")
    list_filter = ("tipo_notificacion", "resuelta", "clinica")
    search_fields = ("telefono", "motivo", "paciente__nombres", "paciente__apellidos")
    autocomplete_fields = ("paciente",)

