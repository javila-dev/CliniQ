from django.contrib import admin

from apps.agenda.models import BloqueoAgenda, Cita, ConfirmacionToken


@admin.register(Cita)
class CitaAdmin(admin.ModelAdmin):
    list_display = (
        "paciente",
        "profesional",
        "sede",
        "servicio",
        "fecha_inicio",
        "estado",
        "estado_confirmacion",
    )
    search_fields = (
        "paciente__nombres",
        "paciente__apellidos",
        "paciente__numero_documento",
    )
    list_filter = ("estado", "estado_confirmacion", "sede", "profesional")


@admin.register(BloqueoAgenda)
class BloqueoAgendaAdmin(admin.ModelAdmin):
    list_display = ("profesional", "sede", "fecha_inicio", "fecha_fin", "motivo", "activo")
    list_filter = ("sede", "profesional", "activo")


@admin.register(ConfirmacionToken)
class ConfirmacionTokenAdmin(admin.ModelAdmin):
    list_display = ("cita", "token", "usado", "expira_en", "created_at")
    search_fields = ("token", "cita__paciente__numero_documento")
