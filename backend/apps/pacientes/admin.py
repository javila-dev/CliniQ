from django.contrib import admin

from apps.pacientes.models import Paciente


@admin.register(Paciente)
class PacienteAdmin(admin.ModelAdmin):
    list_display = (
        "nombre_completo",
        "clinica",
        "tipo_documento",
        "numero_documento",
        "telefono",
        "canal_confirmacion",
        "activo",
    )
    search_fields = (
        "nombres",
        "apellidos",
        "numero_documento",
        "telefono",
        "email",
    )
    list_filter = ("clinica", "sexo", "canal_confirmacion", "tipo_documento", "activo")
