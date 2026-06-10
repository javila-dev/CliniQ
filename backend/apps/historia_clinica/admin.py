from django.contrib import admin

from apps.historia_clinica.models import FotoClinica, HistoriaClinica, NotaClinica


@admin.register(HistoriaClinica)
class HistoriaClinicaAdmin(admin.ModelAdmin):
    list_display = ("numero", "paciente", "clinica", "created_at")
    search_fields = ("numero", "paciente__nombres", "paciente__apellidos", "paciente__numero_documento")
    list_filter = ("clinica",)


@admin.register(NotaClinica)
class NotaClinicaAdmin(admin.ModelAdmin):
    list_display = ("historia", "estado", "firmada_por", "created_at")
    search_fields = ("historia__numero", "firmada_por__first_name", "firmada_por__last_name")
    list_filter = ("estado",)


@admin.register(FotoClinica)
class FotoClinicaAdmin(admin.ModelAdmin):
    list_display = ("nota", "tipo", "descripcion", "created_at")
    list_filter = ("tipo",)
