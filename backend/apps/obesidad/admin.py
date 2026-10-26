from django.contrib import admin

from .models import MedicionAntropometrica


@admin.register(MedicionAntropometrica)
class MedicionAntropometricaAdmin(admin.ModelAdmin):
    list_display  = ("paciente", "peso_kg", "imc", "fecha", "tomado_por", "activo")
    search_fields = ("paciente__nombres", "paciente__apellidos", "paciente__numero_documento")
    list_filter   = ("activo",)
    raw_id_fields = ("paciente", "nota", "tomado_por")
    readonly_fields = ("imc", "icc")
