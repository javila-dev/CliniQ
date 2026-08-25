from rest_framework.routers import DefaultRouter
from django.urls import path

from apps.configuracion.views import (
    ConfiguracionCarteraViewSet,
    ConfiguracionFacialViewSet,
    ConfiguracionHistoriaViewSet,
    ConfiguracionRegistroPublicoViewSet,
    ConfiguracionSignosVitalesViewSet,
    ConfiguracionWizardViewSet,
    DocumensoConsentimientoTemplateViewSet,
    PlantillaConsentimientoViewSet,
)


router = DefaultRouter()
router.register("documenso-templates", DocumensoConsentimientoTemplateViewSet, basename="documenso-templates")
router.register("plantillas-consentimiento", PlantillaConsentimientoViewSet, basename="plantillas-consentimiento")

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
    path(
        "wizard/",
        ConfiguracionWizardViewSet.as_view({"get": "list", "patch": "partial_update"}),
        name="configuracion-wizard",
    ),
    path(
        "registro-publico/",
        ConfiguracionRegistroPublicoViewSet.as_view({"get": "list", "patch": "partial_update"}),
        name="configuracion-registro-publico",
    ),
    path(
        "facial/",
        ConfiguracionFacialViewSet.as_view({"get": "list", "patch": "partial_update"}),
        name="configuracion-facial",
    ),
    path(
        "cartera/",
        ConfiguracionCarteraViewSet.as_view({"get": "list", "patch": "partial_update"}),
        name="configuracion-cartera",
    ),
]
