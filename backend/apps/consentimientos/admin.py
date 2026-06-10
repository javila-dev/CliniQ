from django.contrib import admin

from apps.consentimientos.models import Consentimiento, PlantillaConsentimiento


@admin.register(PlantillaConsentimiento)
class PlantillaConsentimientoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "clinica", "servicio", "version", "activo")
    search_fields = ("nombre", "clinica__nombre", "servicio__nombre")
    list_filter = ("clinica", "servicio", "activo")


@admin.register(Consentimiento)
class ConsentimientoAdmin(admin.ModelAdmin):
    list_display = ("id", "paciente", "plantilla", "estado", "firmado_en", "created_at")
    search_fields = ("paciente__nombres", "paciente__apellidos", "hash_contenido", "token")
    list_filter = ("estado", "plantilla__clinica", "plantilla")
