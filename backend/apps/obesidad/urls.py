from rest_framework.routers import DefaultRouter

from .views import (
    AntecedentesObesidadViewSet,
    MedicionAntropometricaViewSet,
    ObjetivoObesidadViewSet,
    ResultadoLaboratorioViewSet,
    TratamientoFarmacologicoViewSet,
)

router = DefaultRouter()
router.register("antecedentes",   AntecedentesObesidadViewSet,    basename="obesidad-antecedentes")
router.register("objetivos",      ObjetivoObesidadViewSet,         basename="obesidad-objetivos")
router.register("mediciones",     MedicionAntropometricaViewSet,   basename="obesidad-mediciones")
router.register("laboratorios",   ResultadoLaboratorioViewSet,     basename="obesidad-laboratorios")
router.register("farmacologico",  TratamientoFarmacologicoViewSet, basename="obesidad-farmacologico")

urlpatterns = router.urls
