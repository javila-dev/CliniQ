from rest_framework.routers import DefaultRouter

from apps.seguimiento.views import OportunidadViewSet


router = DefaultRouter()
router.register("oportunidades", OportunidadViewSet, basename="seguimiento-oportunidades")

urlpatterns = router.urls
