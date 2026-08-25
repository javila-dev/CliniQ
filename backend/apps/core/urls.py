from rest_framework.routers import DefaultRouter

from apps.core.views import LogAccionViewSet

router = DefaultRouter()
router.register("log-acciones", LogAccionViewSet, basename="log-acciones")

urlpatterns = router.urls
