from django.contrib import admin

from apps.caja.models import Caja, CategoriaGasto, GastoCaja, SesionCaja


@admin.register(CategoriaGasto)
class CategoriaGastoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "clinica", "activa")
    list_filter = ("activa", "clinica")
    search_fields = ("nombre",)


@admin.register(Caja)
class CajaAdmin(admin.ModelAdmin):
    list_display = ("sede", "responsable", "saldo_inicial", "activa")
    list_filter = ("activa", "sede__clinica")
    readonly_fields = ("created_at",)


@admin.register(SesionCaja)
class SesionCajaAdmin(admin.ModelAdmin):
    list_display = (
        "caja", "estado", "abierta_en", "monto_apertura",
        "total_ingresos", "total_egresos", "esperado", "efectivo_contado", "diferencia",
    )
    list_filter = ("estado", "caja__sede")
    readonly_fields = (
        "total_ingresos", "total_egresos", "esperado", "diferencia",
        "abierta_por", "cerrada_por", "cerrada_en", "created_at",
    )


@admin.register(GastoCaja)
class GastoCajaAdmin(admin.ModelAdmin):
    list_display = ("descripcion", "valor", "sede", "categoria", "fecha", "sesion", "registrado_por")
    list_filter = ("fecha", "sede", "categoria")
    search_fields = ("descripcion",)
    readonly_fields = ("registrado_por", "created_at")
