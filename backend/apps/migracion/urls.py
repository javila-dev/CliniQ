from django.urls import path

from apps.migracion.views import MigracionViewSet

lista = MigracionViewSet.as_view({"get": "list"})
detalle = MigracionViewSet.as_view({"get": "retrieve"})

urlpatterns = [
    path("lotes/", lista, name="migracion-lotes"),
    path("lotes/<uuid:pk>/", detalle, name="migracion-lote-detalle"),
    path(
        "lotes/<uuid:pk>/revertir/",
        MigracionViewSet.as_view({"post": "revertir"}),
        name="migracion-lote-revertir",
    ),
    path(
        "paciente-en-curso/",
        MigracionViewSet.as_view({"post": "paciente_en_curso"}),
        name="migracion-paciente-en-curso",
    ),
]
