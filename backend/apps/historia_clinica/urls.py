from rest_framework.routers import DefaultRouter
from apps.historia_clinica.views import (
    AnotacionZonaViewSet,
    ConsentimientoInformadoViewSet,
    FotoClinicaViewSet,
    HistoriaClinicaViewSet,
    NotaClinicaViewSet,
    OrdenMedicaViewSet,
    PlantillaOrdenViewSet,
    ResultadoExamenViewSet,
    SignosVitalesViewSet,
)


router = DefaultRouter()
router.register("historias", HistoriaClinicaViewSet, basename="historias-clinicas")
router.register("notas", NotaClinicaViewSet, basename="notas-clinicas")
router.register("fotos", FotoClinicaViewSet, basename="fotos-clinicas")
router.register("consentimientos", ConsentimientoInformadoViewSet, basename="consentimientos-informados")
router.register("resultados-examenes", ResultadoExamenViewSet, basename="resultados-examenes")
router.register("signos-vitales", SignosVitalesViewSet, basename="signos-vitales")
router.register("plantillas-ordenes", PlantillaOrdenViewSet, basename="plantillas-ordenes")
router.register("ordenes-medicas", OrdenMedicaViewSet, basename="ordenes-medicas")
router.register("anotaciones-zona", AnotacionZonaViewSet, basename="anotaciones-zona")

urlpatterns = router.urls
