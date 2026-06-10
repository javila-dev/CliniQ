from django.contrib import admin

from apps.inventario.models import CategoriaInsumo, Insumo, MovimientoInventario


@admin.register(CategoriaInsumo)
class CategoriaInsumoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "clinica", "activo", "created_at")
    list_filter = ("activo", "clinica")
    search_fields = ("nombre",)


@admin.register(Insumo)
class InsumoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "es_consumo_interno", "es_venta_retail", "unidad_medida", "stock_actual", "stock_minimo", "activo")
    list_filter = ("es_consumo_interno", "es_venta_retail", "activo", "categoria", "clinica")
    search_fields = ("nombre",)
    readonly_fields = ("costo_promedio",)


@admin.register(MovimientoInventario)
class MovimientoInventarioAdmin(admin.ModelAdmin):
    list_display = ("insumo", "tipo", "cantidad", "origen", "fecha", "realizado_por")
    list_filter = ("tipo", "origen")
    search_fields = ("insumo__nombre",)
    readonly_fields = (
        "id", "insumo", "tipo", "cantidad", "costo_unitario",
        "costo_promedio_resultante", "stock_resultante", "origen",
        "referencia_id", "referencia_tipo", "motivo", "realizado_por", "fecha",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
