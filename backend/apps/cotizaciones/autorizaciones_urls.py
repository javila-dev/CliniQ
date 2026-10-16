from rest_framework.routers import DefaultRouter

from apps.cotizaciones.views import AutorizacionPrecioViewSet


router = DefaultRouter()
router.register("", AutorizacionPrecioViewSet, basename="autorizaciones-precio")

urlpatterns = router.urls
