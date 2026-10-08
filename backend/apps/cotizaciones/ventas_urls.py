from rest_framework.routers import DefaultRouter

from apps.cotizaciones.ventas import VentaViewSet


router = DefaultRouter()
router.register("", VentaViewSet, basename="ventas")

urlpatterns = router.urls
