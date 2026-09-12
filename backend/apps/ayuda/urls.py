from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ArticuloAyudaViewSet, CategoriaAyudaViewSet, SubirImagenAyudaView

router = DefaultRouter()
router.register("categorias", CategoriaAyudaViewSet, basename="ayuda-categorias")
router.register("articulos", ArticuloAyudaViewSet, basename="ayuda-articulos")

urlpatterns = router.urls + [
    path("imagenes/", SubirImagenAyudaView.as_view(), name="ayuda-imagenes"),
]
