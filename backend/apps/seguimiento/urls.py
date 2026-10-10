from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.seguimiento.views import ConfigSeguimientoView, OportunidadViewSet


router = DefaultRouter()
router.register("oportunidades", OportunidadViewSet, basename="seguimiento-oportunidades")

urlpatterns = [path("config/", ConfigSeguimientoView.as_view(), name="seguimiento-config")] + router.urls
