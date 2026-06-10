from rest_framework.routers import DefaultRouter
from django.urls import path

from apps.configuracion.views import (
    ConfiguracionHistoriaViewSet,
    ConfiguracionSignosVitalesViewSet,
    DocumensoConsentimientoTemplateViewSet,
)


router = DefaultRouter()
router.register("documenso-templates", DocumensoConsentimientoTemplateViewSet, basename="documenso-templates")

urlpatterns = [
    *router.urls,
    path(
        "signos-vitales/",
        ConfiguracionSignosVitalesViewSet.as_view({"get": "list", "patch": "partial_update"}),
        name="configuracion-signos-vitales",
    ),
    path(
        "historia/",
        ConfiguracionHistoriaViewSet.as_view({"get": "list", "patch": "partial_update"}),
        name="configuracion-historia",
    ),
]
