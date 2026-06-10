from rest_framework.routers import DefaultRouter
from apps.pacientes.views import PacienteViewSet


router = DefaultRouter()
router.register("", PacienteViewSet, basename="pacientes")

urlpatterns = router.urls
