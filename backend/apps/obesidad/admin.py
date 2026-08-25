from django.contrib import admin

from .models import (
    AntecedentesObesidad,
    MedicionAntropometrica,
    ObjetivoObesidad,
    ResultadoLaboratorio,
    TratamientoFarmacologico,
)


@admin.register(AntecedentesObesidad)
class AntecedentesObesidadAdmin(admin.ModelAdmin):
    list_display  = ("historia", "actividad_fisica", "antecedente_familiar", "activo")
    search_fields = ("historia__numero", "historia__paciente__nombres", "historia__paciente__apellidos")
    list_filter   = ("activo", "actividad_fisica")
    raw_id_fields = ("historia",)


@admin.register(ObjetivoObesidad)
class ObjetivoObesidadAdmin(admin.ModelAdmin):
    list_display  = ("paciente", "peso_inicial_kg", "peso_objetivo_kg", "fecha_inicio", "activo")
    search_fields = ("paciente__nombres", "paciente__apellidos", "paciente__numero_documento")
    list_filter   = ("activo",)
    raw_id_fields = ("paciente", "cotizacion")


@admin.register(MedicionAntropometrica)
class MedicionAntropometricaAdmin(admin.ModelAdmin):
    list_display  = ("paciente", "peso_kg", "imc", "fecha", "tomado_por", "activo")
    search_fields = ("paciente__nombres", "paciente__apellidos", "paciente__numero_documento")
    list_filter   = ("activo",)
    raw_id_fields = ("paciente", "nota", "tomado_por")
    readonly_fields = ("imc", "icc")


@admin.register(ResultadoLaboratorio)
class ResultadoLaboratorioAdmin(admin.ModelAdmin):
    list_display  = ("paciente", "tipo", "fecha", "registrado_por", "activo")
    search_fields = ("paciente__nombres", "paciente__apellidos")
    list_filter   = ("activo", "tipo")
    raw_id_fields = ("paciente", "registrado_por")


@admin.register(TratamientoFarmacologico)
class TratamientoFarmacologicoAdmin(admin.ModelAdmin):
    list_display  = ("paciente", "medicamento", "via", "fecha_inicio", "fecha_fin", "activo")
    search_fields = ("paciente__nombres", "paciente__apellidos", "medicamento", "principio_activo")
    list_filter   = ("activo", "via")
    raw_id_fields = ("paciente", "nota", "indicado_por")
