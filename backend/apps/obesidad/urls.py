from rest_framework.routers import DefaultRouter

from .views import MedicionAntropometricaViewSet

router = DefaultRouter()
router.register("mediciones", MedicionAntropometricaViewSet, basename="obesidad-mediciones")

urlpatterns = router.urls
