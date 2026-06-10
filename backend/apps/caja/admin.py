from django.contrib import admin

from apps.caja.models import CategoriaGasto, CierreCaja, GastoCaja


@admin.register(CategoriaGasto)
class CategoriaGastoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "clinica", "activa")
    list_filter = ("activa", "clinica")
    search_fields = ("nombre",)


@admin.register(GastoCaja)
class GastoCajaAdmin(admin.ModelAdmin):
    list_display = ("descripcion", "valor", "sede", "categoria", "fecha", "estado", "registrado_por")
    list_filter = ("estado", "fecha", "sede")
    search_fields = ("descripcion",)
    readonly_fields = ("registrado_por", "aprobado_por", "aprobado_en", "created_at")


@admin.register(CierreCaja)
class CierreCajaAdmin(admin.ModelAdmin):
    list_display = ("sede", "fecha", "total_cobros", "total_gastos", "efectivo_contado", "diferencia", "cerrado_por")
    list_filter = ("sede", "fecha")
    readonly_fields = ("total_cobros", "total_gastos", "diferencia", "cerrado_por", "created_at")
