from rest_framework.routers import DefaultRouter

from apps.caja.views import CategoriaGastoViewSet, CierreCajaViewSet, GastoCajaViewSet

router = DefaultRouter()
router.register("categorias", CategoriaGastoViewSet, basename="categorias-gasto")
router.register("gastos", GastoCajaViewSet, basename="gastos-caja")
router.register("cierres", CierreCajaViewSet, basename="cierres-caja")

urlpatterns = router.urls
