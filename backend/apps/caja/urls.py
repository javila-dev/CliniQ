from rest_framework.routers import DefaultRouter

from apps.caja.views import (
    CajaViewSet,
    CategoriaGastoViewSet,
    GastoCajaViewSet,
    SesionCajaViewSet,
)

router = DefaultRouter()
router.register("categorias", CategoriaGastoViewSet, basename="categorias-gasto")
router.register("gastos", GastoCajaViewSet, basename="gastos-caja")
router.register("cajas", CajaViewSet, basename="cajas")
router.register("sesiones", SesionCajaViewSet, basename="sesiones-caja")

urlpatterns = router.urls
