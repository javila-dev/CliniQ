from django.urls import path
from rest_framework.routers import DefaultRouter
from apps.consentimientos.views import (
    ConsentimientoViewSet,
    FirmarConsentimientoPublicoView,
    PlantillaConsentimientoViewSet,
)


router = DefaultRouter()
router.register("plantillas", PlantillaConsentimientoViewSet, basename="plantillas-consentimiento")
router.register("", ConsentimientoViewSet, basename="consentimientos")

urlpatterns = router.urls + [
    path("firmar/<str:token>/", FirmarConsentimientoPublicoView.as_view(), name="firmar-consentimiento"),
]
