from django.contrib import admin

from .models import ArticuloAyuda, CategoriaAyuda


@admin.register(CategoriaAyuda)
class CategoriaAyudaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "slug", "orden")
    ordering = ("orden", "nombre")
    search_fields = ("nombre", "slug")
    prepopulated_fields = {"slug": ("nombre",)}


@admin.register(ArticuloAyuda)
class ArticuloAyudaAdmin(admin.ModelAdmin):
    list_display = ("titulo", "categoria", "area", "estado", "destacado", "tiene_video_flag", "updated_at")
    list_filter = ("estado", "categoria", "area", "destacado")
    search_fields = ("titulo", "resumen", "keywords", "contenido")
    ordering = ("categoria", "orden", "titulo")
    autocomplete_fields = ("categoria",)
    prepopulated_fields = {"slug": ("titulo",)}
    readonly_fields = ("vistas", "util_si", "util_no", "publicado_at", "actualizado_por", "created_at", "updated_at")

    @admin.display(boolean=True, description="video")
    def tiene_video_flag(self, obj):
        return obj.tiene_video

    def save_model(self, request, obj, form, change):
        obj.actualizado_por = request.user
        super().save_model(request, obj, form, change)
