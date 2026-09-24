from django.urls import path
from rest_framework.routers import DefaultRouter
from apps.clinicas.views import CampanaViewSet, ClinicaViewSet, DiagramaCorporalViewSet, FormaDePagoViewSet, GrupoZonasViewSet, PlantillaAsistenciaViewSet, PlanViewSet, ProcedimientoViewSet, RegistroClinicaView, SedeViewSet, ServicioViewSet, TratamientoCatalogoViewSet


router = DefaultRouter()
router.register("clinicas", ClinicaViewSet, basename="clinicas")
router.register("planes", PlanViewSet, basename="planes")
router.register("sedes", SedeViewSet, basename="sedes")
router.register("formas-pago", FormaDePagoViewSet, basename="formas-pago")
router.register("procedimientos", ProcedimientoViewSet, basename="procedimientos")
router.register("servicios", ServicioViewSet, basename="servicios")
router.register("tratamientos", TratamientoCatalogoViewSet, basename="tratamientos")
router.register("campanas", CampanaViewSet, basename="campanas")
router.register("plantillas-asistencia", PlantillaAsistenciaViewSet, basename="plantillas-asistencia")
router.register("diagramas-corporales", DiagramaCorporalViewSet, basename="diagramas-corporales")
router.register("grupos-zonas", GrupoZonasViewSet, basename="grupos-zonas")

urlpatterns = [
    path("mi-clinica/", ClinicaViewSet.as_view({"get": "mi_clinica", "patch": "mi_clinica"}), name="mi-clinica"),
    path("mi-clinica/plan/", ClinicaViewSet.as_view({"get": "plan_usage"}), name="mi-clinica-plan"),
    path("mi-clinica/setup-checklist/", ClinicaViewSet.as_view({"get": "setup_checklist"}), name="mi-clinica-setup-checklist"),
    path("mi-clinica/preparacion/", ClinicaViewSet.as_view({"post": "preparacion"}), name="mi-clinica-preparacion"),
    path(
        "mi-clinica/preparacion/yo-atiendo/",
        ClinicaViewSet.as_view({"post": "preparacion_yo_atiendo"}),
        name="mi-clinica-preparacion-yo-atiendo",
    ),
    path(
        "mi-clinica/procedimientos-sin-profesional/",
        ClinicaViewSet.as_view({"get": "procedimientos_sin_profesional"}),
        name="mi-clinica-procedimientos-sin-profesional",
    ),
    path(
        "mi-clinica/asignar-profesionales-a-procedimientos/",
        ClinicaViewSet.as_view({"post": "asignar_profesionales_a_procedimientos"}),
        name="mi-clinica-asignar-profesionales-a-procedimientos",
    ),
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
