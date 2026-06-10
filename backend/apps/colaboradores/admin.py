from django.contrib import admin

from apps.colaboradores.models import Colaborador


@admin.register(Colaborador)
class ColaboradorAdmin(admin.ModelAdmin):
    list_display = (
        "nombre_completo",
        "user",
        "sede_principal",
        "tipo_contrato",
        "numero_documento",
        "activo",
    )
    search_fields = (
        "user__first_name",
        "user__last_name",
        "user__email",
        "numero_documento",
    )
    list_filter = ("activo", "tipo_contrato", "sede_principal__clinica", "sede_principal")
    filter_horizontal = ("especialidades",)
