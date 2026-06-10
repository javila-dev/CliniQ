from rest_framework.routers import DefaultRouter

from apps.cobros.views import CobroViewSet

router = DefaultRouter()
router.register("cobros", CobroViewSet, basename="cobro")

urlpatterns = router.urls
