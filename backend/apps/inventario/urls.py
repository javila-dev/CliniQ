from rest_framework.routers import DefaultRouter

from apps.inventario.views import CategoriaInsumoViewSet, InsumoViewSet, KardexViewSet

router = DefaultRouter()
router.register("categorias", CategoriaInsumoViewSet, basename="categoria-insumo")
router.register("insumos", InsumoViewSet, basename="insumo")
router.register("kardex", KardexViewSet, basename="kardex")

urlpatterns = router.urls
