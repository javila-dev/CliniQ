from django.contrib import admin

from apps.proveedores.models import ItemOrdenCompra, OrdenCompra, Proveedor


class ItemOrdenCompraInline(admin.TabularInline):
    model = ItemOrdenCompra
    extra = 0


@admin.register(Proveedor)
class ProveedorAdmin(admin.ModelAdmin):
    list_display = ("nombre", "clinica", "categoria", "telefono", "activo")
    list_filter = ("clinica", "categoria", "activo")
    search_fields = ("nombre", "nit", "contacto", "email")


@admin.register(OrdenCompra)
class OrdenCompraAdmin(admin.ModelAdmin):
    list_display = ("numero", "proveedor", "sede", "estado", "fecha", "activo")
    list_filter = ("estado", "sede", "activo")
    search_fields = ("numero", "proveedor__nombre")
    inlines = [ItemOrdenCompraInline]
