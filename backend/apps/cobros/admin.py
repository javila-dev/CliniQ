from django.contrib import admin

from apps.cobros.models import Cobro, ItemCobro, PagoRecibido


class ItemCobroInline(admin.TabularInline):
    model = ItemCobro
    extra = 0
    readonly_fields = ("subtotal", "costo_unitario")


class PagoRecibidoInline(admin.TabularInline):
    model = PagoRecibido
    extra = 0
    readonly_fields = ("created_at",)


@admin.register(Cobro)
class CobroAdmin(admin.ModelAdmin):
    list_display = ("id", "paciente", "sede", "total", "estado", "fecha")
    list_filter = ("estado", "sede")
    search_fields = ("paciente__primer_nombre", "paciente__primer_apellido")
    readonly_fields = ("subtotal", "total", "created_at", "updated_at")
    inlines = [ItemCobroInline, PagoRecibidoInline]
