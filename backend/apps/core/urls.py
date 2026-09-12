from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.core.views import ConfiguracionGlobalView, LogAccionViewSet

router = DefaultRouter()
router.register("log-acciones", LogAccionViewSet, basename="log-acciones")

urlpatterns = router.urls + [
    path("configuracion-global/", ConfiguracionGlobalView.as_view(), name="configuracion-global"),
]
