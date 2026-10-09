from rest_framework.routers import DefaultRouter
from apps.colaboradores.views import ColaboradorViewSet, GrupoAtencionViewSet, HorarioColaboradorViewSet


router = DefaultRouter()
router.register("horarios", HorarioColaboradorViewSet, basename="colaboradores-horarios")
router.register("grupos", GrupoAtencionViewSet, basename="colaboradores-grupos")
router.register("", ColaboradorViewSet, basename="colaboradores")

urlpatterns = router.urls
