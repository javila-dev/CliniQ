from django.urls import path
from rest_framework.routers import DefaultRouter
from apps.clinicas.views import ClinicaViewSet, PlanViewSet, ProcedimientoViewSet, SedeViewSet, ServicioViewSet, TratamientoCatalogoViewSet


router = DefaultRouter()
router.register("clinicas", ClinicaViewSet, basename="clinicas")
router.register("planes", PlanViewSet, basename="planes")
router.register("sedes", SedeViewSet, basename="sedes")
router.register("procedimientos", ProcedimientoViewSet, basename="procedimientos")
router.register("servicios", ServicioViewSet, basename="servicios")
router.register("tratamientos", TratamientoCatalogoViewSet, basename="tratamientos")

urlpatterns = [
    path("mi-clinica/", ClinicaViewSet.as_view({"get": "mi_clinica"}), name="mi-clinica"),
    path("mi-clinica/plan/", ClinicaViewSet.as_view({"get": "plan_usage"}), name="mi-clinica-plan"),
    path(
        "clinicas/<uuid:pk>/logo/",
        ClinicaViewSet.as_view({"post": "clinica_logo", "delete": "clinica_logo"}),
        name="clinica-logo",
    ),
    path(
        "mi-clinica/logo/",
        ClinicaViewSet.as_view({"post": "mi_clinica_logo", "delete": "mi_clinica_logo"}),
        name="mi-clinica-logo",
    ),
] + router.urls
