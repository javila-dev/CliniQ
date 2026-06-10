from rest_framework.routers import DefaultRouter

from apps.cotizaciones.views import CotizacionViewSet


router = DefaultRouter()
router.register("", CotizacionViewSet, basename="cotizaciones")

urlpatterns = router.urls
