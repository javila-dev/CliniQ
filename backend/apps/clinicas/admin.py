from django.contrib import admin

from apps.clinicas.models import (
    Clinica,
    DiagramaCorporal,
    GrupoZonas,
    GrupoZonasDiagrama,
    PasoProtocolo,
    Sede,
    Servicio,
    ServicioConsentimiento,
    ServicioDiagrama,
    ServicioGrupoZonas,
    TipoSesion,
    TipoSesionProcedimiento,
    TratamientoCatalogo,
    TratamientoProcedimiento,
)


class SedeInline(admin.StackedInline):
    model = Sede
    extra = 0


@admin.register(Clinica)
class ClinicaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "nit", "telefono", "slot_interval_min", "recordatorios_automaticos", "intervalo_recordatorio_horas", "activo", "created_at")
    search_fields = ("nombre", "nit")
    list_filter = ("activo", "recordatorios_automaticos")
    inlines = (SedeInline,)


@admin.register(Sede)
class SedeAdmin(admin.ModelAdmin):
    list_display = ("nombre", "clinica", "ciudad", "telefono", "activo")
    search_fields = ("nombre", "clinica__nombre", "ciudad", "direccion")
    list_filter = ("activo", "ciudad", "clinica")


class ServicioDiagramaInline(admin.TabularInline):
    model = ServicioDiagrama
    extra = 0
    fields = ("diagrama", "orden", "activo")


@admin.register(Servicio)
class ServicioAdmin(admin.ModelAdmin):
    list_display = ("nombre", "clinica", "duracion_min", "precio", "tiene_protocolo", "activo")
    search_fields = ("nombre", "descripcion", "clinica__nombre")
    list_filter = ("clinica", "activo", "tiene_protocolo")
    inlines = (ServicioDiagramaInline,)


@admin.register(ServicioConsentimiento)
class ServicioConsentimientoAdmin(admin.ModelAdmin):
    list_display = ("servicio", "template", "orden", "activo")
    search_fields = ("servicio__nombre", "template__template_token")
    list_filter = ("activo", "servicio__clinica")


@admin.register(PasoProtocolo)
class PasoProtocoloAdmin(admin.ModelAdmin):
    list_display = ("servicio", "orden", "nombre", "semana", "es_control", "activo")
    search_fields = ("servicio__nombre", "nombre")
    list_filter = ("activo", "es_control", "servicio__clinica")


@admin.register(TratamientoCatalogo)
class TratamientoCatalogoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "clinica", "precio_estimado", "activo")
    search_fields = ("nombre", "descripcion", "clinica__nombre")
    list_filter = ("activo", "clinica")


@admin.register(TratamientoProcedimiento)
class TratamientoProcedimientoAdmin(admin.ModelAdmin):
    list_display = ("tratamiento", "procedimiento", "cantidad", "orden", "activo")
    search_fields = ("tratamiento__nombre", "procedimiento__nombre")
    list_filter = ("activo", "tratamiento__clinica")


@admin.register(TipoSesion)
class TipoSesionAdmin(admin.ModelAdmin):
    list_display = ("nombre", "tratamiento", "cantidad", "orden", "es_compromiso", "activo")
    search_fields = ("nombre", "tratamiento__nombre")
    list_filter = ("activo", "es_compromiso", "tratamiento__clinica")


@admin.register(DiagramaCorporal)
class DiagramaCorporalAdmin(admin.ModelAdmin):
    list_display = ("nombre", "orden", "activo", "created_at")
    search_fields = ("nombre",)
    list_filter = ("activo",)
    ordering = ("orden", "nombre")


class GrupoZonasDiagramaInline(admin.TabularInline):
    model = GrupoZonasDiagrama
    extra = 0
    fields = ("diagrama", "orden")


@admin.register(GrupoZonas)
class GrupoZonasAdmin(admin.ModelAdmin):
    list_display = ("nombre", "activo", "created_at")
    search_fields = ("nombre",)
    list_filter = ("activo",)
    inlines = (GrupoZonasDiagramaInline,)


@admin.register(ServicioGrupoZonas)
class ServicioGrupoZonasAdmin(admin.ModelAdmin):
    list_display = ("servicio", "grupo", "orden", "activo")
    search_fields = ("servicio__nombre", "grupo__nombre")
    list_filter = ("activo",)


@admin.register(TipoSesionProcedimiento)
class TipoSesionProcedimientoAdmin(admin.ModelAdmin):
    list_display = ("tipo_sesion", "procedimiento", "orden", "activo")
    search_fields = ("tipo_sesion__nombre", "procedimiento__nombre")
    list_filter = ("activo", "tipo_sesion__tratamiento__clinica")
